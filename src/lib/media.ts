import { addDoc, collection, doc, getDoc, serverTimestamp, setDoc } from '@react-native-firebase/firestore';
import { File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { useEffect, useState } from 'react';
import { postMessage } from './chats';
import { db } from './firebase';
import type { Chat, MediaRef, ReplyRef } from './types';

/**
 * Photos and voice notes are kept in the database (free plan), not in file storage:
 * each file is one document in chats/{chatId}/media, at most ~650 KB of base64.
 * Messages only carry a tiny blurred thumbnail, so chat lists stay light.
 */
const MAX_B64 = 650_000;

async function jpeg(uri: string, maxSide: number, compress: number) {
  const probe = await ImageManipulator.manipulate(uri).renderAsync();
  const scale = Math.min(1, maxSide / Math.max(probe.width, probe.height));
  const ctx = ImageManipulator.manipulate(uri);
  if (scale < 1) ctx.resize({ width: Math.round(probe.width * scale), height: Math.round(probe.height * scale) });
  const out = await (await ctx.renderAsync()).saveAsync({ format: SaveFormat.JPEG, compress, base64: true });
  return { base64: out.base64 ?? '', width: out.width, height: out.height };
}

/** Shrinks a photo until it fits: about 1280px and 150–250 KB for normal photos. */
export async function shrinkPhoto(uri: string) {
  for (const [side, q] of [[1280, 0.6], [1024, 0.5], [800, 0.45], [640, 0.4]] as const) {
    const r = await jpeg(uri, side, q);
    if (r.base64.length <= MAX_B64) return r;
  }
  throw new Error('This photo is too large to send.');
}

/** Square-ish profile picture, 300px, as a data URI (~25 KB). */
export async function avatarDataUri(uri: string) {
  const r = await jpeg(uri, 300, 0.7);
  return `data:image/jpeg;base64,${r.base64}`;
}

async function thumbnail(uri: string) {
  const r = await jpeg(uri, 24, 0.5);
  return `data:image/jpeg;base64,${r.base64}`;
}

/** Longest voice note we store: 60 minutes at ~24 kbit/s is about 14 MB of text, in pieces. */
const MAX_PARTS = 40;

/** Saves media in the chat. Anything larger than one record is split into numbered pieces ("<id>-p1", "-p2"…). */
async function saveMedia(chatId: string, from: string, kind: 'image' | 'voice', mime: string, data: string) {
  if (kind === 'image' && data.length > MAX_B64) throw new Error('Photo is too large.');
  const parts = Math.max(1, Math.ceil(data.length / MAX_B64));
  if (parts > MAX_PARTS) throw new Error('Voice note is too long.');
  const col = collection(db, 'chats', chatId, 'media');
  if (parts === 1) return (await addDoc(col, { from, kind, mime, data, createdAt: serverTimestamp() })).id;
  const main = doc(col);
  // Pieces first, then the main record, so a reader never finds a main record with missing pieces.
  for (let i = 1; i < parts; i++) {
    await setDoc(doc(col, `${main.id}-p${i}`), { from, kind, mime, data: data.slice(i * MAX_B64, (i + 1) * MAX_B64), part: i, createdAt: serverTimestamp() });
  }
  await setDoc(main, { from, kind, mime, data: data.slice(0, MAX_B64), parts, createdAt: serverTimestamp() });
  return main.id;
}

export async function sendPhoto(chat: Chat, from: string, uri: string, caption: string, replyTo?: ReplyRef) {
  const [img, thumb] = await Promise.all([shrinkPhoto(uri), thumbnail(uri)]);
  const id = await saveMedia(chat.id, from, 'image', 'image/jpeg', img.base64);
  const text = caption.trim().slice(0, 1000);
  await postMessage(chat, from, { type: 'image', text, media: { id, kind: 'image', w: img.width, h: img.height, thumb } }, text ? `📷 ${text}` : '📷 Photo', { replyTo });
}

export async function sendVoice(chat: Chat, from: string, uri: string, dur: number, replyTo?: ReplyRef) {
  const data = await new File(uri).base64();
  const id = await saveMedia(chat.id, from, 'voice', 'audio/mp4', data);
  const secs = Math.max(1, Math.round(dur));
  await postMessage(chat, from, { type: 'voice', text: '', media: { id, kind: 'voice', dur: secs } }, `🎤 Voice note (${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')})`, { replyTo });
}

// ---------- loading, with a small in-memory cache ----------
const cache = new Map<string, string>();
const loading = new Map<string, Promise<string>>();

export function loadMedia(chatId: string, mediaId: string): Promise<string> {
  const key = `${chatId}/${mediaId}`;
  const hit = cache.get(key);
  if (hit) return Promise.resolve(hit);
  let p = loading.get(key);
  if (!p) {
    p = getDoc(doc(db, 'chats', chatId, 'media', mediaId)).then(async (s) => {
      let data = (s.data()?.data as string | undefined) ?? '';
      if (!data) throw new Error('missing');
      const parts = Number(s.data()?.parts ?? 1);
      if (parts > 1) {
        const rest = await Promise.all(
          Array.from({ length: parts - 1 }, (_, i) => getDoc(doc(db, 'chats', chatId, 'media', `${mediaId}-p${i + 1}`)).then((d) => (d.data()?.data as string | undefined) ?? '')),
        );
        if (rest.some((r) => !r)) throw new Error('missing');
        data += rest.join('');
      }
      if (cache.size > 40) cache.delete(cache.keys().next().value as string);
      cache.set(key, data);
      return data;
    });
    p.finally(() => loading.delete(key)).catch(() => {});
    loading.set(key, p);
  }
  return p;
}

/** A photo as a data URI once loaded; null until then. */
export function usePhoto(chatId: string | undefined, media: MediaRef | undefined) {
  const [uri, setUri] = useState<string | null>(null);
  useEffect(() => {
    if (!chatId || !media || media.kind !== 'image') return;
    let alive = true;
    loadMedia(chatId, media.id).then((d) => alive && setUri(`data:image/jpeg;base64,${d}`), () => {});
    return () => {
      alive = false;
    };
  }, [chatId, media]);
  return uri;
}

/** Writes a voice note to the cache folder so the player can open it. */
export async function voiceFile(chatId: string, media: MediaRef) {
  const f = new File(Paths.cache, `voice-${media.id}.m4a`);
  if (!f.exists) {
    const data = await loadMedia(chatId, media.id);
    f.create({ overwrite: true });
    await f.write(data, { encoding: 'base64' });
  }
  return f.uri;
}
