import { Suspense } from 'react';
import { getSessionUser } from '@/lib/actions/auth';
import { getConversations } from '@/lib/actions/chat';
import { DirectChatClient } from '@/components/chat/DirectChatClient';
import { redirect } from 'next/navigation';

export const metadata = {
  title: 'Chats & Groups | Chat System',
  description: 'Real-time direct messages and multi-user group chat',
};

async function ChatLoader() {
  const sessionData = await getSessionUser();

  // 1. Strict Security Guard: Unauthenticated users redirected to sign in
  if (!sessionData || !sessionData.user) {
    redirect('/');
  }

  // 2. Fetch initial conversations for this authenticated user
  const convsRes = await getConversations(sessionData.user.id);

  const currentUser = {
    id: sessionData.user.id,
    email: sessionData.user.email,
    ...(sessionData.profile || {}),
  };

  return (
    <DirectChatClient
      initialUser={currentUser}
      initialConversations={convsRes.conversations || []}
    />
  );
}

export default function ChatPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-white flex flex-col items-center justify-center gap-3 select-none">
          <div className="w-10 h-10 rounded-full border-4 border-slate-100 border-t-[#1f6fb2] animate-spin" />
          <p className="text-xs font-medium text-slate-400">Loading messages...</p>
        </div>
      }
    >
      <ChatLoader />
    </Suspense>
  );
}
