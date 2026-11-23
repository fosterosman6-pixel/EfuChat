import { getAuth } from '@react-native-firebase/auth';
import { arrayRemove, arrayUnion, doc, setDoc } from '@react-native-firebase/firestore';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { db } from './firebase';

/**
 * Push notifications. The phone registers its FCM token in pushTokens/{uid}; after sending a
 * message or starting a call the app asks the Cloudflare Worker (token-worker/) to notify the
 * other people. The Worker checks the sender really is in the chat or call before sending.
 */
const extra = (Constants.expoConfig?.extra ?? {}) as { callTokenUrl?: string };
const NOTIFY_URL = (extra.callTokenUrl ?? '').replace(/\/token$/, '/notify');

export const CHANNEL_MESSAGES = 'messages';
export const CHANNEL_CALLS = 'calls';
export const RING_SOUND = 'efuchat_ring.wav';

// In the foreground, chats and the call screen already show everything, so stay quiet there.
Notifications.setNotificationHandler({
  handleNotification: async (n) => {
    const kind = dataOf(n.request.content.data).kind;
    const quiet = kind === 'call' || kind === 'message';
    return { shouldShowBanner: !quiet, shouldShowList: !quiet, shouldPlaySound: false, shouldSetBadge: false };
  },
});

function dataOf(d: unknown): Record<string, string> {
  return d && typeof d === 'object' ? (d as Record<string, string>) : {};
}

async function setUpChannels() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL_MESSAGES, {
    name: 'Messages',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 150, 250],
    lightColor: '#A6D41C',
  });
  await Notifications.setNotificationChannelAsync(CHANNEL_CALLS, {
    name: 'Incoming calls',
    importance: Notifications.AndroidImportance.MAX,
    sound: RING_SOUND,
    vibrationPattern: [0, 800, 800, 800, 800, 800],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    bypassDnd: false,
    audioAttributes: { usage: Notifications.AndroidAudioUsage.NOTIFICATION_RINGTONE, contentType: Notifications.AndroidAudioContentType.SONIFICATION },
  });
}

/** Asks permission, then saves this phone's push token so others can reach me. */
export async function registerForPush(uid: string) {
  await setUpChannels();
  const perm = await Notifications.getPermissionsAsync();
  const granted = perm.granted || (perm.canAskAgain && (await Notifications.requestPermissionsAsync()).granted);
  if (!granted) return null;
  const { data: token } = await Notifications.getDevicePushTokenAsync();
  if (typeof token !== 'string' || !token) return null;
  await setDoc(doc(db, 'pushTokens', uid), { tokens: arrayUnion(token), platform: Platform.OS }, { merge: true });
  return token;
}

/** Stop pushes to this phone, e.g. on sign out. */
export async function unregisterPush(uid: string) {
  const { data: token } = await Notifications.getDevicePushTokenAsync().catch(() => ({ data: null }));
  if (typeof token === 'string') await setDoc(doc(db, 'pushTokens', uid), { tokens: arrayRemove(token) }, { merge: true }).catch(() => {});
}

/** Fire-and-forget: tell the Worker to notify the others in a chat, or ring the person called. */
export async function notify(kind: 'message' | 'call', id: string) {
  if (!NOTIFY_URL) return;
  const user = getAuth().currentUser;
  if (!user) return;
  try {
    await fetch(NOTIFY_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${await user.getIdToken()}` },
      body: JSON.stringify({ kind, id }),
    });
  } catch {
    // A missed notification is not worth bothering the sender about.
  }
}

function open(data: Record<string, string>) {
  if (data.kind === 'call' && data.callId) router.push({ pathname: '/call/[id]', params: { id: data.callId } });
  else if (data.kind === 'message' && data.chatId) router.push({ pathname: '/chat/[id]', params: { id: data.chatId } });
}

function responseData(r: Notifications.NotificationResponse) {
  const c = r.notification.request.content;
  const trigger = r.notification.request.trigger as { remoteMessage?: { data?: Record<string, string> } } | null;
  return { ...dataOf(trigger?.remoteMessage?.data), ...dataOf(c.data) };
}

/** Registers the phone once signed in, and opens the right chat or call when a notification is tapped. */
export function usePush(uid: string | undefined) {
  useEffect(() => {
    if (uid) registerForPush(uid).catch(() => {});
  }, [uid]);

  useEffect(() => {
    if (!uid) return;
    const last = Notifications.getLastNotificationResponse();
    if (last) {
      open(responseData(last));
      Notifications.clearLastNotificationResponse();
    }
    const sub = Notifications.addNotificationResponseReceivedListener((r) => open(responseData(r)));
    return () => sub.remove();
  }, [uid]);
}

/** Asks the server to sign this account out on every phone (including this one). */
export async function signOutAllPhones() {
  const user = getAuth().currentUser;
  if (!user || !NOTIFY_URL) throw new Error('Not available');
  const res = await fetch(NOTIFY_URL.replace(/\/notify$/, '/signout-all'), {
    method: 'POST',
    headers: { authorization: `Bearer ${await user.getIdToken()}` },
  });
  if (!res.ok) throw new Error('Not available');
}
