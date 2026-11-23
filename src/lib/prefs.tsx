import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';

type Prefs = { dataSaver: boolean; setDataSaver: (on: boolean) => void; appLock: boolean; setAppLock: (on: boolean) => void };
const PrefsContext = createContext<Prefs>({ dataSaver: true, setDataSaver: () => {}, appLock: false, setAppLock: () => {} });
const KEY = 'efuchat.dataSaver';
const LOCK_KEY = 'efuchat.appLock';

/** Data saver is on by default: smaller photos, media only on tap. */
export function PrefsProvider({ children }: { children: ReactNode }) {
  const [dataSaver, setState] = useState(true);
  const [appLock, setLock] = useState(false);
  useEffect(() => {
    AsyncStorage.getItem(KEY).then((v) => v !== null && setState(v === '1'));
    AsyncStorage.getItem(LOCK_KEY).then((v) => setLock(v === '1'));
  }, []);
  const setAppLock = useCallback((on: boolean) => {
    setLock(on);
    AsyncStorage.setItem(LOCK_KEY, on ? '1' : '0');
  }, []);
  const setDataSaver = useCallback((on: boolean) => {
    setState(on);
    AsyncStorage.setItem(KEY, on ? '1' : '0');
  }, []);
  return <PrefsContext.Provider value={{ dataSaver, setDataSaver, appLock, setAppLock }}>{children}</PrefsContext.Provider>;
}

export const usePrefs = () => useContext(PrefsContext);
