import { useEffect, useState } from 'react';
import { subscribeChats, type Person } from './chats';
import { contactsPermission, loadContactBook, type ContactBook } from './contacts';
import { useSession } from './session';
import type { Chat } from './types';

/** People I chatted with directly, most recent first. */
export function recentPeople(chats: Chat[], me: string): Person[] {
  const out: Person[] = [];
  for (const c of chats) {
    if (c.type !== 'direct') continue;
    const uid = c.members.find((m) => m !== me);
    if (uid && !out.some((p) => p.uid === uid)) out.push({ uid, name: c.names[uid] ?? 'EfuChat user' });
  }
  return out;
}

/** Recent chats plus the address book matched against EfuChat. Asks for contacts permission when ask is true. */
export function usePeople(ask: boolean) {
  const { user } = useSession();
  const [chats, setChats] = useState<Chat[]>([]);
  const [book, setBook] = useState<ContactBook | null>(null);
  const [permission, setPermission] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const me = user?.uid ?? '';

  useEffect(() => (me ? subscribeChats(me, setChats) : undefined), [me]);

  async function load(askNow: boolean, refresh = false) {
    if (!me) return;
    const ok = await contactsPermission(askNow).catch(() => false);
    setPermission(ok);
    if (!ok) return;
    setLoading(true);
    try {
      setBook(await loadContactBook(me, user?.phoneNumber, refresh));
    } catch {
      setBook({ onApp: [], invite: [] });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(ask);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me]);

  return { chats, recent: recentPeople(chats, me), book, permission, loading, allow: () => load(true), refresh: () => load(false, true) };
}
