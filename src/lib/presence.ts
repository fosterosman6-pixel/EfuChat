import { doc, serverTimestamp, updateDoc } from '@react-native-firebase/firestore';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { db } from './firebase';
import type { UserProfile } from './types';

const BEAT_MS = 60_000;
const ONLINE_MS = 2.5 * 60_000;

/** While the app is in the foreground, marks me as active once a minute. */
export function usePresence(uid: string | undefined, hidden = false) {
  useEffect(() => {
    if (!uid || hidden) return;
    const beat = () => {
      if (AppState.currentState === 'active') updateDoc(doc(db, 'users', uid), { lastActiveAt: serverTimestamp() }).catch(() => {});
    };
    beat();
    const timer = setInterval(beat, BEAT_MS);
    const sub = AppState.addEventListener('change', (s) => s === 'active' && beat());
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [uid, hidden]);
}

export function isOnline(u?: Pick<UserProfile, 'lastActiveAt'> | null) {
  const t = u?.lastActiveAt?.toDate?.();
  return !!t && Date.now() - t.getTime() < ONLINE_MS;
}

/** "online", "last seen today at 08:50", "last seen yesterday at 21:04", "last seen 12 Nov". */
export function presenceLabel(u?: Pick<UserProfile, 'lastActiveAt'> | null) {
  const t = u?.lastActiveAt?.toDate?.();
  if (!t) return 'EfuChat';
  if (isOnline(u)) return 'online';
  const hm = t.toTimeString().slice(0, 5);
  const days = Math.floor((new Date(new Date().toDateString()).getTime() - new Date(t.toDateString()).getTime()) / 86400000);
  if (days === 0) return `last seen today at ${hm}`;
  if (days === 1) return `last seen yesterday at ${hm}`;
  return `last seen ${t.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`;
}
