import { getSessionUser } from '@/lib/actions/auth';
import { getConversations } from '@/lib/actions/chat';
import { DirectChatClient } from '@/components/chat/DirectChatClient';
import { redirect } from 'next/navigation';

export const metadata = {
  title: 'Chats & Groups | Chat System',
  description: 'Real-time direct messages and multi-user group chat',
};

export default async function ChatPage() {
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
