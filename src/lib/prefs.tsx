import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';

type Prefs = { dataSaver: boolean; setDataSaver: (on: boolean) => void };
const PrefsContext = createContext<Prefs>({ dataSaver: true, setDataSaver: () => {} });
const KEY = 'efuchat.dataSaver';

/** Data saver is on by default: smaller photos, media only on tap. */
export function PrefsProvider({ children }: { children: ReactNode }) {
  const [dataSaver, setState] = useState(true);
  useEffect(() => {
    AsyncStorage.getItem(KEY).then((v) => v !== null && setState(v === '1'));
  }, []);
  const setDataSaver = useCallback((on: boolean) => {
    setState(on);
    AsyncStorage.setItem(KEY, on ? '1' : '0');
  }, []);
  return <PrefsContext.Provider value={{ dataSaver, setDataSaver }}>{children}</PrefsContext.Provider>;
}

export const usePrefs = () => useContext(PrefsContext);
