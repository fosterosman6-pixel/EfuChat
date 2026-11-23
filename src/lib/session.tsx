import { onAuthStateChanged, type User } from '@react-native-firebase/auth';
import { doc, onSnapshot } from '@react-native-firebase/firestore';
import { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import { auth, db } from './firebase';
import type { UserProfile } from './types';

type Session = {
  /** undefined while Firebase is still starting up */
  user: User | null | undefined;
  /** null when signed in but the profile has not been set up yet */
  profile: UserProfile | null | undefined;
};

const SessionContext = createContext<Session>({ user: undefined, profile: undefined });

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Session['user']>(undefined);
  const [profile, setProfile] = useState<Session['profile']>(undefined);

  useEffect(() => onAuthStateChanged(auth, (u) => setUser(u)), []);

  useEffect(() => {
    if (!user) {
      setProfile(user === null ? null : undefined);
      return;
    }
    return onSnapshot(doc(db, 'users', user.uid), (snap) => {
      setProfile(snap.exists() ? ({ uid: snap.id, ...snap.data() } as UserProfile) : null);
    });
  }, [user]);

  return <SessionContext.Provider value={{ user, profile }}>{children}</SessionContext.Provider>;
}

export const useSession = () => useContext(SessionContext);
