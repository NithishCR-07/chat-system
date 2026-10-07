'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { OtpInput } from '@/components/onboarding/OtpInput';
import {
  IconMail,
  IconLock,
  IconShieldCheck,
  IconRefresh,
  IconArrowRight,
  IconArrowLeft,
} from '@/components/icons/Icons';
import {
  sendEmailOtp,
  verifyEmailOtp,
  completeRegistrationWithPassword,
} from '@/lib/actions/auth';
import { isValidEmail, isValidPassword } from '@/lib/utils/validations';

/**
 * Multi-Stage Registration Flow:
 * 1. ENTER_EMAIL -> Validates email and dispatches 6-digit OTP via Host SMTP
 * 2. VERIFY_OTP  -> User inputs 6-digit OTP code with countdown timer
 * 3. SET_PASSWORD -> User creates secure password once email is verified
 */
export function EmailStep({ onAuthenticated, onSwitchToLogin, initialEmail = '' }) {
  const router = useRouter();
  const toast = useToast();

  // Stages: 'ENTER_EMAIL' | 'VERIFY_OTP' | 'SET_PASSWORD'
  const [stage, setStage] = useState('ENTER_EMAIL');
  const [email, setEmail] = useState(initialEmail);
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', '']);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [alreadyRegistered, setAlreadyRegistered] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  // 60-Second Countdown Timer for Resending OTP
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  function handleGoToLogin() {
    if (onSwitchToLogin) {
      onSwitchToLogin(email);
    } else {
      router.push('/');
    }
  }

  // -------------------------------------------------------------
  // STAGE 1: Send 6-Digit Verification Code via Host SMTP
  // -------------------------------------------------------------
  async function handleSendOtp(e) {
    if (e) e.preventDefault();
    setAlreadyRegistered(false);

    const cleanEmail = email.trim().toLowerCase();
    if (!isValidEmail(cleanEmail)) {
      toast.error('Please enter a valid email address.');
      return;
    }

    setIsLoading(true);
    const res = await sendEmailOtp(cleanEmail);
    setIsLoading(false);

    if (!res.success) {
      if (res.exists) {
        setAlreadyRegistered(true);
      }
      toast.error(res.error || 'Could not send verification code.');
      return;
    }

    setStage('VERIFY_OTP');
    setOtpDigits(['', '', '', '', '', '']);
    setResendCooldown(60);
    toast.success(`Verification code sent to ${cleanEmail}`);
  }

  // -------------------------------------------------------------
  // STAGE 2: Verify 6-Digit OTP Token
  // -------------------------------------------------------------
  async function handleVerifyOtp(codeToVerify = null) {
    const token = typeof codeToVerify === 'string' ? codeToVerify : otpDigits.join('');
    if (token.length !== 6) {
      toast.error('Please enter all 6 digits of the verification code.');
      return;
    }

    setIsLoading(true);
    const res = await verifyEmailOtp({ email: email.trim().toLowerCase(), token });
    setIsLoading(false);

    if (!res.success) {
      toast.error(res.error || 'Invalid or expired verification code.');
      return;
    }

    toast.success('Email verified successfully! Now create your password.');
    setStage('SET_PASSWORD');
  }

  // -------------------------------------------------------------
  // STAGE 3: Create Secure Password & Complete Registration
  // -------------------------------------------------------------
  async function handleSetPassword(e) {
    e.preventDefault();

    if (!isValidPassword(password)) {
      toast.error('Password must be at least 6 characters long.');
      return;
    }
    if (password !== confirmPassword) {
      toast.error('Passwords do not match. Please re-enter.');
      return;
    }

    setIsLoading(true);
    const res = await completeRegistrationWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    setIsLoading(false);

    if (!res.success) {
      toast.error(res.error || 'Registration failed. Please try again.');
      return;
    }

    toast.success('Account created! Now set up your profile.');

    onAuthenticated({
      user: res.user,
      email: email.trim().toLowerCase(),
      isNew: true,
    });
  }

  function handleResetToEmail() {
    setStage('ENTER_EMAIL');
    setOtpDigits(['', '', '', '', '', '']);
    setAlreadyRegistered(false);
  }

  return (
    <div className="w-full space-y-6">
      {/* Title & Subtitle without redundant process icon */}
      <div className="text-center space-y-1.5">
        <h2 className="text-2xl font-bold tracking-tight text-slate-900">
          {stage === 'ENTER_EMAIL' && 'Create Your Account'}
          {stage === 'VERIFY_OTP' && 'Verify Your Email'}
          {stage === 'SET_PASSWORD' && 'Create Password'}
        </h2>
        <p className="text-xs text-slate-500 max-w-sm mx-auto">
          {stage === 'ENTER_EMAIL' &&
            'Enter your active email to receive a secret 6-digit verification code.'}
          {stage === 'VERIFY_OTP' &&
            `Enter the 6-digit code sent to ${email} to verify ownership.`}
          {stage === 'SET_PASSWORD' &&
            'Your email is verified! Set a strong password to protect your account.'}
        </p>
      </div>

      {/* Account Already Exists Banner Prompt */}
      {alreadyRegistered && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-2xl flex items-center justify-between text-xs text-amber-800">
          <span>This email is already registered.</span>
          <button
            type="button"
            onClick={handleGoToLogin}
            className="px-3 py-1 rounded-xl bg-amber-600 text-white font-semibold hover:bg-amber-700 transition-colors cursor-pointer"
          >
            Sign In
          </button>
        </div>
      )}

      {/* ========================================================= */}
      {/* STAGE 1: ENTER EMAIL FORM                                 */}
      {/* ========================================================= */}
      {stage === 'ENTER_EMAIL' && (
        <form onSubmit={handleSendOtp} className="space-y-4">
          <Input
            id="register-email"
            label="Email Address"
            type="email"
            placeholder="name@company.com"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (alreadyRegistered) setAlreadyRegistered(false);
            }}
            icon={IconMail}
            required
            autoComplete="email"
            autoFocus
          />

          <Button
            type="submit"
            size="lg"
            className="w-full"
            isLoading={isLoading}
            icon={IconArrowRight}
          >
            Send Verification Code
          </Button>
        </form>
      )}

      {/* ========================================================= */}
      {/* STAGE 2: 6-DIGIT OTP VERIFICATION FORM                   */}
      {/* ========================================================= */}
      {stage === 'VERIFY_OTP' && (
        <form onSubmit={(e) => { e.preventDefault(); handleVerifyOtp(); }} className="space-y-5">
          {/* Active Email Pill */}
          <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200/80 rounded-2xl text-xs">
            <div className="flex items-center gap-2.5 overflow-hidden text-slate-700 font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
              <span className="truncate">{email}</span>
            </div>
            <button
              type="button"
              onClick={handleResetToEmail}
              disabled={isLoading}
              className="text-[#1f6fb2] hover:text-[#18558a] font-semibold cursor-pointer transition-colors shrink-0"
            >
              Change
            </button>
          </div>

          {/* 6-Digit OTP Box Input */}
          <div className="py-2">
            <OtpInput
              value={otpDigits}
              onChange={(val) => setOtpDigits(val)}
              onComplete={(code) => handleVerifyOtp(code)}
              disabled={isLoading}
            />
          </div>

          <Button
            type="submit"
            size="lg"
            className="w-full"
            isLoading={isLoading}
            disabled={otpDigits.some((d) => !d) || isLoading}
            icon={IconShieldCheck}
          >
            Verify & Continue
          </Button>

          {/* Resend Code Action */}
          <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
            <button
              type="button"
              onClick={handleResetToEmail}
              className="flex items-center gap-1 text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
            >
              <IconArrowLeft className="w-3.5 h-3.5" />
              <span>Back</span>
            </button>

            <button
              type="button"
              disabled={resendCooldown > 0 || isLoading}
              onClick={handleSendOtp}
              className="flex items-center gap-1 text-[#1f6fb2] font-semibold hover:underline disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-opacity"
            >
              <IconRefresh className="w-3.5 h-3.5" />
              <span>{resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : 'Resend Code'}</span>
            </button>
          </div>
        </form>
      )}

      {/* ========================================================= */}
      {/* STAGE 3: CREATE SECURE PASSWORD FORM                      */}
      {/* ========================================================= */}
      {stage === 'SET_PASSWORD' && (
        <form onSubmit={handleSetPassword} className="space-y-4">
          <Input
            id="register-password"
            label="Create Password"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            icon={IconLock}
            required
            autoComplete="new-password"
            autoFocus
            helperText="Must be at least 6 characters long."
          />

          <Input
            id="register-confirm-password"
            label="Confirm Password"
            type="password"
            placeholder="••••••••"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            icon={IconLock}
            required
            autoComplete="new-password"
          />

          <Button
            type="submit"
            size="lg"
            className="w-full"
            isLoading={isLoading}
            icon={IconArrowRight}
          >
            Create Account & Continue
          </Button>
        </form>
      )}

      {/* Switch to Login Footer */}
      <div className="pt-4 border-t border-slate-100 text-center">
        <p className="text-xs text-slate-500">
          Already have an account?{' '}
          <button
            type="button"
            onClick={handleGoToLogin}
            className="text-[#1f6fb2] hover:text-[#18558a] font-semibold cursor-pointer underline"
          >
            Sign In
          </button>
        </p>
      </div>
    </div>
  );
}
