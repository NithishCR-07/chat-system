'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { IconCheck, IconArrowRight } from '@/components/icons/Icons';

export function SuccessStep({ profile }) {
  const router = useRouter();
  const [countdown, setCountdown] = useState(4);
  const destination = '/chat';

  function handleGoToChat() {
    router.refresh();
    router.push(destination);
  }

  // Pure countdown timer effect
  useEffect(() => {
    if (countdown <= 0) {
      handleGoToChat();
      return;
    }

    const timer = setTimeout(() => {
      setCountdown((prev) => prev - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [countdown]);

  const fullName = profile?.full_name || 'there';
  const username = profile?.username ? `@${profile.username}` : '';

  return (
    <div className="w-full space-y-6 text-center animate-fadeIn">
      {/* Animated Success Badge */}
      <div className="relative mx-auto w-20 h-20">
        <div className="absolute inset-0 bg-[#2ec4b6]/20 rounded-full animate-ping" />
        <div className="relative w-20 h-20 bg-gradient-to-tr from-[#1f6fb2] to-[#2ec4b6] rounded-full flex items-center justify-center text-white shadow-xl shadow-[#1f6fb2]/30">
          <IconCheck className="w-10 h-10 stroke-[3]" />
        </div>
      </div>

      {/* Title & Notification Banner */}
      <div className="space-y-2">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#2ec4b6]/15 text-[#1f6fb2] border border-[#2ec4b6]/30 rounded-full text-xs font-semibold uppercase tracking-wider">
          <IconCheck className="w-3.5 h-3.5" /> Account Ready
        </div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-900">
          Welcome, {fullName}!
        </h2>
        <p className="text-sm text-slate-600 max-w-sm mx-auto">
          Your profile is all set. You can now start 1-on-1 direct conversations with anyone.
        </p>
      </div>

      {/* Profile Summary Card */}
      <div className="p-4 bg-white/80 backdrop-blur-xs rounded-2xl border border-slate-200/80 shadow-xs space-y-3 text-left">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#1f6fb2] to-[#2ec4b6] text-white flex items-center justify-center font-bold text-sm shadow-xs">
              {fullName.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="text-sm font-bold text-slate-900">{fullName}</p>
              <p className="text-xs text-slate-500 font-mono">{username || profile?.email}</p>
            </div>
          </div>
          <span className="text-xs font-medium px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200/60 rounded-full">
            ● Active
          </span>
        </div>
      </div>

      {/* CTA Button */}
      <div className="space-y-3">
        <Button
          type="button"
          size="lg"
          className="w-full"
          onClick={handleGoToChat}
          icon={IconArrowRight}
        >
          Open Chat ({countdown}s)
        </Button>
      </div>
    </div>
  );
}
