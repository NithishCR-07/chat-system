'use client';

import { formatTypingString } from '@/lib/chat/chatEngine';

/**
 * Animated Typing Indicator component supporting single and multi-user group chat.
 */
export function TypingIndicator({ username, typingUsers = [] }) {
  let displayText = '';

  if (Array.isArray(typingUsers) && typingUsers.length > 0) {
    displayText = formatTypingString(typingUsers);
  } else if (username) {
    displayText = `${username} is typing...`;
  } else {
    displayText = 'Someone is typing...';
  }

  return (
    <div className="flex items-center gap-2 py-1.5 px-3 bg-slate-100/90 backdrop-blur-xs rounded-full border border-slate-200/80 w-fit text-[11px] text-slate-600 shadow-2xs animate-in fade-in slide-in-from-bottom-1 duration-150">
      <span className="font-medium text-slate-700 truncate max-w-[220px]">
        {displayText}
      </span>
      <div className="flex items-center gap-1 pl-0.5 shrink-0">
        <span className="w-1.5 h-1.5 rounded-full bg-[#1f6fb2] animate-bounce [animation-delay:-0.3s]" />
        <span className="w-1.5 h-1.5 rounded-full bg-[#1f6fb2] animate-bounce [animation-delay:-0.15s]" />
        <span className="w-1.5 h-1.5 rounded-full bg-[#1f6fb2] animate-bounce" />
      </div>
    </div>
  );
}
