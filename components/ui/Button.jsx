import { IconSpinner } from '@/components/icons/Icons';

export function Button({
  children,
  type = 'button',
  variant = 'primary',
  size = 'md',
  isLoading = false,
  disabled = false,
  onClick,
  className = '',
  icon: Icon,
  ...props
}) {
  const baseStyles =
    'relative inline-flex items-center justify-center font-medium rounded-xl transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shadow-sm touch-manipulation select-none';

  const sizeStyles = {
    sm: 'px-3.5 py-2 text-xs gap-1.5',
    md: 'px-5 py-2.5 text-sm gap-2',
    lg: 'px-6 py-3.5 text-base gap-2.5 font-semibold',
  };

  const variantStyles = {
    primary:
      'bg-gradient-to-r from-[#1f6fb2] to-[#2ec4b6] hover:opacity-95 text-white focus:ring-[#1f6fb2] shadow-md shadow-[#1f6fb2]/25 active:scale-[0.98]',
    secondary:
      'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 hover:border-slate-300 focus:ring-[#1f6fb2] active:scale-[0.98]',
    ghost:
      'bg-transparent text-slate-600 hover:bg-slate-100/70 hover:text-slate-900 focus:ring-slate-400',
    outline:
      'border-2 border-[#1f6fb2] text-[#1f6fb2] hover:bg-[#1f6fb2]/5 focus:ring-[#1f6fb2]',
  };

  return (
    <button
      type={type}
      disabled={disabled || isLoading}
      onClick={onClick}
      className={`${baseStyles} ${sizeStyles[size]} ${variantStyles[variant]} ${className}`}
      {...props}
    >
      {isLoading ? (
        <>
          <IconSpinner className="w-4 h-4 text-current" />
          <span>Processing...</span>
        </>
      ) : (
        <>
          {Icon && <Icon className="w-4 h-4" />}
          {children}
        </>
      )}
    </button>
  );
}
