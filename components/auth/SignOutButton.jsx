'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signOutUser } from '@/lib/actions/auth';
import { IconLogOut, IconSpinner } from '@/components/icons/Icons';

export function SignOutButton({ className = '' }) {
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);

  async function handleSignOut() {
    setIsSigningOut(true);
    await signOutUser();
    router.refresh();
    router.push('/');
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      disabled={isSigningOut}
      title="Sign Out of your account"
      className={`inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-100/90 border border-slate-200/90 shadow-2xs hover:shadow-xs active:scale-95 transition-all cursor-pointer disabled:opacity-50 touch-manipulation shrink-0 ${className}`}
    >
      {isSigningOut ? (
        <>
          <IconSpinner className="w-3.5 h-3.5 animate-spin text-slate-500" />
          <span>Signing out...</span>
        </>
      ) : (
        <>
          <IconLogOut className="w-3.5 h-3.5 text-slate-500" />
          <span>Sign Out</span>
        </>
      )}
    </button>
  );
}

