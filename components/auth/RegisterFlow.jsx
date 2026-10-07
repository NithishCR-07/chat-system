'use client';

import { useState } from 'react';
import { StepTracker } from '@/components/onboarding/StepTracker';
import { EmailStep } from '@/components/onboarding/EmailStep';
import { ProfileStep } from '@/components/onboarding/ProfileStep';
import { SuccessStep } from '@/components/onboarding/SuccessStep';

const STEPS = [
  { id: 'email', label: 'Account' },
  { id: 'profile', label: 'Profile' },
  { id: 'success', label: 'Ready' },
];

export function RegisterFlow({ onSwitchToLogin, initialEmail = '', initialStep = 1, initialUser = null }) {
  const [currentStep, setCurrentStep] = useState(initialStep);
  const [userData, setUserData] = useState({
    user: initialUser || null,
    email: initialEmail || '',
    profile: null,
  });

  // Step 1: Authentication completed
  function handleAuthenticated({ user, email, profile }) {
    setUserData((prev) => ({
      ...prev,
      user,
      email,
      profile: profile || prev.profile,
    }));
    setCurrentStep(2);
  }

  // Step 2: Profile saved
  function handleProfileSaved(profileData) {
    setUserData((prev) => ({
      ...prev,
      profile: profileData,
    }));
    setCurrentStep(3);
  }

  return (
    <div className="w-full space-y-6">
      {/* Top Header with Back to Sign In & Stepper */}
      <div className="space-y-4">
        <div className="flex items-center justify-between px-2">
          <button
            type="button"
            onClick={() => onSwitchToLogin && onSwitchToLogin(userData.email)}
            className="text-xs font-medium text-slate-500 hover:text-[#1f6fb2] flex items-center gap-1 cursor-pointer transition-colors"
          >
            ← Back to Sign In
          </button>
          <span className="text-xs text-slate-400">Step {currentStep} of {STEPS.length}</span>
        </div>

        <StepTracker currentStep={currentStep} steps={STEPS} />
      </div>

      {/* Dynamic Steps */}
      {currentStep === 1 && (
        <EmailStep
          initialEmail={userData.email}
          onAuthenticated={handleAuthenticated}
          onSwitchToLogin={onSwitchToLogin}
        />
      )}

      {currentStep === 2 && (
        <ProfileStep
          initialProfile={{
            email: userData.email,
            ...(userData.profile || {}),
          }}
          email={userData.email}
          userId={userData.user?.id}
          onProfileSaved={handleProfileSaved}
        />
      )}

      {currentStep === 3 && (
        <SuccessStep
          profile={userData.profile}
        />
      )}
    </div>
  );
}

export const RegisterForm = RegisterFlow;
