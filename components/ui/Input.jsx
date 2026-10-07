export function Input({
  id,
  label,
  type = 'text',
  value,
  onChange,
  onBlur,
  placeholder,
  error,
  helperText,
  icon: Icon,
  disabled = false,
  required = false,
  autoComplete,
  prefix,
  className = '',
  ...props
}) {
  return (
    <div className="w-full space-y-1.5 text-left">
      {label && (
        <label
          htmlFor={id}
          className="block text-xs font-semibold uppercase tracking-wider text-slate-700"
        >
          {label} {required && <span className="text-rose-500">*</span>}
        </label>
      )}

      <div className="relative rounded-xl shadow-xs transition-all">
        {Icon && (
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
            <Icon className="w-5 h-5" />
          </div>
        )}

        {prefix && (
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500 font-medium text-sm">
            {prefix}
          </div>
        )}

        <input
          id={id}
          type={type}
          value={value}
          onChange={onChange}
          onBlur={onBlur}
          disabled={disabled}
          placeholder={placeholder}
          autoComplete={autoComplete}
          required={required}
          className={`w-full rounded-xl bg-white border text-sm text-slate-900 placeholder:text-slate-400 py-3 px-3.5 transition-colors duration-200 outline-none
            ${Icon ? 'pl-11' : ''}
            ${prefix ? 'pl-8' : ''}
            ${
              error
                ? 'border-rose-300 focus:border-rose-500 focus:ring-4 focus:ring-rose-500/10'
                : 'border-slate-200 hover:border-slate-300 focus:border-[#1f6fb2] focus:ring-4 focus:ring-[#2ec4b6]/15'
            }
            ${disabled ? 'bg-slate-50 cursor-not-allowed opacity-75' : ''}
            ${className}
          `}
          {...props}
        />
      </div>

      {error && (
        <p className="text-xs font-medium text-rose-600 flex items-center gap-1 mt-1">
          <span>⚠️</span> {error}
        </p>
      )}

      {!error && helperText && (
        <p className="text-xs text-slate-500 mt-1">{helperText}</p>
      )}
    </div>
  );
}
