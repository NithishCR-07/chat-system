'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { useChatRealtime } from '@/lib/hooks/useChatRealtime';
import { ChatSidebar } from './ChatSidebar';
import { ChatMessageList } from './ChatMessageList';
import { ChatMessageInput } from './ChatMessageInput';
import { IconArrowLeft, IconInfo, IconPlus, IconUsers } from '@/components/icons/Icons';

const NewChatModal = dynamic(
  () => import('./NewChatModal').then((mod) => mod.NewChatModal),
  { ssr: false }
);

const GroupInfoModal = dynamic(
  () => import('./GroupInfoModal').then((mod) => mod.GroupInfoModal),
  { ssr: false }
);

const UserProfileModal = dynamic(
  () => import('./UserProfileModal').then((mod) => mod.UserProfileModal),
  { ssr: false }
);

const ProfileSettingsModal = dynamic(
  () => import('./ProfileSettingsModal').then((mod) => mod.ProfileSettingsModal),
  { ssr: false }
);

/**
 * DirectChatClient
 *
 * Presentation & Layout coordinator for Direct (1:1) and Group (1:N) messaging.
 * Fully responsive for desktop, tablets, and mobile devices across LAN.
 */
export function DirectChatClient({ initialUser, initialConversations = [] }) {
  const [currentUser, setCurrentUser] = useState(initialUser);
  const [isNewChatOpen, setIsNewChatOpen] = useState(false);
  const [newChatTab, setNewChatTab] = useState('direct'); // 'direct' | 'group'
  const [isGroupInfoOpen, setIsGroupInfoOpen] = useState(false);
  const [isUserProfileOpen, setIsUserProfileOpen] = useState(false);
  const [isProfileSettingsOpen, setIsProfileSettingsOpen] = useState(false);

  const {
    conversations,
    selectedConvId,
    setSelectedConvId,
    activeConversation,
    activeRecipient,
    activeParticipants,
    isGroup,
    messages,
    isLoadingMessages,
    isLoadingOlder,
    hasMore,
    isRecipientTyping,
    typingUsers,
    onlineUserIds,
    handleSendMessage,
    handleSendAttachment,
    handleRetryMessage,
    handleDeleteMessage,
    handleLoadOlderMessages,
    handleTyping,
    handleOpenNewConversation,
    handleGroupUpdated,
    handleLeaveGroup,
    refreshConversations,
  } = useChatRealtime({
    initialUser,
    initialConversations,
  });

  const currentUserId = initialUser?.id;

  function handleOpenNewChat(tab = 'direct') {
    setNewChatTab(tab);
    setIsNewChatOpen(true);
  }

  async function handleConversationOpened(convOrId) {
    if (typeof convOrId === 'object' && convOrId !== null) {
      handleOpenNewConversation(convOrId, true, true);
    } else if (typeof convOrId === 'string') {
      await refreshConversations(convOrId);
    }
  }

  const isChatOpen = Boolean(selectedConvId && (activeConversation || isLoadingMessages));

  // Determine display values
  let chatTitle = 'Chat';
  let chatSubtitle = '';
  let avatarInitial = 'C';
  let isOnline = false;

  const resolvedAvatarUrl = isGroup
    ? activeConversation?.avatar_url
    : (activeRecipient?.avatar_url || activeConversation?.recipient?.avatar_url || '');

  if (isGroup) {
    chatTitle = activeConversation?.name || 'Group Chat';
    const groupMembers = activeParticipants?.length > 0 ? activeParticipants : (activeConversation?.participants || []);
    const memberNames = groupMembers
      .map((p) => p.full_name || p.username || 'Member')
      .slice(0, 4)
      .join(', ');
    const count = groupMembers.length || activeConversation?.memberCount || 1;
    const remaining = groupMembers.length > 4 ? ` +${groupMembers.length - 4}` : '';
    chatSubtitle = memberNames ? `${count} members: ${memberNames}${remaining}` : `${count} members`;
    avatarInitial = chatTitle.charAt(0).toUpperCase();
  } else if (activeRecipient) {
    chatTitle = activeRecipient.full_name || activeRecipient.email?.split('@')[0] || 'User';
    chatSubtitle = activeRecipient.username ? `@${activeRecipient.username}` : activeRecipient.email;
    avatarInitial = chatTitle.charAt(0).toUpperCase();
    isOnline =
      activeRecipient?.id &&
      (onlineUserIds.has(activeRecipient.id) || activeRecipient.status === 'online');
  } else if (activeConversation) {
    chatTitle = activeConversation.name || 'Chat';
    chatSubtitle = activeConversation.type === 'group' ? 'Group Chat' : 'Direct Chat';
    avatarInitial = chatTitle.charAt(0).toUpperCase();
  }

  function handleHeaderClick() {
    if (isGroup) {
      setIsGroupInfoOpen(true);
    } else if (activeRecipient) {
      setIsUserProfileOpen(true);
    }
  }

  return (
    <div className="flex h-[100dvh] max-h-[100dvh] bg-[#f8fafc] text-slate-800 overflow-hidden font-sans touch-manipulation">
      {/* 1. Sidebar Navigation (Hidden on mobile when chat is open) */}
      <div
        className={`${
          isChatOpen ? 'hidden md:flex' : 'flex'
        } w-full md:w-80 shrink-0 h-full`}
      >
        <ChatSidebar
          conversations={conversations}
          selectedConvId={selectedConvId}
          onSelectConversation={(id) => setSelectedConvId(id)}
          onOpenNewChat={handleOpenNewChat}
          onOpenProfileSettings={() => setIsProfileSettingsOpen(true)}
          currentUser={currentUser}
          onlineUserIds={onlineUserIds}
        />
      </div>

      {/* 2. Main Chat Window (Full width on mobile when chat is open) */}
      <div
        className={`${
          !isChatOpen && 'hidden md:flex'
        } flex-1 flex flex-col bg-white h-full min-w-0`}
      >
        {isChatOpen ? (
          <>
            {/* Active Header */}
            <div className="h-16 border-b border-slate-200 px-4 md:px-6 flex items-center justify-between bg-white shrink-0">
              <div className="flex items-center gap-2.5 md:gap-3 min-w-0">
                {/* Mobile Back Button */}
                <button
                  type="button"
                  onClick={() => setSelectedConvId(null)}
                  className="md:hidden p-2 -ml-2 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 cursor-pointer active:scale-95 transition-all"
                  title="Back to conversations"
                >
                  <IconArrowLeft className="w-5 h-5" />
                </button>

                {/* Avatar with Click to View Info */}
                <div
                  className="relative shrink-0 cursor-pointer group/avatar"
                  onClick={handleHeaderClick}
                  title={isGroup ? 'View Group Info' : 'View Contact Profile'}
                >
                  <div
                    className={`w-10 h-10 rounded-xl overflow-hidden ${
                      isGroup
                        ? 'bg-gradient-to-tr from-[#6366f1] to-[#3b82f6]'
                        : 'bg-gradient-to-tr from-[#1f6fb2] to-[#2ec4b6]'
                    } text-white flex items-center justify-center font-bold text-sm shadow-xs transition-transform group-hover/avatar:scale-105`}
                  >
                    {resolvedAvatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={resolvedAvatarUrl}
                        alt={chatTitle}
                        className="w-full h-full object-cover rounded-xl"
                      />
                    ) : (
                      avatarInitial
                    )}
                  </div>

                  {isGroup ? (
                    <span
                      className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-slate-800 text-white text-[9px] flex items-center justify-center ring-2 ring-white"
                      title="Group"
                    >
                      👥
                    </span>
                  ) : isOnline ? (
                    <span
                      className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 ring-2 ring-white"
                      title="Online"
                    />
                  ) : null}
                </div>

                {/* Title and Subtitle */}
                <div
                  className="min-w-0 cursor-pointer"
                  onClick={handleHeaderClick}
                  title={isGroup ? 'View Group Info' : 'View Contact Profile'}
                >
                  <h2 className="font-bold text-sm text-slate-900 leading-tight truncate hover:text-[#1f6fb2] transition-colors">
                    {chatTitle}
                  </h2>
                  <p className="text-xs text-slate-500 truncate font-mono">
                    {chatSubtitle}
                  </p>
                </div>
              </div>

              {/* Right Header Action Badges */}
              <div className="flex items-center gap-2">
                {isGroup ? (
                  <button
                    type="button"
                    onClick={() => setIsGroupInfoOpen(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors cursor-pointer"
                    title="Group Information"
                  >
                    <IconInfo className="w-3.5 h-3.5 text-[#1f6fb2]" />
                    <span className="hidden sm:inline">Group Info</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsUserProfileOpen(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors cursor-pointer"
                    title="View Profile"
                  >
                    <IconInfo className="w-3.5 h-3.5 text-[#1f6fb2]" />
                    <span className="hidden sm:inline">Profile</span>
                  </button>
                )}
              </div>
            </div>

            {/* Message Stream */}
            <ChatMessageList
              messages={messages}
              currentUserId={currentUserId}
              currentUser={currentUser}
              recipient={activeRecipient}
              conversation={activeConversation}
              isGroup={isGroup}
              isLoading={isLoadingMessages}
              isLoadingOlder={isLoadingOlder}
              hasMore={hasMore}
              onLoadOlder={handleLoadOlderMessages}
              onRetryMessage={handleRetryMessage}
              onDeleteMessage={handleDeleteMessage}
              isRecipientTyping={isRecipientTyping}
              typingUsers={typingUsers}
            />

            {/* Non-Blocking Message Input */}
            <ChatMessageInput
              recipientName={isGroup ? activeConversation?.name || 'group' : chatTitle}
              onSendMessage={handleSendMessage}
              onSendAttachment={handleSendAttachment}
              onTyping={handleTyping}
            />
          </>
        ) : (
          /* Empty / Unselected State */
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-4">
            <div className="w-16 h-16 rounded-3xl bg-gradient-to-tr from-[#1f6fb2] to-[#2ec4b6] text-white flex items-center justify-center text-3xl shadow-xl shadow-[#1f6fb2]/20">
              💬
            </div>
            <div className="space-y-1.5 max-w-sm">
              <h2 className="text-xl font-bold text-slate-900">Direct & Group Messaging</h2>
              <p className="text-xs text-slate-500 leading-relaxed">
                Connect and chat in real time. Start a 1-on-1 direct message or form a group
                chat to collaborate with multiple team members.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => handleOpenNewChat('direct')}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-[#1f6fb2] to-[#2ec4b6] text-white text-xs font-semibold rounded-xl hover:opacity-95 transition-all shadow-md shadow-[#1f6fb2]/25 cursor-pointer active:scale-95"
              >
                <IconPlus className="w-4 h-4" />
                <span>New Direct Message</span>
              </button>

              <button
                type="button"
                onClick={() => handleOpenNewChat('group')}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl transition-all shadow-md shadow-indigo-600/25 cursor-pointer active:scale-95"
              >
                <IconUsers className="w-4 h-4" />
                <span>Create New Group</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* New Chat / Group Creation Modal */}
      <NewChatModal
        currentUserId={currentUserId}
        initialTab={newChatTab}
        isOpen={isNewChatOpen}
        onClose={() => setIsNewChatOpen(false)}
        onConversationOpened={handleConversationOpened}
      />

      {/* Group Info Drawer / Modal */}
      {isGroup && activeConversation && (
        <GroupInfoModal
          isOpen={isGroupInfoOpen}
          onClose={() => setIsGroupInfoOpen(false)}
          conversation={activeConversation}
          currentUser={currentUser}
          onlineUserIds={onlineUserIds}
          onGroupUpdated={handleGroupUpdated}
          onLeaveGroup={handleLeaveGroup}
        />
      )}

      {/* Direct User Profile Modal */}
      {!isGroup && activeRecipient && (
        <UserProfileModal
          isOpen={isUserProfileOpen}
          onClose={() => setIsUserProfileOpen(false)}
          recipient={activeRecipient}
          isOnline={isOnline}
        />
      )}

      {/* Profile Settings Modal */}
      <ProfileSettingsModal
        isOpen={isProfileSettingsOpen}
        onClose={() => setIsProfileSettingsOpen(false)}
        currentUser={currentUser}
        onProfileUpdated={(updated) => setCurrentUser(updated)}
      />
    </div>
  );
}
