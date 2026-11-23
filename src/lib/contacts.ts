import { doc, getDoc } from '@react-native-firebase/firestore';
import * as Contacts from 'expo-contacts/legacy';
import { db } from './firebase';
import { COUNTRIES } from './phone';
import type { UserProfile } from './types';

export type PhoneContact = { name: string; phone: string; display: string };
export type ContactBook = {
  /** phone contacts who have EfuChat, with their profile */
  onApp: (PhoneContact & { user: UserProfile })[];
  /** phone contacts who do not have it yet */
  invite: PhoneContact[];
};

const MAX_LOOKUPS = 600;
let cache: { key: string; book: ContactBook } | null = null;

/** Normalises a number from the address book to +E.164, using my own country for local numbers. */
export function normalise(raw: string, myDial: string) {
  const d = raw.replace(/[^\d+]/g, '');
  if (d.startsWith('+')) return '+' + d.slice(1).replace(/\D/g, '');
  if (d.startsWith('00')) return '+' + d.slice(2);
  const local = d.replace(/^0+/, '');
  return local.length >= 7 ? myDial + local : '';
}

export function myDialCode(myPhone?: string | null) {
  return COUNTRIES.find((c) => myPhone?.startsWith(c.dial))?.dial ?? COUNTRIES[0].dial;
}

export async function contactsPermission(ask: boolean) {
  const r = ask ? await Contacts.requestPermissionsAsync() : await Contacts.getPermissionsAsync();
  return r.status === 'granted';
}

/** Reads the address book and finds who is on EfuChat through phoneIndex. Cached until the app restarts. */
export async function loadContactBook(me: string, myPhone?: string | null, refresh = false): Promise<ContactBook> {
  if (cache && cache.key === me && !refresh) return cache.book;
  const dial = myDialCode(myPhone);
  const { data } = await Contacts.getContactsAsync({ fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Name] });

  const byPhone = new Map<string, PhoneContact>();
  for (const c of data) {
    const name = (c.name || [c.firstName, c.lastName].filter(Boolean).join(' ')).trim();
    for (const p of c.phoneNumbers ?? []) {
      const phone = normalise(p.number ?? p.digits ?? '', dial);
      if (phone && phone !== myPhone && !byPhone.has(phone)) byPhone.set(phone, { name: name || p.number || phone, phone, display: p.number ?? phone });
    }
  }

  const all = [...byPhone.values()].sort((a, b) => a.name.localeCompare(b.name));
  const lookups = all.slice(0, MAX_LOOKUPS);
  const found = new Map<string, UserProfile>();
  for (let i = 0; i < lookups.length; i += 20) {
    await Promise.all(
      lookups.slice(i, i + 20).map(async (c) => {
        const idx = await getDoc(doc(db, 'phoneIndex', c.phone)).catch(() => null);
        const uid = idx?.exists() ? (idx.data()?.uid as string | undefined) : undefined;
        if (!uid || uid === me) return;
        const u = await getDoc(doc(db, 'users', uid)).catch(() => null);
        if (u?.exists()) found.set(c.phone, { uid: u.id, ...u.data() } as UserProfile);
      }),
    );
  }

  const seen = new Set<string>();
  const onApp: ContactBook['onApp'] = [];
  for (const c of all) {
    const user = found.get(c.phone);
    if (user && !seen.has(user.uid)) {
      seen.add(user.uid);
      onApp.push({ ...c, user });
    }
  }
  const book = { onApp, invite: all.filter((c) => !found.has(c.phone)) };
  cache = { key: me, book };
  return book;
}

/** Looks up an @username through the handles collection. */
export async function findUserByHandle(handle: string): Promise<UserProfile | null> {
  const h = handle.replace(/^@/, '').toLowerCase();
  if (!/^[a-z0-9._]{3,24}$/.test(h)) return null;
  const idx = await getDoc(doc(db, 'handles', h)).catch(() => null);
  const uid = idx?.exists() ? (idx.data()?.uid as string | undefined) : undefined;
  if (!uid) return null;
  const u = await getDoc(doc(db, 'users', uid));
  return u.exists() ? ({ uid: u.id, ...u.data() } as UserProfile) : null;
}

export const INVITE_TEXT = 'Chat with me on EfuChat: chat, send money and book a matola, all in one app. Ask me for the download link.';
