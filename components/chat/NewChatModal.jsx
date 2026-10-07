'use client';
/* eslint-disable @next/next/no-img-element */

import { useState, useEffect, useRef } from 'react';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import {
  IconUserPlus,
  IconUserGroup,
  IconMail,
  IconX,
  IconCheck,
  IconSpinner,
  IconSearch,
  IconCamera,
  IconTrash,
} from '@/components/icons/Icons';
import {
  getOrCreateConversation,
  createGroupConversation,
  uploadGroupAvatarAction,
  searchUsers,
} from '@/lib/actions/chat';

/**
 * High-fidelity User Avatar Badge with real avatar image support and online dot
 */
function UserAvatarBadge({ user, size = 'sm' }) {
  const [imgError, setImgError] = useState(false);
  const isOnline = user?.status === 'online';
  const name = user?.full_name || user?.username || user?.email || 'User';
  const initial = name.charAt(0).toUpperCase();

  const sizeClasses = size === 'sm' ? 'w-8 h-8 text-xs' : 'w-10 h-10 text-sm';

  return (
    <div className="relative shrink-0">
      {user?.avatar_url && !imgError ? (
        <img
          src={user.avatar_url}
          alt={name}
          className={`${sizeClasses} rounded-xl object-cover border border-slate-200/80 shadow-2xs`}
          onError={() => setImgError(true)}
        />
      ) : (
        <div
          className={`${sizeClasses} rounded-xl bg-gradient-to-tr from-[#1f6fb2] to-[#2ec4b6] text-white flex items-center justify-center font-bold shadow-2xs`}
        >
          {initial}
        </div>
      )}
      <span
        className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white ${
          isOnline ? 'bg-emerald-500' : 'bg-slate-300'
        }`}
        title={isOnline ? 'Online' : 'Offline'}
      />
    </div>
  );
}

export function NewChatModal({
  currentUserId,
  initialTab = 'direct',
  onConversationOpened,
  isOpen,
  onClose,
}) {
  const [activeTab, setActiveTab] = useState(initialTab); // 'direct' | 'group'

  // Direct chat state
  const [directQuery, setDirectQuery] = useState('');
  const [directSearchResults, setDirectSearchResults] = useState([]);
  const [isSearchingDirect, setIsSearchingDirect] = useState(false);

  // Group chat state
  const [groupName, setGroupName] = useState('');
  const [groupDescription, setGroupDescription] = useState('');
  const [groupMemberQuery, setGroupMemberQuery] = useState('');
  const [groupSearchResults, setGroupSearchResults] = useState([]);
  const [isSearchingGroupMembers, setIsSearchingGroupMembers] = useState(false);
  const [selectedGroupMembers, setSelectedGroupMembers] = useState([]);
  const [groupAvatarPreview, setGroupAvatarPreview] = useState('');
  const [groupAvatarFile, setGroupAvatarFile] = useState(null);
  const groupFileInputRef = useRef(null);

  // Shared state
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Clean local blob URLs on unmount
  useEffect(() => {
    return () => {
      if (groupAvatarPreview && groupAvatarPreview.startsWith('blob:')) {
        try {
          URL.revokeObjectURL(groupAvatarPreview);
        } catch {
          // Handled
        }
      }
    };
  }, [groupAvatarPreview]);

  function handleGroupAvatarSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setError('Group avatar file size must be less than 5MB.');
      return;
    }

    if (!file.type.startsWith('image/')) {
      setError('Please select an image file (JPEG, PNG, WebP, GIF).');
      return;
    }

    setError('');
    setGroupAvatarFile(file);
    const objectUrl = URL.createObjectURL(file);
    setGroupAvatarPreview(objectUrl);
  }

  function handleRemoveGroupAvatar() {
    setGroupAvatarFile(null);
    if (groupAvatarPreview && groupAvatarPreview.startsWith('blob:')) {
      try {
        URL.revokeObjectURL(groupAvatarPreview);
      } catch {
        // Handled
      }
    }
    setGroupAvatarPreview('');
    if (groupFileInputRef.current) groupFileInputRef.current.value = '';
  }

  function handleDirectQueryChange(e) {
    const val = e.target.value;
    setDirectQuery(val);
    if (!val.trim()) {
      setDirectSearchResults([]);
      setIsSearchingDirect(false);
    } else {
      setIsSearchingDirect(true);
    }
    if (error) setError('');
  }

  function handleGroupMemberQueryChange(e) {
    const val = e.target.value;
    setGroupMemberQuery(val);
    if (!val.trim()) {
      setGroupSearchResults([]);
      setIsSearchingGroupMembers(false);
    } else {
      setIsSearchingGroupMembers(true);
    }
  }

  function handleModalClose() {
    setDirectQuery('');
    setDirectSearchResults([]);
    setGroupName('');
    setGroupDescription('');
    setGroupMemberQuery('');
    setGroupSearchResults([]);
    setSelectedGroupMembers([]);
    handleRemoveGroupAvatar();
    setError('');
    setSuccess('');
    onClose();
  }

  // 1. Live Dynamic Debounced Search for Direct Chat (only when user types)
  useEffect(() => {
    const trimmed = directQuery.trim();
    if (!isOpen || activeTab !== 'direct' || !trimmed) return;

    let isMounted = true;

    const timer = setTimeout(async () => {
      try {
        const res = await searchUsers(trimmed, currentUserId);
        if (!isMounted) return;
        setIsSearchingDirect(false);
        if (res?.success) {
          setDirectSearchResults(res.users || []);
        } else {
          setDirectSearchResults([]);
        }
      } catch {
        if (isMounted) {
          setIsSearchingDirect(false);
          setDirectSearchResults([]);
        }
      }
    }, 250);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [directQuery, currentUserId, activeTab, isOpen]);

  // 2. Live Dynamic Debounced Search for Group Members (only when user types)
  useEffect(() => {
    const trimmed = groupMemberQuery.trim();
    if (!isOpen || activeTab !== 'group' || !trimmed) return;

    let isMounted = true;

    const timer = setTimeout(async () => {
      try {
        const res = await searchUsers(trimmed, currentUserId);
        if (!isMounted) return;
        setIsSearchingGroupMembers(false);
        if (res?.success) {
          setGroupSearchResults(res.users || []);
        } else {
          setGroupSearchResults([]);
        }
      } catch {
        if (isMounted) {
          setIsSearchingGroupMembers(false);
          setGroupSearchResults([]);
        }
      }
    }, 250);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [groupMemberQuery, currentUserId, activeTab, isOpen]);

  // Derived filtered suggestions for groups (excluding already selected members)
  const existingGroupMemberIds = new Set(selectedGroupMembers.map((m) => m.id));
  const visibleGroupSuggestions = groupSearchResults.filter(
    (u) => !existingGroupMemberIds.has(u.id)
  );

  // Handle Starting Direct Chat
  async function handleStartDirectChat(recipientInput) {
    if (!recipientInput) return;
    setError('');
    setSuccess('');
    setIsLoading(true);

    try {
      const res = await getOrCreateConversation({
        recipientInput,
        userId: currentUserId,
      });
      setIsLoading(false);

      if (!res?.success) {
        if (res?.isInvite) {
          setSuccess(res.error);
          setDirectQuery('');
          return;
        }
        setError(res?.error || 'Failed to start conversation.');
        return;
      }

      const newConversation = {
        id: res.conversationId,
        type: 'direct',
        recipient: res.recipient,
        lastMessage: null,
        updatedAt: new Date().toISOString(),
      };

      handleModalClose();
      if (onConversationOpened) {
        onConversationOpened(newConversation);
      }
    } catch {
      setIsLoading(false);
      setError('Could not connect to server. Please check your network.');
    }
  }

  // Handle Starting Group Chat
  async function handleCreateGroup(e) {
    e.preventDefault();
    if (!groupName.trim()) {
      setError('Group name is required.');
      return;
    }
    if (selectedGroupMembers.length === 0) {
      setError('Please select at least 1 other contact to add to the group.');
      return;
    }

    setError('');
    setSuccess('');
    setIsLoading(true);

    try {
      const memberIds = selectedGroupMembers.map((u) => u.id);
      const res = await createGroupConversation({
        name: groupName.trim(),
        description: groupDescription.trim(),
        memberIds,
        creatorId: currentUserId,
      });

      setIsLoading(false);

      if (!res?.success || !res.conversation) {
        setError(res?.error || 'Failed to create group.');
        return;
      }

      // If group avatar was selected, upload and attach to conversation
      if (groupAvatarFile && res.conversation) {
        try {
          const formData = new FormData();
          formData.append('file', groupAvatarFile);
          formData.append('conversationId', res.conversation.id || res.conversationId);
          formData.append('actorId', currentUserId);
          const uploadRes = await uploadGroupAvatarAction(formData);
          if (uploadRes?.success && uploadRes.avatarUrl) {
            res.conversation.avatar_url = uploadRes.avatarUrl;
          }
        } catch (uploadErr) {
          console.warn('Group avatar upload notice:', uploadErr);
        }
      }

      handleModalClose();
      if (onConversationOpened) {
        onConversationOpened(res.conversation);
      }
    } catch {
      setIsLoading(false);
      setError('Could not create group. Please check your connection.');
    }
  }

  function handleToggleGroupMember(user) {
    setSelectedGroupMembers((prev) => {
      const exists = prev.find((u) => u.id === user.id);
      if (exists) {
        return prev.filter((u) => u.id !== user.id);
      }
      return [...prev, user];
    });
    setGroupMemberQuery('');
    setGroupSearchResults([]);
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="fixed inset-0" onClick={handleModalClose} aria-hidden="true" />

      <div
        role="dialog"
        aria-modal="true"
        className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-200/80 overflow-hidden z-10 flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-150"
      >
        {/* Modal Header & Tabs */}
        <div className="p-5 border-b border-slate-100 bg-white shrink-0">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-[#1f6fb2] to-[#2ec4b6] text-white flex items-center justify-center shadow-md shadow-[#1f6fb2]/20 ring-4 ring-[#1f6fb2]/10">
                {activeTab === 'direct' ? (
                  <IconUserPlus className="w-5 h-5 stroke-[2.2]" />
                ) : (
                  <IconUserGroup className="w-5 h-5 stroke-[2.2]" />
                )}
              </div>
              <div>
                <h3 className="font-bold text-base text-slate-900 leading-tight">
                  {activeTab === 'direct' ? 'New Direct Message' : 'Create New Group'}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {activeTab === 'direct'
                    ? 'Start a 1-on-1 chat by email or username'
                    : 'Chat with multiple teammates simultaneously'}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleModalClose}
              disabled={isLoading}
              className="w-8 h-8 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              title="Close"
            >
              <IconX className="w-4 h-4" />
            </button>
          </div>

          {/* Tab Switcher */}
          <div className="flex bg-slate-100/80 p-1 rounded-xl gap-1 border border-slate-200/50">
            <button
              type="button"
              onClick={() => {
                setActiveTab('direct');
                setError('');
                setSuccess('');
              }}
              className={`flex-1 py-2 px-3 text-xs font-semibold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-2 ${
                activeTab === 'direct'
                  ? 'bg-gradient-to-r from-[#1f6fb2] to-[#2ec4b6] text-white shadow-sm font-bold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
              }`}
            >
              <IconUserPlus className="w-4 h-4" />
              <span>Direct Message</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab('group');
                setError('');
                setSuccess('');
              }}
              className={`flex-1 py-2 px-3 text-xs font-semibold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-2 ${
                activeTab === 'group'
                  ? 'bg-gradient-to-r from-[#1f6fb2] to-[#2ec4b6] text-white shadow-sm font-bold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
              }`}
            >
              <IconUserGroup className="w-4 h-4" />
              <span>New Group</span>
            </button>
          </div>
        </div>

        {/* Error / Success Feedback */}
        {error && (
          <div className="p-3 bg-rose-50 border-b border-rose-200">
            <Alert type="error" message={error} onClose={() => setError('')} />
          </div>
        )}
        {success && (
          <div className="p-3 bg-emerald-50 border-b border-emerald-200">
            <Alert type="success" message={success} />
          </div>
        )}

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {activeTab === 'direct' ? (
            /* TAB 1: DIRECT 1-ON-1 CHAT */
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!directQuery.trim()) {
                  setError('Please enter a user email or username.');
                  return;
                }
                handleStartDirectChat(directQuery.trim());
              }}
              className="space-y-4"
            >
              <div className="relative">
                <Input
                  id="direct-chat-query"
                  label="Recipient (Email or @Username)"
                  type="text"
                  placeholder="name@company.com or username"
                  value={directQuery}
                  onChange={handleDirectQueryChange}
                  icon={IconMail}
                  autoFocus
                  required
                  disabled={isLoading}
                />
                {isSearchingDirect && (
                  <div className="absolute right-3 top-9 text-[#1f6fb2]">
                    <IconSpinner className="w-4 h-4" />
                  </div>
                )}
              </div>

              {/* Dynamic Suggestions: Only shown when user enters search characters */}
              {directQuery.trim().length > 0 && (
                <div className="space-y-1.5 max-h-56 overflow-y-auto p-1.5 border border-slate-200/80 rounded-2xl bg-slate-50/70 backdrop-blur-xs animate-in fade-in slide-in-from-top-1 duration-150">
                  <div className="flex items-center justify-between px-2 py-1">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      Matching Users ({directSearchResults.length})
                    </p>
                    {isSearchingDirect && (
                      <span className="flex items-center gap-1 text-[10px] text-[#1f6fb2] font-medium">
                        <IconSpinner className="w-3 h-3" />
                        <span>Searching...</span>
                      </span>
                    )}
                  </div>

                  {directSearchResults.length > 0 ? (
                    directSearchResults.map((user) => (
                      <button
                        key={user.id}
                        type="button"
                        onClick={() => handleStartDirectChat(user.email || user.username || user.id)}
                        className="w-full flex items-center justify-between p-2 rounded-xl hover:bg-white hover:shadow-xs transition-all text-left cursor-pointer group border border-transparent hover:border-slate-200/80"
                      >
                        <div className="flex items-center gap-3 overflow-hidden">
                          <UserAvatarBadge user={user} size="sm" />
                          <div className="overflow-hidden min-w-0">
                            <p className="font-semibold text-xs text-slate-900 group-hover:text-[#1f6fb2] transition-colors truncate">
                              {user.full_name || user.username || 'User'}
                            </p>
                            <p className="text-[11px] text-slate-500 font-mono truncate">
                              {user.username ? `@${user.username}` : user.email}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 text-xs font-semibold text-[#1f6fb2] shrink-0 opacity-80 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all">
                          <span>Chat</span>
                          <span>→</span>
                        </div>
                      </button>
                    ))
                  ) : !isSearchingDirect ? (
                    <div className="p-4 text-center">
                      <p className="text-xs text-slate-600">
                        No registered users found matching <span className="font-semibold text-slate-800">&quot;{directQuery}&quot;</span>
                      </p>
                      <p className="text-[11px] text-slate-400 mt-1">
                        Click <span className="font-semibold text-[#1f6fb2]">Start Chat</span> to send an invitation via email.
                      </p>
                    </div>
                  ) : null}
                </div>
              )}

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="md"
                  onClick={handleModalClose}
                  disabled={isLoading}
                >
                  Cancel
                </Button>

                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  isLoading={isLoading}
                  icon={IconCheck}
                >
                  Start Chat
                </Button>
              </div>
            </form>
          ) : (
            /* TAB 2: MULTI-USER GROUP CHAT */
            <form onSubmit={handleCreateGroup} className="space-y-4">
              {/* Group Avatar Selection Card */}
              <div className="flex items-center gap-3.5 p-3.5 bg-slate-50/80 border border-slate-200/80 rounded-2xl">
                <div className="relative group/avatar shrink-0">
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-[#1f6fb2] to-[#2ec4b6] text-white flex items-center justify-center font-bold text-xl shadow-md shadow-[#1f6fb2]/20 overflow-hidden ring-4 ring-[#1f6fb2]/10">
                    {groupAvatarPreview ? (
                      <img
                        src={groupAvatarPreview}
                        alt="Group Avatar"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      (groupName || 'G').charAt(0).toUpperCase()
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => groupFileInputRef.current?.click()}
                    className="absolute -bottom-1 -right-1 w-6 h-6 bg-white text-slate-700 hover:text-[#1f6fb2] rounded-full shadow-md border border-slate-200 flex items-center justify-center cursor-pointer transition-transform hover:scale-110"
                    title="Upload Group Photo"
                  >
                    <IconCamera className="w-3 h-3" />
                  </button>
                  <input
                    ref={groupFileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    className="hidden"
                    onChange={handleGroupAvatarSelect}
                  />
                </div>

                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-slate-800">Group Photo (Optional)</p>
                  <p className="text-[11px] text-slate-500 mb-1.5">Personalize with an icon or image</p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => groupFileInputRef.current?.click()}
                      className="text-xs font-semibold text-[#1f6fb2] hover:underline cursor-pointer"
                    >
                      {groupAvatarPreview ? 'Change Photo' : 'Choose Photo'}
                    </button>
                    {groupAvatarPreview && (
                      <>
                        <span className="text-slate-300">•</span>
                        <button
                          type="button"
                          onClick={handleRemoveGroupAvatar}
                          className="text-xs font-semibold text-rose-600 hover:underline cursor-pointer flex items-center gap-1"
                        >
                          <IconTrash className="w-3 h-3" />
                          <span>Remove</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Group Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Project Launch Team"
                  value={groupName}
                  onChange={(e) => {
                    setGroupName(e.target.value);
                    if (error) setError('');
                  }}
                  className="w-full px-3.5 py-2.5 bg-slate-50/80 border border-slate-200 rounded-xl text-xs text-slate-800 focus:border-[#1f6fb2] focus:ring-4 focus:ring-[#1f6fb2]/10 focus:bg-white outline-none transition-all"
                  autoFocus
                  required
                  disabled={isLoading}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Description (Optional)
                </label>
                <input
                  type="text"
                  placeholder="What is this group for?"
                  value={groupDescription}
                  onChange={(e) => setGroupDescription(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50/80 border border-slate-200 rounded-xl text-xs text-slate-800 focus:border-[#1f6fb2] focus:ring-4 focus:ring-[#1f6fb2]/10 focus:bg-white outline-none transition-all"
                  disabled={isLoading}
                />
              </div>

              {/* Selected Member Chips */}
              {selectedGroupMembers.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold text-slate-600 mb-1.5">
                    Added Members ({selectedGroupMembers.length})
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedGroupMembers.map((m) => (
                      <span
                        key={m.id}
                        className="inline-flex items-center gap-1.5 pl-1.5 pr-2.5 py-1 rounded-xl bg-gradient-to-r from-sky-50 to-teal-50 text-[#1f6fb2] text-xs font-medium border border-sky-200/80 shadow-2xs"
                      >
                        <UserAvatarBadge user={m} size="sm" />
                        <span className="font-semibold text-slate-800">
                          {m.full_name || m.username || m.email}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleToggleGroupMember(m)}
                          className="w-4 h-4 rounded-full flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-100 transition-colors cursor-pointer ml-0.5"
                          title="Remove member"
                        >
                          <IconX className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Member Search input */}
              <div className="relative">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Add Contacts to Group <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-slate-400">
                    <IconSearch className="w-4 h-4" />
                  </span>
                  <input
                    type="text"
                    placeholder="Search user by name, @username, or email..."
                    value={groupMemberQuery}
                    onChange={handleGroupMemberQueryChange}
                    className="w-full pl-9 pr-8 py-2.5 bg-slate-50/80 border border-slate-200 rounded-xl text-xs text-slate-800 focus:border-[#1f6fb2] focus:ring-4 focus:ring-[#1f6fb2]/10 focus:bg-white outline-none transition-all"
                    disabled={isLoading}
                  />
                  {isSearchingGroupMembers && (
                    <div className="absolute right-3 top-2.5 text-[#1f6fb2]">
                      <IconSpinner className="w-4 h-4" />
                    </div>
                  )}
                </div>
              </div>

              {/* Dynamic Group suggestions: Only shown when typing search query */}
              {groupMemberQuery.trim().length > 0 && (
                <div className="space-y-1.5 max-h-48 overflow-y-auto p-1.5 border border-slate-200/80 rounded-2xl bg-slate-50/70 backdrop-blur-xs animate-in fade-in slide-in-from-top-1 duration-150">
                  <div className="flex items-center justify-between px-2 py-1">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      Search Results ({visibleGroupSuggestions.length})
                    </p>
                    {isSearchingGroupMembers && (
                      <span className="flex items-center gap-1 text-[10px] text-[#1f6fb2] font-medium">
                        <IconSpinner className="w-3 h-3" />
                        <span>Searching...</span>
                      </span>
                    )}
                  </div>

                  {visibleGroupSuggestions.length > 0 ? (
                    visibleGroupSuggestions.map((user) => (
                      <button
                        key={user.id}
                        type="button"
                        onClick={() => handleToggleGroupMember(user)}
                        className="w-full flex items-center justify-between p-2 rounded-xl hover:bg-white hover:shadow-xs transition-all text-left cursor-pointer group border border-transparent hover:border-slate-200/80"
                      >
                        <div className="flex items-center gap-3 overflow-hidden">
                          <UserAvatarBadge user={user} size="sm" />
                          <div className="overflow-hidden min-w-0">
                            <p className="font-semibold text-xs text-slate-900 group-hover:text-[#1f6fb2] transition-colors truncate">
                              {user.full_name || user.username || 'User'}
                            </p>
                            <p className="text-[11px] text-slate-500 font-mono truncate">
                              {user.username ? `@${user.username}` : user.email}
                            </p>
                          </div>
                        </div>
                        <span className="px-2.5 py-1 rounded-lg bg-sky-50 text-[#1f6fb2] font-semibold text-xs group-hover:bg-gradient-to-r group-hover:from-[#1f6fb2] group-hover:to-[#2ec4b6] group-hover:text-white transition-all shadow-2xs">
                          + Add
                        </span>
                      </button>
                    ))
                  ) : !isSearchingGroupMembers ? (
                    <div className="p-3 text-center">
                      <p className="text-xs text-slate-500">
                        No contacts found matching &quot;{groupMemberQuery}&quot;
                      </p>
                    </div>
                  ) : null}
                </div>
              )}

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="md"
                  onClick={handleModalClose}
                  disabled={isLoading}
                >
                  Cancel
                </Button>

                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  isLoading={isLoading}
                  disabled={selectedGroupMembers.length === 0 || !groupName.trim()}
                  icon={IconUserGroup}
                >
                  Create Group
                </Button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

