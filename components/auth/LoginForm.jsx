'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { IconMail, IconLock, IconArrowRight } from '@/components/icons/Icons';
import { loginUser } from '@/lib/actions/auth';
import { isValidEmail } from '@/lib/utils/validations';

export function LoginForm({ onSwitchToRegister, initialEmail = '' }) {
  const router = useRouter();
  const toast = useToast();
  const [email, setEmail] = useState(initialEmail || '');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  async function handleLogin(e) {
    e.preventDefault();

    if (!isValidEmail(email)) {
      toast.error('Please enter a valid email address.');
      return;
    }
    if (!password) {
      toast.error('Please enter your password.');
      return;
    }

    setIsLoading(true);

    try {
      const formData = new FormData();
      formData.append('email', email);
      formData.append('password', password);

      const res = await loginUser(formData);
      setIsLoading(false);

      if (!res.success) {
        toast.error(res.error || 'Invalid email or password.');
        return;
      }

      toast.success('Signed in successfully!');

      if (res.isOnboarded) {
        router.refresh();
        router.push('/chat');
      } else {
        onSwitchToRegister({
          email,
          user: res.user,
          step: 2,
        });
      }
    } catch {
      setIsLoading(false);
      toast.error('Could not connect to authentication service. Please try again.');
    }
  }

  return (
    <div className="w-full space-y-6 select-none">
      <div className="text-center space-y-1.5">
        <h2 className="text-2xl font-bold tracking-tight text-slate-900">Sign In</h2>
        <p className="text-xs text-slate-500">Enter your credentials to access your account</p>
      </div>

      <form onSubmit={handleLogin} className="space-y-4">
        <Input
          id="login-email"
          label="Email Address"
          type="email"
          placeholder="name@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          icon={IconMail}
          required
          autoComplete="email"
        />

        <Input
          id="login-password"
          label="Password"
          type="password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          icon={IconLock}
          required
          autoComplete="current-password"
        />

        <Button
          type="submit"
          size="lg"
          className="w-full mt-2"
          isLoading={isLoading}
          icon={IconArrowRight}
        >
          Sign In
        </Button>
      </form>

      {/* Switch to Register */}
      <div className="pt-4 border-t border-slate-100 text-center">
        <p className="text-sm text-slate-600">
          Don&apos;t have an account?{' '}
          <button
            type="button"
            onClick={() => onSwitchToRegister({ email })}
            className="text-[#1f6fb2] hover:text-[#18558a] font-semibold cursor-pointer underline"
          >
            Register
          </button>
        </p>
      </div>
    </div>
  );
}
