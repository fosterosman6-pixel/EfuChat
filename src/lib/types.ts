import type { Timestamp } from '@react-native-firebase/firestore';

type Ts = Timestamp;

/** Mirrors users/{uid}; the full schema is in functions/src/schema.ts. */
export type UserProfile = {
  uid: string;
  name: string;
  about?: string;
  photoURL?: string | null;
  lang?: 'ny' | 'en';
  handle?: string;
  town?: string;
  accountType?: 'personal' | 'creator' | 'business';
  verified?: boolean;
  plan?: 'free' | 'shop' | 'pro';
  walletLinked?: boolean;
  status?: 'active' | 'under_review' | 'suspended' | 'banned';
  createdAt?: Ts;
  privacy?: Privacy;
  /** written every minute while the app is open; drives online / last seen */
  lastActiveAt?: Ts;
};

export type Audience = 'everyone' | 'chats' | 'nobody';
export type Privacy = { lastSeen?: Audience; readTicks?: boolean; calls?: Audience };

export type Chat = {
  id: string;
  type: 'direct' | 'group';
  members: string[];
  /** display names keyed by uid, so the list renders without extra reads */
  names: Record<string, string>;
  groupName?: string;
  /** groups: who can add or remove people and change settings */
  admins?: string[];
  /** groups: only admins may send */
  adminsOnly?: boolean;
  /** groups: only admins change name, photo and description (default true) */
  adminsEdit?: boolean;
  photoURL?: string | null;
  description?: string;
  /** people who muted this chat's notifications */
  muted?: Record<string, boolean>;
  createdBy?: string;
  lastMessage?: { text: string; from: string; at: Ts | null };
  unread?: Record<string, number>;
  /** when each member last read this chat (server time) */
  readAt?: Record<string, Ts>;
  /** when each member last typed; "typing…" shows for a few seconds after */
  typing?: Record<string, Ts | null>;
  pinned?: { id: string; text: string; from: string } | null;
  updatedAt?: Ts | null;
};

export type ReplyRef = { id: string; from: string; name: string; text: string };

export type Message = {
  id: string;
  from: string;
  text: string;
  type: 'text' | 'image' | 'voice' | 'document' | 'video' | 'audio' | 'location' | 'contact' | 'call' | 'money';
  /** money sent through EfuChat (see payments/{paymentId}) */
  money?: { paymentId: string; amount: number };
  /** shared location */
  location?: { lat: number; lng: number; label?: string };
  /** shared contact */
  contact?: { name: string; phone: string };
  /** call lines: written by the caller when a call finishes */
  call?: { callId: string; kind: 'voice' | 'video'; outcome: 'answered' | 'missed' | 'declined' | 'cancelled'; dur?: number };
  createdAt: Ts | null;
  readBy?: string[];
  replyTo?: ReplyRef;
  /** emoji keyed by the uid who reacted */
  reactions?: Record<string, string>;
  deleted?: boolean;
  forwarded?: boolean;
  /** photos and voice notes: the file lives in chats/{chatId}/media/{id} */
  media?: MediaRef;
};

export type MediaRef = {
  id: string;
  kind: 'image' | 'voice' | 'file' | 'video' | 'audio';
  w?: number;
  h?: number;
  thumb?: string;
  dur?: number;
  /** files, videos and audio: original name, type and size in bytes */
  name?: string;
  mime?: string;
  size?: number;
};

export type Story = {
  id: string;
  uid: string;
  name: string;
  kind: 'text' | 'image' | 'video';
  text: string;
  bg: string;
  createdAt: Ts | null;
  expiresAt: Ts;
  viewers?: string[];
  reactions?: Record<string, string>;
};

export type Post = {
  id: string;
  uid: string;
  author: { name: string; handle?: string; verified: boolean };
  kind: 'post' | 'reel' | 'poll';
  text: string;
  media: { path: string; type: 'image' | 'video' }[];
  poll?: { options: string[]; votes: number[]; endsAt: Ts };
  hashtags: string[];
  town?: string;
  counts: { likes: number; comments: number; reposts: number; views: number; tips: number };
  status: 'live' | 'hidden' | 'removed';
  featured: boolean;
  sponsored?: { adId: string };
  createdAt: Ts | null;
};

export type Comment = {
  id: string;
  uid: string;
  name: string;
  text: string;
  parentId?: string;
  likes: number;
  status: 'live' | 'removed';
  createdAt: Ts | null;
};

export type AppNotification = {
  id: string;
  type: 'like' | 'comment' | 'reply' | 'follow' | 'repost' | 'tip' | 'order' | 'delivery' | 'system';
  actorUid?: string;
  actorName?: string;
  text: string;
  targetPath?: string;
  amount?: number;
  read: boolean;
  createdAt: Ts | null;
};
