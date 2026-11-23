import {
  addDoc,
  arrayRemove,
  arrayUnion,
  deleteField,
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
import { notify } from './push';
import type { Chat, Message, ReplyRef, UserProfile } from './types';

export type Person = Pick<UserProfile, 'uid' | 'name'> & Partial<UserProfile>;

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
export async function openDirectChat(me: Person, other: Person) {
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

export async function sendMessage(chat: Chat, from: string, text: string, opts: { replyTo?: ReplyRef; forwarded?: boolean } = {}) {
  const body = text.trim();
  if (!body) return;
  await postMessage(chat, from, { text: body, type: 'text' }, body, opts);
}

/** Writes a message of any kind, then bumps the chat's preview, unread counts and notifications. */
export async function postMessage(
  chat: Chat,
  from: string,
  fields: { text: string; type: Message['type']; media?: Message['media'] },
  preview: string,
  opts: { replyTo?: ReplyRef; forwarded?: boolean } = {},
) {
  await addDoc(collection(db, 'chats', chat.id, 'messages'), {
    from,
    ...fields,
    createdAt: serverTimestamp(),
    readBy: [from],
    ...(opts.replyTo ? { replyTo: { ...opts.replyTo, text: opts.replyTo.text.slice(0, 200) } } : {}),
    ...(opts.forwarded ? { forwarded: true } : {}),
  });
  const bumps: Record<string, unknown> = {
    lastMessage: { text: preview, from, at: serverTimestamp() },
    updatedAt: serverTimestamp(),
    [`typing.${from}`]: deleteField(),
  };
  for (const m of chat.members) if (m !== from) bumps[`unread.${m}`] = increment(1);
  await updateDoc(doc(db, 'chats', chat.id), bumps);
  notify('message', chat.id);
}

/** Marks me as typing in this chat. Callers throttle this to one write every few seconds. */
export function setTyping(chatId: string, uid: string, on: boolean) {
  return updateDoc(doc(db, 'chats', chatId), { [`typing.${uid}`]: on ? serverTimestamp() : deleteField() });
}

/** Names of people (other than me) who typed in the last 6 seconds. */
export function whoIsTyping(chat: Chat | null, me: string) {
  if (!chat?.typing) return [];
  const now = Date.now();
  return Object.entries(chat.typing)
    .filter(([uid, ts]) => uid !== me && ts && now - ts.toDate().getTime() < 6000)
    .map(([uid]) => chat.names[uid] ?? 'Someone');
}

/** Adds, changes or (with null) removes my reaction. */
export function react(chatId: string, msgId: string, uid: string, emoji: string | null) {
  return updateDoc(doc(db, 'chats', chatId, 'messages', msgId), { [`reactions.${uid}`]: emoji ?? deleteField() });
}

export async function deleteForEveryone(chat: Chat, msg: Message, isLatest: boolean) {
  await updateDoc(doc(db, 'chats', chat.id, 'messages', msg.id), { deleted: true, text: '' });
  if (isLatest) await updateDoc(doc(db, 'chats', chat.id), { 'lastMessage.text': 'This message was deleted' });
  if (chat.pinned?.id === msg.id) await updateDoc(doc(db, 'chats', chat.id), { pinned: null });
}

export function pinMessage(chatId: string, msg: Message | null) {
  return updateDoc(doc(db, 'chats', chatId), { pinned: msg ? { id: msg.id, text: msg.text.slice(0, 200), from: msg.from } : null });
}

// ---------- groups ----------

export async function createGroup(me: Person, people: Person[], name: string, adminsOnly: boolean) {
  const members = [me.uid, ...people.map((p) => p.uid)];
  const names: Record<string, string> = { [me.uid]: me.name };
  const unread: Record<string, number> = {};
  for (const p of people) names[p.uid] = p.name;
  for (const m of members) unread[m] = 0;
  const ref = await addDoc(collection(db, 'chats'), {
    type: 'group',
    groupName: name.trim(),
    members,
    names,
    unread,
    admins: [me.uid],
    adminsOnly,
    createdBy: me.uid,
    lastMessage: { text: `${me.name} created the group`, from: me.uid, at: serverTimestamp() },
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export function addGroupMembers(chat: Chat, people: Person[]) {
  const bumps: Record<string, unknown> = { members: arrayUnion(...people.map((p) => p.uid)), updatedAt: serverTimestamp() };
  for (const p of people) {
    bumps[`names.${p.uid}`] = p.name;
    bumps[`unread.${p.uid}`] = 0;
  }
  return updateDoc(doc(db, 'chats', chat.id), bumps);
}

export function removeGroupMember(chatId: string, uid: string) {
  return updateDoc(doc(db, 'chats', chatId), { members: arrayRemove(uid), admins: arrayRemove(uid) });
}

export function leaveGroup(chatId: string, uid: string) {
  return updateDoc(doc(db, 'chats', chatId), { members: arrayRemove(uid) });
}

export function setGroupAdmin(chatId: string, uid: string, admin: boolean) {
  return updateDoc(doc(db, 'chats', chatId), { admins: admin ? arrayUnion(uid) : arrayRemove(uid) });
}

export function updateGroup(chatId: string, data: { groupName?: string; adminsOnly?: boolean }) {
  return updateDoc(doc(db, 'chats', chatId), data);
}

export const isAdmin = (chat: Chat | null, uid: string) => !!chat?.admins?.includes(uid);

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
