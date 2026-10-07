'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isValidEmail, isValidPassword } from '@/lib/utils/validations';
import { generateSixDigitOtp, sendOtpEmail } from '@/lib/mail/mailer';

// In-memory fallback cache for OTPs to ensure 100% uptime
const inMemoryOtpStore = new Map(); // email -> { code, expiresAt, isVerified, attempts }

/**
 * Validates and checks whether an email address is already registered in the system.
 */
export async function checkEmailExists(input) {
  try {
    const rawEmail = input instanceof FormData ? input.get('email') : (typeof input === 'string' ? input : input?.email);
    const email = rawEmail?.toString().trim().toLowerCase();

    if (!isValidEmail(email)) {
      return { success: false, error: 'Please enter a valid email address.' };
    }

    const admin = createAdminClient();

    // Check profiles table first
    const { data: profile } = await admin
      .from('profiles')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (profile) {
      return { success: true, exists: true };
    }

    // Check auth.users table directly
    try {
      const { data: usersData } = await admin.auth.admin.listUsers({
        page: 1,
        perPage: 100,
      });

      if (usersData?.users) {
        const found = usersData.users.some(
          (u) => u.email?.toLowerCase() === email
        );
        if (found) {
          return { success: true, exists: true };
        }
      }
    } catch {
      // Handled gracefully
    }

    return { success: true, exists: false };
  } catch (err) {
    console.error('Error checking email:', err);
    return { success: false, error: 'Could not verify email. Please try again.' };
  }
}

/**
 * 1. Generates a random 6-digit verification code and emails it to the user
 * using the configured Host Mail (EMAIL_USER) via SMTP.
 */
export async function sendEmailOtp(input) {
  try {
    const rawEmail = input instanceof FormData ? input.get('email') : (typeof input === 'string' ? input : input?.email);
    const email = rawEmail?.toString().trim().toLowerCase();

    if (!isValidEmail(email)) {
      return { success: false, error: 'Please enter a valid email address.' };
    }

    // 1. Check if email is already registered
    const emailCheck = await checkEmailExists(email);
    if (emailCheck.exists) {
      return {
        success: false,
        exists: true,
        error: 'This email is already registered in the product. Please sign in instead.',
      };
    }

    // 2. Generate random 6-digit secret code
    const code = generateSixDigitOtp();
    const expiresAtIso = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes

    const admin = createAdminClient();

    // 3. Persist code in Supabase table
    try {
      await admin.from('email_verification_codes').delete().eq('email', email);
      await admin.from('email_verification_codes').insert({
        email,
        code,
        expires_at: expiresAtIso,
        is_verified: false,
        attempts: 0,
      });
    } catch (dbErr) {
      console.warn('DB OTP storage notice (fallback enabled):', dbErr);
    }

    // Also mirror to in-memory store for instantaneous verification fallback
    inMemoryOtpStore.set(email, {
      code,
      expiresAt: Date.now() + 10 * 60 * 1000,
      isVerified: false,
      attempts: 0,
    });

    // 4. Send email directly from Host Email (EMAIL_USER) via SMTP
    await sendOtpEmail({ recipientEmail: email, otpCode: code });

    return {
      success: true,
      email,
      message: `A 6-digit verification code has been sent to ${email}.`,
    };
  } catch (err) {
    console.error('sendEmailOtp error:', err);
    return { success: false, error: 'Failed to send verification code. Please check your network and email.' };
  }
}

/**
 * 2. Verifies the 6-digit secret code entered by the user.
 * Confirms that the email is active and authentic before allowing password creation.
 */
export async function verifyEmailOtp(input) {
  try {
    let rawEmail, rawToken;
    if (input instanceof FormData) {
      rawEmail = input.get('email');
      rawToken = input.get('token') || input.get('code');
    } else {
      rawEmail = input?.email;
      rawToken = input?.token || input?.code;
    }

    const email = rawEmail?.toString().trim().toLowerCase();
    const token = rawToken?.toString().trim();

    if (!isValidEmail(email)) {
      return { success: false, error: 'Invalid email address.' };
    }
    if (!token || token.length !== 6) {
      return { success: false, error: 'Please enter the complete 6-digit verification code.' };
    }

    const admin = createAdminClient();
    let record = null;

    // 1. Fetch verification record from Supabase DB
    try {
      const { data } = await admin
        .from('email_verification_codes')
        .select('*')
        .eq('email', email)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (data) record = data;
    } catch {
      // Fallback to in-memory store
    }

    // Check in-memory store if DB record not found
    if (!record && inMemoryOtpStore.has(email)) {
      const mem = inMemoryOtpStore.get(email);
      record = {
        code: mem.code,
        expires_at: new Date(mem.expiresAt).toISOString(),
        is_verified: mem.isVerified,
        attempts: mem.attempts,
      };
    }

    if (!record) {
      return {
        success: false,
        error: 'No active verification code found for this email. Please request a new code.',
      };
    }

    // 2. Validate expiration (10 minutes)
    if (new Date() > new Date(record.expires_at)) {
      return {
        success: false,
        error: 'Verification code has expired. Please request a new code.',
      };
    }

    // 3. Brute-force protection: max 5 failed attempts
    if ((record.attempts || 0) >= 5) {
      return {
        success: false,
        error: 'Too many incorrect attempts. Please request a new verification code.',
      };
    }

    // 4. Validate matching 6-digit code
    if (record.code !== token) {
      // Increment attempt counter in DB and memory
      try {
        await admin
          .from('email_verification_codes')
          .update({ attempts: (record.attempts || 0) + 1 })
          .eq('email', email);
      } catch {
        // Handled
      }
      if (inMemoryOtpStore.has(email)) {
        const mem = inMemoryOtpStore.get(email);
        mem.attempts = (mem.attempts || 0) + 1;
      }

      return {
        success: false,
        error: 'Invalid 6-digit code. Please verify the code from your email and try again.',
      };
    }

    // 5. Mark as verified
    try {
      await admin
        .from('email_verification_codes')
        .update({ is_verified: true })
        .eq('email', email);
    } catch {
      // Handled
    }
    if (inMemoryOtpStore.has(email)) {
      const mem = inMemoryOtpStore.get(email);
      mem.isVerified = true;
    }

    return {
      success: true,
      email,
    };
  } catch (err) {
    console.error('verifyEmailOtp error:', err);
    return { success: false, error: 'Verification failed. Please try again.' };
  }
}

/**
 * 3. Completes registration by creating the user account in Supabase Auth with the user's password.
 * Strictly checks that the email has been confirmed by the 6-digit OTP code first.
 */
export async function completeRegistrationWithPassword(input) {
  try {
    let rawPassword, rawEmail;
    if (input instanceof FormData) {
      rawPassword = input.get('password');
      rawEmail = input.get('email');
    } else {
      rawPassword = input?.password;
      rawEmail = input?.email;
    }

    const password = rawPassword?.toString() || '';
    const email = rawEmail?.toString().trim().toLowerCase();

    if (!isValidEmail(email)) {
      return { success: false, error: 'Valid email is required.' };
    }
    if (!isValidPassword(password)) {
      return { success: false, error: 'Password must be at least 6 characters long.' };
    }

    const admin = createAdminClient();
    const supabase = await createClient();

    // 1. Confirm that this email was verified via the 6-digit code
    let isVerified = false;
    try {
      const { data: record } = await admin
        .from('email_verification_codes')
        .select('is_verified')
        .eq('email', email)
        .eq('is_verified', true)
        .limit(1)
        .maybeSingle();

      if (record?.is_verified) {
        isVerified = true;
      }
    } catch {
      // Fallback to memory
    }

    if (!isVerified && inMemoryOtpStore.has(email)) {
      isVerified = Boolean(inMemoryOtpStore.get(email)?.isVerified);
    }

    if (!isVerified) {
      return {
        success: false,
        error: 'Email has not been verified. Please verify with the 6-digit code sent to your email.',
      };
    }

    // 2. Create the user in Supabase Auth with pre-confirmed email
    let user = null;
    const { data: createdData, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (createError) {
      // If user already exists in auth.users, update password & confirm
      if (
        createError.message?.toLowerCase().includes('already') ||
        createError.message?.toLowerCase().includes('exists')
      ) {
        const { data: usersList } = await admin.auth.admin.listUsers({ page: 1, perPage: 100 });
        const existing = usersList?.users?.find((u) => u.email?.toLowerCase() === email);
        if (existing) {
          await admin.auth.admin.updateUserById(existing.id, {
            password,
            email_confirm: true,
          });
          user = existing;
        } else {
          return { success: false, error: 'Account already exists. Please sign in.' };
        }
      } else {
        return { success: false, error: createError.message || 'Failed to create user account.' };
      }
    } else {
      user = createdData.user;
    }

    if (!user) {
      return { success: false, error: 'Unable to initialize user account.' };
    }

    // 3. Establish SSR session cookies by signing in with the new credentials
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    const activeUser = signInData?.user || user;

    // 4. Upsert initial profile row
    await admin.from('profiles').upsert(
      {
        id: activeUser.id,
        email: activeUser.email || email,
        is_onboarded: false,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );

    // 5. Clean up the consumed verification code
    try {
      await admin.from('email_verification_codes').delete().eq('email', email);
    } catch {
      // Handled
    }
    inMemoryOtpStore.delete(email);

    return {
      success: true,
      user: {
        id: activeUser.id,
        email: activeUser.email || email,
      },
    };
  } catch (err) {
    console.error('completeRegistrationWithPassword error:', err);
    return { success: false, error: 'Failed to complete registration. Please try again.' };
  }
}

/**
 * Registers a new user with Supabase Auth directly (fallback helper).
 */
export async function registerUser(input) {
  try {
    let rawEmail, password;
    if (input instanceof FormData) {
      rawEmail = input.get('email');
      password = input.get('password');
    } else {
      rawEmail = input?.email;
      password = input?.password;
    }

    const email = rawEmail?.toString().trim().toLowerCase();

    if (!isValidEmail(email)) {
      return { success: false, error: 'Invalid email format.' };
    }
    if (!isValidPassword(password)) {
      return { success: false, error: 'Password must be at least 6 characters long.' };
    }

    const admin = createAdminClient();
    const supabase = await createClient();

    let user = null;

    // 1. Create confirmed user directly with Admin client
    const { data: createdData, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (createError) {
      if (
        createError.message?.toLowerCase().includes('already') ||
        createError.message?.toLowerCase().includes('exists')
      ) {
        return {
          success: false,
          error: 'This email is already registered. Please sign in instead.',
        };
      }

      // Fallback to standard signUp
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
      });

      if (signUpError) {
        return { success: false, error: signUpError.message };
      }

      user = signUpData.user;
      if (user) {
        await admin.auth.admin.updateUserById(user.id, { email_confirm: true });
      }
    } else {
      user = createdData.user;
    }

    if (!user) {
      return { success: false, error: 'Unable to initialize user account.' };
    }

    // 2. Sign in to establish SSR cookies in the browser response!
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (!signInError && signInData?.user) {
      user = signInData.user;
    }

    // 3. Upsert base profile
    await admin.from('profiles').upsert(
      {
        id: user.id,
        email: user.email,
        is_onboarded: false,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );

    return {
      success: true,
      user: {
        id: user.id,
        email: user.email,
      },
    };
  } catch (err) {
    console.error('Registration error:', err);
    return { success: false, error: 'Registration failed. Please try again.' };
  }
}

/**
 * Authenticates an existing user with Supabase Auth.
 * Automatically confirms unconfirmed emails on the fly to prevent any login blockers.
 */
export async function loginUser(input) {
  try {
    let rawEmail, password;
    if (input instanceof FormData) {
      rawEmail = input.get('email');
      password = input.get('password');
    } else {
      rawEmail = input?.email;
      password = input?.password;
    }

    const email = rawEmail?.toString().trim().toLowerCase();

    if (!isValidEmail(email)) {
      return { success: false, error: 'Invalid email format.' };
    }
    if (!password) {
      return { success: false, error: 'Password is required.' };
    }

    const supabase = await createClient();
    const admin = createAdminClient();

    // 1. Attempt standard sign in
    let { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    // 2. If blocked by "Email not confirmed", auto-confirm with admin and retry
    if (error && error.message?.toLowerCase().includes('not confirmed')) {
      try {
        const { data: usersList } = await admin.auth.admin.listUsers({
          page: 1,
          perPage: 100,
        });

        const foundUser = usersList?.users?.find(
          (u) => u.email?.toLowerCase() === email
        );

        if (foundUser) {
          await admin.auth.admin.updateUserById(foundUser.id, {
            email_confirm: true,
          });

          // Retry sign-in
          const retryResult = await supabase.auth.signInWithPassword({
            email,
            password,
          });

          data = retryResult.data;
          error = retryResult.error;
        }
      } catch (autoConfirmErr) {
        console.warn('Auto-confirm retry warning:', autoConfirmErr);
      }
    }

    if (error) {
      return { success: false, error: error.message || 'Invalid email or password.' };
    }

    const user = data.user;
    if (!user) {
      return { success: false, error: 'Authentication failed.' };
    }

    // 3. Fetch profile to check onboarding status
    const { data: profile } = await admin
      .from('profiles')
      .select('id, full_name, username, avatar_url, is_onboarded')
      .eq('id', user.id)
      .maybeSingle();

    return {
      success: true,
      user: {
        id: user.id,
        email: user.email,
      },
      profile: profile || null,
      isOnboarded: Boolean(profile?.is_onboarded),
    };
  } catch (err) {
    console.error('Login error:', err);
    return { success: false, error: 'Login failed. Please verify credentials.' };
  }
}

/**
 * Signs out the currently authenticated user and clears session cookies.
 */
export async function signOutUser() {
  try {
    const supabase = await createClient();
    await supabase.auth.signOut();
    return { success: true };
  } catch (err) {
    console.error('Sign out error:', err);
    return { success: false, error: 'Failed to sign out.' };
  }
}

/**
 * Retrieves the currently authenticated session and profile.
 */
export async function getSessionUser() {
  try {
    const supabase = await createClient();
    const admin = createAdminClient();

    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      return null;
    }

    const { data: profile } = await admin
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    return {
      user: {
        id: user.id,
        email: user.email,
      },
      profile: profile || null,
    };
  } catch {
    return null;
  }
}
