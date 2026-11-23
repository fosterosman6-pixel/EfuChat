import { doc, onSnapshot } from '@react-native-firebase/firestore';
import { useEffect, useRef, useState } from 'react';
import { db } from './firebase';
import type { UserProfile } from './types';

/** Live profiles (photo, online, privacy) for a list of people. */
export function usePeople(uids: string[]) {
  const [people, setPeople] = useState<Record<string, UserProfile>>({});
  const subs = useRef(new Map<string, () => void>());
  const key = [...new Set(uids)].sort().join(',');
  useEffect(() => {
    const want = new Set(key ? key.split(',') : []);
    for (const [uid, off] of subs.current) if (!want.has(uid)) (off(), subs.current.delete(uid));
    for (const uid of want) {
      if (subs.current.has(uid)) continue;
      subs.current.set(
        uid,
        onSnapshot(
          doc(db, 'users', uid),
          (s) => s.exists() && setPeople((p) => ({ ...p, [uid]: { uid, ...s.data() } as UserProfile })),
          () => {},
        ),
      );
    }
  }, [key]);
  useEffect(() => () => subs.current.forEach((off) => off()), []);
  return people;
}
