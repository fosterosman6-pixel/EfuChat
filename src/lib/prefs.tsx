import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';

export type WallpaperName = 'plain' | 'chitenje' | 'lake' | 'night';
type Prefs = {
  dataSaver: boolean;
  setDataSaver: (on: boolean) => void;
  appLock: boolean;
  setAppLock: (on: boolean) => void;
  /** wallpaper for a chat: its own choice, else the one for all chats (Chitenje by default) */
  wallpaperFor: (chatId?: string) => WallpaperName;
  setWallpaper: (name: WallpaperName, chatId?: string) => void;
};
const PrefsContext = createContext<Prefs>({
  dataSaver: true,
  setDataSaver: () => {},
  appLock: false,
  setAppLock: () => {},
  wallpaperFor: () => 'chitenje',
  setWallpaper: () => {},
});
const KEY = 'efuchat.dataSaver';
const LOCK_KEY = 'efuchat.appLock';
const WP_KEY = 'efuchat.wallpaper';
type WP = { all: WallpaperName; chats: Record<string, WallpaperName> };

/** Data saver is on by default: smaller photos, media only on tap. */
export function PrefsProvider({ children }: { children: ReactNode }) {
  const [dataSaver, setState] = useState(true);
  const [appLock, setLock] = useState(false);
  const [wp, setWp] = useState<WP>({ all: 'chitenje', chats: {} });
  useEffect(() => {
    AsyncStorage.getItem(KEY).then((v) => v !== null && setState(v === '1'));
    AsyncStorage.getItem(LOCK_KEY).then((v) => setLock(v === '1'));
    AsyncStorage.getItem(WP_KEY).then((v) => {
      try {
        if (v) setWp({ all: 'chitenje', chats: {}, ...JSON.parse(v) });
      } catch {}
    });
  }, []);
  const setAppLock = useCallback((on: boolean) => {
    setLock(on);
    AsyncStorage.setItem(LOCK_KEY, on ? '1' : '0');
  }, []);
  const setDataSaver = useCallback((on: boolean) => {
    setState(on);
    AsyncStorage.setItem(KEY, on ? '1' : '0');
  }, []);
  const wallpaperFor = useCallback((chatId?: string) => (chatId && wp.chats[chatId]) || wp.all, [wp]);
  const setWallpaper = useCallback((name: WallpaperName, chatId?: string) => {
    setWp((cur) => {
      // "for all chats" also clears each chat's own choice so every chat matches
      const next: WP = chatId ? { ...cur, chats: { ...cur.chats, [chatId]: name } } : { all: name, chats: {} };
      AsyncStorage.setItem(WP_KEY, JSON.stringify(next));
      return next;
    });
  }, []);
  return (
    <PrefsContext.Provider value={{ dataSaver, setDataSaver, appLock, setAppLock, wallpaperFor, setWallpaper }}>{children}</PrefsContext.Provider>
  );
}

export const usePrefs = () => useContext(PrefsContext);
