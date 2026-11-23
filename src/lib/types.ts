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
};

export type Chat = {
  id: string;
  type: 'direct' | 'group';
  members: string[];
  /** display names keyed by uid, so the list renders without extra reads */
  names: Record<string, string>;
  groupName?: string;
  lastMessage?: { text: string; from: string; at: Ts | null };
  unread?: Record<string, number>;
  updatedAt?: Ts | null;
};

export type Message = {
  id: string;
  from: string;
  text: string;
  type: 'text';
  createdAt: Ts | null;
  readBy?: string[];
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
