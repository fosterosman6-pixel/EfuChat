import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  where,
} from '@react-native-firebase/firestore';
import { db } from './firebase';
import type { Comment, Post, UserProfile } from './types';

export type Feed = 'For you' | 'Following' | 'Near me';

const toPost = (d: { id: string; data: () => unknown }) => ({ id: d.id, ...(d.data() as object) }) as Post;

/** Words starting with # become lowercase hashtags (max 10). */
export function hashtagsIn(text: string) {
  const tags = (text.match(/#[\p{L}\p{N}_]+/gu) ?? []).map((t) => t.slice(1).toLowerCase());
  return [...new Set(tags)].slice(0, 10);
}

/**
 * Live feed. "Following" uses Firestore's `in` filter, which takes up to 30 ids,
 * so it shows the 30 people followed most recently.
 */
export function subscribeFeed(
  feed: Feed,
  opts: { following: string[]; town?: string; blocked: Set<string> },
  cb: (posts: Post[]) => void,
) {
  const base = collection(db, 'posts');
  let q;
  if (feed === 'Following') {
    if (opts.following.length === 0) {
      cb([]);
      return () => {};
    }
    q = query(base, where('status', '==', 'live'), where('uid', 'in', opts.following.slice(0, 30)), orderBy('createdAt', 'desc'), limit(50));
  } else if (feed === 'Near me' && opts.town) {
    q = query(base, where('status', '==', 'live'), where('town', '==', opts.town), orderBy('createdAt', 'desc'), limit(50));
  } else {
    q = query(base, where('status', '==', 'live'), orderBy('createdAt', 'desc'), limit(50));
  }
  return onSnapshot(
    q,
    (snap) => cb(snap.docs.map(toPost).filter((p) => !opts.blocked.has(p.uid))),
    () => cb([]),
  );
}

export function subscribePost(id: string, cb: (p: Post | null) => void) {
  return onSnapshot(doc(db, 'posts', id), (s) => cb(s.exists() ? toPost(s) : null), () => cb(null));
}

export function subscribeUserPosts(uid: string, me: string, cb: (p: Post[]) => void) {
  const base = collection(db, 'posts');
  // Others may only list live posts; you also see your own hidden ones.
  const q =
    uid === me
      ? query(base, where('uid', '==', uid), orderBy('createdAt', 'desc'), limit(60))
      : query(base, where('uid', '==', uid), where('status', '==', 'live'), orderBy('createdAt', 'desc'), limit(60));
  return onSnapshot(q, (s) => cb(s.docs.map(toPost)), () => cb([]));
}

export function postsWithTag(tag: string) {
  return getDocs(
    query(collection(db, 'posts'), where('status', '==', 'live'), where('hashtags', 'array-contains', tag), orderBy('createdAt', 'desc'), limit(50)),
  ).then((s) => s.docs.map(toPost));
}

export async function createPost(me: UserProfile, text: string, poll?: string[]) {
  const body = text.trim();
  const options = (poll ?? []).map((o) => o.trim()).filter(Boolean).slice(0, 4);
  const isPoll = options.length >= 2;
  if (!body && !isPoll) return null;
  const ref = await addDoc(collection(db, 'posts'), {
    uid: me.uid,
    author: { name: me.name, verified: me.verified ?? false, ...(me.handle ? { handle: me.handle } : {}) },
    kind: isPoll ? 'poll' : 'post',
    text: body,
    media: [],
    ...(isPoll ? { poll: { options, votes: options.map(() => 0), endsAt: Timestamp.fromMillis(Date.now() + 24 * 3600_000) } } : {}),
    hashtags: hashtagsIn(body),
    ...(me.town ? { town: me.town } : {}),
    visibility: 'everyone',
    counts: { likes: 0, comments: 0, reposts: 0, views: 0, tips: 0 },
    status: 'live',
    featured: false,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export function deletePost(id: string) {
  return deleteDoc(doc(db, 'posts', id));
}

/* ---------- likes, votes, counts ---------- */

export async function isLiked(postId: string, uid: string) {
  return (await getDoc(doc(db, 'posts', postId, 'likes', uid))).exists();
}

export function setLiked(postId: string, uid: string, liked: boolean) {
  const ref = doc(db, 'posts', postId, 'likes', uid);
  return liked ? setDoc(ref, { createdAt: serverTimestamp() }) : deleteDoc(ref);
}

export async function myVote(postId: string, uid: string): Promise<number | null> {
  const v = await getDoc(doc(db, 'posts', postId, 'votes', uid));
  return v.exists() ? (v.data()?.option as number) : null;
}

export function vote(postId: string, uid: string, option: number) {
  return setDoc(doc(db, 'posts', postId, 'votes', uid), { option, createdAt: serverTimestamp() });
}

/**
 * Like and comment totals counted from the database.
 * The server functions also keep counts on each post; this works before they are deployed.
 */
export async function liveCounts(postId: string) {
  const [likes, comments] = await Promise.all([
    getCountFromServer(collection(db, 'posts', postId, 'likes')),
    getCountFromServer(query(collection(db, 'posts', postId, 'comments'), where('status', '==', 'live'))),
  ]);
  return { likes: likes.data().count, comments: comments.data().count };
}

/* ---------- comments ---------- */

export function subscribeComments(postId: string, cb: (c: Comment[]) => void) {
  const q = query(collection(db, 'posts', postId, 'comments'), where('status', '==', 'live'), orderBy('createdAt', 'asc'), limit(200));
  return onSnapshot(q, (s) => cb(s.docs.map((d) => ({ id: d.id, ...d.data() }) as Comment)), () => cb([]));
}

export function addComment(postId: string, me: UserProfile, text: string, parentId?: string) {
  const body = text.trim();
  if (!body) return Promise.resolve();
  return addDoc(collection(db, 'posts', postId, 'comments'), {
    uid: me.uid,
    name: me.name,
    text: body.slice(0, 1000),
    ...(parentId ? { parentId } : {}),
    likes: 0,
    status: 'live',
    createdAt: serverTimestamp(),
  });
}

export function deleteComment(postId: string, commentId: string) {
  return deleteDoc(doc(db, 'posts', postId, 'comments', commentId));
}

/** "2h", "3d", "21 Nov". */
export function ago(ts: { toDate: () => Date } | null | undefined) {
  if (!ts) return 'now';
  const s = (Date.now() - ts.toDate().getTime()) / 1000;
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d`;
  return ts.toDate().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}
