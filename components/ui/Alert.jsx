export function Alert({ type = 'info', message, title, className = '', onClose }) {
  if (!message) return null;

  const styles = {
    info: 'bg-blue-50 border-blue-200 text-blue-800',
    success: 'bg-emerald-50 border-emerald-200 text-emerald-800',
    warning: 'bg-amber-50 border-amber-200 text-amber-800',
    error: 'bg-rose-50 border-rose-200 text-rose-800',
  };

  const icons = {
    info: '💡',
    success: '✅',
    warning: '⚠️',
    error: '⛔',
  };

  return (
    <div
      className={`flex items-start gap-3 p-3.5 rounded-xl border text-sm transition-all duration-200 ${styles[type]} ${className}`}
    >
      <span className="text-base select-none shrink-0">{icons[type]}</span>
      <div className="flex-1 text-left">
        {title && <h4 className="font-semibold mb-0.5">{title}</h4>}
        <p className="text-xs leading-relaxed">{message}</p>
      </div>
      {onClose && (
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-600 -mr-1 -mt-1 p-1 text-xs cursor-pointer"
        >
          ✕
        </button>
      )}
    </div>
  );
}
