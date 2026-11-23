import { doc, getDoc, updateDoc, writeBatch } from '@react-native-firebase/firestore';
import { db } from './firebase';
import type { Audience, Privacy, UserProfile } from './types';

export const HANDLE_RE = /^[a-z0-9._]{3,24}$/;
export const cleanHandle = (h: string) => h.trim().replace(/^@/, '').toLowerCase();

/** 'ok' when the handle is free (or already mine). */
export async function handleStatus(handle: string, me: string): Promise<'ok' | 'taken' | 'invalid'> {
  if (!HANDLE_RE.test(handle)) return 'invalid';
  const s = await getDoc(doc(db, 'handles', handle));
  return !s.exists() || s.data()?.uid === me ? 'ok' : 'taken';
}

export type ProfileEdit = { name: string; about: string; town: string; accountType: NonNullable<UserProfile['accountType']>; handle: string; photoURL?: string | null };

/** Saves the profile, claiming the new @handle and releasing the old one in one batch. */
export async function saveProfile(me: UserProfile, edit: ProfileEdit) {
  const batch = writeBatch(db);
  const handle = cleanHandle(edit.handle);
  const old = me.handle;
  if (handle && handle !== old) batch.set(doc(db, 'handles', handle), { uid: me.uid });
  if (old && old !== handle) batch.delete(doc(db, 'handles', old));
  batch.update(doc(db, 'users', me.uid), {
    name: edit.name.trim(),
    about: edit.about.trim() || 'Available',
    town: edit.town.trim(),
    accountType: edit.accountType,
    ...(handle ? { handle } : {}),
    ...(edit.photoURL !== undefined ? { photoURL: edit.photoURL } : {}),
  });
  await batch.commit();
}

export const privacyOf = (u?: Pick<UserProfile, 'privacy'> | null): Required<Privacy> => ({
  lastSeen: u?.privacy?.lastSeen ?? 'everyone',
  readTicks: u?.privacy?.readTicks ?? true,
  calls: u?.privacy?.calls ?? 'everyone',
});

export function savePrivacy(uid: string, p: Privacy) {
  return updateDoc(doc(db, 'users', uid), { privacy: p });
}

export const AUDIENCE_LABEL: Record<Audience, string> = { everyone: 'Everyone', chats: 'People I chat with', nobody: 'Nobody' };

/**
 * Whether I may see their online / last seen. Works both ways: hide yours and you see nobody's.
 * inChat is true when we already have a chat together.
 */
export function canSeePresence(them: Pick<UserProfile, 'privacy'> | null | undefined, me: Pick<UserProfile, 'privacy'> | null | undefined, inChat: boolean) {
  if (privacyOf(me).lastSeen === 'nobody') return false;
  const a = privacyOf(them).lastSeen;
  return a === 'everyone' || (a === 'chats' && inChat);
}

/** Read ticks show only when both people have them on. */
export const ticksOn = (them?: Pick<UserProfile, 'privacy'> | null, me?: Pick<UserProfile, 'privacy'> | null) => privacyOf(them).readTicks && privacyOf(me).readTicks;
