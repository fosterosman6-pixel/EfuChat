import { addDoc, collection, doc, getDoc, onSnapshot, query, serverTimestamp, updateDoc, where } from '@react-native-firebase/firestore';
import { db } from './firebase';
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
