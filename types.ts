

export interface PollOption {
  id: string;
  text: string;
  votes: string[]; // Array of user IDs who voted for this option
}

export interface PollDetails {
  question: string;
  options: PollOption[];
  isAnonymous: boolean;
  allowsMultipleAnswers: boolean;
  // voters?: { [userId: string]: string[] }; // Tracks which options a user voted for if not anonymous and multiple answers allowed
}

export interface UserProfile {
  name: string;
  nickname: string;
  avatarUrl?: string;
  bio?: string;
  // other profile fields
}

export type UserVisibility = 'public' | 'friends' | 'none';

export interface User {
  id: string;
  name: string; // Real name
  nickname: string; // Unique alias/nickname
  email: string;
  passwordHash: string;
  avatarUrl?: string;
  status?: 'online' | 'offline' | 'away';
  language?: 'en' | 'ar';
  role?: 'user' | 'admin';
  lastSeen?: string; // Timestamp for last seen status
  visibilitySettings?: {
    onlineStatus: UserVisibility; // Who can see if user is online
    lastSeen: UserVisibility;     // Who can see last seen time
    profileInfo: UserVisibility;  // Who can see profile details (beyond basic like name/avatar)
  };
  friends?: string[]; // Array of user IDs
  friendRequestsSent?: string[]; // Array of user IDs
  friendRequestsReceived?: string[]; // Array of user IDs
  blockedUserIds?: string[]; // Array of user IDs
  // experimental or future
  profile?: UserProfile;
}

export type MessageType = 'text' | 'image' | 'file' | 'audio' | 'link' | 'location' | 'system' | 'friend_request' | 'video' | 'video_call_log' | 'poll';

export interface Message {
  id: string;
  chatId: string;
  senderId: string;
  content: string; // For text, link, system messages, or base64 data for image/video. For polls, this could be the question or empty.
  timestamp: string;
  type: MessageType;
  fileName?: string; // For file, image, video, audio
  fileUrl?: string;  // For file, image, video, audio (if not base64 or for external links)
  reactions?: { [emoji: string]: string[] }; // emoji: [userIds]
  readBy?: { [userId: string]: string }; // userId: timestamp when read
  isSent?: boolean; // For UI indication, true if processed by sender's client
  // For friend requests specifically
  friendRequest?: {
    status: 'pending' | 'accepted' | 'declined';
    targetUserId: string; // The user to whom the request is being sent/was sent
  };
  callDuration?: number; // Duration of video call in seconds
  pollDetails?: PollDetails; // Details for poll messages
}

export type ChatType = 'individual' | 'group' | 'channel';

export interface GroupPermissions {
  canSendMessages: boolean;
  canSendMedia: boolean; // images, videos
  canSendFiles: boolean;
  canSendLinks: boolean;
  canSendStickersGifs: boolean; // UI Only
  canSendPolls: boolean; // UI Only
  canPinMessages: boolean; // UI Only
  canMembersChangeInfo: boolean; // Existing
  canMembersInvite: boolean; // Existing
  slowModeSeconds?: number; // 0 for off, otherwise seconds
  autoDeleteSeconds?: number; // 0 for off, otherwise seconds
}

export interface Chat {
  id: string;
  name: string;
  type: ChatType;
  participants: string[];
  avatarUrl?: string;
  lastMessage?: string;
  lastMessageTimestamp?: string;
  unreadCounts?: { [userId: string]: number }; // userId: count of unread messages for them
  admins?: string[];
  ownerId?: string; // Changed from 'owner' for clarity
  participantDetails?: { [userId: string]: { name: string, nickname: string, avatarUrl?: string, status?: User['status'], lastSeen?: User['lastSeen'], visibilitySettings?: User['visibilitySettings'] } };
  archivedBy?: string[]; // Users who archived this chat
  mutedBy?: { [userId: string]: Date | 'forever' }; // Users who muted, and until when
  pinnedBy?: string[]; // Users who pinned this chat
  bannedUsers?: string[]; // Users banned from this group/channel
  groupSettings?: GroupPermissions; // Replaced specific boolean flags with a structured object
  // New fields for requested features
  deletedFor?: { [userId: string]: boolean | string }; // userId: true or timestamp of deletion
  activityVisibilityOverrides?: { [userIdHidingActivity: string]: boolean }; // userIdHidingActivity: true if activity hidden from partner in this chat
  memberOverrides?: { [userId: string]: Partial<GroupPermissions> }; // Custom permissions per member
  chatBackgroundUrl?: string | null; // URL for chat-specific background, null for default
  blockedBy?: string[]; // Users who blocked this group chat
}

export type Theme = 'light' | 'dark';

export enum AppView {
  LOGIN = 'login',
  REGISTER = 'register',
  CHAT = 'chat',
  SETTINGS = 'settings',
  USER_PROFILE = 'user_profile',
  SHARED_MEDIA = 'shared_media', // New view for shared media
}

export type Language = 'en' | 'ar';

export enum FriendRequestPanelView {
  LIST = 'list',
}

// Video Call Related Types
export type CallStatus = 'idle' | 'initiating' | 'ringing_outgoing' | 'ringing_incoming' | 'connecting' | 'connected' | 'declined' | 'ended' | 'error';

export interface CallDetails {
  callId: string;
  chatId: string;
  callerId: string; // User ID of the one who initiated
  calleeId: string; // User ID of the one being called
  isOutgoing: boolean; // True if the current user initiated the call
  status: CallStatus;
  startTime?: number; // Timestamp when call connected
  localStream?: MediaStream;
  remoteStream?: MediaStream;
  offer?: RTCSessionDescriptionInit; // Store offer for incoming calls
}

export interface SignalingMessage {
    type: 'offer' | 'answer' | 'candidate' | 'call-ended' | 'call-declined';
    callId: string;
    senderId: string; // User who sent this signaling message
    receiverId: string; // User who should receive this
    payload: any; // SDP for offer/answer, ICE candidate object for candidate
}