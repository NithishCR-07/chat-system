export default function ChatLoading() {
  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center gap-3 select-none">
      <div className="w-10 h-10 rounded-full border-4 border-slate-100 border-t-[#1f6fb2] animate-spin" />
      <p className="text-xs font-medium text-slate-400">Loading messages...</p>
    </div>
  );
}
