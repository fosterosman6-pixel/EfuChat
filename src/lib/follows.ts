import { collection, doc, getCountFromServer, onSnapshot, serverTimestamp, writeBatch } from '@react-native-firebase/firestore';
import { useEffect, useState } from 'react';
import { db } from './firebase';
import { useSession } from './session';

/**
 * Following writes both sides at once. The onFollow server function would
 * also do this, so the app works the same before and after functions are deployed.
 */
export async function setFollowing(me: string, target: string, follow: boolean) {
  const batch = writeBatch(db);
  const theirs = doc(db, 'users', target, 'followers', me);
  const mine = doc(db, 'users', me, 'following', target);
  if (follow) {
    batch.set(theirs, { createdAt: serverTimestamp() });
    batch.set(mine, { createdAt: serverTimestamp() });
  } else {
    batch.delete(theirs);
    batch.delete(mine);
  }
  await batch.commit();
}

/** Ids of everyone I follow, live. */
export function useFollowing() {
  const { user } = useSession();
  const [ids, setIds] = useState<string[]>([]);
  useEffect(() => {
    if (!user) return;
    return onSnapshot(collection(db, 'users', user.uid, 'following'), (s) => setIds(s.docs.map((d) => d.id)), () => setIds([]));
  }, [user]);
  return ids;
}

/** People I blocked, so their posts stay out of my lists. */
export function useBlocked() {
  const { user } = useSession();
  const [ids, setIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!user) return;
    return onSnapshot(collection(db, 'users', user.uid, 'blocks'), (s) => setIds(new Set(s.docs.map((d) => d.id))), () => setIds(new Set()));
  }, [user]);
  return ids;
}

export async function followCounts(uid: string) {
  const [followers, following] = await Promise.all([
    getCountFromServer(collection(db, 'users', uid, 'followers')),
    getCountFromServer(collection(db, 'users', uid, 'following')),
  ]);
  return { followers: followers.data().count, following: following.data().count };
}
