/**
 * Pure helper functions for ultra-fast, robust chat message synchronization,
 * deduplication, chronological sorting, cursor-based group read receipts,
 * and multi-user typing state management.
 */

/**
 * Normalizes a timestamp into milliseconds for stable sorting.
 * @param {string|number|Date} ts
 * @returns {number}
 */
export function getMessageTimestamp(ts) {
  if (!ts) return 0;
  const t = new Date(ts).getTime();
  return isNaN(t) ? 0 : t;
}

/**
 * Deduplicates and strictly sorts chat messages in chronological order (oldest to newest).
 * Merges properties so read status and confirmed statuses are preserved.
 *
 * @param {Array} msgList
 * @returns {Array}
 */
export function deduplicateMessages(msgList) {
  if (!Array.isArray(msgList) || msgList.length === 0) return [];

  const map = new Map();
  const pendingByContent = new Map();

  for (const m of msgList) {
    if (!m) continue;

    // Track pending/optimistic messages to prevent duplication with confirmed DB messages
    if (m.id && String(m.id).startsWith('temp-')) {
      const pKey = `${m.sender_id}:::${m.content || ''}:::${m.file_name || ''}`;
      pendingByContent.set(pKey, m);
    }
  }

  for (const m of msgList) {
    if (!m) continue;

    // If this is a confirmed message, remove any corresponding pending message with same sender & content/file
    if (m.id && !String(m.id).startsWith('temp-')) {
      const pKey = `${m.sender_id}:::${m.content || ''}:::${m.file_name || ''}`;
      const pendingMsg = pendingByContent.get(pKey);
      if (pendingMsg && map.has(pendingMsg.id)) {
        map.delete(pendingMsg.id);
      }
    }

    const key = m.id || `${m.sender_id}-${m.created_at}-${m.content}-${m.file_url || ''}`;

    if (map.has(key)) {
      const existing = map.get(key);
      map.set(key, {
        ...existing,
        ...m,
        is_read: Boolean(existing.is_read || m.is_read),
        status: m.status === 'failed' ? 'failed' : (m.status || existing.status || 'sent'),
      });
    } else {
      map.set(key, m);
    }
  }

  return Array.from(map.values()).sort((a, b) => {
    const timeA = getMessageTimestamp(a.created_at);
    const timeB = getMessageTimestamp(b.created_at);
    if (timeA !== timeB) return timeA - timeB;
    return String(a.id || '').localeCompare(String(b.id || ''));
  });
}

/**
 * Merges a newly confirmed database message into the existing messages array,
 * replacing the temporary client ID in-place with zero duplicate bubbles and strict sorting.
 *
 * @param {Array} currentMessages
 * @param {Object} confirmedMessage
 * @param {string|null} tempId
 * @returns {Array}
 */
export function mergeConfirmedMessage(currentMessages, confirmedMessage, tempId = null) {
  if (!confirmedMessage) return currentMessages;
  const list = Array.isArray(currentMessages) ? currentMessages : [];

  // 1. If tempId is known, replace the temp bubble in-place
  if (tempId && list.some((m) => m.id === tempId)) {
    const replaced = list.map((m) =>
      m.id === tempId
        ? {
            ...confirmedMessage,
            is_read: Boolean(m.is_read || confirmedMessage.is_read),
            status: 'sent',
          }
        : m
    );
    return deduplicateMessages(replaced);
  }

  // 2. If matching optimistic message exists by sender + content + file, replace it
  const matchingTemp = list.find(
    (m) =>
      String(m.id).startsWith('temp-') &&
      m.sender_id === confirmedMessage.sender_id &&
      (m.content === confirmedMessage.content || (m.file_name && m.file_name === confirmedMessage.file_name))
  );
  if (matchingTemp) {
    const replaced = list.map((m) =>
      m.id === matchingTemp.id
        ? {
            ...confirmedMessage,
            is_read: Boolean(m.is_read || confirmedMessage.is_read),
            status: 'sent',
          }
        : m
    );
    return deduplicateMessages(replaced);
  }

  // 3. If already exists by confirmed ID, update in-place
  if (list.some((m) => m.id === confirmedMessage.id)) {
    const updated = list.map((m) =>
      m.id === confirmedMessage.id
        ? {
            ...m,
            ...confirmedMessage,
            is_read: Boolean(m.is_read || confirmedMessage.is_read),
            status: 'sent',
          }
        : m
    );
    return deduplicateMessages(updated);
  }

  // 4. Otherwise append cleanly and sort
  return deduplicateMessages([...list, { ...confirmedMessage, status: 'sent' }]);
}

/**
 * Resolves read receipts across a list of messages for both Direct (1:1) and Group (1:N) chats.
 *
 * Direct Chat Rule:
 * 1. If message is already marked is_read: true.
 * 2. If isRecipientActive is true (recipient is currently inside the conversation).
 * 3. If recipient has sent ANY message at or after this message's timestamp.
 *
 * Group Chat Rule:
 * 1. For each participant (excluding sender), check if participant.last_read_at >= message.created_at.
 * 2. is_read_by_all = true if all other members have read.
 * 3. read_by_count = number of participants who have read.
 *
 * @param {Array} messages
 * @param {string} currentUserId
 * @param {Object} options
 * @param {boolean} [options.isRecipientActive=false]
 * @param {boolean} [options.isGroup=false]
 * @param {Array} [options.participants=[]]
 * @returns {Array}
 */
export function resolveMessageReadStatuses(
  messages,
  currentUserId,
  options = {}
) {
  if (!Array.isArray(messages) || messages.length === 0) return [];

  const { isRecipientActive = false, isGroup = false, participants = [] } =
    typeof options === 'boolean'
      ? { isRecipientActive: options }
      : options;

  if (isGroup && Array.isArray(participants) && participants.length > 0) {
    // Group Cursor-Based Read Resolution
    const otherParticipants = participants.filter((p) => (p.user_id || p.id) !== currentUserId);
    const totalOthers = otherParticipants.length;

    return messages.map((m) => {
      if (!m) return m;

      // System messages do not track read receipts
      if (m.message_type === 'system') {
        return m;
      }

      if (m.sender_id === currentUserId) {
        const msgTime = getMessageTimestamp(m.created_at);
        let readCount = 0;

        for (const p of otherParticipants) {
          const lastReadTime = getMessageTimestamp(p.last_read_at);
          if (lastReadTime >= msgTime) {
            readCount++;
          }
        }

        const isReadByAll = totalOthers > 0 && readCount >= totalOthers;
        const isReadByAny = readCount > 0;

        return {
          ...m,
          is_read: isReadByAll || Boolean(m.is_read),
          is_read_by_all: isReadByAll,
          is_read_by_any: isReadByAny,
          read_count: readCount,
          total_recipients: totalOthers,
        };
      }
      return m;
    });
  }

  // 1-on-1 Direct Chat Resolution
  let latestRecipientTime = 0;
  for (const m of messages) {
    if (m && m.sender_id !== currentUserId && m.message_type !== 'system') {
      const t = getMessageTimestamp(m.created_at);
      if (t > latestRecipientTime) {
        latestRecipientTime = t;
      }
    }
  }

  return messages.map((m) => {
    if (!m) return m;
    if (m.message_type === 'system') return m;

    if (m.sender_id === currentUserId) {
      const msgTime = getMessageTimestamp(m.created_at);
      const isSeenByReply = latestRecipientTime > 0 && msgTime <= latestRecipientTime;
      const isSeen = Boolean(m.is_read || isRecipientActive || isSeenByReply);
      return {
        ...m,
        is_read: isSeen,
        is_read_by_all: isSeen,
        read_count: isSeen ? 1 : 0,
        total_recipients: 1,
      };
    }
    return m;
  });
}

/**
 * Formats a dynamic multi-user typing string for the UI.
 * e.g. "Sarah is typing...", "Sarah and Alex are typing...", "Sarah, Alex, and 2 others are typing..."
 *
 * @param {Array<{ userId: string, name: string }>} typers
 * @returns {string}
 */
export function formatTypingString(typers = []) {
  if (!Array.isArray(typers) || typers.length === 0) return '';

  const names = typers.map((t) => t.name || 'Someone').filter(Boolean);
  if (names.length === 0) return '';

  if (names.length === 1) {
    return `${names[0]} is typing...`;
  }
  if (names.length === 2) {
    return `${names[0]} and ${names[1]} are typing...`;
  }
  if (names.length === 3) {
    return `${names[0]}, ${names[1]}, and ${names[2]} are typing...`;
  }
  return `${names[0]}, ${names[1]}, and ${names.length - 2} others are typing...`;
}

/**
 * Generates a consistent pleasant color hex for a given user ID for group message sender labels.
 * @param {string} id
 * @returns {string} Tailwind text color class
 */
const SENDER_COLORS = [
  'text-indigo-600',
  'text-teal-600',
  'text-emerald-600',
  'text-violet-600',
  'text-amber-600',
  'text-rose-600',
  'text-cyan-600',
  'text-blue-600',
  'text-fuchsia-600',
  'text-lime-600',
];

export function getSenderColorClass(id) {
  if (!id) return 'text-indigo-600';
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash << 5) - hash + id.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % SENDER_COLORS.length;
  return SENDER_COLORS[index];
}

/**
 * Safely send a broadcast event over a Supabase Realtime channel.
 *
 * In Supabase Realtime:
 * - When a channel is subscribed to WebSocket (joined), calling `channel.send({ type: 'broadcast', event, payload })`
 *   pushes over the WebSocket connection with 0ms latency.
 * - If a channel is NOT subscribed (e.g. temporary/on-the-fly channel), calling `channel.send()` automatically falls
 *   back to REST API and logs a deprecation warning.
 * - Calling `channel.httpSend(event, payload)` explicitly sends via Supabase Realtime REST API without warning.
 *
 * This function detects if the channel is currently joined via WebSocket and uses WebSocket `channel.send()`,
 * otherwise explicitly calls `channel.httpSend(event, payload)` for REST broadcast delivery.
 *
 * @param {Object} channel - Supabase RealtimeChannel instance
 * @param {string} event - Broadcast event name
 * @param {any} payload - Broadcast payload
 * @param {Object} [opts] - Additional options (e.g. timeout)
 * @returns {Promise<any>}
 */
export async function safeBroadcast(channel, event, payload, opts = {}) {
  if (!channel || !event) return null;

  try {
    const isJoined =
      typeof channel.channelAdapter?.canPush === 'function'
        ? channel.channelAdapter.canPush()
        : channel.state === 'joined' || channel.state === 'SUBSCRIBED';

    if (isJoined) {
      return await channel.send(
        {
          type: 'broadcast',
          event,
          payload,
        },
        opts
      );
    }

    if (typeof channel.httpSend === 'function') {
      return await channel.httpSend(event, payload, opts);
    }

    return await channel.send(
      {
        type: 'broadcast',
        event,
        payload,
      },
      opts
    );
  } catch (err) {
    // Gracefully ignore transient socket/REST network interruptions
    // All persistent state is already stored reliably in Postgres
    return null;
  }
}

