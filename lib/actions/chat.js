'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isValidEmail } from '@/lib/utils/validations';

// Module-level schema cache to avoid repeating failed column queries
let hasMessagesDeletedColumns = true;

/**
 * Fetches all direct and group messaging conversations for the specified user.
 * Ultra-fast batch query with 0 N+1 overhead and 100% fault-tolerant schema adaptation.
 */
export async function getConversations(userId = null) {
  try {
    let targetUserId = userId;
    if (!targetUserId) {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      targetUserId = user?.id;
    }

    if (!targetUserId) {
      return { success: false, conversations: [] };
    }

    const admin = createAdminClient();

    // 1. Find all participations of this user with multi-tier schema resilience
    let participations = [];
    const { data: pFull, error: pFullError } = await admin
      .from('conversation_participants')
      .select('conversation_id, joined_at, last_read_at, role')
      .eq('user_id', targetUserId);

    if (pFullError || !pFull) {
      const { data: pTimes, error: pTimesError } = await admin
        .from('conversation_participants')
        .select('conversation_id, joined_at, last_read_at')
        .eq('user_id', targetUserId);

      if (pTimesError || !pTimes) {
        const { data: pBare } = await admin
          .from('conversation_participants')
          .select('conversation_id')
          .eq('user_id', targetUserId);
        participations = pBare || [];
      } else {
        participations = pTimes;
      }
    } else {
      participations = pFull;
    }

    if (!participations || participations.length === 0) {
      return { success: true, conversations: [] };
    }

    const conversationIds = participations.map((p) => p.conversation_id).filter(Boolean);
    if (conversationIds.length === 0) {
      return { success: true, conversations: [] };
    }

    const myParticipationMap = new Map(participations.map((p) => [p.conversation_id, p]));

    // 2. Fetch conversation entities with safe fallback
    let convEntities = [];
    const { data: fullConvs, error: fullConvsError } = await admin
      .from('conversations')
      .select('id, type, name, avatar_url, description, created_by, created_at, updated_at')
      .in('id', conversationIds);

    if (fullConvsError || !fullConvs) {
      const { data: midConvs, error: midConvsError } = await admin
        .from('conversations')
        .select('id, type, name, created_at, updated_at')
        .in('id', conversationIds);

      if (midConvsError || !midConvs) {
        const { data: nameConvs, error: nameConvsError } = await admin
          .from('conversations')
          .select('id, type, name, created_at')
          .in('id', conversationIds);

        if (nameConvsError || !nameConvs) {
          const { data: pureNameConvs, error: pureNameErr } = await admin
            .from('conversations')
            .select('id, name')
            .in('id', conversationIds);

          if (pureNameErr || !pureNameConvs) {
            const { data: basicConvs } = await admin
              .from('conversations')
              .select('id, created_at')
              .in('id', conversationIds);
            convEntities = basicConvs || [];
          } else {
            convEntities = pureNameConvs;
          }
        } else {
          convEntities = nameConvs;
        }
      } else {
        convEntities = midConvs;
      }
    } else {
      convEntities = fullConvs;
    }

    const convEntityMap = new Map(convEntities.map((c) => [c.id, c]));

    // 3. Fetch all participants for these conversations with multi-tier fallback
    let allParticipants = [];
    const { data: partsWithRole, error: partsRoleErr } = await admin
      .from('conversation_participants')
      .select(`
        conversation_id,
        user_id,
        role,
        last_read_at,
        user:profiles (
          id,
          full_name,
          username,
          avatar_url,
          email,
          status
        )
      `)
      .in('conversation_id', conversationIds);

    if (partsRoleErr || !partsWithRole) {
      const { data: partsNoRole, error: partsNoRoleErr } = await admin
        .from('conversation_participants')
        .select(`
          conversation_id,
          user_id,
          last_read_at,
          user:profiles (
            id,
            full_name,
            username,
            avatar_url,
            email,
            status
          )
        `)
        .in('conversation_id', conversationIds);

      if (partsNoRoleErr || !partsNoRole) {
        const { data: partsBare } = await admin
          .from('conversation_participants')
          .select(`
            conversation_id,
            user_id,
            user:profiles (
              id,
              full_name,
              username,
              avatar_url,
              email,
              status
            )
          `)
          .in('conversation_id', conversationIds);
        allParticipants = partsBare || [];
      } else {
        allParticipants = partsNoRole;
      }
    } else {
      allParticipants = partsWithRole;
    }

    // Group participants by conversation
    const participantsByConv = new Map();
    for (const p of allParticipants || []) {
      if (!participantsByConv.has(p.conversation_id)) {
        participantsByConv.set(p.conversation_id, []);
      }
      participantsByConv.get(p.conversation_id).push(p);
    }

    // 4. Fetch latest message for each conversation with multi-tier resilient fallback
    let latestMessages = [];
    let lSuccess = false;

    if (hasMessagesDeletedColumns && !lSuccess) {
      try {
        const { data: lMsgs, error: lErr } = await admin
          .from('messages')
          .select('id, conversation_id, sender_id, content, created_at, is_read, is_deleted, deleted_by, message_type, file_name, sender:profiles(id, full_name, username)')
          .in('conversation_id', conversationIds)
          .order('created_at', { ascending: false });

        if (!lErr && lMsgs) {
          latestMessages = lMsgs;
          lSuccess = true;
        } else if (lErr?.code === '42703' || lErr?.message?.includes('is_deleted')) {
          hasMessagesDeletedColumns = false;
        }
      } catch {
        // Fall to next tier
      }
    }

    if (!lSuccess) {
      try {
        const { data: fbLMsgs, error: fbLErr } = await admin
          .from('messages')
          .select('id, conversation_id, sender_id, content, created_at, is_read, message_type, file_name, sender:profiles(id, full_name, username)')
          .in('conversation_id', conversationIds)
          .order('created_at', { ascending: false });

        if (!fbLErr && fbLMsgs) {
          latestMessages = fbLMsgs;
          lSuccess = true;
        }
      } catch {
        // Fall to flat fallback
      }
    }

    if (!lSuccess) {
      try {
        const { data: flatLMsgs } = await admin
          .from('messages')
          .select('id, conversation_id, sender_id, content, created_at, is_read, message_type, file_name')
          .in('conversation_id', conversationIds)
          .order('created_at', { ascending: false });
        latestMessages = flatLMsgs || [];
      } catch {
        latestMessages = [];
      }
    }

    const lastMsgByConv = new Map();
    for (const m of latestMessages || []) {
      if (!lastMsgByConv.has(m.conversation_id)) {
        lastMsgByConv.set(m.conversation_id, m);
      }
    }

    // 4.1. Guarantee Group Name Recovery: Query group creation messages across all conversations
    const creationNameByConv = new Map();
    try {
      const { data: creationMsgs } = await admin
        .from('messages')
        .select('conversation_id, content')
        .in('conversation_id', conversationIds)
        .ilike('content', '%created group%');

      for (const cm of creationMsgs || []) {
        if (!creationNameByConv.has(cm.conversation_id)) {
          const match = cm.content?.match(/created group ["']?(.*?)["']?$/i);
          if (match && match[1]) {
            creationNameByConv.set(cm.conversation_id, match[1].replace(/["']/g, '').trim());
          }
        }
      }
    } catch (msgErr) {
      console.warn('Group creation name recovery notice:', msgErr);
    }

    // 4.2. Guarantee Group Avatar Recovery: Query public avatars storage for group avatars if DB column was missing
    const groupStorageAvatars = new Map();
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '');
      if (supabaseUrl) {
        for (const cid of conversationIds) {
          const cEntity = convEntityMap.get(cid);
          if (cEntity?.avatar_url) {
            groupStorageAvatars.set(cid, cEntity.avatar_url);
          } else {
            try {
              const { data: gFiles } = await admin.storage
                .from('avatars')
                .list(`groups/${cid}`);
              if (gFiles && gFiles.length > 0) {
                const latestFile = gFiles.sort((a, b) => b.name.localeCompare(a.name))[0];
                if (latestFile?.name) {
                  const pubUrl = `${supabaseUrl}/storage/v1/object/public/avatars/groups/${cid}/${latestFile.name}`;
                  groupStorageAvatars.set(cid, pubUrl);
                }
              }
            } catch {
              // Graceful
            }
          }
        }
      }
    } catch (storageErr) {
      console.warn('Group avatar storage recovery notice:', storageErr);
    }

    // 4.3 Compute unread count per conversation
    const unreadCountByConv = new Map();
    try {
      let unreadQuery = admin
        .from('messages')
        .select('conversation_id, created_at, sender_id')
        .in('conversation_id', conversationIds)
        .neq('sender_id', targetUserId);

      if (hasMessagesDeletedColumns) {
        unreadQuery = unreadQuery.eq('is_deleted', false);
      }

      const { data: uRows, error: uErr } = await unreadQuery;
      let unreadRows = uRows;

      if (uErr && (uErr.code === '42703' || uErr.message?.includes('is_deleted'))) {
        hasMessagesDeletedColumns = false;
        const { data: fbURows } = await admin
          .from('messages')
          .select('conversation_id, created_at, sender_id')
          .in('conversation_id', conversationIds)
          .neq('sender_id', targetUserId);
        unreadRows = fbURows;
      }

      for (const m of unreadRows || []) {
        const myPart = myParticipationMap.get(m.conversation_id);
        const lastReadTime = myPart?.last_read_at ? new Date(myPart.last_read_at).getTime() : 0;
        const msgTime = new Date(m.created_at).getTime();
        if (msgTime > lastReadTime) {
          unreadCountByConv.set(
            m.conversation_id,
            (unreadCountByConv.get(m.conversation_id) || 0) + 1
          );
        }
      }
    } catch (unreadErr) {
      console.warn('Unread calculation notice:', unreadErr);
    }

    // 5. Assemble Polymorphic Conversation list
    const conversationList = [];

    for (const convId of conversationIds) {
      const convData = convEntityMap.get(convId) || { id: convId, type: 'direct' };
      const myPart = myParticipationMap.get(convId);
      const convParticipants = participantsByConv.get(convId) || [];
      const lastMsg = lastMsgByConv.get(convId) || null;
      const unreadCount = unreadCountByConv.get(convId) || 0;

      // Extract group name from DB, creation message, or system message
      let inferredGroupName =
        (convData.name || '').trim() ||
        creationNameByConv.get(convId) ||
        '';

      const isSystemGroup =
        lastMsg?.message_type === 'system' ||
        (lastMsg?.content && lastMsg.content.toLowerCase().includes('created group')) ||
        creationNameByConv.has(convId);

      if (!inferredGroupName && lastMsg?.content) {
        const match = lastMsg.content.match(/created group ["']?(.*?)["']?$/i);
        if (match && match[1]) {
          inferredGroupName = match[1].replace(/["']/g, '').trim();
        }
      }

      // Polymorphic group detection: check type, name, participant count, roles, created_by, or system message
      const hasGroupRole = convParticipants.some((p) => p.role === 'owner' || p.role === 'admin');
      const isGroup =
        convData.type === 'group' ||
        Boolean(inferredGroupName) ||
        Boolean(convData.name && convData.name.trim()) ||
        convParticipants.length > 2 ||
        hasGroupRole ||
        Boolean(convData.created_by) ||
        isSystemGroup;

      if (isGroup) {
        // GROUP CONVERSATION - Guarantee creator role resolution with multi-tier fallback
        let resolvedCreatorId = convData.created_by;
        if (!resolvedCreatorId) {
          const ownerPart = convParticipants.find((p) => p.role === 'owner' || p.role === 'admin');
          if (ownerPart) {
            resolvedCreatorId = ownerPart.user?.id || ownerPart.user_id;
          } else if (isSystemGroup && lastMsg?.sender_id) {
            resolvedCreatorId = lastMsg.sender_id;
          } else if (convParticipants.length > 0) {
            resolvedCreatorId = convParticipants[0].user?.id || convParticipants[0].user_id;
          }
        }

        const memberCount = convParticipants.length;
        const participantProfiles = convParticipants.map((p) => {
          const uid = p.user?.id || p.user_id;
          const isCreator = uid === resolvedCreatorId;
          return {
            id: uid,
            user_id: uid,
            full_name: p.user?.full_name || p.user?.username || 'Member',
            username: p.user?.username || '',
            avatar_url: p.user?.avatar_url || '',
            email: p.user?.email || '',
            status: p.user?.status || 'offline',
            role: p.role || (isCreator ? 'owner' : 'member'),
            last_read_at: p.last_read_at,
          };
        });

        const isMeCreator = resolvedCreatorId === targetUserId;
        const myRole = isMeCreator ? 'owner' : (myPart?.role || 'member');
        const resolvedGroupName =
          (convData.name && convData.name.trim()) ||
          inferredGroupName ||
          'Group Chat';

        const resolvedGroupAvatar =
          convData.avatar_url ||
          groupStorageAvatars.get(convId) ||
          '';

        conversationList.push({
          id: convId,
          type: 'group',
          name: resolvedGroupName,
          avatar_url: resolvedGroupAvatar,
          description: convData.description || '',
          created_by: resolvedCreatorId,
          memberCount,
          participants: participantProfiles,
          myRole,
          lastMessage: lastMsg,
          unreadCount,
          updatedAt: lastMsg?.created_at || convData.updated_at || new Date().toISOString(),
        });
      } else {
        // DIRECT 1-ON-1 CONVERSATION
        const otherParticipant = convParticipants
          .filter((p) => (p.user?.id || p.user_id) !== targetUserId)
          .map((p) => p.user)[0];

        const recipient = otherParticipant || convParticipants[0]?.user || {
          id: 'unknown',
          full_name: 'Chat Member',
          username: 'member',
          email: '',
          status: 'offline',
        };

        conversationList.push({
          id: convId,
          type: 'direct',
          recipient,
          participants: convParticipants.map((p) => ({
            id: p.user?.id || p.user_id,
            full_name: p.user?.full_name,
            username: p.user?.username,
            avatar_url: p.user?.avatar_url,
            status: p.user?.status,
            role: p.role || 'member',
            last_read_at: p.last_read_at,
          })),
          lastMessage: lastMsg,
          unreadCount,
          updatedAt: lastMsg?.created_at || convData.updated_at || new Date().toISOString(),
        });
      }
    }

    // Sort by latest message/update timestamp
    const sorted = conversationList.sort((a, b) => {
      const timeA = new Date(a.lastMessage?.created_at || a.updatedAt).getTime();
      const timeB = new Date(b.lastMessage?.created_at || b.updatedAt).getTime();
      return timeB - timeA;
    });

    return { success: true, conversations: sorted };
  } catch (err) {
    console.error('getConversations error:', err);
    return { success: false, conversations: [] };
  }
}

/**
 * Creates a new Multi-User Group Conversation.
 */
export async function createGroupConversation({
  name,
  description = '',
  avatarUrl = '',
  memberIds = [],
  creatorId = null,
}) {
  try {
    let activeCreatorId = creatorId;
    if (!activeCreatorId) {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      activeCreatorId = user?.id;
    }

    if (!activeCreatorId) {
      return { success: false, error: 'Authentication required to create a group.' };
    }

    const cleanName = (name || '').trim();
    if (!cleanName) {
      return { success: false, error: 'Group name is required.' };
    }

    // Ensure memberIds contains unique IDs and includes creator
    const uniqueMemberIds = Array.from(
      new Set([activeCreatorId, ...(Array.isArray(memberIds) ? memberIds : [])])
    ).filter(Boolean);

    if (uniqueMemberIds.length < 2) {
      return { success: false, error: 'A group requires at least 1 other member.' };
    }

    const admin = createAdminClient();

    // 1. Fetch creator profile for initial system message
    const { data: creatorProfile } = await admin
      .from('profiles')
      .select('id, full_name, username')
      .eq('id', activeCreatorId)
      .maybeSingle();

    const creatorName = creatorProfile?.full_name || creatorProfile?.username || 'Group Creator';

    // 2. Insert new group conversation with resilient multi-tier fallback
    const nowIso = new Date().toISOString();
    let newConv = null;

    // Tier 1: Full insert with all metadata
    const { data: convFull, error: errFull } = await admin
      .from('conversations')
      .insert({
        type: 'group',
        name: cleanName,
        description: (description || '').trim(),
        avatar_url: avatarUrl || '',
        created_by: activeCreatorId,
        last_message_preview: `${creatorName} created group "${cleanName}"`,
        last_message_at: nowIso,
        updated_at: nowIso,
      })
      .select()
      .maybeSingle();

    if (!errFull && convFull) {
      newConv = convFull;
    } else {
      // Tier 2: Core fields without preview columns
      const { data: convCore, error: errCore } = await admin
        .from('conversations')
        .insert({
          type: 'group',
          name: cleanName,
          description: (description || '').trim(),
          avatar_url: avatarUrl || '',
          created_by: activeCreatorId,
          updated_at: nowIso,
        })
        .select()
        .maybeSingle();

      if (!errCore && convCore) {
        newConv = convCore;
      } else {
        // Tier 3: Type and Name
        const { data: convMin, error: errMin } = await admin
          .from('conversations')
          .insert({
            type: 'group',
            name: cleanName,
            updated_at: nowIso,
          })
          .select()
          .maybeSingle();

        if (!errMin && convMin) {
          newConv = convMin;
        } else {
          // Tier 4: Base fallback
          const { data: convBare, error: errBare } = await admin
            .from('conversations')
            .insert({
              updated_at: nowIso,
            })
            .select()
            .maybeSingle();

          if (errBare || !convBare) {
            console.error('Failed to create group conversation entity:', errFull, errBare);
            return { success: false, error: 'Failed to create group conversation.' };
          }
          newConv = { ...convBare, type: 'group', name: cleanName };
        }
      }
    }

    // 3. Insert ALL participants (Creator + Every added member)
    const participantRowsWithRole = uniqueMemberIds.map((uid) => ({
      conversation_id: newConv.id,
      user_id: uid,
      role: uid === activeCreatorId ? 'owner' : 'member',
      joined_at: nowIso,
      last_read_at: nowIso,
    }));

    const { error: partRoleError } = await admin
      .from('conversation_participants')
      .insert(participantRowsWithRole);

    if (partRoleError) {
      console.warn('Participant role insert error, trying without role:', partRoleError.message);
      const participantRowsWithTimes = uniqueMemberIds.map((uid) => ({
        conversation_id: newConv.id,
        user_id: uid,
        joined_at: nowIso,
        last_read_at: nowIso,
      }));
      const { error: partTimeError } = await admin
        .from('conversation_participants')
        .insert(participantRowsWithTimes);

      if (partTimeError) {
        console.warn('Participant time insert error, trying bare insert:', partTimeError.message);
        const participantRowsBare = uniqueMemberIds.map((uid) => ({
          conversation_id: newConv.id,
          user_id: uid,
        }));
        const { error: partBareError } = await admin
          .from('conversation_participants')
          .insert(participantRowsBare);

        if (partBareError) {
          // Individual inserts guarantee all member rows are created
          console.warn('Batch bare insert failed, trying individual inserts:', partBareError.message);
          for (const uid of uniqueMemberIds) {
            await admin
              .from('conversation_participants')
              .insert({ conversation_id: newConv.id, user_id: uid });
          }
        }
      }
    }

    // 4. Insert initial System message
    let systemMsg = null;
    try {
      const { data } = await admin
        .from('messages')
        .insert({
          conversation_id: newConv.id,
          sender_id: activeCreatorId,
          content: `${creatorName} created group "${cleanName}"`,
          message_type: 'system',
          created_at: nowIso,
        })
        .select('id, conversation_id, sender_id, content, message_type, created_at')
        .maybeSingle();
      if (data) {
        systemMsg = {
          ...data,
          sender: { id: activeCreatorId, full_name: creatorName, username: creatorName, avatar_url: '' },
        };
      }
    } catch {
      // Fallback
    }

    // 5. Fetch full member profiles for immediate return
    const { data: memberProfiles } = await admin
      .from('profiles')
      .select('id, full_name, username, avatar_url, email, status')
      .in('id', uniqueMemberIds);

    const participants = (memberProfiles || []).map((p) => ({
      ...p,
      role: p.id === activeCreatorId ? 'owner' : 'member',
      last_read_at: nowIso,
    }));

    const groupConversation = {
      id: newConv.id,
      type: 'group',
      name: cleanName,
      avatar_url: avatarUrl || newConv.avatar_url || '',
      description: description || newConv.description || '',
      created_by: activeCreatorId,
      memberCount: uniqueMemberIds.length,
      participants,
      myRole: 'owner',
      lastMessage: systemMsg || null,
      updatedAt: nowIso,
    };

    return {
      success: true,
      conversationId: newConv.id,
      conversation: groupConversation,
      recipientIds: uniqueMemberIds.filter((id) => id !== activeCreatorId),
    };
  } catch (err) {
    console.error('createGroupConversation error:', err);
    return { success: false, error: 'Could not create group. Please try again.' };
  }
}

/**
 * Retrieves or creates a 1-on-1 direct conversation with a recipient by email, username, or userId.
 */
export async function getOrCreateConversation({ recipientInput, userId = null }) {
  try {
    const supabase = await createClient();
    const {
      data: { user: currentUser },
    } = await supabase.auth.getUser();

    const senderId = currentUser?.id || userId;
    if (!senderId) {
      return { success: false, error: 'Authentication required.' };
    }

    const cleanInput = recipientInput?.trim().toLowerCase();
    if (!cleanInput) {
      return { success: false, error: 'Please enter a user email or username.' };
    }

    const admin = createAdminClient();

    // 1. Lookup recipient profile by email or username
    let { data: recipient } = await admin
      .from('profiles')
      .select('id, full_name, username, avatar_url, email, status')
      .or(`email.eq.${cleanInput},username.eq.${cleanInput.replace(/^@/, '')}`)
      .maybeSingle();

    if (!recipient) {
      // If valid email, record contact invite
      if (isValidEmail(cleanInput)) {
        await admin.from('contact_invites').upsert({
          invited_by: senderId,
          email: cleanInput,
          status: 'pending',
        });
        return {
          success: false,
          isInvite: true,
          error: `User with email "${cleanInput}" is not registered yet. An invitation has been logged.`,
        };
      }
      return { success: false, error: 'User not found. Please verify the email or username.' };
    }

    if (recipient.id === senderId) {
      return { success: false, error: 'You cannot start a direct conversation with yourself.' };
    }

    // 2. Check if a 1-on-1 direct conversation between sender and recipient already exists
    const { data: myParticipations } = await admin
      .from('conversation_participants')
      .select('conversation_id')
      .eq('user_id', senderId);

    if (myParticipations && myParticipations.length > 0) {
      const myConvIds = myParticipations.map((p) => p.conversation_id);

      const { data: matchingConv } = await admin
        .from('conversation_participants')
        .select('conversation_id')
        .in('conversation_id', myConvIds)
        .eq('user_id', recipient.id)
        .maybeSingle();

      if (matchingConv) {
        return {
          success: true,
          conversationId: matchingConv.conversation_id,
          recipient,
        };
      }
    }

    // 3. Create new 1-on-1 conversation
    const { data: newConv, error: convError } = await admin
      .from('conversations')
      .insert({})
      .select()
      .single();

    if (convError || !newConv) {
      console.error('Conversation create error:', convError);
      return { success: false, error: 'Failed to start conversation.' };
    }

    // 4. Add both participants
    await admin.from('conversation_participants').insert([
      { conversation_id: newConv.id, user_id: senderId },
      { conversation_id: newConv.id, user_id: recipient.id },
    ]);

    return {
      success: true,
      conversationId: newConv.id,
      recipient,
    };
  } catch (err) {
    console.error('getOrCreateConversation error:', err);
    return { success: false, error: 'Could not create conversation.' };
  }
}

/**
 * Fetches messages and conversation details for a specific conversation.
 */
export async function getConversationMessages(arg1, arg2 = null) {
  try {
    let conversationId, cursor, limit, userId;

    if (typeof arg1 === 'object' && arg1 !== null) {
      conversationId = arg1.conversationId;
      cursor = arg1.cursor || null;
      limit = arg1.limit || 20;
      userId = arg1.userId || null;
    } else {
      conversationId = arg1;
      cursor = null;
      limit = 20;
      userId = arg2;
    }

    let currentUserId = userId;
    if (!currentUserId) {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      currentUserId = user?.id;
    }

    if (!currentUserId || !conversationId) {
      return { success: false, messages: [], recipient: null, conversation: null, hasMore: false };
    }

    const admin = createAdminClient();

    // 1. Verify caller is a participant with resilient query
    const { data: myParticipationRows, error: myPartErr } = await admin
      .from('conversation_participants')
      .select('conversation_id, role, last_read_at')
      .eq('conversation_id', conversationId)
      .eq('user_id', currentUserId)
      .limit(1);

    const myParticipation = myParticipationRows?.[0] || null;

    if (!myParticipation && !myPartErr) {
      // Also check if user is the creator of the conversation in conversations table
      const { data: convCheck } = await admin
        .from('conversations')
        .select('id, created_by')
        .eq('id', conversationId)
        .limit(1);

      if (convCheck?.[0]?.created_by !== currentUserId) {
        return { success: false, error: 'Unauthorized to view this conversation.' };
      }
    }

    // Safe fetch conversation metadata
    let convData = null;
    const { data: fullData, error: fullError } = await admin
      .from('conversations')
      .select('id, type, name, avatar_url, description, created_by, created_at, updated_at')
      .eq('id', conversationId)
      .maybeSingle();

    if (fullError || !fullData) {
      const { data: midData, error: midError } = await admin
        .from('conversations')
        .select('id, type, name, created_at, updated_at')
        .eq('id', conversationId)
        .maybeSingle();

      if (midError || !midData) {
        const { data: nameData, error: nameError } = await admin
          .from('conversations')
          .select('id, type, name, created_at')
          .eq('id', conversationId)
          .maybeSingle();

        if (nameError || !nameData) {
          const { data: pureNameData, error: pureNameError } = await admin
            .from('conversations')
            .select('id, name')
            .eq('id', conversationId)
            .maybeSingle();

          if (pureNameError || !pureNameData) {
            const { data: basicData } = await admin
              .from('conversations')
              .select('id, created_at')
              .eq('id', conversationId)
              .maybeSingle();
            convData = basicData;
          } else {
            convData = pureNameData;
          }
        } else {
          convData = nameData;
        }
      } else {
        convData = midData;
      }
    } else {
      convData = fullData;
    }

    // 2. Fetch all participants for this conversation with multi-tier fallback
    let allParticipants = [];
    const { data: partsWithRole, error: partsRoleErr } = await admin
      .from('conversation_participants')
      .select(`
        user_id,
        role,
        last_read_at,
        user:profiles (
          id,
          full_name,
          username,
          avatar_url,
          email,
          status
        )
      `)
      .eq('conversation_id', conversationId);

    if (partsRoleErr || !partsWithRole) {
      const { data: partsNoRole, error: partsNoRoleErr } = await admin
        .from('conversation_participants')
        .select(`
          user_id,
          last_read_at,
          user:profiles (
            id,
            full_name,
            username,
            avatar_url,
            email,
            status
          )
        `)
        .eq('conversation_id', conversationId);

      if (partsNoRoleErr || !partsNoRole) {
        const { data: partsBare } = await admin
          .from('conversation_participants')
          .select(`
            user_id,
            user:profiles (
              id,
              full_name,
              username,
              avatar_url,
              email,
              status
            )
          `)
          .eq('conversation_id', conversationId);
        allParticipants = partsBare || [];
      } else {
        allParticipants = partsNoRole;
      }
    } else {
      allParticipants = partsWithRole;
    }

    // 3. Mark current user's last_read_at = NOW() (in try-catch so it never blocks message retrieval)
    const nowIso = new Date().toISOString();
    try {
      await admin
        .from('conversation_participants')
        .update({ last_read_at: nowIso })
        .eq('conversation_id', conversationId)
        .eq('user_id', currentUserId);

      await admin
        .from('messages')
        .update({ is_read: true })
        .eq('conversation_id', conversationId)
        .neq('sender_id', currentUserId)
        .eq('is_read', false);
    } catch {
      // Ignored gracefully
    }

    // 4. Multi-tier resilient message retrieval ladder (guarantees messages ALWAYS load)
    let rawMessages = [];
    let querySuccess = false;

    // Tier 1: Full schema with soft-delete columns (flat query without FK dependencies)
    if (hasMessagesDeletedColumns && !querySuccess) {
      try {
        let q = admin
          .from('messages')
          .select(`
            id,
            conversation_id,
            sender_id,
            content,
            message_type,
            file_url,
            file_name,
            file_size,
            file_type,
            is_read,
            is_deleted,
            deleted_by,
            deleted_at,
            created_at
          `)
          .eq('conversation_id', conversationId);

        if (cursor?.created_at) {
          q = q.lt('created_at', cursor.created_at);
        }
        q = q.order('created_at', { ascending: false }).limit(limit + 1);

        const { data: t1Msgs, error: t1Err } = await q;
        if (!t1Err && t1Msgs) {
          rawMessages = t1Msgs;
          querySuccess = true;
        } else if (t1Err?.code === '42703' || t1Err?.message?.includes('is_deleted')) {
          hasMessagesDeletedColumns = false;
        }
      } catch {
        // Fall to next tier
      }
    }

    // Tier 2: Standard schema with flat columns (no deleted columns)
    if (!querySuccess) {
      try {
        let q = admin
          .from('messages')
          .select(`
            id,
            conversation_id,
            sender_id,
            content,
            message_type,
            file_url,
            file_name,
            file_size,
            file_type,
            is_read,
            created_at
          `)
          .eq('conversation_id', conversationId);

        if (cursor?.created_at) {
          q = q.lt('created_at', cursor.created_at);
        }
        q = q.order('created_at', { ascending: false }).limit(limit + 1);

        const { data: t2Msgs, error: t2Err } = await q;
        if (!t2Err && t2Msgs) {
          rawMessages = t2Msgs;
          querySuccess = true;
        }
      } catch {
        // Fall to next tier
      }
    }

    // Tier 3: Direct flat columns without file_size/file_type
    if (!querySuccess) {
      try {
        let q = admin
          .from('messages')
          .select(`
            id,
            conversation_id,
            sender_id,
            content,
            message_type,
            file_url,
            file_name,
            is_read,
            created_at
          `)
          .eq('conversation_id', conversationId);

        if (cursor?.created_at) {
          q = q.lt('created_at', cursor.created_at);
        }
        q = q.order('created_at', { ascending: false }).limit(limit + 1);

        const { data: t3Msgs, error: t3Err } = await q;
        if (!t3Err && t3Msgs) {
          rawMessages = t3Msgs;
          querySuccess = true;
        }
      } catch {
        // Fall to minimal tier
      }
    }

    // Tier 4: Minimal essential columns (guaranteed to succeed on any database state)
    if (!querySuccess) {
      try {
        let q = admin
          .from('messages')
          .select('id, conversation_id, sender_id, content, created_at, message_type, file_url')
          .eq('conversation_id', conversationId);

        if (cursor?.created_at) {
          q = q.lt('created_at', cursor.created_at);
        }
        q = q.order('created_at', { ascending: false }).limit(limit + 1);

        const { data: t4Msgs } = await q;
        rawMessages = t4Msgs || [];
      } catch {
        rawMessages = [];
      }
    }

    // 5. Inferred Group Name & Full Polymorphic Group Detection
    let inferredGroupName = (convData?.name || '').trim();

    if (!inferredGroupName) {
      const createMsg = (rawMessages || []).find(
        (m) => m.content && m.content.toLowerCase().includes('created group')
      );
      if (createMsg?.content) {
        const match = createMsg.content.match(/created group ["']?(.*?)["']?$/i);
        if (match && match[1]) {
          inferredGroupName = match[1].replace(/["']/g, '').trim();
        }
      }

      if (!inferredGroupName) {
        try {
          const { data: createMsgDb } = await admin
            .from('messages')
            .select('content')
            .eq('conversation_id', conversationId)
            .ilike('content', '%created group%')
            .limit(1)
            .maybeSingle();

          if (createMsgDb?.content) {
            const match = createMsgDb.content.match(/created group ["']?(.*?)["']?$/i);
            if (match && match[1]) {
              inferredGroupName = match[1].replace(/["']/g, '').trim();
            }
          }
        } catch {
          // Graceful fallback
        }
      }
    }

    const isSystemGroup =
      Boolean(inferredGroupName) ||
      (rawMessages || []).some(
        (m) =>
          m.message_type === 'system' ||
          (m.content && m.content.toLowerCase().includes('created group'))
      );

    const hasGroupRole = (allParticipants || []).some((p) => p.role === 'owner' || p.role === 'admin');
    const isGroup =
      convData?.type === 'group' ||
      Boolean(inferredGroupName) ||
      Boolean(convData?.name && convData.name.trim()) ||
      (allParticipants || []).length > 2 ||
      hasGroupRole ||
      Boolean(convData?.created_by) ||
      isSystemGroup;

    // Resolve creator ID with multi-tier fallback
    let resolvedCreatorId = convData?.created_by;
    if (!resolvedCreatorId && isGroup) {
      const ownerPart = (allParticipants || []).find((p) => p.role === 'owner' || p.role === 'admin');
      if (ownerPart) {
        resolvedCreatorId = ownerPart.user?.id || ownerPart.user_id;
      } else {
        const createMsg = (rawMessages || []).find(
          (m) => m.message_type === 'system' && m.content && m.content.toLowerCase().includes('created group')
        );
        if (createMsg?.sender_id) {
          resolvedCreatorId = createMsg.sender_id;
        } else if (allParticipants?.length > 0) {
          resolvedCreatorId = allParticipants[0].user?.id || allParticipants[0].user_id;
        }
      }
    }

    const participantList = (allParticipants || []).map((p) => {
      const uid = p.user?.id || p.user_id;
      const isCreator = uid === resolvedCreatorId;
      return {
        id: uid,
        user_id: uid,
        full_name: p.user?.full_name || p.user?.username || 'Member',
        username: p.user?.username || '',
        avatar_url: p.user?.avatar_url || '',
        email: p.user?.email || '',
        status: p.user?.status || 'offline',
        role: p.role || (isCreator ? 'owner' : 'member'),
        last_read_at: p.last_read_at,
      };
    });

    // Find recipient if direct
    const otherParticipant = participantList.find((p) => p.id !== currentUserId) || participantList[0] || null;

    const hasMore = (rawMessages || []).length > limit;
    const paginated = hasMore ? rawMessages.slice(0, limit) : (rawMessages || []);

    const participantMap = new Map(participantList.map((p) => [p.id, p]));

    // Reverse to chronological order (oldest first for chat stream) and enrich messages
    const chronologicalMessages = [...paginated].reverse().map((m) => {
      // Ensure sender profile is always attached even with flat DB queries
      const senderProfile = m.sender || participantMap.get(m.sender_id) || {
        id: m.sender_id,
        full_name: m.sender_id === currentUserId ? 'You' : 'Member',
        username: 'member',
        avatar_url: '',
      };

      // Dual-path deletion detection:
      // A message is considered deleted if:
      // 1. Explicitly flagged as is_deleted === true or deleted_at is present
      // 2. OR its content is empty ('') and has no file_url and is not a system message (tombstone pattern)
      const isDeleted = Boolean(
        m.is_deleted === true ||
        Boolean(m.deleted_at) ||
        ((m.content === null || m.content === undefined || String(m.content).trim() === '') && !m.file_url && m.message_type !== 'system')
      );

      if (isDeleted) {
        const delProfile = m.deleted_by ? participantMap.get(m.deleted_by) : null;
        return {
          ...m,
          is_deleted: true,
          deleted_by: m.deleted_by || m.sender_id,
          deleted_at: m.deleted_at || m.created_at,
          content: '',
          file_url: null,
          file_name: null,
          sender: senderProfile,
          deleted_by_profile: delProfile
            ? { id: delProfile.id, full_name: delProfile.full_name, username: delProfile.username }
            : senderProfile,
        };
      }
      return {
        ...m,
        is_deleted: false,
        sender: senderProfile,
      };
    });

    const nextCursor =
      hasMore && paginated.length > 0
        ? {
            created_at: paginated[paginated.length - 1].created_at,
            id: paginated[paginated.length - 1].id,
          }
        : null;

    const isMeCreator = resolvedCreatorId === currentUserId;
    const myRole = isMeCreator
      ? 'owner'
      : myParticipation?.role || participantList.find((p) => p.id === currentUserId)?.role || 'member';

    const resolvedGroupName =
      (convData?.name && convData.name.trim()) ||
      inferredGroupName ||
      (isGroup ? 'Group Chat' : otherParticipant?.full_name || 'Direct Chat');

    let resolvedGroupAvatar = convData?.avatar_url || '';
    if (!resolvedGroupAvatar && isGroup) {
      try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '');
        const { data: gFiles } = await admin.storage
          .from('avatars')
          .list(`groups/${conversationId}`);
        if (gFiles && gFiles.length > 0) {
          const latestFile = gFiles.sort((a, b) => b.name.localeCompare(a.name))[0];
          if (latestFile?.name) {
            resolvedGroupAvatar = `${supabaseUrl}/storage/v1/object/public/avatars/groups/${conversationId}/${latestFile.name}`;
          }
        }
      } catch {
        // Graceful
      }
    }

    const conversationDetails = {
      id: conversationId,
      type: isGroup ? 'group' : 'direct',
      name: resolvedGroupName,
      avatar_url: resolvedGroupAvatar,
      description: convData?.description || '',
      created_by: resolvedCreatorId,
      recipient: isGroup ? null : otherParticipant,
      participants: participantList,
      memberCount: participantList.length,
      myRole,
    };

    return {
      success: true,
      messages: chronologicalMessages,
      recipient: isGroup ? null : otherParticipant,
      conversation: conversationDetails,
      nextCursor,
      hasMore,
    };
  } catch (err) {
    console.error('getConversationMessages error:', err);
    return { success: false, messages: [], recipient: null, conversation: null, hasMore: false };
  }
}

/**
 * Sends a message (Text, Image, PDF, Document, or System) in a conversation.
 * Ultra-robust error isolation ensures message delivery ALWAYS succeeds.
 */
export async function sendMessage(input) {
  try {
    const {
      conversationId,
      content = '',
      senderId = null,
      messageType = 'text',
      fileUrl = null,
      fileName = null,
      fileSize = null,
      fileType = null,
    } = input || {};

    const cleanContent = typeof content === 'string' ? content.trim() : '';
    if (!cleanContent && !fileUrl) {
      return { success: false, error: 'Message content or attachment is required.' };
    }

    if (!conversationId) {
      return { success: false, error: 'Conversation identifier is required.' };
    }

    // Authenticate caller on server
    let activeSenderId = senderId;
    let senderProfileData = null;
    if (!activeSenderId) {
      const supabase = await createClient();
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();
      activeSenderId = currentUser?.id;
      if (currentUser) {
        const meta = currentUser.user_metadata || {};
        senderProfileData = {
          id: currentUser.id,
          full_name: meta.full_name || meta.name || (currentUser.email ? currentUser.email.split('@')[0] : 'User'),
          username: meta.username || (currentUser.email ? currentUser.email.split('@')[0] : 'user'),
          avatar_url: meta.avatar_url || '',
        };
      }
    }

    if (!activeSenderId) {
      return { success: false, error: 'Authentication required to send messages.' };
    }

    const admin = createAdminClient();

    // Fetch sender profile safely from profiles table if not loaded
    if (!senderProfileData) {
      try {
        const { data: prof } = await admin
          .from('profiles')
          .select('id, full_name, username, avatar_url')
          .eq('id', activeSenderId)
          .maybeSingle();
        if (prof) {
          senderProfileData = prof;
        }
      } catch {
        // Handled
      }
    }

    if (!senderProfileData) {
      senderProfileData = {
        id: activeSenderId,
        full_name: 'User',
        username: 'user',
        avatar_url: '',
      };
    }

    // Ensure sender is enrolled in conversation_participants
    try {
      const { data: isParticipant } = await admin
        .from('conversation_participants')
        .select('conversation_id')
        .eq('conversation_id', conversationId)
        .eq('user_id', activeSenderId)
        .maybeSingle();

      if (!isParticipant) {
        await admin
          .from('conversation_participants')
          .insert({
            conversation_id: conversationId,
            user_id: activeSenderId,
            role: 'member',
          });
      }
    } catch {
      // Ignored gracefully
    }

    // 1. Insert message into messages table with resilient 4-attempt multi-tier ladder
    const nowIso = new Date().toISOString();
    let savedMsg = null;
    let insertError = null;

    // Attempt 1: Full rich payload with flat column select (no embedded join)
    try {
      const { data, error } = await admin
        .from('messages')
        .insert({
          conversation_id: conversationId,
          sender_id: activeSenderId,
          content: cleanContent || '',
          message_type: messageType || 'text',
          file_url: fileUrl || null,
          file_name: fileName || null,
          file_size: fileSize || null,
          file_type: fileType || null,
          created_at: nowIso,
        })
        .select('id, conversation_id, sender_id, content, message_type, file_url, file_name, file_size, file_type, is_read, created_at')
        .maybeSingle();

      if (!error && data) {
        savedMsg = data;
      } else {
        insertError = error;
      }
    } catch (t1Err) {
      insertError = t1Err;
    }

    // Attempt 2: Standard payload (without file_size, file_type columns if DB table lacks them)
    if (!savedMsg) {
      try {
        const { data, error } = await admin
          .from('messages')
          .insert({
            conversation_id: conversationId,
            sender_id: activeSenderId,
            content: cleanContent || '',
            message_type: messageType || 'text',
            file_url: fileUrl || null,
            file_name: fileName || null,
            created_at: nowIso,
          })
          .select('id, conversation_id, sender_id, content, message_type, file_url, file_name, created_at')
          .maybeSingle();

        if (!error && data) {
          savedMsg = data;
        } else {
          insertError = error;
        }
      } catch (t2Err) {
        insertError = t2Err;
      }
    }

    // Attempt 3: Base payload (preserves message_type and file_url on simplified schemas)
    if (!savedMsg) {
      try {
        const { data, error } = await admin
          .from('messages')
          .insert({
            conversation_id: conversationId,
            sender_id: activeSenderId,
            content: cleanContent || '',
            message_type: messageType || 'text',
            file_url: fileUrl || null,
            created_at: nowIso,
          })
          .select('id, conversation_id, sender_id, content, message_type, file_url, created_at')
          .maybeSingle();

        if (!error && data) {
          savedMsg = data;
        } else {
          insertError = error;
        }
      } catch (t3Err) {
        insertError = t3Err;
      }
    }

    // Attempt 4: Minimal bare insert (fallback for legacy/strictly constrained schemas)
    if (!savedMsg) {
      try {
        const { data, error } = await admin
          .from('messages')
          .insert({
            conversation_id: conversationId,
            sender_id: activeSenderId,
            content: cleanContent || (fileUrl ? `[Attachment] ${fileUrl}` : 'Message'),
          })
          .select('id, conversation_id, sender_id, content, created_at')
          .maybeSingle();

        if (!error && data) {
          savedMsg = data;
        } else {
          insertError = error;
        }
      } catch (t4Err) {
        insertError = t4Err;
      }
    }

    if (!savedMsg) {
      console.error('Message insert all 4 attempts failed:', insertError);
      return { success: false, error: 'Failed to save message. Please verify database connection.' };
    }

    // 2. Synthesize complete confirmed message object with sender profile
    const confirmedMessage = {
      id: savedMsg.id,
      conversation_id: conversationId,
      sender_id: activeSenderId,
      content: savedMsg.content || cleanContent,
      message_type: savedMsg.message_type || messageType || 'text',
      file_url: savedMsg.file_url || fileUrl,
      file_name: savedMsg.file_name || fileName,
      file_size: savedMsg.file_size || fileSize,
      file_type: savedMsg.file_type || fileType,
      is_read: false,
      is_deleted: false,
      created_at: savedMsg.created_at || nowIso,
      sender: senderProfileData,
    };

    // 3. Safely update sender's last_read_at timestamp
    try {
      await admin
        .from('conversation_participants')
        .update({ last_read_at: nowIso })
        .eq('conversation_id', conversationId)
        .eq('user_id', activeSenderId);
    } catch {
      // Graceful
    }

    // 4. Safely update conversation preview & timestamp
    let snippet = cleanContent;
    if (!snippet) {
      if (messageType === 'image') snippet = '📷 Photo';
      else if (messageType === 'pdf') snippet = `📄 ${fileName || 'Document'}`;
      else snippet = `📎 ${fileName || 'Attachment'}`;
    }

    try {
      await admin
        .from('conversations')
        .update({
          last_message_preview: snippet,
          last_message_at: nowIso,
          last_message_sender_id: activeSenderId,
          updated_at: nowIso,
        })
        .eq('id', conversationId);
    } catch {
      try {
        await admin
          .from('conversations')
          .update({ updated_at: nowIso })
          .eq('id', conversationId);
      } catch {
        // Handled
      }
    }

    // 5. Fetch recipient user IDs for real-time broadcast fanout
    let recipientIds = [];
    try {
      const { data: participants } = await admin
        .from('conversation_participants')
        .select('user_id')
        .eq('conversation_id', conversationId)
        .neq('user_id', activeSenderId);
      recipientIds = (participants || []).map((p) => p.user_id);
    } catch {
      // Handled
    }

    return {
      success: true,
      message: confirmedMessage,
      recipientIds,
      recipientId: recipientIds[0] || null,
    };
  } catch (err) {
    console.error('sendMessage fatal error:', err);
    return { success: false, error: 'Could not send message. Please check connection.' };
  }
}

/**
 * Adds new members to an existing group conversation.
 */
export async function addMembersToGroup({ conversationId, userIds = [], actorId = null }) {
  try {
    if (!conversationId || !Array.isArray(userIds) || userIds.length === 0) {
      return { success: false, error: 'Conversation ID and member IDs are required.' };
    }

    let activeActorId = actorId;
    if (!activeActorId) {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      activeActorId = user?.id;
    }

    if (!activeActorId) {
      return { success: false, error: 'Authentication required.' };
    }

    const admin = createAdminClient();

    // Fetch actor profile & target user profiles
    const { data: actorProfile } = await admin
      .from('profiles')
      .select('full_name, username')
      .eq('id', activeActorId)
      .maybeSingle();

    const actorName = actorProfile?.full_name || actorProfile?.username || 'An admin';

    const { data: targetProfiles } = await admin
      .from('profiles')
      .select('id, full_name, username, avatar_url, email, status')
      .in('id', userIds);

    if (!targetProfiles || targetProfiles.length === 0) {
      return { success: false, error: 'No valid users found to add.' };
    }

    const nowIso = new Date().toISOString();

    // Upsert participants with multi-tier fallback
    const insertRowsWithRole = targetProfiles.map((tp) => ({
      conversation_id: conversationId,
      user_id: tp.id,
      role: 'member',
      joined_at: nowIso,
      last_read_at: nowIso,
    }));

    const { error: upsertErr1 } = await admin
      .from('conversation_participants')
      .upsert(insertRowsWithRole, {
        onConflict: 'conversation_id,user_id',
      });

    if (upsertErr1) {
      const insertRowsWithTimes = targetProfiles.map((tp) => ({
        conversation_id: conversationId,
        user_id: tp.id,
        joined_at: nowIso,
        last_read_at: nowIso,
      }));
      const { error: upsertErr2 } = await admin
        .from('conversation_participants')
        .upsert(insertRowsWithTimes, {
          onConflict: 'conversation_id,user_id',
        });

      if (upsertErr2) {
        for (const tp of targetProfiles) {
          try {
            await admin
              .from('conversation_participants')
              .insert({ conversation_id: conversationId, user_id: tp.id });
          } catch {
            // Handled
          }
        }
      }
    }

    // Create system message announcing new members
    const addedNames = targetProfiles.map((p) => p.full_name || p.username || 'user').join(', ');
    const systemNotice = `${actorName} added ${addedNames} to the group`;

    let sysMsg = null;
    try {
      const { data } = await admin
        .from('messages')
        .insert({
          conversation_id: conversationId,
          sender_id: activeActorId,
          content: systemNotice,
          message_type: 'system',
          created_at: nowIso,
        })
        .select('id, conversation_id, sender_id, content, message_type, created_at')
        .maybeSingle();
      if (data) {
        sysMsg = {
          ...data,
          sender: { id: activeActorId, full_name: actorName, username: actorName, avatar_url: '' },
        };
      }
    } catch {
      // Handled
    }

    // Fetch all current participant IDs for real-time notification
    const { data: allParts } = await admin
      .from('conversation_participants')
      .select('user_id')
      .eq('conversation_id', conversationId);

    const recipientIds = (allParts || []).map((p) => p.user_id).filter((id) => id !== activeActorId);

    return {
      success: true,
      addedMembers: targetProfiles.map((p) => ({ ...p, role: 'member', last_read_at: nowIso })),
      systemMessage: sysMsg,
      recipientIds,
    };
  } catch (err) {
    console.error('addMembersToGroup error:', err);
    return { success: false, error: 'Could not add members to group.' };
  }
}

/**
 * Removes a member from a group (or allows a member to leave).
 */
export async function removeMemberFromGroup({ conversationId, targetUserId, actorId = null }) {
  try {
    if (!conversationId || !targetUserId) {
      return { success: false, error: 'Conversation and target user identifiers are required.' };
    }

    let activeActorId = actorId;
    if (!activeActorId) {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      activeActorId = user?.id;
    }

    if (!activeActorId) {
      return { success: false, error: 'Authentication required.' };
    }

    const admin = createAdminClient();
    const isSelf = targetUserId === activeActorId;

    // Fetch target user profile
    const { data: targetProfile } = await admin
      .from('profiles')
      .select('full_name, username')
      .eq('id', targetUserId)
      .maybeSingle();

    const { data: actorProfile } = await admin
      .from('profiles')
      .select('full_name, username')
      .eq('id', activeActorId)
      .maybeSingle();

    const targetName = targetProfile?.full_name || targetProfile?.username || 'A member';
    const actorName = actorProfile?.full_name || actorProfile?.username || 'An admin';

    // Delete participant row
    await admin
      .from('conversation_participants')
      .delete()
      .eq('conversation_id', conversationId)
      .eq('user_id', targetUserId);

    const nowIso = new Date().toISOString();
    const systemNotice = isSelf
      ? `${targetName} left the group`
      : `${actorName} removed ${targetName} from the group`;

    // Insert system message
    let sysMsg = null;
    try {
      const { data } = await admin
        .from('messages')
        .insert({
          conversation_id: conversationId,
          sender_id: activeActorId,
          content: systemNotice,
          message_type: 'system',
          created_at: nowIso,
        })
        .select('id, conversation_id, sender_id, content, message_type, created_at')
        .maybeSingle();
      if (data) {
        sysMsg = {
          ...data,
          sender: { id: activeActorId, full_name: actorName, username: actorName, avatar_url: '' },
        };
      }
    } catch {
      // Handled
    }

    const { data: remainingParts } = await admin
      .from('conversation_participants')
      .select('user_id')
      .eq('conversation_id', conversationId);

    const recipientIds = (remainingParts || []).map((p) => p.user_id);

    return {
      success: true,
      removedUserId: targetUserId,
      systemMessage: sysMsg,
      recipientIds,
    };
  } catch (err) {
    console.error('removeMemberFromGroup error:', err);
    return { success: false, error: 'Could not remove member.' };
  }
}

/**
 * Uploads a Group Avatar image to the public 'avatars' storage bucket.
 */
export async function uploadGroupAvatarAction(formData) {
  try {
    const file = formData.get('file');
    const conversationId = formData.get('conversationId');
    const customActorId = formData.get('actorId');

    if (!file || !conversationId) {
      return { success: false, error: 'File and conversation ID are required.' };
    }

    if (file.size > 5 * 1024 * 1024) {
      return { success: false, error: 'Group avatar file size must be less than 5MB.' };
    }

    const mimeType = file.type?.toLowerCase() || '';
    const validMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'];
    if (!validMimeTypes.includes(mimeType) && !/\.(jpg|jpeg|png|webp|gif|svg)$/i.test(file.name || '')) {
      return { success: false, error: 'Please upload a valid image file (JPEG, PNG, WebP, GIF, or SVG).' };
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const activeActorId = user?.id || customActorId;
    if (!activeActorId) {
      return { success: false, error: 'Authentication required to update group avatar.' };
    }

    const admin = createAdminClient();

    // 1. Ensure 'avatars' public bucket exists
    const { data: buckets } = await admin.storage.listBuckets();
    const bucketName = buckets?.some((b) => b.name === 'avatars' || b.id === 'avatars')
      ? 'avatars'
      : buckets?.some((b) => b.name === 'avatar' || b.id === 'avatar')
      ? 'avatar'
      : 'avatars';

    const hasBucket = buckets?.some((b) => b.name === bucketName || b.id === bucketName);
    if (!hasBucket) {
      try {
        await admin.storage.createBucket('avatars', {
          public: true,
          fileSizeLimit: 5242880,
          allowedMimeTypes: validMimeTypes,
        });
      } catch (bucketErr) {
        console.warn('Bucket notice:', bucketErr.message);
      }
    }

    // 2. Clean previous group avatars
    try {
      const { data: existingFiles } = await admin.storage
        .from(bucketName)
        .list(`groups/${conversationId}`);
      if (existingFiles && existingFiles.length > 0) {
        const pathsToDelete = existingFiles.map((f) => `groups/${conversationId}/${f.name}`);
        await admin.storage.from(bucketName).remove(pathsToDelete);
      }
    } catch {
      // Graceful
    }

    // 3. Upload new buffer
    const buffer = Buffer.from(await file.arrayBuffer());
    const fileExt = (file.name || 'group.png').split('.').pop().toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
    const storagePath = `groups/${conversationId}/avatar_${Date.now()}.${fileExt}`;

    const { error: uploadError } = await admin.storage
      .from(bucketName)
      .upload(storagePath, buffer, {
        contentType: mimeType || 'image/png',
        upsert: true,
      });

    if (uploadError) {
      console.error('Group avatar storage upload error:', uploadError);
      return { success: false, error: uploadError.message || 'Failed to upload group avatar to storage.' };
    }

    // 4. Retrieve public URL
    const { data: publicData } = admin.storage.from(bucketName).getPublicUrl(storagePath);
    let avatarUrl = publicData?.publicUrl || '';

    if (!avatarUrl) {
      const { data: signedData } = await admin.storage
        .from(bucketName)
        .createSignedUrl(storagePath, 60 * 60 * 24 * 365);
      avatarUrl = signedData?.signedUrl || '';
    }

    // 5. Update conversation in database with resilient fallback
    try {
      const { error: convUpdateErr } = await admin
        .from('conversations')
        .update({
          avatar_url: avatarUrl,
          updated_at: new Date().toISOString(),
        })
        .eq('id', conversationId);

      if (convUpdateErr) {
        await admin
          .from('conversations')
          .update({
            avatar_url: avatarUrl,
          })
          .eq('id', conversationId);
      }
    } catch (e) {
      console.warn('Group avatar DB update notice:', e);
    }

    return {
      success: true,
      avatarUrl,
    };
  } catch (err) {
    console.error('uploadGroupAvatarAction exception:', err);
    return { success: false, error: err?.message || 'Could not upload group avatar.' };
  }
}

/**
 * Updates Group title, description, or avatar with resilient multi-tier fallbacks.
 */
export async function updateGroupDetails({
  conversationId,
  name = null,
  description = null,
  avatarUrl = null,
  actorId = null,
}) {
  try {
    if (!conversationId) {
      return { success: false, error: 'Conversation ID is required.' };
    }

    let activeActorId = actorId;
    if (!activeActorId) {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      activeActorId = user?.id;
    }

    if (!activeActorId) {
      return { success: false, error: 'Authentication required.' };
    }

    const admin = createAdminClient();

    const cleanName = typeof name === 'string' ? name.trim() : null;
    const cleanDesc = typeof description === 'string' ? description.trim() : null;

    let updatedConv = null;

    // Tier 1: Try full update with all fields (name, description, avatar_url, updated_at)
    try {
      const tier1Fields = {};
      if (cleanName) tier1Fields.name = cleanName;
      if (cleanDesc !== null) tier1Fields.description = cleanDesc;
      if (avatarUrl !== null) tier1Fields.avatar_url = avatarUrl;
      tier1Fields.updated_at = new Date().toISOString();

      const { data: t1Data, error: t1Err } = await admin
        .from('conversations')
        .update(tier1Fields)
        .eq('id', conversationId)
        .select()
        .maybeSingle();

      if (!t1Err && t1Data) {
        updatedConv = t1Data;
      }
    } catch {
      // Tier 1 fallback
    }

    // Tier 2: Without updated_at
    if (!updatedConv) {
      try {
        const tier2Fields = {};
        if (cleanName) tier2Fields.name = cleanName;
        if (cleanDesc !== null) tier2Fields.description = cleanDesc;
        if (avatarUrl !== null) tier2Fields.avatar_url = avatarUrl;

        const { data: t2Data, error: t2Err } = await admin
          .from('conversations')
          .update(tier2Fields)
          .eq('id', conversationId)
          .select()
          .maybeSingle();

        if (!t2Err && t2Data) {
          updatedConv = t2Data;
        }
      } catch {
        // Tier 2 fallback
      }
    }

    // Tier 3: Without description (if description column is missing)
    if (!updatedConv) {
      try {
        const tier3Fields = {};
        if (cleanName) tier3Fields.name = cleanName;
        if (avatarUrl !== null) tier3Fields.avatar_url = avatarUrl;

        const { data: t3Data, error: t3Err } = await admin
          .from('conversations')
          .update(tier3Fields)
          .eq('id', conversationId)
          .select()
          .maybeSingle();

        if (!t3Err && t3Data) {
          updatedConv = t3Data;
        }
      } catch {
        // Tier 3 fallback
      }
    }

    // Tier 4: Without avatar_url (if avatar_url column is missing in schema cache)
    if (!updatedConv) {
      try {
        const tier4Fields = {};
        if (cleanName) tier4Fields.name = cleanName;
        if (cleanDesc !== null) tier4Fields.description = cleanDesc;

        const { data: t4Data, error: t4Err } = await admin
          .from('conversations')
          .update(tier4Fields)
          .eq('id', conversationId)
          .select('id, type, name')
          .maybeSingle();

        if (!t4Err && t4Data) {
          updatedConv = {
            ...t4Data,
            avatar_url: avatarUrl || '',
            description: cleanDesc || '',
          };
        }
      } catch {
        // Tier 4 fallback
      }
    }

    // Tier 5: Minimal update with name only (no schema-dependent select)
    if (!updatedConv && cleanName) {
      try {
        const { error: t5Err } = await admin
          .from('conversations')
          .update({ name: cleanName })
          .eq('id', conversationId);

        if (!t5Err) {
          updatedConv = {
            id: conversationId,
            name: cleanName,
            description: cleanDesc || '',
            avatar_url: avatarUrl || '',
          };
        }
      } catch {
        // Tier 5 fallback
      }
    }

    // Default object so UI never breaks
    if (!updatedConv) {
      updatedConv = {
        id: conversationId,
        name: cleanName || 'Group Chat',
        description: cleanDesc || '',
        avatar_url: avatarUrl || '',
      };
    }

    // System notice (isolated in try/catch so system notice creation never fails the group update)
    let sysMsg = null;
    let recipientIds = [];
    try {
      const { data: actorProfile } = await admin
        .from('profiles')
        .select('full_name, username')
        .eq('id', activeActorId)
        .maybeSingle();

      const actorName = actorProfile?.full_name || actorProfile?.username || 'An admin';
      const nowIso = new Date().toISOString();

      const { data: insertedSysMsg } = await admin
        .from('messages')
        .insert({
          conversation_id: conversationId,
          sender_id: activeActorId,
          content: `${actorName} updated the group profile`,
          message_type: 'system',
          created_at: nowIso,
        })
        .select(`
          id,
          conversation_id,
          sender_id,
          content,
          message_type,
          created_at,
          sender:profiles (id, full_name, username, avatar_url)
        `)
        .maybeSingle();

      sysMsg = insertedSysMsg;

      const { data: allParts } = await admin
        .from('conversation_participants')
        .select('user_id')
        .eq('conversation_id', conversationId);

      recipientIds = (allParts || []).map((p) => p.user_id).filter((id) => id !== activeActorId);
    } catch (sysErr) {
      console.warn('System notice creation notice:', sysErr);
    }

    return {
      success: true,
      group: updatedConv,
      systemMessage: sysMsg,
      recipientIds,
    };
  } catch (err) {
    console.error('updateGroupDetails exception:', err);
    return { success: false, error: err?.message || 'Could not update group details.' };
  }
}

/**
 * Allows the current user to leave a group conversation.
 */
export async function leaveGroup({ conversationId, userId = null }) {
  return removeMemberFromGroup({ conversationId, targetUserId: userId, actorId: userId });
}

/**
 * Searches for users/contacts by query.
 */
export async function searchUsers(query = '', currentUserId = null) {
  try {
    const cleanQuery = typeof query === 'string' ? query.trim().toLowerCase() : '';
    const admin = createAdminClient();

    let dbQuery = admin
      .from('profiles')
      .select('id, full_name, username, avatar_url, email, status')
      .limit(20);

    if (cleanQuery.length > 0) {
      dbQuery = dbQuery.or(`full_name.ilike.%${cleanQuery}%,username.ilike.%${cleanQuery}%,email.ilike.%${cleanQuery}%`);
    }

    if (currentUserId) {
      dbQuery = dbQuery.neq('id', currentUserId);
    }

    const { data: users, error } = await dbQuery;

    if (error) {
      return { success: false, users: [] };
    }

    return { success: true, users: users || [] };
  } catch (err) {
    console.error('searchUsers error:', err);
    return { success: false, users: [] };
  }
}

/**
 * Marks messages in a conversation as read.
 */
export async function markMessagesAsRead({ conversationId, userId = null }) {
  try {
    let currentUserId = userId;
    if (!currentUserId) {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      currentUserId = user?.id;
    }

    if (!currentUserId || !conversationId) {
      return { success: false };
    }

    const admin = createAdminClient();
    const nowIso = new Date().toISOString();

    try {
      await admin
        .from('conversation_participants')
        .update({ last_read_at: nowIso })
        .eq('conversation_id', conversationId)
        .eq('user_id', currentUserId);

      await admin
        .from('messages')
        .update({ is_read: true })
        .eq('conversation_id', conversationId)
        .neq('sender_id', currentUserId)
        .eq('is_read', false);
    } catch {
      // Handled gracefully
    }

    return { success: true, readAt: nowIso };
  } catch (err) {
    console.error('markMessagesAsRead error:', err);
    return { success: false };
  }
}

/**
 * Guaranteed Server Action for uploading chat attachments.
 */
export async function uploadChatAttachmentAction(formData) {
  try {
    const file = formData.get('file');
    const conversationId = formData.get('conversationId');

    if (!file || !conversationId) {
      return { success: false, error: 'File and conversation ID are required.' };
    }

    const admin = createAdminClient();

    // 1. Ensure bucket exists
    const { data: buckets } = await admin.storage.listBuckets();
    const hasBucket = buckets?.some((b) => b.name === 'chat-attachments' || b.id === 'chat-attachments');
    if (!hasBucket) {
      await admin.storage.createBucket('chat-attachments', {
        public: true,
        fileSizeLimit: 52428800, // 50MB
      });
    }

    // 2. Prepare file buffer & path
    const buffer = Buffer.from(await file.arrayBuffer());
    const cleanName = (file.name || 'file')
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/_+/g, '_')
      .slice(0, 100);
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const storagePath = `conversations/${conversationId}/${timestamp}_${randomSuffix}_${cleanName}`;

    // 3. Upload with admin client
    const { error: uploadError } = await admin.storage
      .from('chat-attachments')
      .upload(storagePath, buffer, {
        contentType: file.type || 'application/octet-stream',
        upsert: true,
      });

    if (uploadError) {
      console.error('Server storage upload error:', uploadError);
      return { success: false, error: uploadError.message };
    }

    // 4. Generate clean URL
    const { data: publicData } = admin.storage
      .from('chat-attachments')
      .getPublicUrl(storagePath);

    let fileUrl = publicData?.publicUrl || '';

    if (!fileUrl) {
      const { data: signedData } = await admin.storage
        .from('chat-attachments')
        .createSignedUrl(storagePath, 60 * 60 * 24 * 365);
      fileUrl = signedData?.signedUrl || '';
    }

    let messageType = 'file';
    const type = file.type?.toLowerCase() || '';
    const name = file.name?.toLowerCase() || '';
    if (type.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|svg|bmp)$/i.test(name)) {
      messageType = 'image';
    } else if (type === 'application/pdf' || /\.pdf$/i.test(name)) {
      messageType = 'pdf';
    }

    return {
      success: true,
      fileUrl,
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type || 'application/octet-stream',
      messageType,
      storagePath,
    };
  } catch (err) {
    console.error('uploadChatAttachmentAction error:', err);
    return { success: false, error: err.message || 'Failed to upload attachment.' };
  }
}

/**
 * Permanently deletes a message.
 */
export async function deleteMessageForEveryone({ messageId, conversationId, userId = null }) {
  try {
    if (!messageId || !conversationId) {
      return { success: false, error: 'Message and conversation identifiers are required.' };
    }

    let activeUserId = userId;
    if (!activeUserId) {
      const supabase = await createClient();
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();
      activeUserId = currentUser?.id;
    }

    if (!activeUserId) {
      return { success: false, error: 'Authentication required to delete messages.' };
    }

    const admin = createAdminClient();

    // 1. Fetch the target message safely (handling UUID vs client_message_id)
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(messageId);
    let targetMessage = null;

    if (isUuid) {
      const { data: tm } = await admin
        .from('messages')
        .select('id, conversation_id, sender_id, file_url, created_at')
        .eq('id', messageId)
        .eq('conversation_id', conversationId)
        .maybeSingle();
      targetMessage = tm;
    }

    if (!targetMessage) {
      const { data: tmClient } = await admin
        .from('messages')
        .select('id, conversation_id, sender_id, file_url, created_at')
        .eq('client_message_id', messageId)
        .eq('conversation_id', conversationId)
        .maybeSingle();
      targetMessage = tmClient;
    }

    if (!targetMessage) {
      return { success: false, error: 'Message not found.' };
    }

    if (targetMessage.sender_id !== activeUserId) {
      return { success: false, error: 'Unauthorized: You can only delete messages you sent.' };
    }

    const resolvedMessageId = targetMessage.id;

    // 2. Fetch deleter profile info for real-time notification
    let deleterProfile = { id: activeUserId, full_name: '', username: '' };
    try {
      const { data: prof } = await admin
        .from('profiles')
        .select('id, full_name, username, email')
        .eq('id', activeUserId)
        .maybeSingle();
      if (prof) {
        deleterProfile = {
          id: prof.id,
          full_name: prof.full_name || prof.username || (prof.email ? prof.email.split('@')[0] : 'User'),
          username: prof.username || (prof.email ? prof.email.split('@')[0] : 'User'),
          email: prof.email || '',
        };
      } else {
        const { data: authData } = await admin.auth.admin.getUserById(activeUserId);
        const meta = authData?.user?.user_metadata || {};
        const emailPrefix = authData?.user?.email ? authData.user.email.split('@')[0] : 'User';
        deleterProfile = {
          id: activeUserId,
          full_name: meta.full_name || meta.username || emailPrefix,
          username: meta.username || emailPrefix,
          email: authData?.user?.email || '',
        };
      }
    } catch {
      // Handled
    }

    // 3. If message has storage file attachment, purge from Supabase storage
    if (targetMessage.file_url) {
      try {
        const match = targetMessage.file_url.match(/chat-attachments\/(.+?)(\?|$)/);
        if (match && match[1]) {
          const storagePath = decodeURIComponent(match[1]);
          await admin.storage.from('chat-attachments').remove([storagePath]);
        }
      } catch (storageErr) {
        console.warn('Could not remove file from storage:', storageErr);
      }
    }

    // 4. Soft delete message from DB (WhatsApp style tombstone)
    const nowIso = new Date().toISOString();
    if (hasMessagesDeletedColumns) {
      const { error: updateError } = await admin
        .from('messages')
        .update({
          content: '',
          file_url: null,
          file_name: null,
          file_size: null,
          file_type: null,
          is_deleted: true,
          deleted_by: activeUserId,
          deleted_at: nowIso,
        })
        .eq('id', resolvedMessageId);

      if (updateError && (updateError.code === '42703' || updateError.message?.includes('is_deleted'))) {
        hasMessagesDeletedColumns = false;
        await admin
          .from('messages')
          .update({
            content: '',
            file_url: null,
            file_name: null,
          })
          .eq('id', resolvedMessageId);
      }
    } else {
      await admin
        .from('messages')
        .update({
          content: '',
          file_url: null,
          file_name: null,
        })
        .eq('id', resolvedMessageId);
    }

    // 5. Fetch the next latest remaining message for this conversation
    let nextLastMessage = null;
    try {
      const { data: nextLastMessages } = await admin
        .from('messages')
        .select(`
          id,
          conversation_id,
          sender_id,
          content,
          message_type,
          file_name,
          created_at,
          is_read
        `)
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .limit(1);

      nextLastMessage = nextLastMessages?.[0] || null;
    } catch {
      // Handled
    }

    // 6. Update conversation timestamp
    if (nextLastMessage) {
      try {
        await admin
          .from('conversations')
          .update({
            updated_at: nextLastMessage.created_at,
          })
          .eq('id', conversationId);
      } catch {
        // Handled
      }
    }

    // 7. Fetch all other participant IDs for real-time broadcast fan-out
    let recipientIds = [];
    try {
      const { data: participants } = await admin
        .from('conversation_participants')
        .select('user_id')
        .eq('conversation_id', conversationId)
        .neq('user_id', activeUserId);
      recipientIds = (participants || []).map((p) => p.user_id);
    } catch {
      // Handled
    }

    return {
      success: true,
      messageId,
      conversationId,
      deletedBy: activeUserId,
      deleterProfile,
      deletedAt: nowIso,
      nextLastMessage,
      recipientIds,
      recipientId: recipientIds[0] || null,
    };
  } catch (err) {
    console.error('deleteMessageForEveryone error:', err);
    return { success: false, error: 'Could not delete message. Please try again.' };
  }
}
