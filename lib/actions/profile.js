'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isValidFullName, isValidUsername } from '@/lib/utils/validations';

/**
 * Validates whether a username is available.
 */
export async function checkUsernameAvailable(rawUsername, userId = null) {
  try {
    const username = rawUsername?.trim().toLowerCase();
    if (!isValidUsername(username)) {
      return {
        success: false,
        available: false,
        error: 'Username must be 3-20 characters (letters, numbers, underscores, dots).',
      };
    }

    const admin = createAdminClient();

    let query = admin.from('profiles').select('id').eq('username', username);
    if (userId) {
      query = query.neq('id', userId);
    }

    const { data: existing } = await query.maybeSingle();

    if (existing) {
      return { success: true, available: false, error: 'Username is already taken.' };
    }

    return { success: true, available: true };
  } catch (err) {
    console.error('Username check error:', err);
    return { success: false, available: false, error: 'Failed to verify username availability.' };
  }
}

/**
 * Updates the user's profile with full_name, username, and optional avatar.
 * Guarantees email is always populated to satisfy the NOT NULL constraint on public.profiles.
 */
export async function updateProfile({
  fullName,
  username,
  avatarUrl = '',
  email = null,
  userId = null,
}) {
  try {
    const cleanName = fullName?.trim();
    const cleanUsername = username?.trim().toLowerCase();

    if (!isValidFullName(cleanName)) {
      return { success: false, error: 'Full name must be between 2 and 50 characters.' };
    }
    if (!isValidUsername(cleanUsername)) {
      return {
        success: false,
        error: 'Username must be 3-20 characters (alphanumeric, dots, underscores).',
      };
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const targetUserId = user?.id || userId;

    if (!targetUserId) {
      return {
        success: false,
        error: 'Authentication required to update profile. Please sign in again.',
      };
    }

    const admin = createAdminClient();

    // 1. Check if username is taken by another user
    const { data: existingUsername } = await admin
      .from('profiles')
      .select('id')
      .eq('username', cleanUsername)
      .neq('id', targetUserId)
      .maybeSingle();

    if (existingUsername) {
      return { success: false, error: 'Username is already taken. Please choose another.' };
    }

    // 2. Resolve user email to guarantee NOT NULL constraint is satisfied
    let resolvedEmail = email || user?.email;
    if (!resolvedEmail) {
      try {
        const { data: authUserData } = await admin.auth.admin.getUserById(targetUserId);
        resolvedEmail = authUserData?.user?.email;
      } catch (e) {
        console.warn('Could not fetch user by ID:', e);
      }
    }

    if (!resolvedEmail) {
      // Check if existing profile already has email
      const { data: existingProfile } = await admin
        .from('profiles')
        .select('email')
        .eq('id', targetUserId)
        .maybeSingle();

      resolvedEmail = existingProfile?.email;
    }

    const profilePayload = {
      id: targetUserId,
      email: resolvedEmail || `${cleanUsername}@user.chat`,
      full_name: cleanName,
      username: cleanUsername,
      avatar_url: avatarUrl || '',
      is_onboarded: true,
      updated_at: new Date().toISOString(),
    };

    // 3. Upsert using admin service client
    const { data: profile, error: upsertError } = await admin
      .from('profiles')
      .upsert(profilePayload, { onConflict: 'id' })
      .select()
      .single();

    if (upsertError) {
      console.error('Profile upsert error:', upsertError);
      return { success: false, error: upsertError.message || 'Failed to save profile.' };
    }

    return {
      success: true,
      profile,
    };
  } catch (err) {
    console.error('Profile update error:', err);
    return { success: false, error: 'Failed to save profile. Please try again.' };
  }
}

/**
 * Uploads user profile avatar to the public 'avatars' storage bucket and updates profile.
 */
export async function uploadAvatarAction(formData) {
  try {
    const file = formData.get('file');
    const customUserId = formData.get('userId');

    if (!file) {
      return { success: false, error: 'Image file is required.' };
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      return { success: false, error: 'Image file size must be less than 5MB.' };
    }

    // Validate MIME type
    const mimeType = file.type?.toLowerCase() || '';
    const validMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'];
    if (!validMimeTypes.includes(mimeType) && !/\.(jpg|jpeg|png|webp|gif|svg)$/i.test(file.name || '')) {
      return { success: false, error: 'Please upload a valid image file (JPEG, PNG, WebP, GIF, or SVG).' };
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const targetUserId = user?.id || customUserId;
    if (!targetUserId) {
      return { success: false, error: 'Authentication required to upload avatar.' };
    }

    const admin = createAdminClient();

    // 1. Ensure 'avatars' public bucket exists
    const { data: buckets } = await admin.storage.listBuckets();
    const bucketName = buckets?.some((b) => b.name === 'avatars' || b.id === 'avatars')
      ? 'avatars'
      : buckets?.some((b) => b.name === 'avatar' || b.id === 'avatar')
      ? 'avatar'
      : 'avatars';

    const hasBucket = buckets?.some((b) => b.name === bucketName || b.id === bucketName);
    if (!hasBucket) {
      try {
        await admin.storage.createBucket('avatars', {
          public: true,
          fileSizeLimit: 5242880, // 5MB
          allowedMimeTypes: validMimeTypes,
        });
      } catch (bucketErr) {
        console.warn('Bucket creation notice:', bucketErr.message);
      }
    }

    // 2. Clean previous avatars in user folder to save space
    try {
      const { data: existingFiles } = await admin.storage
        .from(bucketName)
        .list(`users/${targetUserId}`);
      if (existingFiles && existingFiles.length > 0) {
        const pathsToDelete = existingFiles.map((f) => `users/${targetUserId}/${f.name}`);
        await admin.storage.from(bucketName).remove(pathsToDelete);
      }
    } catch {
      // Graceful fallback
    }

    // 3. Upload new avatar buffer
    const buffer = Buffer.from(await file.arrayBuffer());
    const fileExt = (file.name || 'avatar.png').split('.').pop().toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
    const storagePath = `users/${targetUserId}/avatar_${Date.now()}.${fileExt}`;

    const { error: uploadError } = await admin.storage
      .from(bucketName)
      .upload(storagePath, buffer, {
        contentType: mimeType || 'image/png',
        upsert: true,
      });

    if (uploadError) {
      console.error('Avatar storage upload error:', uploadError);
      return { success: false, error: uploadError.message || 'Failed to upload image.' };
    }

    // 4. Retrieve public URL
    const { data: publicData } = admin.storage.from(bucketName).getPublicUrl(storagePath);
    let avatarUrl = publicData?.publicUrl || '';

    if (!avatarUrl) {
      const { data: signedData } = await admin.storage
        .from(bucketName)
        .createSignedUrl(storagePath, 60 * 60 * 24 * 365);
      avatarUrl = signedData?.signedUrl || '';
    }

    // 5. Update user profile record with new avatar URL
    const { data: profile, error: profileErr } = await admin
      .from('profiles')
      .update({
        avatar_url: avatarUrl,
        updated_at: new Date().toISOString(),
      })
      .eq('id', targetUserId)
      .select()
      .maybeSingle();

    if (profileErr) {
      console.warn('Profile avatar_url update error:', profileErr);
    }

    return {
      success: true,
      avatarUrl,
      profile,
    };
  } catch (err) {
    console.error('uploadAvatarAction exception:', err);
    return { success: false, error: 'Could not upload avatar. Please try again.' };
  }
}

/**
 * Removes the user's avatar from storage and resets avatar_url in the database.
 */
export async function removeAvatarAction({ userId = null } = {}) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const targetUserId = user?.id || userId;
    if (!targetUserId) {
      return { success: false, error: 'Authentication required.' };
    }

    const admin = createAdminClient();

    // 1. Remove storage files
    try {
      const { data: existingFiles } = await admin.storage
        .from('avatars')
        .list(`users/${targetUserId}`);
      if (existingFiles && existingFiles.length > 0) {
        const pathsToDelete = existingFiles.map((f) => `users/${targetUserId}/${f.name}`);
        await admin.storage.from('avatars').remove(pathsToDelete);
      }
    } catch {
      // Graceful fallback
    }

    // 2. Reset avatar_url in profiles table
    const { data: profile, error: profileErr } = await admin
      .from('profiles')
      .update({
        avatar_url: '',
        updated_at: new Date().toISOString(),
      })
      .eq('id', targetUserId)
      .select()
      .maybeSingle();

    if (profileErr) {
      return { success: false, error: profileErr.message || 'Failed to remove avatar.' };
    }

    return {
      success: true,
      profile,
    };
  } catch (err) {
    console.error('removeAvatarAction exception:', err);
    return { success: false, error: 'Could not remove avatar.' };
  }
}

