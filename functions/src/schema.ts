/**
 * EfuChat database schema (Cloud Firestore).
 *
 * One place that lists every collection, what each document holds,
 * and who may write it. Security rules live in /firestore.rules.
 *
 * Money amounts are whole Malawi Kwacha (MWK), stored as integers.
 * Times are Firestore Timestamps. "server" means only Cloud Functions
 * (Admin SDK) write the field or document; the app never does.
 */
import type { Timestamp } from 'firebase-admin/firestore';

export type MWK = number;
export type Role = 'owner' | 'moderator' | 'finance' | 'support';
export type Network = 'airtel' | 'tnm';

/* ---------- Paths ---------- */

export const C = {
  users: 'users', // users/{uid}
  userPrivate: (uid: string) => `users/${uid}/private`, // users/{uid}/private/account
  followers: (uid: string) => `users/${uid}/followers`, // users/{uid}/followers/{followerUid}
  following: (uid: string) => `users/${uid}/following`, // users/{uid}/following/{targetUid}
  notifications: (uid: string) => `users/${uid}/notifications`,
  blocks: (uid: string) => `users/${uid}/blocks`, // users/{uid}/blocks/{blockedUid}
  saved: (uid: string) => `users/${uid}/saved`, // users/{uid}/saved/{itemId}
  phoneIndex: 'phoneIndex', // phoneIndex/{+265...}
  handles: 'handles', // handles/{handle} -> { uid }

  chats: 'chats',
  messages: (chatId: string) => `chats/${chatId}/messages`,

  stories: 'stories',

  posts: 'posts', // posts, polls and reels
  comments: (postId: string) => `posts/${postId}/comments`,
  likes: (postId: string) => `posts/${postId}/likes`, // likes/{uid}
  votes: (postId: string) => `posts/${postId}/votes`, // votes/{uid}
  hashtags: 'hashtags', // hashtags/{tag}

  channels: 'channels',
  channelPosts: (id: string) => `channels/${id}/posts`,
  channelFollowers: (id: string) => `channels/${id}/followers`,

  listings: 'listings',
  orders: 'orders',
  disputes: 'disputes',
  reviews: 'reviews', // seller reviews after an order

  wallets: 'wallets', // wallets/{uid}, server only
  ledger: 'ledger', // every money movement, server only
  payments: 'payments', // requests to Airtel Money / TNM Mpamba, server only

  boosts: 'boosts',
  subscriptions: 'subscriptions', // subscriptions/{uid}
  ads: 'ads',

  deliveries: 'deliveries', // matola jobs shared with EfuLogistix

  reports: 'reports',
  adminLog: 'adminLog',
  config: 'config', // config/pricing, config/fees, config/rules
  stats: 'stats', // stats/{yyyy-mm-dd}, dashboard numbers
} as const;

/* ---------- People ---------- */

export type User = {
  name: string;
  handle?: string; // @thandiwe.cooks, unique via handles/{handle}
  about: string;
  photoURL: string | null;
  town?: string;
  lang: 'ny' | 'en';
  accountType: 'personal' | 'creator' | 'business';
  verified: boolean; // server
  plan: 'free' | 'shop' | 'pro'; // server
  plus: boolean; // EfuChat Plus, server
  walletLinked: boolean; // server
  status: 'active' | 'under_review' | 'suspended' | 'banned'; // server
  counts: { posts: number; followers: number; following: number; sales: number }; // server
  rating?: { avg: number; count: number }; // server
  createdAt: Timestamp;
  lastActiveAt?: Timestamp;
};

/** users/{uid}/private/account: only the person and staff can read it. */
export type UserPrivate = {
  phone: string; // E.164
  birthYear?: number; // wallet needs 18+
  wantsWallet?: boolean; // asked to link mobile money at sign-up
  wallet?: { network: Network; msisdn: string; linkedAt: Timestamp }; // server
  pushTokens: string[];
  settings: {
    dataSaver: boolean;
    readReceipts: boolean;
    lastSeen: 'everyone' | 'contacts' | 'nobody';
    storiesVisibleTo: 'everyone' | 'contacts';
    moneyFrom: 'everyone' | 'contacts' | 'nobody';
  };
};

export type Follow = { createdAt: Timestamp };

export type Notification = {
  type: 'like' | 'comment' | 'reply' | 'follow' | 'repost' | 'tip' | 'order' | 'delivery' | 'system';
  actorUid?: string;
  actorName?: string;
  text: string;
  targetPath?: string; // e.g. posts/abc
  amount?: MWK;
  read: boolean;
  createdAt: Timestamp;
};

/* ---------- Chats and stories ---------- */

export type Chat = {
  type: 'direct' | 'group';
  members: string[];
  admins?: string[];
  names: Record<string, string>;
  groupName?: string;
  groupPhoto?: string | null;
  description?: string;
  lastMessage?: { text: string; from: string; at: Timestamp };
  unread: Record<string, number>;
  updatedAt: Timestamp;
};

export type Message = {
  from: string;
  type: 'text' | 'image' | 'voice' | 'document' | 'location' | 'contact' | 'payment' | 'matola';
  text?: string;
  media?: { path: string; width?: number; height?: number; seconds?: number; size: number };
  location?: { lat: number; lng: number };
  ref?: string; // ledger/{id} or deliveries/{id} for payment and matola cards
  replyTo?: string;
  createdAt: Timestamp;
  deleted?: boolean;
};

export type Story = {
  uid: string;
  name: string;
  kind: 'text' | 'image' | 'video';
  text?: string;
  bg?: string;
  media?: { path: string; seconds?: number };
  visibleTo: 'everyone' | 'contacts';
  viewers: string[];
  createdAt: Timestamp;
  expiresAt: Timestamp; // createdAt + 24 h
};

/* ---------- Feed, reels, polls ---------- */

export type Post = {
  uid: string;
  author: { name: string; handle?: string; verified: boolean };
  kind: 'post' | 'reel' | 'poll';
  text: string;
  media: { path: string; type: 'image' | 'video'; width?: number; height?: number; seconds?: number }[];
  poll?: { options: string[]; votes: number[]; endsAt: Timestamp }; // votes: server
  hashtags: string[];
  town?: string;
  geohash?: string; // for "Near me"
  repostOf?: string; // posts/{id}
  listingId?: string; // "Sell item" posts link to listings/{id}
  visibility: 'everyone' | 'followers';
  counts: { likes: number; comments: number; reposts: number; views: number; tips: MWK }; // server
  status: 'live' | 'hidden' | 'removed'; // server
  featured: boolean; // server
  sponsored?: { adId: string }; // server
  createdAt: Timestamp;
};

export type Comment = {
  uid: string;
  name: string;
  text: string;
  parentId?: string; // replies
  likes: number; // server
  status: 'live' | 'removed';
  createdAt: Timestamp;
};

export type Like = { createdAt: Timestamp };
export type Vote = { option: number; createdAt: Timestamp };
export type Hashtag = { posts: number; postsToday: number; state: 'normal' | 'pinned' | 'hidden' }; // server

/* ---------- Channels ---------- */

export type Channel = {
  name: string;
  about: string;
  photoURL: string | null;
  category: 'local' | 'news' | 'church' | 'sport' | 'health' | 'government' | 'business' | 'other';
  ownerUid: string;
  admins: string[];
  verified: boolean; // server
  verification?: { status: 'waiting' | 'verified' | 'declined'; proof: string[]; note?: string }; // server
  followers: number; // server
  createdAt: Timestamp;
};

export type ChannelPost = {
  text: string;
  media: { path: string; type: 'image' | 'video' }[];
  reactions: Record<string, number>; // server
  views: number; // server
  createdAt: Timestamp;
};

/* ---------- Market ---------- */

export type Listing = {
  sellerUid: string;
  seller: { name: string; verified: boolean; rating?: number };
  title: string;
  description: string;
  priceMWK: MWK;
  category: 'food' | 'phones' | 'clothes' | 'home' | 'bikes' | 'other';
  condition: 'new' | 'like_new' | 'used';
  photos: string[]; // storage paths, max 6
  town: string;
  geohash?: string;
  matolaDelivery: boolean;
  walletPayment: boolean;
  status: 'live' | 'sold' | 'paused' | 'removed'; // sold/removed: server
  boostedUntil?: Timestamp; // server
  views: number; // server
  createdAt: Timestamp;
};

export type OrderStatus = 'awaiting_payment' | 'paid' | 'packed' | 'on_the_way' | 'delivered' | 'completed' | 'disputed' | 'refunded' | 'cancelled';

/** Orders are created and moved by Cloud Functions only. */
export type Order = {
  listingId: string;
  buyerUid: string;
  sellerUid: string;
  members: [string, string]; // buyer, seller: used by rules
  item: { title: string; photo?: string };
  priceMWK: MWK;
  deliveryMWK: MWK;
  feeMWK: MWK; // EfuChat fee taken from the seller
  totalMWK: MWK; // price + delivery, paid by the buyer
  network: Network;
  status: OrderStatus;
  deliveryId?: string;
  history: { status: OrderStatus; at: Timestamp; by: string }[];
  createdAt: Timestamp;
};

export type Dispute = {
  orderId: string;
  members: [string, string];
  openedBy: string;
  reason: string;
  buyerStatement: string;
  sellerStatement?: string;
  evidence: string[]; // storage paths
  status: 'open' | 'refund_buyer' | 'pay_seller' | 'split';
  resolvedBy?: string;
  createdAt: Timestamp;
  resolvedAt?: Timestamp;
};

export type Review = { orderId: string; sellerUid: string; buyerUid: string; stars: 1 | 2 | 3 | 4 | 5; text?: string; createdAt: Timestamp };

/* ---------- Money (server only) ---------- */

export type Wallet = {
  network: Network;
  heldMWK: MWK; // money held for orders this person is selling
  earnedMWK: MWK; // lifetime tips and sales received
  updatedAt: Timestamp;
};

/**
 * Every money movement is one ledger entry. Balances are never edited
 * by hand: they are the sum of entries. Entries are never changed or deleted.
 */
export type LedgerEntry = {
  kind: 'tip' | 'order_payment' | 'order_release' | 'order_refund' | 'fee' | 'boost' | 'subscription' | 'ad' | 'delivery' | 'transfer';
  fromUid: string | 'efuchat' | 'external';
  toUid: string | 'efuchat' | 'external';
  members: string[]; // uids that may read this entry
  amountMWK: MWK;
  feeMWK: MWK;
  ref?: string; // orders/{id}, posts/{id}, boosts/{id}...
  network?: Network;
  paymentId?: string; // payments/{id}
  note?: string;
  createdAt: Timestamp;
};

/** A request sent to Airtel Money or TNM Mpamba, and what came back. */
export type Payment = {
  uid: string;
  network: Network;
  msisdn: string;
  direction: 'collect' | 'payout';
  amountMWK: MWK;
  purpose: LedgerEntry['kind'];
  ref: string;
  feeMWK?: MWK; // EfuChat's share, for tips
  providerRef?: string;
  status: 'pending' | 'success' | 'failed';
  error?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};

/* ---------- Paid features (server only) ---------- */

export type Boost = {
  uid: string;
  target: { type: 'listing' | 'post'; id: string };
  days: 1 | 3 | 7;
  priceMWK: MWK;
  startsAt: Timestamp;
  endsAt: Timestamp;
  status: 'running' | 'ended';
  views: number;
  clicks: number;
};

export type Subscription = {
  plan: 'shop' | 'pro' | 'plus';
  period: 'week' | 'month' | 'year';
  priceMWK: MWK;
  renewsAt: Timestamp;
  status: 'active' | 'cancelled' | 'expired';
  updatedAt: Timestamp;
};

export type Ad = {
  uid: string;
  business: string;
  placement: 'feed' | 'reels' | 'channels';
  postId?: string; // the sponsored post, once approved
  budgetMWK: MWK;
  audience: { towns: string[]; minAge: number };
  startsAt: Timestamp;
  endsAt: Timestamp;
  status: 'to_approve' | 'changes_requested' | 'rejected' | 'running' | 'ended';
  paid?: boolean; // server
  views: number;
  clicks: number;
  reviewedBy?: string;
  createdAt: Timestamp;
};

/* ---------- Matola ---------- */

export type Delivery = {
  source: 'market' | 'chat';
  orderId?: string;
  chatId?: string;
  requesterUid: string;
  members: string[]; // buyer, seller or chat members who may follow it
  pickup: { label: string; lat: number; lng: number };
  dropoff: { label: string; lat: number; lng: number };
  fareMWK: MWK;
  commissionMWK: MWK; // EfuChat's share
  efulogistixJobId?: string; // id in EfuLogistix
  driver?: { name: string; phone: string; plate?: string };
  status: 'requested' | 'assigned' | 'picking_up' | 'on_the_way' | 'delivered' | 'cancelled';
  etaMinutes?: number;
  lastLocation?: { lat: number; lng: number; at: Timestamp };
  createdAt: Timestamp;
  updatedAt: Timestamp;
};

/* ---------- Safety and admin ---------- */

export type Report = {
  target: { type: 'post' | 'reel' | 'comment' | 'listing' | 'user' | 'channel' | 'story'; path: string; ownerUid: string };
  reasons: Record<string, number>; // server: { scam: 7, spam: 2 }
  reporters: string[]; // server
  count: number; // server
  urgent: boolean; // server
  status: 'open' | 'kept' | 'removed' | 'warned' | 'banned';
  decidedBy?: string;
  note?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};

export type AdminLogEntry = { by: string; role: Role; action: string; target: string; note?: string; at: Timestamp };

export type Pricing = {
  boost: { 1: MWK; 3: MWK; 7: MWK };
  plans: { shop: MWK; pro: MWK; plusMonth: MWK; plusWeek: MWK };
};

export type Fees = {
  marketPercent: number; // 2.5
  tipsPercent: number; // 2
  matolaPercent: number; // 10
};

export type AppRules = {
  minAge: number; // 13
  walletMinAge: number; // 18
  holdNewAccountPosts: boolean;
  autoHideAfterReports: number; // hide a post while it waits for review
};

export type DailyStats = {
  activeUsers: number;
  signups: number;
  messages: number;
  posts: number;
  orders: number;
  earnedMWK: MWK;
  movedMWK: MWK;
};

export const DEFAULT_PRICING: Pricing = { boost: { 1: 500, 3: 1200, 7: 2500 }, plans: { shop: 5000, pro: 15000, plusMonth: 1500, plusWeek: 500 } };
export const DEFAULT_FEES: Fees = { marketPercent: 2.5, tipsPercent: 2, matolaPercent: 10 };
export const DEFAULT_RULES: AppRules = { minAge: 13, walletMinAge: 18, holdNewAccountPosts: false, autoHideAfterReports: 5 };

/** Fee in whole kwacha, rounded up so EfuChat never loses part of a kwacha. */
export function feeFor(amount: MWK, percent: number): MWK {
  return Math.ceil((amount * percent) / 100);
}
