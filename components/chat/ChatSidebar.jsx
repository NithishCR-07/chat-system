'use client';
/* eslint-disable @next/next/no-img-element */

import { useState } from 'react';
import { SignOutButton } from '@/components/auth/SignOutButton';
import { IconPlus, IconSettings } from '@/components/icons/Icons';

export function ChatSidebar({
  conversations = [],
  selectedConvId,
  onSelectConversation,
  onOpenNewChat,
  onOpenProfileSettings,
  currentUser,
  onlineUserIds = new Set(),
}) {
  const [searchFilter, setSearchFilter] = useState('');

  const userFullName = currentUser?.full_name || currentUser?.email?.split('@')[0] || 'You';
  const userEmail = currentUser?.email || '';
  const userInitial = userFullName.charAt(0).toUpperCase();

  // Filter conversations (Direct recipient or Group name)
  const filteredConversations = conversations.filter((c) => {
    const q = searchFilter.toLowerCase().trim();
    if (!q) return true;

    if (c.type === 'group') {
      const gName = (c.name || '').toLowerCase();
      const gDesc = (c.description || '').toLowerCase();
      return gName.includes(q) || gDesc.includes(q);
    }
    const name = c.recipient?.full_name?.toLowerCase() || '';
    const username = c.recipient?.username?.toLowerCase() || '';
    const email = c.recipient?.email?.toLowerCase() || '';
    return name.includes(q) || username.includes(q) || email.includes(q);
  });

  return (
    <div className="w-full bg-white border-r border-slate-200 flex flex-col shrink-0 h-full select-none">
      {/* 1. Sidebar Header */}
      <div className="h-16 border-b border-slate-200 px-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#1f6fb2] to-[#2ec4b6] text-white flex items-center justify-center font-bold text-sm shadow-xs">
            💬
          </div>
          <div>
            <h1 className="font-bold text-base text-slate-900 leading-tight">Messages</h1>
            <p className="text-[11px] text-slate-400">
              {conversations.length} conversation{conversations.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>

        {/* New Chat Action Button */}
        <button
          type="button"
          onClick={() => onOpenNewChat && onOpenNewChat('direct')}
          className="w-8 h-8 rounded-lg bg-gradient-to-tr from-[#1f6fb2] to-[#2ec4b6] text-white hover:opacity-90 flex items-center justify-center text-sm shadow-xs transition-transform active:scale-95 cursor-pointer"
          title="New Direct Message or Group"
        >
          <IconPlus className="w-4 h-4 stroke-[2.5]" />
        </button>
      </div>

      {/* 2. Search Filter */}
      <div className="p-3 border-b border-slate-100 shrink-0">
        <div className="relative">
          <input
            type="text"
            placeholder="Search messages..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-800 placeholder:text-slate-400 outline-none focus:border-[#1f6fb2] focus:bg-white transition-all"
          />
        </div>
      </div>

      {/* 3. Conversation List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {filteredConversations.length > 0 ? (
          filteredConversations.map((conv) => {
            const isSelected = conv.id === selectedConvId;
            const isGroup = conv.type === 'group';

            let title = '';
            let initial = '';
            let isOnline = false;

            if (isGroup) {
              title = conv.name || 'Group Chat';
              initial = title.charAt(0).toUpperCase();
            } else {
              title = conv.recipient?.full_name || conv.recipient?.email?.split('@')[0] || 'User';
              initial = title.charAt(0).toUpperCase();
              isOnline =
                conv.recipient?.id &&
                (onlineUserIds.has(conv.recipient.id) || conv.recipient.status === 'online');
            }

            // Message Snippet
            let lastMsgContent = 'No messages yet';
            if (conv.lastMessage) {
              const senderPrefix =
                isGroup && conv.lastMessage.sender_id !== currentUser?.id
                  ? `${conv.lastMessage.sender?.full_name?.split(' ')[0] || 'Member'}: `
                  : '';

              if (conv.lastMessage.message_type === 'system') {
                lastMsgContent = conv.lastMessage.content;
              } else if (conv.lastMessage.message_type === 'image') {
                lastMsgContent = `${senderPrefix}📷 Photo`;
              } else if (conv.lastMessage.message_type === 'pdf') {
                lastMsgContent = `${senderPrefix}📄 ${conv.lastMessage.file_name || 'PDF Document'}`;
              } else if (conv.lastMessage.message_type === 'file') {
                lastMsgContent = `${senderPrefix}📎 ${conv.lastMessage.file_name || 'Attachment'}`;
              } else {
                lastMsgContent = `${senderPrefix}${conv.lastMessage.content || 'No messages yet'}`;
              }
            }

            const isMyLastMsg =
              conv.lastMessage?.sender_id === currentUser?.id &&
              conv.lastMessage?.message_type !== 'system';

            return (
              <button
                key={conv.id}
                type="button"
                onClick={() => onSelectConversation(conv.id)}
                className={`w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all cursor-pointer ${
                  isSelected
                    ? isGroup
                      ? 'bg-indigo-50/80 border border-indigo-200/80 shadow-2xs'
                      : 'bg-gradient-to-r from-[#1f6fb2]/10 to-[#2ec4b6]/10 border border-[#1f6fb2]/20 shadow-2xs'
                    : 'hover:bg-slate-50 border border-transparent active:bg-slate-100'
                }`}
              >
                {/* Avatar */}
                <div className="relative shrink-0">
                  <div
                    className={`w-10 h-10 rounded-xl overflow-hidden ${
                      isGroup
                        ? 'bg-gradient-to-tr from-[#6366f1] to-[#3b82f6]'
                        : 'bg-gradient-to-tr from-[#1f6fb2] to-[#2ec4b6]'
                    } text-white flex items-center justify-center font-bold text-sm shadow-xs`}
                  >
                    {conv.avatar_url ? (
                      <img
                        src={conv.avatar_url}
                        alt={title}
                        className="w-full h-full object-cover rounded-xl"
                      />
                    ) : !isGroup && conv.recipient?.avatar_url ? (
                      <img
                        src={conv.recipient.avatar_url}
                        alt={title}
                        className="w-full h-full object-cover rounded-xl"
                      />
                    ) : (
                      initial
                    )}
                  </div>

                  {/* Online Indicator for 1:1 or Group badge for groups */}
                  {isGroup ? (
                    <span
                      className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-slate-800 text-white text-[9px] flex items-center justify-center ring-2 ring-white"
                      title="Group Chat"
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

                {/* Conversation Meta */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between mb-0.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <p
                        className={`font-semibold text-xs truncate ${
                          isSelected
                            ? isGroup
                              ? 'text-indigo-700'
                              : 'text-[#1f6fb2]'
                            : 'text-slate-900'
                        }`}
                      >
                        {title}
                      </p>
                      {isGroup && (
                        <span className="text-[10px] text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded-md font-mono font-medium shrink-0 border border-indigo-200/50">
                          {conv.memberCount || conv.participants?.length || 1} members
                        </span>
                      )}
                    </div>

                    {conv.lastMessage?.created_at && (
                      <span className="text-[10px] text-slate-400 shrink-0">
                        {new Date(conv.lastMessage.created_at).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    )}
                  </div>

                  {/* Team Members List Preview for Groups */}
                  {isGroup && conv.participants && conv.participants.length > 0 && (
                    <p className="text-[10px] text-slate-400 truncate mb-0.5 font-sans">
                      👥 {conv.participants.map((p) => p.full_name || p.username || 'Member').slice(0, 3).join(', ')}
                      {conv.participants.length > 3 ? ` +${conv.participants.length - 3}` : ''}
                    </p>
                  )}

                  <p className="text-[11px] text-slate-500 truncate">
                    {isMyLastMsg ? <span className="text-slate-400">You: </span> : ''}
                    {lastMsgContent}
                  </p>
                </div>
              </button>
            );
          })
        ) : (
          <div className="text-center py-10 px-4 space-y-3">
            <div className="w-12 h-12 mx-auto rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center text-xl">
              💬
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-700">
                {searchFilter ? 'No matching conversations' : 'No messages yet'}
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {searchFilter
                  ? 'Try a different search term.'
                  : 'Start a direct chat or create a group to begin messaging.'}
              </p>
            </div>
            {!searchFilter && (
              <div className="flex items-center justify-center pt-1">
                <button
                  type="button"
                  onClick={() => onOpenNewChat && onOpenNewChat('direct')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-tr from-[#1f6fb2] to-[#2ec4b6] text-white text-xs font-medium rounded-lg hover:opacity-90 transition-opacity cursor-pointer shadow-xs"
                >
                  <IconPlus className="w-3.5 h-3.5" />
                  <span>Start a Chat</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 4. User Profile Footer Card */}
      <div className="p-3 border-t border-slate-200 bg-slate-50/70 flex items-center justify-between gap-2.5 shrink-0">
        <button
          type="button"
          onClick={() => onOpenProfileSettings && onOpenProfileSettings()}
          className="flex items-center gap-2.5 min-w-0 flex-1 text-left p-1 -m-1 rounded-xl hover:bg-slate-200/50 transition-colors cursor-pointer group"
          title="Click to edit profile"
        >
          <div className="relative w-9 h-9 rounded-xl overflow-hidden bg-gradient-to-tr from-[#1f6fb2] to-[#2ec4b6] text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-xs ring-2 ring-transparent group-hover:ring-[#1f6fb2]/30 transition-all">
            {currentUser?.avatar_url ? (
              <img
                src={currentUser.avatar_url}
                alt={userFullName}
                className="w-full h-full object-cover"
              />
            ) : (
              userInitial
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-xs text-slate-900 truncate leading-tight group-hover:text-[#1f6fb2] transition-colors">
              {userFullName}
            </p>
            <p className="text-[11px] text-slate-500 truncate" title={userEmail}>
              {currentUser?.username ? `@${currentUser.username}` : userEmail}
            </p>
          </div>
        </button>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => onOpenProfileSettings && onOpenProfileSettings()}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors cursor-pointer"
            title="Profile Settings"
          >
            <IconSettings className="w-4 h-4" />
          </button>
          <SignOutButton />
        </div>
      </div>
    </div>
  );
}



