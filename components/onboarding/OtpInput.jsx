'use client';

import { useRef, useEffect } from 'react';

/**
 * Reusable 6-Digit OTP Box Component with paste, keyboard navigation, and auto-focus
 */
export function OtpInput({
  value = ['', '', '', '', '', ''],
  onChange,
  onComplete,
  disabled = false,
  hasError = false,
}) {
  const inputsRef = useRef([]);

  useEffect(() => {
    // Auto-focus first input on mount if empty
    if (!disabled && inputsRef.current[0] && value.every((v) => !v)) {
      inputsRef.current[0].focus();
    }
  }, [disabled, value]);

  function handleChange(index, e) {
    const rawVal = e.target.value;
    // Allow only single numeric digit
    const digit = rawVal.replace(/\D/g, '').slice(-1);

    const nextValue = [...value];
    nextValue[index] = digit;
    onChange(nextValue);

    if (digit && index < 5) {
      inputsRef.current[index + 1]?.focus();
    }

    // If all digits are filled, notify completion
    if (digit && index === 5 && nextValue.every((d) => d !== '') && onComplete) {
      onComplete(nextValue.join(''));
    }
  }

  function handleKeyDown(index, e) {
    if (e.key === 'Backspace') {
      if (!value[index] && index > 0) {
        inputsRef.current[index - 1]?.focus();
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      e.preventDefault();
      inputsRef.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < 5) {
      e.preventDefault();
      inputsRef.current[index + 1]?.focus();
    }
  }

  function handlePaste(e) {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text/plain').trim();
    const digitsOnly = pastedData.replace(/\D/g, '').slice(0, 6);

    if (!digitsOnly) return;

    const nextValue = [...value];
    for (let i = 0; i < 6; i++) {
      nextValue[i] = digitsOnly[i] || '';
    }
    onChange(nextValue);

    // Focus on the next empty box or the last box
    const nextEmptyIndex = nextValue.findIndex((d) => !d);
    if (nextEmptyIndex !== -1) {
      inputsRef.current[nextEmptyIndex]?.focus();
    } else {
      inputsRef.current[5]?.focus();
      if (onComplete && digitsOnly.length === 6) {
        onComplete(digitsOnly);
      }
    }
  }

  return (
    <div className="flex items-center justify-center gap-2 sm:gap-3" onPaste={handlePaste}>
      {value.map((digit, idx) => (
        <input
          key={idx}
          ref={(el) => (inputsRef.current[idx] = el)}
          type="text"
          inputMode="numeric"
          autoComplete={idx === 0 ? 'one-time-code' : 'off'}
          pattern="[0-9]*"
          maxLength={1}
          value={digit}
          disabled={disabled}
          onChange={(e) => handleChange(idx, e)}
          onKeyDown={(e) => handleKeyDown(idx, e)}
          className={`w-11 h-13 sm:w-12 sm:h-14 text-center text-xl font-bold rounded-2xl border transition-all outline-none ${
            hasError
              ? 'border-rose-300 bg-rose-50/50 text-rose-900 focus:border-rose-500 focus:ring-4 focus:ring-rose-500/15'
              : digit
              ? 'border-[#1f6fb2] bg-white text-slate-900 ring-2 ring-[#1f6fb2]/20 shadow-xs'
              : 'border-slate-200/90 bg-slate-50/80 text-slate-800 hover:border-slate-300 focus:bg-white focus:border-[#1f6fb2] focus:ring-4 focus:ring-[#1f6fb2]/15'
          } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        />
      ))}
    </div>
  );
}
