'use client';

import { useState, useEffect, createContext, useContext, useCallback } from 'react';
import { IconCheck, IconX, IconInfo } from '@/components/icons/Icons';

const ToastContext = createContext({
  showToast: () => {},
  success: () => {},
  error: () => {},
  info: () => {},
});

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(({ message, type = 'info', duration = 4000 }) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, type, duration }]);
  }, []);

  const success = useCallback((message, duration = 4000) => {
    showToast({ message, type: 'success', duration });
  }, [showToast]);

  const error = useCallback((message, duration = 5000) => {
    showToast({ message, type: 'error', duration });
  }, [showToast]);

  const info = useCallback((message, duration = 4000) => {
    showToast({ message, type: 'info', duration });
  }, [showToast]);

  return (
    <ToastContext.Provider value={{ showToast, success, error, info }}>
      {children}
      {/* Toast Notification Container */}
      <div className="fixed top-5 right-5 z-[9999] flex flex-col gap-2.5 max-w-sm w-full pointer-events-none px-4 sm:px-0">
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onDismiss={() => removeToast(toast.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}

/**
 * Individual Toast notification with timed auto-dismiss and animated progress bar
 */
function ToastItem({ toast, onDismiss }) {
  const [progress, setProgress] = useState(100);

  useEffect(() => {
    const startTime = Date.now();
    const interval = 16; // ~60fps
    const timer = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, 100 - (elapsed / toast.duration) * 100);
      setProgress(remaining);
      if (remaining <= 0) {
        clearInterval(timer);
        onDismiss();
      }
    }, interval);

    return () => clearInterval(timer);
  }, [toast.duration, onDismiss]);

  const isSuccess = toast.type === 'success';
  const isError = toast.type === 'error';

  return (
    <div
      role="alert"
      className="pointer-events-auto relative w-full overflow-hidden rounded-2xl bg-white/95 backdrop-blur-md shadow-2xl border border-slate-200/90 p-4 transition-all duration-300 animate-in slide-in-from-top-3 fade-in"
    >
      <div className="flex items-start gap-3">
        {/* Type Icon */}
        <div
          className={`w-8 h-8 rounded-xl shrink-0 flex items-center justify-center text-white shadow-xs ${
            isSuccess
              ? 'bg-gradient-to-tr from-emerald-500 to-teal-400'
              : isError
              ? 'bg-gradient-to-tr from-rose-500 to-pink-500'
              : 'bg-gradient-to-tr from-[#1f6fb2] to-[#2ec4b6]'
          }`}
        >
          {isSuccess && <IconCheck className="w-4 h-4 stroke-[3]" />}
          {isError && <IconX className="w-4 h-4 stroke-[3]" />}
          {!isSuccess && !isError && <IconInfo className="w-4 h-4" />}
        </div>

        {/* Message Content */}
        <div className="min-w-0 flex-1 pt-0.5">
          <p className="text-xs font-semibold text-slate-900 leading-snug">
            {isSuccess ? 'Success' : isError ? 'Error' : 'Notice'}
          </p>
          <p className="text-xs text-slate-600 mt-0.5 leading-relaxed break-words">
            {toast.message}
          </p>
        </div>

        {/* Dismiss Button */}
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
          title="Close notification"
        >
          <IconX className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Real-time Progress Countdown Bar */}
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-slate-100">
        <div
          className={`h-full transition-all duration-75 ease-linear ${
            isSuccess
              ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
              : isError
              ? 'bg-gradient-to-r from-rose-500 to-pink-500'
              : 'bg-gradient-to-r from-[#1f6fb2] to-[#2ec4b6]'
          }`}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
