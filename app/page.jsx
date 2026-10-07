'use client';

import { useState } from 'react';
import { IconMessageSquare } from '@/components/icons/Icons';
import { LoginForm } from '@/components/auth/LoginForm';
import { RegisterFlow } from '@/components/auth/RegisterFlow';

export default function AuthPage() {
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [registerState, setRegisterState] = useState({
    email: '',
    user: null,
    step: 1,
  });

  // Switch to Register flow
  function handleSwitchToRegister(data = {}) {
    setRegisterState({
      email: data.email || '',
      user: data.user || null,
      step: data.step || 1,
    });
    setMode('register');
  }

  // Switch to Login flow
  function handleSwitchToLogin(email = '') {
    if (email) {
      setRegisterState((prev) => ({ ...prev, email }));
    }
    setMode('login');
  }

  return (
    <main className="min-h-screen bg-custom-gradient flex flex-col justify-center items-center py-12 px-4 sm:px-6 relative overflow-hidden">
      {/* Ambient background lighting with custom brand colors */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[550px] h-[350px] bg-[#1f6fb2]/15 blur-[110px] rounded-full pointer-events-none -z-0" />
      <div className="absolute bottom-10 right-10 w-[350px] h-[350px] bg-[#2ec4b6]/15 blur-[90px] rounded-full pointer-events-none -z-0" />

      {/* Main Container */}
      <div className="w-full max-w-lg z-10">
        {/* App Brand Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-[#1f6fb2] to-[#2ec4b6] text-white flex items-center justify-center shadow-lg shadow-[#1f6fb2]/25 ring-4 ring-[#1f6fb2]/10">
              <IconMessageSquare className="w-5 h-5 stroke-[2.2]" />
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">
              Chat System
            </h1>
          </div>
        </div>

        {/* Card */}
        <div className="glass-card rounded-3xl p-6 sm:p-8 shadow-xl transition-all duration-300">
          {mode === 'login' ? (
            <LoginForm
              initialEmail={registerState.email}
              onSwitchToRegister={handleSwitchToRegister}
            />
          ) : (
            <RegisterFlow
              initialEmail={registerState.email}
              initialUser={registerState.user}
              initialStep={registerState.step}
              onSwitchToLogin={handleSwitchToLogin}
            />
          )}
        </div>
      </div>
    </main>
  );
}
