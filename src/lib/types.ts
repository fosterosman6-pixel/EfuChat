import type { Timestamp } from '@react-native-firebase/firestore';

type Ts = Timestamp;

/** Mirrors users/{uid}; the full schema is in functions/src/schema.ts. */
export type UserProfile = {
  uid: string;
  name: string;
  about?: string;
  photoURL?: string | null;
  lang?: 'ny' | 'en';
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
