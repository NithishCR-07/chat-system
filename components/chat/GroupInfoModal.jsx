'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import {
  IconX,
  IconUsers,
  IconUserPlus,
  IconUserMinus,
  IconShield,
  IconCrown,
  IconEdit,
  IconCheck,
  IconSpinner,
  IconLogOut,
  IconSearch,
  IconCamera,
  IconTrash,
} from '@/components/icons/Icons';
import {
  addMembersToGroup,
  removeMemberFromGroup,
  updateGroupDetails,
  uploadGroupAvatarAction,
  searchUsers,
} from '@/lib/actions/chat';
import { createClient } from '@/lib/supabase/client';
import { safeBroadcast } from '@/lib/chat/chatEngine';

/* eslint-disable @next/next/no-img-element */

/**
 * Reusable User Avatar Badge with real avatar support and online status indicator
 */
function UserAvatarBadge({ user, size = 'sm' }) {
  const [imgError, setImgError] = useState(false);
  const isOnline = user?.status === 'online';
  const name = user?.full_name || user?.username || user?.email || 'User';
  const initial = name.charAt(0).toUpperCase();

  const sizeClasses = size === 'sm' ? 'w-8 h-8 text-xs' : 'w-10 h-10 text-xs';

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
      {isOnline && (
        <span
          className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-white"
          title="Online"
        />
      )}
    </div>
  );
}

export function GroupInfoModal({
  isOpen,
  onClose,
  conversation,
  currentUser,
  onlineUserIds = new Set(),
  onGroupUpdated,
  onMemberRemoved,
  onLeaveGroup,
}) {
  const [activeTab, setActiveTab] = useState('members'); // 'members' | 'add_members' | 'settings'
  const [searchQuery, setSearchQuery] = useState('');
  const [nameInput, setNameInput] = useState(conversation?.name || '');
  const [descInput, setDescInput] = useState(conversation?.description || '');
  const [avatarPreview, setAvatarPreview] = useState(conversation?.avatar_url || '');
  const [avatarFile, setAvatarFile] = useState(null);
  const [prevConvId, setPrevConvId] = useState(conversation?.id);
  const [prevConvAvatar, setPrevConvAvatar] = useState(conversation?.avatar_url);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const fileInputRef = useRef(null);

  // Add members state
  const [addQuery, setAddQuery] = useState('');
  const [userSuggestions, setUserSuggestions] = useState([]);
  const [isSearchingUsers, setIsSearchingUsers] = useState(false);
  const [selectedToAdd, setSelectedToAdd] = useState([]);

  const currentUserId = currentUser?.id;
  const isOwner = conversation?.myRole === 'owner' || conversation?.created_by === currentUserId;
  const isAdmin = isOwner || conversation?.myRole === 'admin';
  const participants = useMemo(
    () => conversation?.participants || [],
    [conversation?.participants]
  );

  // Sync inputs during render if active conversation changes
  if (conversation?.id !== prevConvId || conversation?.avatar_url !== prevConvAvatar) {
    setPrevConvId(conversation?.id);
    setPrevConvAvatar(conversation?.avatar_url);
    setNameInput(conversation?.name || '');
    setDescInput(conversation?.description || '');
    setAvatarPreview(conversation?.avatar_url || '');
    setAvatarFile(null);
  }

  // Clean local blob URLs on unmount
  useEffect(() => {
    return () => {
      if (avatarPreview && avatarPreview.startsWith('blob:')) {
        try {
          URL.revokeObjectURL(avatarPreview);
        } catch {
          // Handled
        }
      }
    };
  }, [avatarPreview]);

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
    setAvatarFile(file);
    const objectUrl = URL.createObjectURL(file);
    setAvatarPreview(objectUrl);
  }

  function handleRemoveGroupAvatar() {
    setAvatarFile(null);
    if (avatarPreview && avatarPreview.startsWith('blob:')) {
      try {
        URL.revokeObjectURL(avatarPreview);
      } catch {
        // Handled
      }
    }
    setAvatarPreview('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function handleSearchToAdd(e) {
    const val = typeof e === 'string' ? e : e?.target?.value || '';
    setAddQuery(val);
    if (!val.trim()) {
      setUserSuggestions([]);
      setIsSearchingUsers(false);
    } else {
      setIsSearchingUsers(true);
    }
    if (error) setError('');
  }

  // Live dynamic debounced search for adding new members (only when user types)
  useEffect(() => {
    const trimmed = typeof addQuery === 'string' ? addQuery.trim() : '';
    if (!isOpen || activeTab !== 'add_members' || !trimmed) return;

    let isMounted = true;

    const timer = setTimeout(async () => {
      try {
        const res = await searchUsers(trimmed, currentUserId);
        if (!isMounted) return;
        setIsSearchingUsers(false);
        if (res?.success) {
          const existingMemberIds = new Set(participants.map((p) => p.id || p.user_id));
          const available = (res.users || []).filter((u) => !existingMemberIds.has(u.id));
          setUserSuggestions(available);
        } else {
          setUserSuggestions([]);
        }
      } catch {
        if (isMounted) {
          setIsSearchingUsers(false);
          setUserSuggestions([]);
        }
      }
    }, 250);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [addQuery, activeTab, isOpen, currentUserId, participants]);

  function handleToggleSelectUser(user) {
    setSelectedToAdd((prev) => {
      const exists = prev.find((u) => u.id === user.id);
      if (exists) {
        return prev.filter((u) => u.id !== user.id);
      }
      return [...prev, user];
    });
  }

  if (!isOpen || !conversation) return null;

  // Filter members in group
  const filteredParticipants = participants.filter((p) => {
    const q = searchQuery.toLowerCase();
    const name = (p.full_name || '').toLowerCase();
    const username = (p.username || '').toLowerCase();
    const email = (p.email || '').toLowerCase();
    return name.includes(q) || username.includes(q) || email.includes(q);
  });

  async function handleSaveGroupDetails(e) {
    e.preventDefault();
    if (!nameInput.trim()) {
      setError('Group name cannot be empty.');
      return;
    }

    setError('');
    setSuccess('');
    setIsLoading(true);
    try {
      let finalAvatarUrl = conversation.avatar_url || '';

      // 1. If a new avatar file was picked by the user, upload to Supabase avatars bucket
      if (avatarFile) {
        setIsUploadingAvatar(true);
        const formData = new FormData();
        formData.append('file', avatarFile);
        formData.append('conversationId', conversation.id);
        formData.append('actorId', currentUserId);

        const uploadRes = await uploadGroupAvatarAction(formData);
        setIsUploadingAvatar(false);

        if (!uploadRes?.success) {
          setIsLoading(false);
          setError(uploadRes?.error || 'Failed to upload group avatar.');
          return;
        }
        finalAvatarUrl = uploadRes.avatarUrl;
      } else if (!avatarPreview && conversation.avatar_url) {
        // User explicitly removed the avatar
        finalAvatarUrl = '';
      }

      // 2. Update group metadata in database
      const res = await updateGroupDetails({
        conversationId: conversation.id,
        name: nameInput.trim(),
        description: descInput.trim(),
        avatarUrl: finalAvatarUrl,
        actorId: currentUserId,
      });
      setIsLoading(false);

      if (res?.success) {
        setSuccess('Group details updated successfully.');
        setAvatarFile(null);
        if (onGroupUpdated) {
          onGroupUpdated({
            ...conversation,
            name: nameInput.trim(),
            description: descInput.trim(),
            avatar_url: finalAvatarUrl,
          });
        }

        // Broadcast realtime update to all members
        try {
          const supabase = createClient();
          const globalStream = supabase.channel('global_chat_stream');
          await safeBroadcast(globalStream, 'group_profile_updated', {
            conversationId: conversation.id,
            name: nameInput.trim(),
            description: descInput.trim(),
            avatar_url: finalAvatarUrl,
          });
          supabase.removeChannel(globalStream);

          const roomStream = supabase.channel(`room:${conversation.id}`);
          await safeBroadcast(roomStream, 'group_profile_updated', {
            conversationId: conversation.id,
            name: nameInput.trim(),
            description: descInput.trim(),
            avatar_url: finalAvatarUrl,
          });
          supabase.removeChannel(roomStream);

          const recipientIds =
            res.recipientIds ||
            participants.map((p) => p.id || p.user_id).filter((id) => id !== currentUserId);

          for (const rId of recipientIds) {
            try {
              const userStream = supabase.channel(`user_stream:${rId}`);
              await safeBroadcast(userStream, 'group_profile_updated', {
                conversationId: conversation.id,
                name: nameInput.trim(),
                description: descInput.trim(),
                avatar_url: finalAvatarUrl,
              });
              supabase.removeChannel(userStream);
            } catch {
              // Graceful
            }
          }
        } catch {
          // Graceful
        }
      } else {
        setError(res?.error || 'Failed to update group.');
      }
    } catch {
      setIsLoading(false);
      setIsUploadingAvatar(false);
      setError('Connection error. Please try again.');
    }
  }

  async function handleAddSelectedMembers() {
    if (selectedToAdd.length === 0) return;
    setIsLoading(true);
    setError('');

    try {
      const userIds = selectedToAdd.map((u) => u.id);
      const res = await addMembersToGroup({
        conversationId: conversation.id,
        userIds,
        actorId: currentUserId,
      });

      setIsLoading(false);
      if (res?.success) {
        setSelectedToAdd([]);
        setAddQuery('');
        setUserSuggestions([]);
        setActiveTab('members');
        setSuccess(`Added ${selectedToAdd.length} member(s).`);
        if (onGroupUpdated) {
          onGroupUpdated({
            ...conversation,
            participants: [...participants, ...(res.addedMembers || [])],
            memberCount: participants.length + selectedToAdd.length,
          });
        }
      } else {
        setError(res?.error || 'Failed to add members.');
      }
    } catch {
      setIsLoading(false);
      setError('Could not add members.');
    }
  }

  async function handleRemoveMember(targetUserId, targetUserName = 'this member') {
    if (!confirm(`Are you sure you want to remove ${targetUserName} from the group?`)) return;

    setIsLoading(true);
    try {
      const res = await removeMemberFromGroup({
        conversationId: conversation.id,
        targetUserId,
        actorId: currentUserId,
      });

      setIsLoading(false);
      if (res?.success) {
        const remaining = participants.filter((p) => (p.id || p.user_id) !== targetUserId);
        if (onGroupUpdated) {
          onGroupUpdated({
            ...conversation,
            participants: remaining,
            memberCount: remaining.length,
          });
        }
        if (onMemberRemoved) {
          onMemberRemoved(targetUserId);
        }
        setSuccess(`Removed ${targetUserName} from the group.`);
      } else {
        alert(res?.error || 'Could not remove member.');
      }
    } catch {
      setIsLoading(false);
      alert('Error removing member.');
    }
  }

  async function handleConfirmLeave() {
    if (!confirm('Are you sure you want to leave this group?')) return;

    setIsLoading(true);
    try {
      const res = await removeMemberFromGroup({
        conversationId: conversation.id,
        targetUserId: currentUserId,
        actorId: currentUserId,
      });

      setIsLoading(false);
      if (res?.success) {
        onClose();
        if (onLeaveGroup) {
          onLeaveGroup(conversation.id);
        }
      } else {
        alert(res?.error || 'Could not leave group.');
      }
    } catch {
      setIsLoading(false);
      alert('Error leaving group.');
    }
  }

  const groupInitial = (conversation.name || 'G').charAt(0).toUpperCase();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="fixed inset-0" onClick={onClose} aria-hidden="true" />

      <div
        role="dialog"
        aria-modal="true"
        className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-200/80 overflow-hidden z-10 flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-150"
      >
        {/* 1. Clean Modal Top Header */}
        <div className="p-5 border-b border-slate-100 bg-white shrink-0">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="relative group/head-avatar shrink-0">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-[#1f6fb2] to-[#2ec4b6] text-white flex items-center justify-center font-bold text-xl shadow-md shadow-[#1f6fb2]/20 ring-4 ring-[#1f6fb2]/10 overflow-hidden">
                  {avatarPreview ? (
                    <img
                      src={avatarPreview}
                      alt={conversation.name}
                      className="w-full h-full object-cover rounded-2xl"
                    />
                  ) : (
                    groupInitial
                  )}
                </div>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('settings');
                      setTimeout(() => fileInputRef.current?.click(), 50);
                    }}
                    className="absolute -bottom-1 -right-1 w-5 h-5 bg-white text-slate-700 hover:text-[#1f6fb2] rounded-full shadow border border-slate-200 flex items-center justify-center cursor-pointer transition-transform hover:scale-110"
                    title="Change group avatar"
                  >
                    <IconCamera className="w-2.5 h-2.5" />
                  </button>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <h3 className="font-bold text-base text-slate-900 leading-tight truncate">
                  {conversation.name || 'Group Chat'}
                </h3>
                <div className="flex items-center gap-2 mt-1 text-xs text-slate-500">
                  <span className="flex items-center gap-1">
                    <IconUsers className="w-3.5 h-3.5 text-slate-400" />
                    <span>{participants.length} members</span>
                  </span>
                  <span>•</span>
                  <span className="capitalize font-medium text-[#1f6fb2]">
                    Role: {conversation.myRole === 'owner' ? 'Owner' : conversation.myRole === 'admin' ? 'Admin' : 'Member'}
                  </span>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="w-8 h-8 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              title="Close"
            >
              <IconX className="w-4 h-4" />
            </button>
          </div>

          {conversation.description && activeTab !== 'settings' && (
            <p className="mt-3 text-xs text-slate-600 bg-slate-50 border border-slate-100 p-2.5 rounded-xl leading-relaxed">
              {conversation.description}
            </p>
          )}

          {/* Pill Tab Switcher */}
          <div className="flex bg-slate-100/80 p-1 rounded-xl gap-1 border border-slate-200/50 mt-4">
            <button
              type="button"
              onClick={() => {
                setActiveTab('members');
                setError('');
                setSuccess('');
              }}
              className={`flex-1 py-2 px-3 text-xs font-semibold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                activeTab === 'members'
                  ? 'bg-gradient-to-r from-[#1f6fb2] to-[#2ec4b6] text-white shadow-sm font-bold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
              }`}
            >
              <IconUsers className="w-4 h-4" />
              <span>Members ({participants.length})</span>
            </button>

            {isAdmin && (
              <button
                type="button"
                onClick={() => {
                  setActiveTab('add_members');
                  setError('');
                  setSuccess('');
                }}
                className={`flex-1 py-2 px-3 text-xs font-semibold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  activeTab === 'add_members'
                    ? 'bg-gradient-to-r from-[#1f6fb2] to-[#2ec4b6] text-white shadow-sm font-bold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                }`}
              >
                <IconUserPlus className="w-4 h-4" />
                <span>Add Members</span>
              </button>
            )}

            {isAdmin && (
              <button
                type="button"
                onClick={() => {
                  setActiveTab('settings');
                  setError('');
                  setSuccess('');
                }}
                className={`flex-1 py-2 px-3 text-xs font-semibold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  activeTab === 'settings'
                    ? 'bg-gradient-to-r from-[#1f6fb2] to-[#2ec4b6] text-white shadow-sm font-bold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                }`}
              >
                <IconEdit className="w-4 h-4" />
                <span>Settings</span>
              </button>
            )}
          </div>
        </div>

        {/* Feedback Alerts */}
        {error && (
          <div className="px-5 py-2.5 bg-rose-50 border-b border-rose-200 text-xs text-rose-700 font-medium flex items-center justify-between">
            <span>{error}</span>
            <button type="button" onClick={() => setError('')} className="cursor-pointer">
              <IconX className="w-3.5 h-3.5 text-rose-500" />
            </button>
          </div>
        )}
        {success && (
          <div className="px-5 py-2.5 bg-emerald-50 border-b border-emerald-200 text-xs text-emerald-700 font-medium flex items-center justify-between">
            <span>{success}</span>
            <button type="button" onClick={() => setSuccess('')} className="cursor-pointer">
              <IconX className="w-3.5 h-3.5 text-emerald-500" />
            </button>
          </div>
        )}

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {activeTab === 'members' && (
            <div className="space-y-3">
              {/* Member Search Bar */}
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-slate-400">
                  <IconSearch className="w-4 h-4" />
                </span>
                <input
                  type="text"
                  placeholder="Search group members..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:border-[#1f6fb2] focus:ring-2 focus:ring-[#1f6fb2]/10 focus:bg-white outline-none transition-all"
                />
              </div>

              {/* Members List */}
              <div className="space-y-1.5 max-h-72 overflow-y-auto pr-0.5">
                {filteredParticipants.map((member) => {
                  const memberId = member.id || member.user_id;
                  const isMe = memberId === currentUserId;
                  const isMemberOwner = member.role === 'owner' || memberId === conversation.created_by;
                  const isMemberAdmin = member.role === 'admin';
                  const memberDisplayName = member.full_name || member.username || 'Member';

                  return (
                    <div
                      key={memberId}
                      className="flex items-center justify-between p-2.5 rounded-2xl hover:bg-slate-50 transition-colors border border-transparent hover:border-slate-100 group"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <UserAvatarBadge user={member} size="sm" />

                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="font-semibold text-xs text-slate-900 truncate">
                              {memberDisplayName}
                            </p>
                            {isMe && (
                              <span className="text-[10px] text-slate-400 font-mono">
                                (You)
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-400 truncate">
                            {member.username ? `@${member.username}` : member.email}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {isMemberOwner ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700 text-[10px] font-semibold border border-amber-200 shadow-2xs">
                            <IconCrown className="w-3 h-3 text-amber-600" />
                            <span>Owner</span>
                          </span>
                        ) : isMemberAdmin ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-sky-50 text-[#1f6fb2] text-[10px] font-semibold border border-sky-200 shadow-2xs">
                            <IconShield className="w-3 h-3" />
                            <span>Admin</span>
                          </span>
                        ) : (
                          <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-500 text-[10px] font-medium">
                            Member
                          </span>
                        )}

                        {/* Kick / Remove button: Enabled for Admins on other members */}
                        {isAdmin && !isMe && !isMemberOwner && (
                          <button
                            type="button"
                            onClick={() => handleRemoveMember(memberId, memberDisplayName)}
                            disabled={isLoading}
                            className="p-1.5 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                            title={`Remove ${memberDisplayName} from group`}
                          >
                            <IconUserMinus className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {activeTab === 'add_members' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Search Registered Contacts to Add
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-slate-400">
                    <IconSearch className="w-4 h-4" />
                  </span>
                  <input
                    type="text"
                    placeholder="Search by name, @username, or email..."
                    value={addQuery}
                    onChange={handleSearchToAdd}
                    className="w-full pl-9 pr-8 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:border-[#1f6fb2] focus:ring-2 focus:ring-[#1f6fb2]/10 focus:bg-white outline-none"
                    autoFocus
                  />
                  {isSearchingUsers && (
                    <div className="absolute right-3 top-2.5 text-[#1f6fb2]">
                      <IconSpinner className="w-4 h-4" />
                    </div>
                  )}
                </div>
              </div>

              {/* Selected Chips */}
              {selectedToAdd.length > 0 && (
                <div className="space-y-1">
                  <p className="text-[11px] font-semibold text-slate-500">
                    Selected to add ({selectedToAdd.length})
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedToAdd.map((u) => (
                      <span
                        key={u.id}
                        className="inline-flex items-center gap-1.5 pl-1.5 pr-2.5 py-1 rounded-xl bg-gradient-to-r from-sky-50 to-teal-50 text-[#1f6fb2] text-xs font-medium border border-sky-200 shadow-2xs"
                      >
                        <UserAvatarBadge user={u} size="sm" />
                        <span className="font-semibold text-slate-800">
                          {u.full_name || u.username || u.email}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleToggleSelectUser(u)}
                          className="w-4 h-4 rounded-full flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-100 cursor-pointer ml-0.5"
                        >
                          <IconX className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Live Search Suggestions */}
              <div className="space-y-1.5 max-h-48 overflow-y-auto border border-slate-100 rounded-2xl p-1 bg-slate-50/50">
                {userSuggestions.length > 0 ? (
                  userSuggestions.map((u) => {
                    const isSelected = selectedToAdd.some((s) => s.id === u.id);
                    return (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => handleToggleSelectUser(u)}
                        className={`w-full flex items-center justify-between p-2 rounded-xl transition-all text-left cursor-pointer ${
                          isSelected
                            ? 'bg-[#1f6fb2]/10 border border-[#1f6fb2]/20'
                            : 'hover:bg-white border border-transparent'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <UserAvatarBadge user={u} size="sm" />
                          <div>
                            <p className="font-semibold text-xs text-slate-900">
                              {u.full_name || 'User'}
                            </p>
                            <p className="text-[10px] text-slate-400">
                              {u.username ? `@${u.username}` : u.email}
                            </p>
                          </div>
                        </div>
                        <span
                          className={`w-5 h-5 rounded-md flex items-center justify-center text-xs font-bold ${
                            isSelected
                              ? 'bg-[#1f6fb2] text-white'
                              : 'border border-slate-300 text-transparent'
                          }`}
                        >
                          ✓
                        </span>
                      </button>
                    );
                  })
                ) : addQuery.trim() ? (
                  <p className="text-xs text-slate-400 text-center py-6">
                    {isSearchingUsers ? 'Searching users...' : 'No contacts found matching query.'}
                  </p>
                ) : (
                  <p className="text-xs text-slate-400 text-center py-6">
                    Type a contact name, @username, or email to search
                  </p>
                )}
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={handleAddSelectedMembers}
                  disabled={selectedToAdd.length === 0 || isLoading}
                  className="px-4 py-2 bg-gradient-to-r from-[#1f6fb2] to-[#2ec4b6] text-white text-xs font-semibold rounded-xl hover:opacity-95 transition-all shadow-md shadow-[#1f6fb2]/20 cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                >
                  {isLoading ? (
                    <IconSpinner className="w-3.5 h-3.5" />
                  ) : (
                    <IconUserPlus className="w-3.5 h-3.5" />
                  )}
                  <span>Add {selectedToAdd.length} Member(s)</span>
                </button>
              </div>
            </div>
          )}

          {activeTab === 'settings' && isAdmin && (
            <form onSubmit={handleSaveGroupDetails} className="space-y-4">
              {/* Group Avatar Customization */}
              <div className="bg-slate-50/80 p-4 rounded-2xl border border-slate-200/80 flex flex-col sm:flex-row items-center sm:items-center gap-4">
                <div className="relative group/avatar shrink-0">
                  <div className="w-20 h-20 rounded-2xl bg-gradient-to-tr from-[#1f6fb2] to-[#2ec4b6] text-white flex items-center justify-center font-bold text-2xl shadow-md shadow-[#1f6fb2]/20 overflow-hidden ring-4 ring-[#1f6fb2]/10">
                    {avatarPreview ? (
                      <img
                        src={avatarPreview}
                        alt="Group Avatar Preview"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      groupInitial
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="absolute -bottom-1.5 -right-1.5 w-7 h-7 bg-white text-slate-700 hover:text-[#1f6fb2] rounded-full shadow-md border border-slate-200 flex items-center justify-center transition-transform hover:scale-110 cursor-pointer"
                    title="Upload Group Photo"
                  >
                    <IconCamera className="w-3.5 h-3.5" />
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    className="hidden"
                    onChange={handleGroupAvatarSelect}
                  />
                </div>

                <div className="flex-1 text-center sm:text-left">
                  <h4 className="text-xs font-bold text-slate-800 mb-0.5">Group Avatar</h4>
                  <p className="text-[11px] text-slate-500 mb-2.5">
                    JPG, PNG, WebP or GIF up to 5MB. Visible to all members.
                  </p>
                  <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-2xs transition-colors cursor-pointer flex items-center gap-1.5"
                    >
                      <IconCamera className="w-3.5 h-3.5 text-[#1f6fb2]" />
                      <span>{avatarPreview ? 'Change Photo' : 'Upload Photo'}</span>
                    </button>
                    {avatarPreview && (
                      <button
                        type="button"
                        onClick={handleRemoveGroupAvatar}
                        className="px-3 py-1.5 rounded-xl bg-rose-50 border border-rose-200/80 hover:bg-rose-100 text-rose-600 text-xs font-semibold shadow-2xs transition-colors cursor-pointer flex items-center gap-1.5"
                      >
                        <IconTrash className="w-3.5 h-3.5" />
                        <span>Remove</span>
                      </button>
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
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:border-[#1f6fb2] focus:ring-2 focus:ring-[#1f6fb2]/10 focus:bg-white outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Group Description
                </label>
                <textarea
                  value={descInput}
                  onChange={(e) => setDescInput(e.target.value)}
                  rows={3}
                  placeholder="What is this group about?"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:border-[#1f6fb2] focus:ring-2 focus:ring-[#1f6fb2]/10 focus:bg-white outline-none resize-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="submit"
                  disabled={isLoading || isUploadingAvatar}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#1f6fb2] to-[#2ec4b6] text-white text-xs font-semibold hover:opacity-95 transition-all shadow-md shadow-[#1f6fb2]/20 cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isLoading || isUploadingAvatar ? (
                    <IconSpinner className="w-3.5 h-3.5" />
                  ) : (
                    <IconCheck className="w-3.5 h-3.5" />
                  )}
                  <span>{isUploadingAvatar ? 'Uploading Avatar...' : 'Save Changes'}</span>
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Footer: Leave Group & Close */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={handleConfirmLeave}
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-rose-600 hover:bg-rose-100/70 text-xs font-semibold transition-colors cursor-pointer"
          >
            <IconLogOut className="w-3.5 h-3.5" />
            <span>Leave Group</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-semibold rounded-xl transition-colors cursor-pointer shadow-2xs"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
