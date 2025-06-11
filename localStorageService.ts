
// Cache buster: ${new Date().toISOString()}
import type { User, Chat, Message, UserVisibility, MessageType, GroupPermissions } from './types';
import { MOCK_USERS as INITIAL_USERS } from './constants'; // For seeding

const DB_KEYS = {
  USERS: 'titanChatUsers_v3', 
  CHATS: 'titanChatChats_v3', 
  MESSAGES: 'titanChatMessages_v3', 
  CURRENT_USER_ID: 'titanChatCurrentUserId_v3',
};

// --- Utility Functions ---
const generateId = (prefix: string = ''): string => {
  return `${prefix}${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 9)}`;
};

const getFromStorage = <T>(key: string, defaultValue: T): T => {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : defaultValue;
  } catch (error) {
    console.error(`Error reading from localStorage key "${key}":`, error);
    return defaultValue;
  }
};

const saveToStorage = <T>(key: string, value: T): void => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error(`Error saving to localStorage key "${key}":`, error);
  }
};

// --- User Management ---
export const getUsers = (): User[] => getFromStorage<User[]>(DB_KEYS.USERS, []);
export const saveUsers = (users: User[]): void => saveToStorage<User[]>(DB_KEYS.USERS, users);

export const addUser = (newUser: Omit<User, 'id' | 'status' | 'language' | 'role' | 'friends' | 'friendRequestsSent' | 'friendRequestsReceived' | 'blockedUserIds' | 'visibilitySettings' | 'lastSeen' | 'avatarUrl'>): User | null => {
  const users = getUsers();
  if (users.find(u => u.email.toLowerCase() === newUser.email.toLowerCase())) {
    throw new Error("Email already exists.");
  }
  if (users.find(u => u.nickname.toLowerCase() === newUser.nickname.toLowerCase())) {
    throw new Error("Nickname already exists.");
  }
  const userWithId: User = {
    ...newUser,
    id: generateId('user_'),
    status: 'online',
    language: 'en',
    role: 'user',
    friends: [],
    friendRequestsSent: [],
    friendRequestsReceived: [],
    blockedUserIds: [],
    visibilitySettings: { 
      onlineStatus: 'public',
      lastSeen: 'friends',
      profileInfo: 'public',
    },
    lastSeen: new Date().toISOString(),
    // avatarUrl is intentionally omitted to use initials-based avatar by default
  };
  saveUsers([...users, userWithId]);
  return userWithId;
};

export const findUserByEmail = (email: string): User | undefined => {
  return getUsers().find(u => u.email.toLowerCase() === email.toLowerCase());
};

export const findUserById = (userId: string): User | undefined => {
  return getUsers().find(u => u.id === userId);
};

export const updateUser = (userId: string, updates: Partial<User>): User | null => {
  let users = getUsers();
  const userIndex = users.findIndex(u => u.id === userId);
  if (userIndex === -1) return null;

  if (updates.status === 'offline' && users[userIndex].status !== 'offline') {
    updates.lastSeen = new Date().toISOString();
  } else if (updates.status === 'online' && users[userIndex].status !== 'online') {
     updates.lastSeen = new Date().toISOString(); 
  }

  users[userIndex] = { ...users[userIndex], ...updates };
  saveUsers(users);

  let chats = getChats();
  let chatsModified = false;
  chats.forEach(chat => {
      if (chat.participants.includes(userId) && chat.participantDetails && chat.participantDetails[userId]) {
          const userForChatDetails = users[userIndex]; 
          chat.participantDetails[userId] = {
              name: userForChatDetails.name,
              nickname: userForChatDetails.nickname,
              avatarUrl: userForChatDetails.avatarUrl,
              status: userForChatDetails.status,
              lastSeen: userForChatDetails.lastSeen,
              visibilitySettings: userForChatDetails.visibilitySettings,
          };
          chatsModified = true;
      }
  });
  if (chatsModified) saveChats(chats);

  return users[userIndex];
};

export const deleteUser = (userId: string): boolean => {
  let users = getUsers();
  const initialLength = users.length;
  users = users.filter(u => u.id !== userId);
  if (users.length === initialLength) return false;
  saveUsers(users);

  let chats = getChats();
  const updatedChats = chats.map(chat => {
    let chatModified = false;
    const newParticipants = chat.participants.filter(pId => pId !== userId);

    if (newParticipants.length < chat.participants.length) { // User was in this chat
      chatModified = true;
      chat.participants = newParticipants;
      if (chat.participantDetails && chat.participantDetails[userId]) {
        delete chat.participantDetails[userId];
      }
      if (chat.admins?.includes(userId)) {
        chat.admins = chat.admins.filter(adminId => adminId !== userId);
      }
      if (chat.ownerId === userId) {
        chat.ownerId = chat.admins?.[0] || chat.participants?.[0] || undefined;
      }
      if (chat.unreadCounts && chat.unreadCounts[userId]) {
        delete chat.unreadCounts[userId];
      }
      if (chat.deletedFor && chat.deletedFor[userId]) {
        delete chat.deletedFor[userId];
      }
      if (chat.activityVisibilityOverrides && chat.activityVisibilityOverrides[userId]) {
        delete chat.activityVisibilityOverrides[userId];
      }
      if (chat.memberOverrides && chat.memberOverrides[userId]) {
        delete chat.memberOverrides[userId];
      }
    }
    return chatModified ? chat : null; // return modified chat or null if no change related to this user
  }).filter(chat => chat !== null && (chat.type === 'individual' ? chat.participants.length > 1 : chat.participants.length > 0)) as Chat[];
  
  saveChats(updatedChats);


  let messages = getMessages();
  for (const chatId in messages) {
    const originalCount = messages[chatId].length;
    messages[chatId] = messages[chatId].filter(msg => msg.senderId !== userId);
    // Also remove reactions by the deleted user
    messages[chatId].forEach(msg => {
        if (msg.reactions) {
            for (const emoji in msg.reactions) {
                msg.reactions[emoji] = msg.reactions[emoji].filter(reactorId => reactorId !== userId);
                if (msg.reactions[emoji].length === 0) {
                    delete msg.reactions[emoji];
                }
            }
            if (Object.keys(msg.reactions).length === 0) {
                delete msg.reactions;
            }
        }
    });

    if (messages[chatId].length === 0 && originalCount > 0) {
        delete messages[chatId];
    } else if (messages[chatId].length < originalCount) {
        // messages for this chat were modified
    }
  }
  saveMessages(messages);

  if (getCurrentUserId() === userId) setCurrentUserId(null);
  return true;
};

// --- Friend Management ---
export const sendFriendRequest = (senderId: string, receiverId: string): boolean => {
  const users = getUsers();
  const sender = users.find(u => u.id === senderId);
  const receiver = users.find(u => u.id === receiverId);

  if (!sender || !receiver || sender.friends?.includes(receiverId) || sender.friendRequestsSent?.includes(receiverId) || receiver.friendRequestsReceived?.includes(senderId)) {
    return false; 
  }

  sender.friendRequestsSent = [...(sender.friendRequestsSent || []), receiverId];
  receiver.friendRequestsReceived = [...(receiver.friendRequestsReceived || []), senderId];
  saveUsers(users);
  return true;
};

export const acceptFriendRequest = (accepterId: string, requesterId: string): boolean => {
  const users = getUsers();
  const accepter = users.find(u => u.id === accepterId);
  const requester = users.find(u => u.id === requesterId);

  if (!accepter || !requester || !accepter.friendRequestsReceived?.includes(requesterId) || !requester.friendRequestsSent?.includes(accepterId)) {
    return false; 
  }

  accepter.friendRequestsReceived = accepter.friendRequestsReceived.filter(id => id !== requesterId);
  accepter.friends = [...new Set([...(accepter.friends || []), requesterId])];

  requester.friendRequestsSent = requester.friendRequestsSent.filter(id => id !== accepterId);
  requester.friends = [...new Set([...(requester.friends || []), accepterId])];

  saveUsers(users);
  return true;
};

export const rejectFriendRequest = (rejecterId: string, requesterId: string): boolean => {
  const users = getUsers();
  const rejecter = users.find(u => u.id === rejecterId);
  const requester = users.find(u => u.id === requesterId);

  if (!rejecter || !requester || !rejecter.friendRequestsReceived?.includes(requesterId) || !requester.friendRequestsSent?.includes(rejecterId)) {
    return false;
  }

  rejecter.friendRequestsReceived = rejecter.friendRequestsReceived.filter(id => id !== requesterId);
  requester.friendRequestsSent = requester.friendRequestsSent.filter(id => id !== rejecterId);
  saveUsers(users);
  return true;
};

export const removeFriend = (userId: string, friendId: string): boolean => {
  const users = getUsers();
  const user = users.find(u => u.id === userId);
  const friend = users.find(u => u.id === friendId);

  if (!user || !friend || !user.friends?.includes(friendId)) {
    return false;
  }

  user.friends = user.friends.filter(id => id !== friendId);
  friend.friends = friend.friends?.filter(id => id !== userId);
  saveUsers(users);
  return true;
};

// --- Block Management ---
export const blockUser = (blockerId: string, blockedId: string): boolean => {
  const users = getUsers();
  const blockerIndex = users.findIndex(u => u.id === blockerId);
  if (blockerIndex === -1) return false;
  
  const blocker = users[blockerIndex];
  blocker.blockedUserIds = [...new Set([...(blocker.blockedUserIds || []), blockedId])];
  removeFriend(blockerId, blockedId); 
  
  users[blockerIndex] = blocker;
  saveUsers(users);
  return true;
};

export const unblockUser = (unblockerId: string, unblockedId: string): boolean => {
  const users = getUsers();
  const unblockerIndex = users.findIndex(u => u.id === unblockerId);
  if (unblockerIndex === -1) return false;

  const unblocker = users[unblockerIndex];
  if (!unblocker.blockedUserIds?.includes(unblockedId)) return false;
  unblocker.blockedUserIds = unblocker.blockedUserIds.filter(id => id !== unblockedId);
  
  users[unblockerIndex] = unblocker;
  saveUsers(users);
  return true;
};

// --- User Visibility ---
export const updateUserVisibility = (userId: string, visibility: Partial<User['visibilitySettings']>) : User | null => {
    const user = findUserById(userId);
    if (!user) return null;
    const newVisibility = {...(user.visibilitySettings || {}), ...visibility};
    return updateUser(userId, { visibilitySettings: newVisibility as User['visibilitySettings']});
}


// --- Chat Management ---
export const getChats = (): Chat[] => getFromStorage<Chat[]>(DB_KEYS.CHATS, []);
export const saveChats = (chats: Chat[]): void => saveToStorage<Chat[]>(DB_KEYS.CHATS, chats);

const populateParticipantDetails = (userIds: string[]): Chat['participantDetails'] => {
    const details: Chat['participantDetails'] = {};
    userIds.forEach(id => {
        const user = findUserById(id);
        if (user) {
            details[id] = {
                name: user.name,
                nickname: user.nickname,
                avatarUrl: user.avatarUrl,
                status: user.status,
                lastSeen: user.lastSeen,
                visibilitySettings: user.visibilitySettings,
            };
        }
    });
    return details;
};

export const createOrGetIndividualChat = (userId1: string, userId2: string): Chat | null => {
  const user1 = findUserById(userId1);
  const user2 = findUserById(userId2);
  if (!user1 || !user2) return null;

  let chats = getChats();
  const existingChat = chats.find(chat =>
    chat.type === 'individual' &&
    chat.participants.includes(userId1) &&
    chat.participants.includes(userId2)
  );

  if (existingChat) {
    existingChat.participantDetails = populateParticipantDetails([userId1, userId2]);
    // Ensure new fields are present
    if (!existingChat.deletedFor) existingChat.deletedFor = {};
    if (!existingChat.activityVisibilityOverrides) existingChat.activityVisibilityOverrides = {};
    if (!existingChat.memberOverrides) existingChat.memberOverrides = {}; // Should not exist for individual chat
    if (existingChat.chatBackgroundUrl === undefined) existingChat.chatBackgroundUrl = null;
    saveChats(chats);
    return existingChat;
  }


  const newChat: Chat = {
    id: generateId('chat_'),
    type: 'individual',
    participants: [userId1, userId2],
    name: user2.nickname || user2.name, 
    avatarUrl: user2.avatarUrl, 
    lastMessage: "Chat started.",
    lastMessageTimestamp: new Date().toISOString(),
    unreadCounts: { [userId1]: 0, [userId2]: 0 },
    participantDetails: populateParticipantDetails([userId1, userId2]),
    deletedFor: {},
    activityVisibilityOverrides: {},
    chatBackgroundUrl: null, 
    // memberOverrides: {}, // Not applicable for individual chats
  };
  chats.push(newChat);
  saveChats(chats);
  return newChat;
};

export const createGroupChat = (adminId: string, participantIds: string[], groupName: string, groupAvatarUrl?: string): Chat | null => {
  const adminUser = findUserById(adminId);
  if (!adminUser) return null;

  const allParticipantIds = [...new Set([adminId, ...participantIds])]; 
  if (allParticipantIds.length < 2) return null;

  const participantDetails = populateParticipantDetails(allParticipantIds);
  const unreadCounts: Chat['unreadCounts'] = {};
  allParticipantIds.forEach(pId => unreadCounts[pId] = 0);
  unreadCounts[adminId] = 0;

  const defaultGroupSettings: GroupPermissions = {
    canSendMessages: true,
    canSendMedia: true,
    canSendFiles: true,
    canSendLinks: true,
    canSendStickersGifs: true, 
    canSendPolls: true, 
    canPinMessages: true, 
    canMembersChangeInfo: false, 
    canMembersInvite: true, 
    slowModeSeconds: 0,
    autoDeleteSeconds: 0,
  };

  const newChat: Chat = {
    id: generateId('group_'),
    name: groupName,
    type: 'group',
    participants: allParticipantIds,
    avatarUrl: groupAvatarUrl, 
    lastMessage: `${adminUser.nickname || adminUser.name} created the group.`,
    lastMessageTimestamp: new Date().toISOString(),
    admins: [adminId],
    ownerId: adminId,
    participantDetails,
    unreadCounts,
    groupSettings: defaultGroupSettings,
    deletedFor: {},
    activityVisibilityOverrides: {},
    memberOverrides: {},
    chatBackgroundUrl: null,
  };

  const chats = getChats();
  chats.push(newChat);
  saveChats(chats);
  return newChat;
};

export const deleteChatForUser = (chatId: string, userId: string): boolean => {
    let chats = getChats();
    const chatIndex = chats.findIndex(c => c.id === chatId);
    if (chatIndex === -1) return false;

    if (!chats[chatIndex].deletedFor) {
        chats[chatIndex].deletedFor = {};
    }
    chats[chatIndex].deletedFor![userId] = true; 
    if (chats[chatIndex].unreadCounts && chats[chatIndex].unreadCounts![userId]) {
        chats[chatIndex].unreadCounts![userId] = 0;
    }
    saveChats(chats);
    return true;
};

export const updateChatActivityVisibilityOverride = (chatId: string, currentUserId: string, hideMyActivity: boolean): Chat | null => {
    let chats = getChats();
    const chatIndex = chats.findIndex(c => c.id === chatId);
    if (chatIndex === -1) return null;
    
    if (!chats[chatIndex].activityVisibilityOverrides) {
        chats[chatIndex].activityVisibilityOverrides = {};
    }
    chats[chatIndex].activityVisibilityOverrides![currentUserId] = hideMyActivity;
    saveChats(chats);
    return chats[chatIndex];
};

export const updateChatBackground = (chatId: string, backgroundUrl: string | null): Chat | null => {
  let chats = getChats();
  const chatIndex = chats.findIndex(c => c.id === chatId);
  if (chatIndex === -1) return null;

  chats[chatIndex].chatBackgroundUrl = backgroundUrl;
  saveChats(chats);
  return chats[chatIndex];
};


// --- Group Member Management ---
export const addGroupParticipant = (chatId: string, adderId: string, newParticipantId: string): Chat | null => {
    let chats = getChats();
    const chatIndex = chats.findIndex(c => c.id === chatId);
    if (chatIndex === -1) return null;
    const chat = chats[chatIndex];

    if (chat.type !== 'group' || !(chat.admins?.includes(adderId) || chat.ownerId === adderId) || chat.participants.includes(newParticipantId)) {
        return null; 
    }
    const newParticipant = findUserById(newParticipantId);
    if (!newParticipant) return null;

    chat.participants.push(newParticipantId);
    if (chat.participantDetails) {
        chat.participantDetails[newParticipantId] = { 
            name: newParticipant.name, 
            nickname: newParticipant.nickname, 
            avatarUrl: newParticipant.avatarUrl,
            status: newParticipant.status,
            lastSeen: newParticipant.lastSeen,
            visibilitySettings: newParticipant.visibilitySettings
        };
    }
    if (chat.unreadCounts) {
        chat.unreadCounts[newParticipantId] = 0; 
    }
    chats[chatIndex] = chat;
    saveChats(chats);
    return chat;
};

export const removeGroupParticipant = (chatId: string, removerId: string, targetParticipantId: string): Chat | null => {
    let chats = getChats();
    const chatIndex = chats.findIndex(c => c.id === chatId);
    if (chatIndex === -1) return null;
    const chat = chats[chatIndex];

    if (chat.type !== 'group' || !(chat.admins?.includes(removerId) || chat.ownerId === removerId) || !chat.participants.includes(targetParticipantId) || chat.ownerId === targetParticipantId) {
        return null; 
    }
    chat.participants = chat.participants.filter(pId => pId !== targetParticipantId);
    if (chat.participantDetails?.[targetParticipantId]) delete chat.participantDetails[targetParticipantId];
    if (chat.admins?.includes(targetParticipantId)) chat.admins = chat.admins.filter(adminId => adminId !== targetParticipantId);
    if (chat.unreadCounts?.[targetParticipantId]) delete chat.unreadCounts[targetParticipantId];
    if (chat.memberOverrides?.[targetParticipantId]) delete chat.memberOverrides[targetParticipantId];


    chats[chatIndex] = chat;
    saveChats(chats);
    return chat;
};

export const banUserFromGroup = (chatId: string, adminId: string, targetUserId: string): Chat | null => {
    let chats = getChats();
    const chatIndex = chats.findIndex(c => c.id === chatId);
    if (chatIndex === -1) return null;
    const chat = chats[chatIndex];

    if (chat.type !== 'group' || !(chat.admins?.includes(adminId) || chat.ownerId === adminId) || chat.ownerId === targetUserId) {
        return null; 
    }
    chat.bannedUsers = [...new Set([...(chat.bannedUsers || []), targetUserId])];
    chat.participants = chat.participants.filter(pId => pId !== targetUserId);
    if (chat.participantDetails?.[targetUserId]) delete chat.participantDetails[targetUserId];
    if (chat.admins?.includes(targetUserId)) chat.admins = chat.admins.filter(id => id !== targetUserId);
    if (chat.memberOverrides?.[targetUserId]) delete chat.memberOverrides[targetUserId];
    
    chats[chatIndex] = chat;
    saveChats(chats);
    return chat;
};

export const unbanUserFromGroup = (chatId: string, adminId: string, targetUserId: string): Chat | null => {
    let chats = getChats();
    const chatIndex = chats.findIndex(c => c.id === chatId);
    if (chatIndex === -1) return null;
    const chat = chats[chatIndex];

    if (chat.type !== 'group' || !(chat.admins?.includes(adminId) || chat.ownerId === adminId) || !chat.bannedUsers?.includes(targetUserId)) {
        return null;
    }
    chat.bannedUsers = chat.bannedUsers.filter(id => id !== targetUserId);
    chats[chatIndex] = chat;
    saveChats(chats);
    return chat;
};

export const transferGroupOwnership = (chatId: string, currentOwnerId: string, newOwnerId: string): Chat | null => {
    let chats = getChats();
    const chatIndex = chats.findIndex(c => c.id === chatId);
    if (chatIndex === -1) return null;
    const chat = chats[chatIndex];

    if (chat.type !== 'group' || chat.ownerId !== currentOwnerId || !chat.participants.includes(newOwnerId) || newOwnerId === currentOwnerId) {
        console.error("Transfer ownership conditions not met:", chat.type, chat.ownerId, currentOwnerId, chat.participants.includes(newOwnerId), newOwnerId, currentOwnerId);
        return null; 
    }
    chat.ownerId = newOwnerId;
    chat.admins = [...new Set([...(chat.admins || []), newOwnerId, currentOwnerId])];
    
    chats[chatIndex] = chat;
    saveChats(chats);
    return chat;
};

export const updateGroupName = (chatId: string, adminId: string, newName: string): Chat | null => {
    let chats = getChats();
    const chatIndex = chats.findIndex(c => c.id === chatId);
    if (chatIndex === -1) return null;
    const chat = chats[chatIndex];

    const canChangeInfo = chat.groupSettings?.canMembersChangeInfo;
    const isPrivileged = chat.admins?.includes(adminId) || chat.ownerId === adminId;

    if (chat.type !== 'group' || !(isPrivileged || canChangeInfo)) {
         console.warn("User does not have permission to change group name.");
         return null;
    }

    if (newName.trim() === '') {
        console.warn("Group name cannot be empty.");
        return null; 
    }

    chat.name = newName.trim();
    chats[chatIndex] = chat;
    saveChats(chats);
    return chat;
};

export const updateGroupAdmins = (chatId: string, actorId: string, newAdminIds: string[]): Chat | null => {
    let chats = getChats();
    const chatIndex = chats.findIndex(c => c.id === chatId);
    if (chatIndex === -1) return null;
    const chat = chats[chatIndex];

    if (chat.type !== 'group' || chat.ownerId !== actorId ) { 
        console.warn("User does not have permission to change group admins (only owner).");
        return null;
    }

    if (chat.ownerId) { 
        if (!newAdminIds.includes(chat.ownerId)) {
            newAdminIds = [...new Set([...newAdminIds, chat.ownerId])];
        }
    }
    
    const validNewAdminIds = newAdminIds.filter(adminId => chat.participants.includes(adminId));

    chat.admins = [...new Set(validNewAdminIds)]; 
    chats[chatIndex] = chat;
    saveChats(chats);
    return chat;
};


export const updateGroupSettings = (chatId: string, adminId: string, settings: Partial<GroupPermissions>) : Chat | null => {
    let chats = getChats();
    const chatIndex = chats.findIndex(c => c.id === chatId);
    if (chatIndex === -1) return null;
    const chat = chats[chatIndex];

    if (chat.type !== 'group' || !(chat.admins?.includes(adminId) || chat.ownerId === adminId)) {
        return null; 
    }
    chat.groupSettings = { ...(chat.groupSettings as GroupPermissions), ...settings };
    chats[chatIndex] = chat;
    saveChats(chats);
    return chat;
};

export const updateGroupMemberOverrides = (chatId: string, actorId: string, targetMemberId: string, overrides: Partial<GroupPermissions>): Chat | null => {
    let chats = getChats();
    const chatIndex = chats.findIndex(c => c.id === chatId);
    if (chatIndex === -1) return null;
    const chat = chats[chatIndex];

    if (chat.type !== 'group' || !(chat.admins?.includes(actorId) || chat.ownerId === actorId)) {
        return null; 
    }
    if (!chat.participants.includes(targetMemberId)) {
        return null; 
    }

    if (!chat.memberOverrides) {
        chat.memberOverrides = {};
    }
    
    if (Object.keys(overrides).length === 0) {
        delete chat.memberOverrides[targetMemberId];
    } else {
        chat.memberOverrides[targetMemberId] = { ...(chat.memberOverrides[targetMemberId] || {}), ...overrides };
    }
    
    chats[chatIndex] = chat;
    saveChats(chats);
    return chat;
};


export const updateGroupAvatar = (chatId: string, adminId: string, avatarUrl: string): Chat | null => {
    let chats = getChats();
    const chatIndex = chats.findIndex(c => c.id === chatId);
    if (chatIndex === -1) return null;
    const chat = chats[chatIndex];

    const canChangeInfo = chat.groupSettings?.canMembersChangeInfo;
    const isPrivileged = chat.admins?.includes(adminId) || chat.ownerId === adminId;

     if (chat.type !== 'group' || !(isPrivileged || canChangeInfo)) {
        return null;
    }
    chat.avatarUrl = avatarUrl || undefined; 
    chats[chatIndex] = chat;
    saveChats(chats);
    return chat;
}


// --- Message Management ---
export const getMessages = (): { [chatId: string]: Message[] } => getFromStorage(DB_KEYS.MESSAGES, {});
export const saveMessages = (messages: { [chatId: string]: Message[] }): void => saveToStorage(DB_KEYS.MESSAGES, messages);

export const addMessage = (chatId: string, messageData: Omit<Message, 'id' | 'readBy' | 'isSent' | 'reactions'>): Message => {
  const allMessages = getMessages();
  const newMessage: Message = {
    ...messageData,
    id: generateId('msg_'),
    readBy: {}, 
    isSent: true,
    reactions: {},
  };
  
  if (messageData.type !== 'system' && messageData.type !== 'video_call_log') {
    newMessage.readBy![messageData.senderId] = new Date().toISOString();
  }


  const chatMessages = allMessages[chatId] || [];
  allMessages[chatId] = [...chatMessages, newMessage];
  saveMessages(allMessages);

  const chats = getChats();
  const chatIndex = chats.findIndex(c => c.id === chatId);
  if (chatIndex > -1) {
    const chat = chats[chatIndex];
    if (newMessage.type === 'text') {
        chat.lastMessage = newMessage.content;
    } else if (newMessage.type === 'video_call_log') {
        chat.lastMessage = newMessage.content; 
    } else {
        chat.lastMessage = newMessage.fileName || newMessage.type.charAt(0).toUpperCase() + newMessage.type.slice(1); 
    }
    chat.lastMessageTimestamp = newMessage.timestamp;

    if (!chat.unreadCounts) chat.unreadCounts = {};
    if (newMessage.type !== 'system' && newMessage.type !== 'video_call_log') {
        chat.participants.forEach(pId => {
          if (pId !== newMessage.senderId) { 
            chat.unreadCounts![pId] = (chat.unreadCounts![pId] || 0) + 1;
          } else {
            chat.unreadCounts![pId] = 0; 
          }
        });
    }
    chat.participantDetails = populateParticipantDetails(chat.participants);
    chats[chatIndex] = chat;
    saveChats(chats);
  }
  return newMessage;
};

export const markMessageAsRead = (chatId: string, messageId: string, userId: string): boolean => {
  const allMessages = getMessages();
  if (!allMessages[chatId]) return false;

  const msgIndex = allMessages[chatId].findIndex(m => m.id === messageId);
  if (msgIndex === -1) return false;

  const message = allMessages[chatId][msgIndex];
  if (!message.readBy) message.readBy = {};
  if (!message.readBy[userId]) {
    message.readBy[userId] = new Date().toISOString();
    allMessages[chatId][msgIndex] = message;
    saveMessages(allMessages);
    return true;
  }
  return false; 
};

export const markAllMessagesInChatAsRead = (chatId: string, userId: string): boolean => {
    const allMessages = getMessages();
    if(!allMessages[chatId]) return false;

    let changed = false;
    allMessages[chatId].forEach(msg => {
        if (msg.senderId !== userId && msg.type !== 'system' && msg.type !== 'video_call_log') { 
             if (!msg.readBy) msg.readBy = {};
             if(!msg.readBy[userId]) {
                 msg.readBy[userId] = new Date().toISOString();
                 changed = true;
             }
        }
    });

    if (changed) {
        saveMessages(allMessages);
    }
    const chats = getChats();
    const chatIndex = chats.findIndex(c => c.id === chatId);
    if (chatIndex > -1) {
        if (chats[chatIndex].unreadCounts) {
            chats[chatIndex].unreadCounts![userId] = 0;
            saveChats(chats);
        }
    }
    return changed;
}

export const updateMessageReactions = (chatId: string, messageId: string, userId: string, emoji: string): Message | null => {
    const allMessages = getMessages();
    if (!allMessages[chatId]) return null;
    const msgIndex = allMessages[chatId].findIndex(m => m.id === messageId);
    if (msgIndex === -1) return null;

    const message = allMessages[chatId][msgIndex];
    if (!message.reactions) message.reactions = {};

    if (!message.reactions[emoji]) {
        message.reactions[emoji] = [];
    }

    const userReactedIndex = message.reactions[emoji].indexOf(userId);
    if (userReactedIndex > -1) {
        message.reactions[emoji].splice(userReactedIndex, 1);
        if (message.reactions[emoji].length === 0) {
            delete message.reactions[emoji];
        }
    } else {
        message.reactions[emoji].push(userId);
    }
    
    if (Object.keys(message.reactions).length === 0) {
        delete message.reactions;
    }

    allMessages[chatId][msgIndex] = message;
    saveMessages(allMessages);
    return message;
};


// --- Current User Session ---
export const getCurrentUserId = (): string | null => getFromStorage<string | null>(DB_KEYS.CURRENT_USER_ID, null);
export const setCurrentUserId = (userId: string | null): void => saveToStorage<string | null>(DB_KEYS.CURRENT_USER_ID, userId);


// --- Initialization ---
// The initializeDB function is now only exported and called from App.tsx
export const initializeDB = (): void => {
  let users = getUsers();
  if (users.length === 0) {
    const initialUsersWithNewIds = INITIAL_USERS.map(u => ({
      ...u,
      id: generateId('user_'),
      language: 'en' as 'en' | 'ar',
      role: 'user' as 'user' | 'admin',
      friends: [],
      friendRequestsSent: [],
      friendRequestsReceived: [],
      blockedUserIds: [],
      visibilitySettings: { onlineStatus: 'public', lastSeen: 'friends', profileInfo: 'public' } as User['visibilitySettings'],
      lastSeen: new Date().toISOString(),
      avatarUrl: undefined, 
    }));
    users = initialUsersWithNewIds;
    const adminUser: User = {
        id: generateId('user_admin_'),
        name: 'Admin User',
        nickname: 'SiteAdmin',
        email: 'admin@gmail.com',
        passwordHash: 'admin', 
        avatarUrl: undefined, 
        status: 'online',
        language: 'en',
        role: 'admin',
        friends: [],
        friendRequestsSent: [],
        friendRequestsReceived: [],
        blockedUserIds: [],
        visibilitySettings: { onlineStatus: 'none', lastSeen: 'none', profileInfo: 'none' }, 
        lastSeen: new Date().toISOString(),
    };
    users.push(adminUser);
    saveUsers(users);
    if (INITIAL_USERS.length > 0) {
        console.log("Database seeded with initial users and admin.");
    } else {
        console.log("Database seeded with admin account.");
    }
  }

  let usersModified = false;
  users = users.map(user => {
    let modified = false;
    if (user.friends === undefined) { user.friends = []; modified = true; }
    if (user.friendRequestsSent === undefined) { user.friendRequestsSent = []; modified = true; }
    if (user.friendRequestsReceived === undefined) { user.friendRequestsReceived = []; modified = true; }
    if (user.blockedUserIds === undefined) { user.blockedUserIds = []; modified = true; }
    if (user.role === undefined) { user.role = 'user'; modified = true; }
    if (user.visibilitySettings === undefined) {
        user.visibilitySettings = { onlineStatus: 'public', lastSeen: 'friends', profileInfo: 'public' };
        modified = true;
    }
     if (user.lastSeen === undefined) { 
        user.lastSeen = user.status === 'offline' ? new Date(Date.now() - 3600000).toISOString() : new Date().toISOString(); 
        modified = true; 
    }
    if (user.status === undefined) { user.status = 'offline'; modified = true; }


    if (modified) usersModified = true;
    return user;
  });
  if (usersModified) saveUsers(users);


  let chats = getChats();
  let chatsModified = false;
  const defaultGroupSettingsOnInit: GroupPermissions = {
      canSendMessages: true, canSendMedia: true, canSendFiles: true, canSendLinks: true,
      canSendStickersGifs: true, canSendPolls: true, canPinMessages: true,
      canMembersChangeInfo: false, canMembersInvite: true,
      slowModeSeconds: 0, autoDeleteSeconds: 0,
  };

  chats = chats.map(chat => {
      let modified = false;
      if (chat.unreadCounts === undefined) {
          chat.unreadCounts = {};
          chat.participants.forEach(pId => chat.unreadCounts![pId] = 0);
          modified = true;
      }
      if (chat.ownerId === undefined && chat.type === 'group' && chat.admins && chat.admins.length > 0) {
          chat.ownerId = chat.admins[0]; 
          modified = true;
      }
      if (chat.bannedUsers === undefined && chat.type === 'group') {
          chat.bannedUsers = [];
          modified = true;
      }
      if (chat.groupSettings === undefined && chat.type === 'group') {
          chat.groupSettings = defaultGroupSettingsOnInit;
          modified = true;
      } else if (chat.type === 'group' && chat.groupSettings) {
          let settingsUpdated = false;
          for (const key in defaultGroupSettingsOnInit) {
              const typedKey = key as keyof GroupPermissions;
              if (chat.groupSettings[typedKey] === undefined) {
                  (chat.groupSettings as any)[typedKey] = defaultGroupSettingsOnInit[typedKey]; // Use 'as any' carefully
                  settingsUpdated = true;
              }
          }
          if (settingsUpdated) modified = true;
      }
      if (chat.memberOverrides === undefined && chat.type === 'group') {
          chat.memberOverrides = {};
          modified = true;
      }
      if (chat.participantDetails === undefined || Object.keys(chat.participantDetails).length !== chat.participants.length) {
          chat.participantDetails = populateParticipantDetails(chat.participants);
          modified = true;
      } else { 
          for (const pId of chat.participants) {
              const detail = chat.participantDetails[pId];
              if (detail && (detail.status === undefined || detail.lastSeen === undefined || detail.visibilitySettings === undefined)) {
                  const fullUser = findUserById(pId);
                  if (fullUser) {
                      chat.participantDetails[pId] = {
                          name: fullUser.name,
                          nickname: fullUser.nickname,
                          avatarUrl: fullUser.avatarUrl,
                          status: fullUser.status,
                          lastSeen: fullUser.lastSeen,
                          visibilitySettings: fullUser.visibilitySettings,
                      };
                      modified = true;
                  }
              }
          }
      }
      if (chat.deletedFor === undefined) { chat.deletedFor = {}; modified = true; }
      if (chat.activityVisibilityOverrides === undefined) { chat.activityVisibilityOverrides = {}; modified = true; }
      if (chat.chatBackgroundUrl === undefined) { chat.chatBackgroundUrl = null; modified = true; }


      if (modified) chatsModified = true;
      return chat;
  });
  if (chatsModified) saveChats(chats);


  let messages = getMessages();
  let messagesModified = false;
  for (const chatId in messages) {
      messages[chatId] = messages[chatId].map(msg => {
          let modified = false;
          if (msg.readBy === undefined) { msg.readBy = {}; modified = true; }
          if (msg.isSent === undefined) { msg.isSent = true; modified = true; }
          if (msg.reactions === undefined) { msg.reactions = {}; modified = true; }
          if (modified) messagesModified = true;
          return msg;
      });
  }
  if (messagesModified) saveMessages(messages);


  if (getChats().length === 0) {
    saveChats([]);
    // console.log("Database seeded with empty chats."); // Keep console logs minimal if not debugging
  }
  if (Object.keys(getMessages()).length === 0) {
    saveMessages({});
    // console.log("Database seeded with empty messages.");
  }
};