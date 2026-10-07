'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  getConversations,
  getConversationMessages,
  sendMessage,
  markMessagesAsRead,
  deleteMessageForEveryone,
} from '@/lib/actions/chat';
import {
  deduplicateMessages,
  mergeConfirmedMessage,
  resolveMessageReadStatuses,
  safeBroadcast,
} from '@/lib/chat/chatEngine';
import { uploadChatAttachment, getMessageTypeFromFile } from '@/lib/storage/uploadMedia';

/**
 * Dedicated Realtime & State Synchronization Hook for Direct & Multi-User Group Chats.
 */
export function useChatRealtime({ initialUser, initialConversations = [] }) {
  const currentUserId = initialUser?.id;
  const supabase = useMemo(() => createClient(), []);

  // 1. Core State
  const [conversations, setConversations] = useState(initialConversations);
  const [selectedConvId, setSelectedConvId] = useState(
    initialConversations[0]?.id || null
  );
  const [messages, setMessages] = useState([]);
  const [activeConversationDetails, setActiveConversationDetails] = useState(null);

  // Refs to always access latest selection in persistent socket listeners
  const selectedConvIdRef = useRef(selectedConvId);
  useEffect(() => {
    selectedConvIdRef.current = selectedConvId;
  }, [selectedConvId]);

  // Derive active conversation & recipient/group data
  const activeConversation = useMemo(() => {
    const found = conversations.find((c) => c.id === selectedConvId) || null;
    if (found && activeConversationDetails && activeConversationDetails.id === selectedConvId) {
      const isGroupType = found.type === 'group' || activeConversationDetails.type === 'group';
      return {
        ...found,
        ...activeConversationDetails,
        type: isGroupType ? 'group' : (activeConversationDetails.type || found.type || 'direct'),
        name: activeConversationDetails.name || found.name || '',
      };
    }
    return found || (activeConversationDetails?.id === selectedConvId ? activeConversationDetails : null);
  }, [conversations, selectedConvId, activeConversationDetails]);

  const isGroup = useMemo(() => {
    if (!activeConversation) return false;
    if (activeConversation.type === 'group') return true;
    if (Array.isArray(activeConversation.participants) && activeConversation.participants.length > 2) return true;
    if (Boolean(activeConversation.name && activeConversation.name.trim() && !activeConversation.recipient)) return true;
    if (Boolean(activeConversation.created_by && !activeConversation.recipient)) return true;
    if (Boolean(activeConversation.memberCount && activeConversation.memberCount > 1 && !activeConversation.recipient)) return true;
    if (activeConversation.myRole === 'owner' || activeConversation.myRole === 'admin') return true;
    return false;
  }, [activeConversation]);

  const activeRecipient = useMemo(() => {
    if (!activeConversation || isGroup) return null;
    if (activeConversation.recipient) return activeConversation.recipient;
    if (Array.isArray(activeConversation.participants)) {
      const other = activeConversation.participants.find(
        (p) => (p.id || p.user_id) !== currentUserId
      );
      if (other) {
        return {
          id: other.id || other.user_id,
          full_name: other.full_name,
          username: other.username,
          avatar_url: other.avatar_url,
          email: other.email,
          status: other.status,
        };
      }
    }
    return null;
  }, [activeConversation, isGroup, currentUserId]);
  const activeParticipants = useMemo(
    () => activeConversation?.participants || [],
    [activeConversation?.participants]
  );

  const activeRecipientRef = useRef(activeRecipient);
  useEffect(() => {
    activeRecipientRef.current = activeRecipient;
  }, [activeRecipient]);

  const activeParticipantsRef = useRef(activeParticipants);
  useEffect(() => {
    activeParticipantsRef.current = activeParticipants;
  }, [activeParticipants]);

  // 2. Pagination & Loading State
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState(null);

  // 3. Multi-User Realtime Ephemeral State (Typing & Presence)
  const [typingUsersMap, setTypingUsersMap] = useState(new Map()); // Map<userId, { name, timeout }>
  const [onlineUserIds, setOnlineUserIds] = useState(new Set());

  // Derived list of currently typing users (excluding self)
  const typingUsers = useMemo(() => {
    const list = [];
    typingUsersMap.forEach((val, key) => {
      if (key !== currentUserId) {
        list.push({ userId: key, name: val.name });
      }
    });
    return list;
  }, [typingUsersMap, currentUserId]);

  const isRecipientTyping = typingUsers.length > 0;

  // 4. Memory Cache & Channel References
  const messagesCacheRef = useRef(new Map());
  const activeRequestIdRef = useRef(0);
  const blobUrlsRef = useRef(new Set());
  const roomChannelRef = useRef(null);
  const globalChannelRef = useRef(null);
  const userChannelRef = useRef(null);
  const lastMarkedSeenTimeRef = useRef(0);

  // Auto-cleanup blob Object URLs on unmount to prevent memory leaks
  useEffect(() => {
    const urls = blobUrlsRef.current;
    return () => {
      urls.forEach((u) => {
        try {
          URL.revokeObjectURL(u);
        } catch {
          // Handled
        }
      });
      urls.clear();
    };
  }, []);

  const isRecipientActive = Boolean(
    activeRecipient?.id &&
    (onlineUserIds.has(activeRecipient.id) || activeRecipient.status === 'online')
  );

  const isRecipientActiveRef = useRef(isRecipientActive);
  useEffect(() => {
    isRecipientActiveRef.current = isRecipientActive;
  }, [isRecipientActive]);

  /**
   * Updates sidebar snippet and brings active conversation to top
   */
  const updateSidebarLastMessage = useCallback((convId, lastMsg) => {
    if (!convId || !lastMsg) return;
    setConversations((prev) => {
      const targetIndex = prev.findIndex((c) => c.id === convId);
      if (targetIndex === -1) return prev;

      const updatedConv = {
        ...prev[targetIndex],
        lastMessage: lastMsg,
        updatedAt: lastMsg.created_at || new Date().toISOString(),
      };

      const remaining = prev.filter((c) => c.id !== convId);
      return [updatedConv, ...remaining];
    });
  }, []);

  /**
   * Refresh conversation list from server silently
   */
  const refreshConversations = useCallback(
    async (newConvId = null) => {
      if (!currentUserId) return;
      if (typeof window !== 'undefined' && !navigator.onLine) return;

      try {
        const convsRes = await getConversations(currentUserId);
        if (convsRes?.success && Array.isArray(convsRes.conversations)) {
          setConversations((prev) => {
            const map = new Map();
            for (const conv of convsRes.conversations) {
              map.set(conv.id, conv);
            }
            for (const p of prev) {
              if (!map.has(p.id)) {
                map.set(p.id, p);
              }
            }
            return Array.from(map.values()).sort((a, b) => {
              const timeA = new Date(a.lastMessage?.created_at || a.updatedAt).getTime();
              const timeB = new Date(b.lastMessage?.created_at || b.updatedAt).getTime();
              return timeB - timeA;
            });
          });
        }
      } catch (err) {
        console.warn('Could not refresh conversations list:', err);
      }

      if (newConvId) {
        setSelectedConvId(newConvId);
      }
    },
    [currentUserId]
  );

  /**
   * Immediately inject newly created conversation into local state at index 0
   */
  const handleOpenNewConversation = useCallback((newConv, shouldSelect = true, shouldBroadcast = false) => {
    if (!newConv?.id) return;
    setConversations((prev) => {
      const exists = prev.find((c) => c.id === newConv.id);
      if (exists) {
        return [exists, ...prev.filter((c) => c.id !== newConv.id)];
      }
      return [newConv, ...prev];
    });
    if (shouldSelect) {
      setSelectedConvId(newConv.id);
    }

    if (shouldBroadcast && globalChannelRef.current) {
      safeBroadcast(globalChannelRef.current, 'new_conversation_dispatch', {
        recipientId: newConv.recipient?.id,
        recipientIds: newConv.memberIds || (Array.isArray(newConv.participants) ? newConv.participants.map((p) => p.id || p.user_id) : []),
        conversationId: newConv.id,
        initiatorId: currentUserId,
        conversation: newConv,
      });
    }
  }, [currentUserId]);

  /**
   * Mark messages as read and broadcast seen event
   */
  const markAsSeen = useCallback(
    async (convId) => {
      if (!convId || !currentUserId) return;

      // Broadcast instant seen event over active room channel
      if (roomChannelRef.current) {
        safeBroadcast(roomChannelRef.current, 'messages_read', {
          readerId: currentUserId,
          conversationId: convId,
          readAt: new Date().toISOString(),
        });
      }

      // Throttle heavy database server actions to once per 3 seconds
      const now = Date.now();
      if (now - lastMarkedSeenTimeRef.current < 3000) {
        return;
      }
      lastMarkedSeenTimeRef.current = now;

      try {
        await markMessagesAsRead({ conversationId: convId, userId: currentUserId });
      } catch {
        // Silently ignore network interruptions
      }
    },
    [currentUserId]
  );

  /**
   * Fetch messages for conversation with cache + safe offline checks + race condition guard
   */
  const fetchMessagesForConversation = useCallback(
    async (convId, isBackground = false) => {
      if (!convId || !currentUserId) return;

      if (typeof window !== 'undefined' && !navigator.onLine) {
        return;
      }

      const reqId = ++activeRequestIdRef.current;

      const cached = messagesCacheRef.current.get(convId);
      if (cached && !isBackground) {
        setMessages(cached.messages || []);
        setNextCursor(cached.nextCursor || null);
        setHasMore(Boolean(cached.hasMore));
        setIsLoadingMessages(false);
      } else if (!cached && !isBackground) {
        setMessages([]);
        setNextCursor(null);
        setHasMore(false);
        setIsLoadingMessages(true);
      }

      try {
        const res = await getConversationMessages({
          conversationId: convId,
          limit: 20,
          userId: currentUserId,
        });

        // Ignore stale out-of-order response if user navigated away or started a newer request
        if (selectedConvIdRef.current !== convId || reqId !== activeRequestIdRef.current) {
          return;
        }

        setIsLoadingMessages(false);

        if (res?.success) {
          if (res.conversation && res.conversation.id === convId) {
            setActiveConversationDetails(res.conversation);
          }

          const convIsGroup = res.conversation?.type === 'group';
          const convParticipants = res.conversation?.participants || [];

          setMessages((prev) => {
            // Strictly scope local pending/sending messages to THIS conversation
            const localPending = prev.filter(
              (m) =>
                m.conversation_id === convId &&
                m.sender_id === currentUserId &&
                (m.status === 'failed' || m.status === 'sending')
            );
            const dbList = (res.messages || []).map((m) => ({ ...m, status: 'sent' }));
            const merged = [...dbList];

            for (const pending of localPending) {
              const alreadyInDb = merged.some(
                (m) =>
                  m.id === pending.id ||
                  (m.sender_id === currentUserId && m.content === pending.content)
              );
              if (!alreadyInDb) {
                merged.push(pending);
              }
            }
            const deduped = deduplicateMessages(merged);
            const resolved = resolveMessageReadStatuses(deduped, currentUserId, {
              isGroup: convIsGroup,
              participants: convParticipants,
              isRecipientActive: isRecipientActiveRef.current,
            });

            // Save to in-memory cache
            messagesCacheRef.current.set(convId, {
              messages: resolved,
              nextCursor: res.nextCursor || null,
              hasMore: Boolean(res.hasMore),
            });

            return resolved;
          });

          setNextCursor(res.nextCursor || null);
          setHasMore(Boolean(res.hasMore));

          // Mark incoming unread messages as read
          const hasUnreadFromOther = (res.messages || []).some(
            (m) => m.sender_id !== currentUserId && !m.is_read
          );
          if (hasUnreadFromOther) {
            markAsSeen(convId);
          }
        }
      } catch (err) {
        if (selectedConvIdRef.current === convId && reqId === activeRequestIdRef.current) {
          setIsLoadingMessages(false);
        }
        console.warn('Network sync paused:', err?.message || err);
      }
    },
    [currentUserId, markAsSeen]
  );

  // Load messages when conversation selection changes & clear unread badge
  useEffect(() => {
    if (!selectedConvId) {
      setMessages([]);
      setActiveConversationDetails(null);
      setIsLoadingMessages(false);
      return;
    }
    setConversations((prev) =>
      prev.map((c) =>
        c.id === selectedConvId && c.unreadCount > 0
          ? { ...c, unreadCount: 0 }
          : c
      )
    );
    fetchMessagesForConversation(selectedConvId, false);
  }, [selectedConvId, fetchMessagesForConversation]);

  // Handle browser Online / Reconnect / Visibility
  useEffect(() => {
    let syncTimeout = null;

    function handleSync() {
      if (syncTimeout) clearTimeout(syncTimeout);
      syncTimeout = setTimeout(() => {
        if (typeof window !== 'undefined' && navigator.onLine) {
          refreshConversations();
          if (selectedConvIdRef.current) {
            fetchMessagesForConversation(selectedConvIdRef.current, true);
          }
        }
      }, 500);
    }

    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && typeof window !== 'undefined' && navigator.onLine) {
        handleSync();
        if (selectedConvIdRef.current) {
          markAsSeen(selectedConvIdRef.current);
        }
      }
    };

    const handleFocus = () => {
      if (typeof window !== 'undefined' && navigator.onLine) {
        refreshConversations();
        if (selectedConvIdRef.current) {
          markAsSeen(selectedConvIdRef.current);
        }
      }
    };

    window.addEventListener('online', handleSync);
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      if (syncTimeout) clearTimeout(syncTimeout);
      window.removeEventListener('online', handleSync);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [fetchMessagesForConversation, markAsSeen, refreshConversations]);

  // Handler for real-time group profile updates (avatar, name, description) across all channels
  const handleGroupProfileUpdatedDispatch = useCallback((eventPayload) => {
    const { conversationId, name, description, avatar_url } = eventPayload?.payload || {};
    if (!conversationId) return;

    setConversations((prev) =>
      prev.map((c) => {
        if (c.id === conversationId) {
          return {
            ...c,
            ...(name ? { name } : {}),
            ...(description !== undefined ? { description } : {}),
            ...(avatar_url !== undefined ? { avatar_url } : {}),
          };
        }
        return c;
      })
    );

    if (selectedConvIdRef.current === conversationId) {
      setActiveConversationDetails((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          ...(name ? { name } : {}),
          ...(description !== undefined ? { description } : {}),
          ...(avatar_url !== undefined ? { avatar_url } : {}),
        };
      });
    }
  }, []);

  // 1. GLOBAL & USER STREAM (0ms cross-user notifications & new conversation dispatch)
  useEffect(() => {
    if (!currentUserId || !supabase) return;

    if (globalChannelRef.current) {
      supabase.removeChannel(globalChannelRef.current);
    }
    if (userChannelRef.current) {
      supabase.removeChannel(userChannelRef.current);
    }

    const globalChannel = supabase.channel('global_chat_stream', {
      config: {
        broadcast: { ack: false, self: false },
      },
    });

    const userChannel = supabase.channel(`user_stream:${currentUserId}`, {
      config: {
        broadcast: { ack: false, self: false },
      },
    });

    // Handler for instant inbox dispatch from any sender across the entire app
    const handleInboxDispatch = (eventPayload) => {
      const { recipientId, recipientIds, conversationId, message, sender, conversation } =
        eventPayload.payload || {};

      const isTargetRecipient =
        recipientId === currentUserId ||
        (Array.isArray(recipientIds) && recipientIds.includes(currentUserId));

      if (!isTargetRecipient || !conversationId || !message) return;

      const isCurrentlyOpen = conversationId === selectedConvIdRef.current;

      setConversations((prev) => {
        const targetIndex = prev.findIndex((c) => c.id === conversationId);
        if (targetIndex !== -1) {
          const currentUnread = prev[targetIndex].unreadCount || 0;
          const updatedConv = {
            ...prev[targetIndex],
            lastMessage: message,
            unreadCount: isCurrentlyOpen ? 0 : currentUnread + 1,
            updatedAt: message.created_at || new Date().toISOString(),
          };
          const remaining = prev.filter((c) => c.id !== conversationId);
          return [updatedConv, ...remaining];
        }

        // Brand new conversation
        const newConv = conversation || {
          id: conversationId,
          type: 'direct',
          recipient: sender || {
            id: message.sender_id,
            full_name: 'Chat Member',
            username: 'member',
            email: '',
            status: 'online',
          },
          lastMessage: message,
          unreadCount: isCurrentlyOpen ? 0 : 1,
          updatedAt: message.created_at || new Date().toISOString(),
        };
        return [newConv, ...prev];
      });

      // If receiver currently has this conversation open, append message in real-time
      if (conversationId === selectedConvIdRef.current) {
        setMessages((prev) => {
          const withRead = prev.map((m) =>
            m.sender_id === currentUserId ? { ...m, is_read: true } : m
          );
          const merged = mergeConfirmedMessage(withRead, message);
          const resolved = resolveMessageReadStatuses(merged, currentUserId, {
            isGroup: activeConversation?.type === 'group',
            participants: activeParticipantsRef.current,
            isRecipientActive: true,
          });
          const cached = messagesCacheRef.current.get(conversationId) || {};
          messagesCacheRef.current.set(conversationId, {
            ...cached,
            messages: resolved,
          });
          return resolved;
        });
        markAsSeen(conversationId);
      } else {
        const cached = messagesCacheRef.current.get(conversationId);
        if (cached && Array.isArray(cached.messages)) {
          messagesCacheRef.current.set(conversationId, {
            ...cached,
            messages: mergeConfirmedMessage(cached.messages, message),
          });
        }
      }

      refreshConversations();
    };

    globalChannel.on('broadcast', { event: 'inbox_dispatch' }, handleInboxDispatch);
    userChannel.on('broadcast', { event: 'inbox_dispatch' }, handleInboxDispatch);

    // Handler for new conversation created by another user
    const handleNewConversationDispatch = (eventPayload) => {
      const { recipientId, recipientIds, conversation } = eventPayload.payload || {};
      const isTarget =
        recipientId === currentUserId ||
        (Array.isArray(recipientIds) && recipientIds.includes(currentUserId));

      if (isTarget) {
        if (conversation && conversation.id) {
          handleOpenNewConversation(conversation, false);
        }
        refreshConversations();
      }
    };

    globalChannel.on('broadcast', { event: 'new_conversation_dispatch' }, handleNewConversationDispatch);
    userChannel.on('broadcast', { event: 'new_conversation_dispatch' }, handleNewConversationDispatch);

    // Handler for real-time message deletion across entire app
    const handleMessageDeletedDispatch = (eventPayload) => {
      const { messageId, conversationId, deletedBy, deletedByProfile, deletedAt, nextLastMessage } =
        eventPayload.payload || {};
      if (!messageId) return;

      const nowIso = deletedAt || new Date().toISOString();

      if (conversationId === selectedConvIdRef.current) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId
              ? {
                  ...m,
                  is_deleted: true,
                  deleted_by: deletedBy,
                  deleted_by_profile: deletedByProfile,
                  deleted_at: nowIso,
                  content: '',
                  file_url: null,
                  file_name: null,
                  file_size: null,
                  file_type: null,
                }
              : m
          )
        );
      }

      const cached = messagesCacheRef.current.get(conversationId);
      if (cached) {
        messagesCacheRef.current.set(conversationId, {
          ...cached,
          messages: (cached.messages || []).map((m) =>
            m.id === messageId
              ? {
                  ...m,
                  is_deleted: true,
                  deleted_by: deletedBy,
                  deleted_by_profile: deletedByProfile,
                  deleted_at: nowIso,
                  content: '',
                  file_url: null,
                  file_name: null,
                }
              : m
          ),
        });
      }

      if (conversationId) {
        if (nextLastMessage) {
          updateSidebarLastMessage(conversationId, nextLastMessage);
        }
        refreshConversations();
      }
    };

    globalChannel.on('broadcast', { event: 'message_deleted' }, handleMessageDeletedDispatch);
    userChannel.on('broadcast', { event: 'message_deleted' }, handleMessageDeletedDispatch);

    globalChannel.on('broadcast', { event: 'group_profile_updated' }, handleGroupProfileUpdatedDispatch);
    userChannel.on('broadcast', { event: 'group_profile_updated' }, handleGroupProfileUpdatedDispatch);

    // Postgres database changes
    globalChannel.on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
      },
      (payload) => {
        const newMsg = payload.new;
        if (!newMsg) return;

        const isCurrentlyOpen = newMsg.conversation_id === selectedConvIdRef.current;
        const isIncoming = newMsg.sender_id !== currentUserId;

        setConversations((prev) => {
          const targetIndex = prev.findIndex((c) => c.id === newMsg.conversation_id);
          if (targetIndex !== -1) {
            const currentUnread = prev[targetIndex].unreadCount || 0;
            const updatedConv = {
              ...prev[targetIndex],
              lastMessage: newMsg,
              unreadCount: (isIncoming && !isCurrentlyOpen) ? currentUnread + 1 : (isCurrentlyOpen ? 0 : currentUnread),
              updatedAt: newMsg.created_at || new Date().toISOString(),
            };
            const remaining = prev.filter((c) => c.id !== newMsg.conversation_id);
            return [updatedConv, ...remaining];
          }
          return prev;
        });

        if (newMsg.sender_id !== currentUserId) {
          refreshConversations();
        }
      }
    );

    globalChannel.on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'messages',
      },
      (payload) => {
        const updatedMsg = payload.new;
        if (!updatedMsg) return;

        if (updatedMsg.is_deleted) {
          if (updatedMsg.conversation_id === selectedConvIdRef.current) {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === updatedMsg.id
                  ? {
                      ...m,
                      is_deleted: true,
                      deleted_by: updatedMsg.deleted_by,
                      deleted_at: updatedMsg.deleted_at,
                      content: '',
                      file_url: null,
                      file_name: null,
                    }
                  : m
              )
            );
          }
          refreshConversations();
        }
      }
    );

    globalChannel.subscribe();
    userChannel.subscribe();

    globalChannelRef.current = globalChannel;
    userChannelRef.current = userChannel;

    return () => {
      if (globalChannelRef.current) {
        supabase.removeChannel(globalChannelRef.current);
      }
      if (userChannelRef.current) {
        supabase.removeChannel(userChannelRef.current);
      }
    };
  }, [
    currentUserId,
    supabase,
    markAsSeen,
    refreshConversations,
    updateSidebarLastMessage,
    handleOpenNewConversation,
    handleGroupProfileUpdatedDispatch,
    activeConversation?.type,
  ]);

  // 2. ROOM-LEVEL CHANNEL (Typing indicators, Presence, and Read Receipts for the active room)
  useEffect(() => {
    if (!selectedConvId || !supabase) return;

    const channelName = `room:${selectedConvId}`;

    if (roomChannelRef.current) {
      supabase.removeChannel(roomChannelRef.current);
    }

    const channel = supabase.channel(channelName, {
      config: {
        broadcast: { ack: false, self: false },
        presence: { key: currentUserId },
      },
    });

    // 1. Instant WebSocket Broadcast from Sender (0ms latency in the active room)
    channel.on('broadcast', { event: 'new_message' }, (eventPayload) => {
      const incomingMsg = eventPayload.payload?.message;
      if (!incomingMsg || incomingMsg.sender_id === currentUserId) return;

      setMessages((prev) => {
        const withRead = prev.map((m) =>
          m.sender_id === currentUserId ? { ...m, is_read: true } : m
        );
        const merged = mergeConfirmedMessage(withRead, incomingMsg);
        const resolved = resolveMessageReadStatuses(merged, currentUserId, {
          isGroup: isGroup,
          participants: activeParticipantsRef.current,
          isRecipientActive: true,
        });
        const cached = messagesCacheRef.current.get(selectedConvId) || {};
        messagesCacheRef.current.set(selectedConvId, {
          ...cached,
          messages: resolved,
        });
        return resolved;
      });

      updateSidebarLastMessage(selectedConvId, incomingMsg);
      markAsSeen(selectedConvId);
    });

    // 2. Instant Message Deletion Broadcast for active room
    channel.on('broadcast', { event: 'message_deleted' }, (eventPayload) => {
      const { messageId, conversationId, deletedBy, deletedByProfile, deletedAt, nextLastMessage } =
        eventPayload.payload || {};
      if (conversationId === selectedConvId && messageId) {
        const nowIso = deletedAt || new Date().toISOString();
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId
              ? {
                  ...m,
                  is_deleted: true,
                  deleted_by: deletedBy,
                  deleted_by_profile: deletedByProfile,
                  deleted_at: nowIso,
                  content: '',
                  file_url: null,
                  file_name: null,
                  file_size: null,
                  file_type: null,
                }
              : m
          )
        );
        if (nextLastMessage) {
          updateSidebarLastMessage(selectedConvId, nextLastMessage);
        } else {
          refreshConversations();
        }
      }
    });

    // 2.1. Realtime Group Profile Updates for active room
    channel.on('broadcast', { event: 'group_profile_updated' }, handleGroupProfileUpdatedDispatch);

    // 3. Realtime Read Receipts
    channel.on('broadcast', { event: 'messages_read' }, (eventPayload) => {
      const { readerId, readAt } = eventPayload.payload || {};
      if (readerId && readerId !== currentUserId) {
        // Update participant's last_read_at in memory
        if (isGroup) {
          setActiveConversationDetails((prev) => {
            if (!prev) return prev;
            const updatedParts = (prev.participants || []).map((p) =>
              (p.id || p.user_id) === readerId ? { ...p, last_read_at: readAt || new Date().toISOString() } : p
            );
            return { ...prev, participants: updatedParts };
          });
        }

        setMessages((prev) =>
          resolveMessageReadStatuses(prev, currentUserId, {
            isGroup: isGroup,
            participants: activeParticipantsRef.current.map((p) =>
              (p.id || p.user_id) === readerId ? { ...p, last_read_at: readAt || new Date().toISOString() } : p
            ),
            isRecipientActive: true,
          })
        );
      }
    });

    // 4. Postgres DB Changes: INSERT event listener for this room
    channel.on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
      },
      (payload) => {
        const newMsg = payload.new;
        if (!newMsg || newMsg.conversation_id !== selectedConvId) return;

        setMessages((prev) => {
          let baseList = prev;
          const isFromOther = newMsg.sender_id !== currentUserId;
          if (isFromOther) {
            baseList = prev.map((m) =>
              m.sender_id === currentUserId ? { ...m, is_read: true } : m
            );
          }
          const merged = mergeConfirmedMessage(baseList, newMsg);
          return resolveMessageReadStatuses(merged, currentUserId, {
            isGroup: isGroup,
            participants: activeParticipantsRef.current,
            isRecipientActive: isFromOther || isRecipientActive,
          });
        });

        updateSidebarLastMessage(selectedConvId, newMsg);
        if (newMsg.sender_id !== currentUserId) {
          markAsSeen(selectedConvId);
        }
      }
    );

    // 5. Ephemeral Multi-User Typing Indicator
    channel.on('broadcast', { event: 'typing' }, (eventPayload) => {
      const { senderId, senderName, isTyping } = eventPayload.payload || {};
      if (!senderId || senderId === currentUserId) return;

      setTypingUsersMap((prev) => {
        const next = new Map(prev);
        if (next.has(senderId)) {
          clearTimeout(next.get(senderId).timeout);
        }

        if (isTyping) {
          const timeout = setTimeout(() => {
            setTypingUsersMap((m) => {
              const cleaned = new Map(m);
              cleaned.delete(senderId);
              return cleaned;
            });
          }, 3000);

          next.set(senderId, { name: senderName || 'Someone', timeout });
        } else {
          next.delete(senderId);
        }

        return next;
      });
    });

    // 6. Presence Tracking (Online / Offline status)
    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState();
      const activeIds = new Set();
      Object.keys(state).forEach((key) => {
        activeIds.add(key);
      });
      setOnlineUserIds(activeIds);

      if (activeRecipient?.id && activeIds.has(activeRecipient.id) && selectedConvId) {
        markAsSeen(selectedConvId);
      }
    });

    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.track({ online_at: new Date().toISOString() });
        if (selectedConvId) {
          markAsSeen(selectedConvId);
        }
      }
    });

    roomChannelRef.current = channel;

    return () => {
      if (roomChannelRef.current) {
        supabase.removeChannel(roomChannelRef.current);
      }
      setTypingUsersMap(new Map());
    };
  }, [
    selectedConvId,
    currentUserId,
    supabase,
    markAsSeen,
    updateSidebarLastMessage,
    refreshConversations,
    activeRecipient?.id,
    isRecipientActive,
    isGroup,
    handleGroupProfileUpdatedDispatch,
  ]);

  /**
   * Emit Typing Broadcast with User's Full Name
   */
  const handleTyping = useCallback(
    (isTyping) => {
      if (!roomChannelRef.current || !selectedConvId) return;
      safeBroadcast(roomChannelRef.current, 'typing', {
        senderId: currentUserId,
        senderName: initialUser?.full_name || initialUser?.username || 'Someone',
        isTyping,
      });
    },
    [selectedConvId, currentUserId, initialUser]
  );

  /**
   * Helper to dispatch inbox notifications to multiple recipients
   */
  const dispatchToRecipients = useCallback(
    async (recipientIds, messagePayload) => {
      if (!Array.isArray(recipientIds) || recipientIds.length === 0) return;

      const payload = {
        recipientIds,
        recipientId: recipientIds[0],
        conversationId: selectedConvId,
        message: messagePayload,
        sender: {
          id: currentUserId,
          full_name: initialUser?.full_name,
          username: initialUser?.username,
          email: initialUser?.email,
          avatar_url: initialUser?.avatar_url || '',
        },
        conversation: activeConversation,
      };

      if (globalChannelRef.current) {
        safeBroadcast(globalChannelRef.current, 'inbox_dispatch', payload);
      }
    },
    [selectedConvId, currentUserId, initialUser, activeConversation]
  );

  /**
   * 0ms Optimistic Send Message (Text)
   */
  const handleSendMessage = useCallback(
    async (content) => {
      if (!content || !selectedConvId) return;

      const tempId = `temp-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const nowIso = new Date().toISOString();

      const optimisticMessage = {
        id: tempId,
        conversation_id: selectedConvId,
        sender_id: currentUserId,
        content,
        message_type: 'text',
        is_read: false,
        created_at: nowIso,
        status: 'sending',
        sender: {
          id: currentUserId,
          full_name: initialUser?.full_name,
          username: initialUser?.username,
        },
      };

      // 1. Instantly append (0ms UI feedback)
      setMessages((prev) => {
        const next = deduplicateMessages([...prev, optimisticMessage]);
        const cached = messagesCacheRef.current.get(selectedConvId) || {};
        messagesCacheRef.current.set(selectedConvId, {
          ...cached,
          messages: next,
        });
        return next;
      });

      // 2. Instantly update sidebar snippet
      updateSidebarLastMessage(selectedConvId, optimisticMessage);

      // 3. Offline check
      if (typeof window !== 'undefined' && !navigator.onLine) {
        setMessages((prev) =>
          prev.map((m) => (m.id === tempId ? { ...m, status: 'failed' } : m))
        );
        return;
      }

      // 4. Persist to DB via Server Action
      try {
        const res = await sendMessage({
          conversationId: selectedConvId,
          content,
          senderId: currentUserId,
          messageType: 'text',
        });

        if (res?.success && res.message) {
          const confirmedMsg = {
            ...res.message,
            status: 'sent',
          };

          // Update sender state in-place
          setMessages((prev) => {
            const merged = mergeConfirmedMessage(prev, confirmedMsg, tempId);
            const resolved = resolveMessageReadStatuses(merged, currentUserId, {
              isGroup,
              participants: activeParticipantsRef.current,
              isRecipientActive: isRecipientActiveRef.current,
            });
            const cached = messagesCacheRef.current.get(selectedConvId) || {};
            messagesCacheRef.current.set(selectedConvId, {
              ...cached,
              messages: resolved,
            });
            return resolved;
          });

          // A. Broadcast confirmed message to active room channel
          if (roomChannelRef.current) {
            safeBroadcast(roomChannelRef.current, 'new_message', { message: confirmedMsg });
          }

          // B. Multi-recipient socket fan-out
          const recipientIds = res.recipientIds || (res.recipientId ? [res.recipientId] : []);
          dispatchToRecipients(recipientIds, confirmedMsg);

          updateSidebarLastMessage(selectedConvId, confirmedMsg);
        } else {
          console.error('sendMessage returned error:', res?.error || res);
          setMessages((prev) =>
            prev.map((m) => (m.id === tempId ? { ...m, status: 'failed' } : m))
          );
        }
      } catch (sendErr) {
        console.error('sendMessage exception:', sendErr);
        setMessages((prev) =>
          prev.map((m) => (m.id === tempId ? { ...m, status: 'failed' } : m))
        );
      }
    },
    [selectedConvId, currentUserId, initialUser, updateSidebarLastMessage, isGroup, dispatchToRecipients]
  );

  /**
   * 0ms Optimistic Send Attachment (Image, PDF, Document)
   */
  const handleSendAttachment = useCallback(
    async ({ file, caption = '' }) => {
      if (!file || !selectedConvId) return;

      const tempId = `temp-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const nowIso = new Date().toISOString();
      const messageType = getMessageTypeFromFile(file);
      const localPreviewUrl = messageType === 'image' ? URL.createObjectURL(file) : null;
      if (localPreviewUrl) {
        blobUrlsRef.current.add(localPreviewUrl);
      }

      const optimisticMessage = {
        id: tempId,
        conversation_id: selectedConvId,
        sender_id: currentUserId,
        content: caption || '',
        message_type: messageType,
        file_url: localPreviewUrl,
        file_name: file.name,
        file_size: file.size,
        file_type: file.type,
        is_read: false,
        created_at: nowIso,
        status: 'sending',
        sender: {
          id: currentUserId,
          full_name: initialUser?.full_name,
          username: initialUser?.username,
        },
      };

      setMessages((prev) => {
        const next = deduplicateMessages([...prev, optimisticMessage]);
        const cached = messagesCacheRef.current.get(selectedConvId) || {};
        messagesCacheRef.current.set(selectedConvId, {
          ...cached,
          messages: next,
        });
        return next;
      });
      updateSidebarLastMessage(selectedConvId, optimisticMessage);

      if (typeof window !== 'undefined' && !navigator.onLine) {
        setMessages((prev) =>
          prev.map((m) => (m.id === tempId ? { ...m, status: 'failed' } : m))
        );
        return;
      }

      try {
        const uploadResult = await uploadChatAttachment({
          file,
          conversationId: selectedConvId,
          supabase,
          onProgress: ({ percentage }) => {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === tempId ? { ...m, uploadProgress: percentage } : m
              )
            );
          },
        });

        const res = await sendMessage({
          conversationId: selectedConvId,
          content: caption || '',
          senderId: currentUserId,
          messageType: uploadResult.messageType,
          fileUrl: uploadResult.fileUrl,
          fileName: uploadResult.fileName,
          fileSize: uploadResult.fileSize,
          fileType: uploadResult.fileType,
        });

        if (localPreviewUrl) {
          try {
            URL.revokeObjectURL(localPreviewUrl);
            blobUrlsRef.current.delete(localPreviewUrl);
          } catch {
            // Handled
          }
        }

        if (res?.success && res.message) {
          const confirmedMsg = {
            ...res.message,
            status: 'sent',
          };

          setMessages((prev) => {
            const merged = mergeConfirmedMessage(prev, confirmedMsg, tempId);
            const resolved = resolveMessageReadStatuses(merged, currentUserId, {
              isGroup,
              participants: activeParticipantsRef.current,
              isRecipientActive: isRecipientActiveRef.current,
            });
            const cached = messagesCacheRef.current.get(selectedConvId) || {};
            messagesCacheRef.current.set(selectedConvId, {
              ...cached,
              messages: resolved,
            });
            return resolved;
          });

          if (roomChannelRef.current) {
            safeBroadcast(roomChannelRef.current, 'new_message', { message: confirmedMsg });
          }

          const recipientIds = res.recipientIds || (res.recipientId ? [res.recipientId] : []);
          dispatchToRecipients(recipientIds, confirmedMsg);

          updateSidebarLastMessage(selectedConvId, confirmedMsg);
        } else {
          setMessages((prev) =>
            prev.map((m) => (m.id === tempId ? { ...m, status: 'failed' } : m))
          );
        }
      } catch (err) {
        console.error('handleSendAttachment error:', err);
        if (localPreviewUrl) {
          try {
            URL.revokeObjectURL(localPreviewUrl);
            blobUrlsRef.current.delete(localPreviewUrl);
          } catch {
            // Handled
          }
        }
        setMessages((prev) =>
          prev.map((m) => (m.id === tempId ? { ...m, status: 'failed' } : m))
        );
      }
    },
    [selectedConvId, currentUserId, initialUser, updateSidebarLastMessage, isGroup, supabase, dispatchToRecipients]
  );

  /**
   * Retry sending a failed message
   */
  const handleRetryMessage = useCallback(
    async (failedMsg) => {
      if (!failedMsg || !selectedConvId) return;

      if (typeof window !== 'undefined' && !navigator.onLine) {
        return;
      }

      const tempId = failedMsg.id;

      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...m, status: 'sending' } : m))
      );

      try {
        const res = await sendMessage({
          conversationId: selectedConvId,
          content: failedMsg.content,
          senderId: currentUserId,
          messageType: failedMsg.message_type || 'text',
          fileUrl: failedMsg.file_url || null,
          fileName: failedMsg.file_name || null,
          fileSize: failedMsg.file_size || null,
          fileType: failedMsg.file_type || null,
        });

        if (res?.success && res.message) {
          const confirmedMsg = {
            ...res.message,
            status: 'sent',
          };

          setMessages((prev) => {
            const merged = mergeConfirmedMessage(prev, confirmedMsg, tempId);
            const resolved = resolveMessageReadStatuses(merged, currentUserId, {
              isGroup,
              participants: activeParticipantsRef.current,
              isRecipientActive: isRecipientActiveRef.current,
            });
            const cached = messagesCacheRef.current.get(selectedConvId) || {};
            messagesCacheRef.current.set(selectedConvId, {
              ...cached,
              messages: resolved,
            });
            return resolved;
          });

          if (roomChannelRef.current) {
            safeBroadcast(roomChannelRef.current, 'new_message', { message: confirmedMsg });
          }

          const recipientIds = res.recipientIds || (res.recipientId ? [res.recipientId] : []);
          dispatchToRecipients(recipientIds, confirmedMsg);

          updateSidebarLastMessage(selectedConvId, res.message);
        } else {
          setMessages((prev) =>
            prev.map((m) => (m.id === tempId ? { ...m, status: 'failed' } : m))
          );
        }
      } catch {
        setMessages((prev) =>
          prev.map((m) => (m.id === tempId ? { ...m, status: 'failed' } : m))
        );
      }
    },
    [selectedConvId, currentUserId, updateSidebarLastMessage, isGroup, dispatchToRecipients]
  );

  /**
   * Cursor-based pagination: Load older messages
   */
  const handleLoadOlderMessages = useCallback(async () => {
    if (!selectedConvId || !hasMore || isLoadingOlder || !nextCursor || !currentUserId) return;

    if (typeof window !== 'undefined' && !navigator.onLine) {
      return;
    }

    const activeConvId = selectedConvId;
    setIsLoadingOlder(true);
    try {
      const res = await getConversationMessages({
        conversationId: activeConvId,
        cursor: nextCursor,
        limit: 20,
        userId: currentUserId,
      });

      // Ignore if user navigated away while loading
      if (selectedConvIdRef.current !== activeConvId) return;

      setIsLoadingOlder(false);

      if (res?.success && res.messages?.length > 0) {
        setMessages((prev) => {
          const combined = deduplicateMessages([...res.messages, ...prev]);
          const resolved = resolveMessageReadStatuses(combined, currentUserId, {
            isGroup,
            participants: activeParticipantsRef.current,
            isRecipientActive: isRecipientActiveRef.current,
          });

          const cached = messagesCacheRef.current.get(activeConvId) || {};
          messagesCacheRef.current.set(activeConvId, {
            ...cached,
            messages: resolved,
            nextCursor: res.nextCursor || null,
            hasMore: Boolean(res.hasMore),
          });

          return resolved;
        });
        setNextCursor(res.nextCursor || null);
        setHasMore(Boolean(res.hasMore));
      } else {
        setHasMore(false);
      }
    } catch {
      if (selectedConvIdRef.current === activeConvId) {
        setIsLoadingOlder(false);
      }
    }
  }, [selectedConvId, hasMore, isLoadingOlder, nextCursor, currentUserId, isGroup]);

  /**
   * Delete message for everyone (WhatsApp style soft-delete notice)
   */
  const handleDeleteMessage = useCallback(
    async (messageId) => {
      if (!messageId || !selectedConvId) return;

      const nowIso = new Date().toISOString();
      const displayName =
        initialUser?.full_name ||
        initialUser?.username ||
        (initialUser?.email ? initialUser.email.split('@')[0] : '') ||
        'User';

      const myProfile = {
        id: currentUserId,
        full_name: displayName,
        username: initialUser?.username || displayName,
        email: initialUser?.email || '',
      };

      // 1. Optimistic soft-delete on local state
      setMessages((prev) =>
        prev.map((m) =>
          (m.id === messageId || (m.client_message_id && m.client_message_id === messageId))
            ? {
                ...m,
                is_deleted: true,
                deleted_by: currentUserId,
                deleted_by_profile: myProfile,
                sender: m.sender || myProfile,
                deleted_at: nowIso,
                content: '',
                file_url: null,
                file_name: null,
                file_size: null,
                file_type: null,
              }
            : m
        )
      );

      const cached = messagesCacheRef.current.get(selectedConvId);
      if (cached) {
        messagesCacheRef.current.set(selectedConvId, {
          ...cached,
          messages: (cached.messages || []).map((m) =>
            (m.id === messageId || (m.client_message_id && m.client_message_id === messageId))
              ? {
                  ...m,
                  is_deleted: true,
                  deleted_by: currentUserId,
                  deleted_by_profile: myProfile,
                  sender: m.sender || myProfile,
                  deleted_at: nowIso,
                  content: '',
                  file_url: null,
                  file_name: null,
                }
              : m
          ),
        });
      }

      if (typeof window !== 'undefined' && !navigator.onLine) {
        return;
      }

      try {
        const res = await deleteMessageForEveryone({
          messageId,
          conversationId: selectedConvId,
          userId: currentUserId,
        });

        if (res?.success) {
          const broadcastPayload = {
            messageId,
            conversationId: selectedConvId,
            deletedBy: currentUserId,
            deletedByProfile: res.deleterProfile || myProfile,
            deletedAt: res.deletedAt || nowIso,
            nextLastMessage: res.nextLastMessage,
          };

          if (roomChannelRef.current) {
            safeBroadcast(roomChannelRef.current, 'message_deleted', broadcastPayload);
          }

          if (globalChannelRef.current) {
            safeBroadcast(globalChannelRef.current, 'message_deleted', broadcastPayload);
          }

          if (res.nextLastMessage) {
            updateSidebarLastMessage(selectedConvId, res.nextLastMessage);
          } else {
            refreshConversations();
          }
        }
      } catch (err) {
        console.error('handleDeleteMessage error:', err);
      }
    },
    [selectedConvId, currentUserId, initialUser, supabase, updateSidebarLastMessage, refreshConversations]
  );

  /**
   * Handles local state update when group details or members change
   */
  const handleGroupUpdated = useCallback((updatedConversation) => {
    if (!updatedConversation?.id) return;
    setActiveConversationDetails(updatedConversation);
    setConversations((prev) =>
      prev.map((c) => (c.id === updatedConversation.id ? { ...c, ...updatedConversation } : c))
    );

    const payload = {
      conversationId: updatedConversation.id,
      name: updatedConversation.name,
      description: updatedConversation.description,
      avatar_url: updatedConversation.avatar_url,
    };

    if (globalChannelRef.current) {
      safeBroadcast(globalChannelRef.current, 'group_profile_updated', payload);
    }
    if (roomChannelRef.current) {
      safeBroadcast(roomChannelRef.current, 'group_profile_updated', payload);
    }
  }, []);

  /**
   * Handles when user leaves a group
   */
  const handleLeaveGroup = useCallback(
    (convId) => {
      setConversations((prev) => prev.filter((c) => c.id !== convId));
      if (selectedConvId === convId) {
        setSelectedConvId(null);
      }
    },
    [selectedConvId]
  );

  return {
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
  };
}
