import { addDoc, collection, doc, getDoc, onSnapshot, query, serverTimestamp, updateDoc, where } from '@react-native-firebase/firestore';
import { db } from './firebase';
import { notify } from './push';
import { openDirectChat, postMessage } from './chats';
import type { Chat } from './types';
import type { Person } from './chats';

export type CallStatus = 'ringing' | 'accepted' | 'declined' | 'missed' | 'cancelled' | 'ended';
export type Call = {
  id: string;
  from: string;
  to: string;
  fromName: string;
  toName: string;
  kind: 'voice' | 'video';
  status: CallStatus;
  createdAt: { toDate: () => Date } | null;
  answeredAt?: { toDate: () => Date } | null;
  endedAt?: { toDate: () => Date } | null;
};

/** How long a call rings before it counts as missed. */
export const RING_MS = 45_000;

/** Creates the call document; the Agora channel is named after its id. */
export async function startCall(me: Person, other: Person, kind: Call['kind'] = 'voice') {
  const them = await getDoc(doc(db, 'users', other.uid));
  const who = (them.data()?.privacy?.calls as string | undefined) ?? 'everyone';
  if (who === 'nobody') throw new Error(`${other.name.split(' ')[0]} is not taking calls.`);
  if (who === 'chats' && !(await getDoc(doc(db, 'chats', [me.uid, other.uid].sort().join('_')))).exists()) throw new Error(`${other.name.split(' ')[0]} only takes calls from people they chat with.`);
  const ref = await addDoc(collection(db, 'calls'), {
    from: me.uid,
    to: other.uid,
    fromName: me.name,
    toName: other.name,
    kind,
    status: 'ringing',
    createdAt: serverTimestamp(),
  });
  notify('call', ref.id);
  return ref.id;
}

export function subscribeCall(id: string, cb: (c: Call | null) => void) {
  return onSnapshot(
    doc(db, 'calls', id),
    (s) => cb(s.exists() ? ({ id: s.id, ...s.data() } as Call) : null),
    () => cb(null),
  );
}

/** Calls ringing for me right now. */
export function subscribeIncoming(uid: string, cb: (calls: Call[]) => void) {
  const q = query(collection(db, 'calls'), where('to', '==', uid), where('status', '==', 'ringing'));
  return onSnapshot(
    q,
    (snap) => {
      const now = Date.now();
      cb(
        snap.docs
          .map((d) => ({ id: d.id, ...d.data() }) as Call)
          .filter((c) => !c.createdAt || now - c.createdAt.toDate().getTime() < RING_MS),
      );
    },
    () => cb([]),
  );
}

export function setCallStatus(id: string, status: CallStatus) {
  const extra = status === 'accepted' ? { answeredAt: serverTimestamp() } : status === 'ringing' ? {} : { endedAt: serverTimestamp() };
  return updateDoc(doc(db, 'calls', id), { status, ...extra });
}

/** My calls, newest first. Two equality queries merged on the phone, so no extra index is needed. */
export function subscribeMyCalls(uid: string, cb: (calls: Call[]) => void) {
  let made: Call[] = [];
  let got: Call[] = [];
  const emit = () => cb([...made, ...got].sort((a, b) => (b.createdAt?.toDate().getTime() ?? Date.now()) - (a.createdAt?.toDate().getTime() ?? Date.now())).slice(0, 100));
  const map = (snap: { docs: { id: string; data: () => object }[] }) => snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Call);
  const u1 = onSnapshot(query(collection(db, 'calls'), where('from', '==', uid)), (s) => ((made = map(s)), emit()), () => {});
  const u2 = onSnapshot(query(collection(db, 'calls'), where('to', '==', uid)), (s) => ((got = map(s)), emit()), () => {});
  return () => {
    u1();
    u2();
  };
}

export const callLabel = (kind: 'voice' | 'video', outcome: string, mine: boolean) =>
  outcome === 'answered' ? (kind === 'video' ? 'Video call' : 'Voice call')
  : mine ? (kind === 'video' ? 'Video call' : 'Voice call')
  : kind === 'video' ? 'Missed video call' : 'Missed voice call';

/** The caller adds a line to the chat when a call finishes (answered, missed, declined or cancelled). */
export async function logCallInChat(call: Call, me: Person) {
  const outcome = call.answeredAt ? 'answered' : call.status === 'declined' ? 'declined' : call.status === 'cancelled' ? 'cancelled' : 'missed';
  const dur = call.answeredAt && call.endedAt ? Math.max(0, Math.round((call.endedAt.toDate().getTime() - call.answeredAt.toDate().getTime()) / 1000)) : undefined;
  const chatId = await openDirectChat(me, { uid: call.to, name: call.toName });
  const snap = await getDoc(doc(db, 'chats', chatId));
  if (!snap.exists()) return;
  const chat = { id: snap.id, ...snap.data() } as Chat;
  const preview = outcome === 'answered' ? `📞 ${call.kind === 'video' ? 'Video' : 'Voice'} call` : `📞 Missed ${call.kind} call`;
  await postMessage(chat, me.uid, { type: 'call', text: '', call: { callId: call.id, kind: call.kind, outcome, ...(dur !== undefined ? { dur } : {}) } }, preview);
}
