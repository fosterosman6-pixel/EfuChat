import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';

export type Lang = 'ny' | 'en';

// Chichewa (ny) strings: please check and correct the wording.
const strings = {
  en: {
    tagline: 'Chat, send money and book a matola, all in one app.',
    chooseLanguage: 'CHOOSE YOUR LANGUAGE',
    getStarted: 'Get started',
    enterPhone: 'Enter your phone number',
    smsNote: "We'll send you a 6-digit code by SMS to confirm it's you.",
    sendCode: 'Send code',
    verifyTitle: 'Verify your number',
    enterCode: 'Enter the 6-digit code',
    verify: 'Verify',
    yourProfile: 'Your profile',
    yourName: 'YOUR NAME',
    about: 'ABOUT (OPTIONAL)',
    startChatting: 'Start chatting',
    greeting: 'Good morning',
    chats: 'Chats',
    home: 'Home',
    reels: 'Reels',
    market: 'Market',
    message: 'Message',
    newChat: 'New chat',
    yourStory: 'Your story',
    online: 'online',
    noChats: 'No chats yet. Tap + to start one.',
    comingSoon: 'Coming in the next update',
    dataSaver: 'Data saver',
  },
  ny: {
    tagline: 'Chezani, tumizani ndalama ndi kuitana matola, zonse pa app imodzi.',
    chooseLanguage: 'SANKHANI CHILANKHULO',
    getStarted: 'Tiyeni tiyambe',
    enterPhone: 'Lembani nambala yanu ya foni',
    smsNote: 'Tikutumizirani nambala ya manambala 6 pa SMS kuti titsimikize kuti ndinu.',
    sendCode: 'Tumizani nambala',
    verifyTitle: 'Tsimikizani nambala yanu',
    enterCode: 'Lembani nambala ya manambala 6',
    verify: 'Tsimikizani',
    yourProfile: 'Mbiri yanu',
    yourName: 'DZINA LANU',
    about: 'ZOKHUDZA INU (MWASANKHA)',
    startChatting: 'Yambani kucheza',
    greeting: 'Mwadzuka bwanji',
    chats: 'Macheza',
    home: 'Kunyumba',
    reels: 'Makanema',
    market: 'Msika',
    message: 'Lembani uthenga...',
    newChat: 'Macheza atsopano',
    yourStory: 'Nkhani yanu',
    online: 'ali pa intaneti',
    noChats: 'Mulibe macheza. Dinani + kuti muyambe.',
    comingSoon: 'Zikubwera posachedwa',
    dataSaver: 'Sungani data',
  },
} as const;

export type StringKey = keyof typeof strings.en;

type Ctx = { lang: Lang; setLang: (l: Lang) => void; t: (k: StringKey) => string };
const LangContext = createContext<Ctx>({ lang: 'ny', setLang: () => {}, t: (k) => strings.en[k] });

const KEY = 'efuchat.lang';

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>('ny');

  useEffect(() => {
    AsyncStorage.getItem(KEY).then((v) => {
      if (v === 'en' || v === 'ny') setLangState(v);
    });
  }, []);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    AsyncStorage.setItem(KEY, l);
  }, []);

  const t = useCallback((k: StringKey) => strings[lang][k], [lang]);

  return <LangContext.Provider value={{ lang, setLang, t }}>{children}</LangContext.Provider>;
}

export const useLang = () => useContext(LangContext);
