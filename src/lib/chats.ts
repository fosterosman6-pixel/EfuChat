import {
  addDoc,
  collection,
  doc,
  getDoc,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from '@react-native-firebase/firestore';
import { db } from './firebase';
import type { Chat, Message, UserProfile } from './types';

/** One direct chat per pair of people: the id is both uids, sorted. */
export function directChatId(a: string, b: string) {
  return [a, b].sort().join('_');
}

export function chatTitle(chat: Chat, me: string) {
  if (chat.type === 'group') return chat.groupName ?? 'Group';
  const other = chat.members.find((m) => m !== me) ?? me;
  return chat.names[other] ?? 'EfuChat user';
}

export function subscribeChats(uid: string, cb: (chats: Chat[]) => void) {
  const q = query(collection(db, 'chats'), where('members', 'array-contains', uid), orderBy('updatedAt', 'desc'), limit(100));
  return onSnapshot(
    q,
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Chat)),
    () => cb([]),
  );
}

export function subscribeChat(chatId: string, cb: (chat: Chat | null) => void) {
  return onSnapshot(doc(db, 'chats', chatId), (snap) => cb(snap.exists() ? ({ id: snap.id, ...snap.data() } as Chat) : null));
}

export function subscribeMessages(chatId: string, cb: (msgs: Message[]) => void) {
  const q = query(collection(db, 'chats', chatId, 'messages'), orderBy('createdAt', 'desc'), limit(200));
  return onSnapshot(q, (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Message)));
}

/** Creates the direct chat if it does not exist yet, and returns its id. */
export async function openDirectChat(me: UserProfile, other: UserProfile) {
  const id = directChatId(me.uid, other.uid);
  const ref = doc(db, 'chats', id);
  // A chat that does not exist yet can come back as "permission denied" on older rules; treat it as missing.
  const exists = await getDoc(ref).then((s) => s.exists(), () => false);
  if (!exists) {
    await setDoc(ref, {
      type: 'direct',
      members: [me.uid, other.uid],
      names: { [me.uid]: me.name, [other.uid]: other.name },
      unread: { [me.uid]: 0, [other.uid]: 0 },
      updatedAt: serverTimestamp(),
    });
  }
  return id;
}

export async function sendMessage(chat: Chat, from: string, text: string) {
  const body = text.trim();
  if (!body) return;
  await addDoc(collection(db, 'chats', chat.id, 'messages'), {
    from,
    text: body,
    type: 'text',
    createdAt: serverTimestamp(),
    readBy: [from],
  });
  const bumps: Record<string, unknown> = {
    lastMessage: { text: body, from, at: serverTimestamp() },
    updatedAt: serverTimestamp(),
  };
  for (const m of chat.members) if (m !== from) bumps[`unread.${m}`] = increment(1);
  await updateDoc(doc(db, 'chats', chat.id), bumps);
}

export async function markRead(chatId: string, uid: string) {
  await updateDoc(doc(db, 'chats', chatId), { [`unread.${uid}`]: 0 });
}

/** Looks a person up by phone number through the phoneIndex collection. */
export async function findUserByPhone(phoneE164: string): Promise<UserProfile | null> {
  const idx = await getDoc(doc(db, 'phoneIndex', phoneE164));
  const uid = idx.exists() ? (idx.data()?.uid as string | undefined) : undefined;
  if (!uid) return null;
  const u = await getDoc(doc(db, 'users', uid));
  return u.exists() ? ({ uid: u.id, ...u.data() } as UserProfile) : null;
}

/** "08:41", "Yesterday" or a short weekday, like the mockups. */
export function shortTime(ts: { toDate: () => Date } | null | undefined) {
  if (!ts) return '';
  const d = ts.toDate();
  const now = new Date();
  const days = Math.floor((new Date(now.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86400000);
  if (days === 0) return d.toTimeString().slice(0, 5);
  if (days === 1) return 'Yesterday';
  if (days < 7) return d.toLocaleDateString('en-GB', { weekday: 'short' });
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}
