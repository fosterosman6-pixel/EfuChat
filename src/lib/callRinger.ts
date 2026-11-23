/**
 * Full-screen incoming calls that keep ringing, even when EfuChat is closed (Android).
 *
 * The server sends a data-only push for a call. expo-notifications wakes this background task,
 * which shows a call-style notification with notifee: it covers the lock screen, loops the
 * ringtone and has Decline / Answer buttons. A second push ("call_end") or 45 seconds stops it.
 */
import notifee, { AndroidCategory, AndroidImportance, AndroidVisibility, EventType, type Event } from '@notifee/react-native';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';

export const CALL_TASK = 'efuchat-incoming-call';
export const CALL_CHANNEL = 'incoming_call_ring';
export const callNotificationId = (callId: string) => `call-${callId}`;

type CallPush = { kind: string; callId?: string; fromName?: string; callKind?: string };

/** Finds our {kind, callId…} payload wherever expo-notifications put it. */
function findPayload(x: unknown, depth = 0): CallPush | null {
  if (!x || depth > 5) return null;
  if (typeof x === 'string') {
    if (!x.includes('kind')) return null;
    try {
      return findPayload(JSON.parse(x), depth + 1);
    } catch {
      return null;
    }
  }
  if (typeof x !== 'object') return null;
  const o = x as Record<string, unknown>;
  if (typeof o.kind === 'string' && (o.kind === 'call' || o.kind === 'call_end')) return o as unknown as CallPush;
  for (const v of Object.values(o)) {
    const hit = findPayload(v, depth + 1);
    if (hit) return hit;
  }
  return null;
}

export async function ensureCallChannel() {
  if (Platform.OS !== 'android') return;
  await notifee.createChannel({
    id: CALL_CHANNEL,
    name: 'Incoming calls (ringing)',
    importance: AndroidImportance.HIGH,
    sound: 'efuchat_ring',
    vibration: true,
    vibrationPattern: [300, 800, 400, 800],
    visibility: AndroidVisibility.PUBLIC,
  });
}

export async function showIncomingCall(p: CallPush) {
  if (!p.callId) return;
  await ensureCallChannel();
  const video = p.callKind === 'video';
  await notifee.displayNotification({
    id: callNotificationId(p.callId),
    title: p.fromName || 'EfuChat',
    body: video ? 'Incoming video call' : 'Incoming voice call',
    data: { kind: 'call', callId: p.callId },
    android: {
      channelId: CALL_CHANNEL,
      category: AndroidCategory.CALL,
      importance: AndroidImportance.HIGH,
      visibility: AndroidVisibility.PUBLIC,
      loopSound: true,
      ongoing: true,
      autoCancel: false,
      timeoutAfter: 45000,
      smallIcon: 'notification_icon',
      color: '#0A2253',
      lightUpScreen: true,
      fullScreenAction: { id: 'default', launchActivity: 'default' },
      pressAction: { id: 'default', launchActivity: 'default' },
      actions: [
        { title: 'Decline', pressAction: { id: 'decline' } },
        { title: video ? 'Answer video' : 'Answer', pressAction: { id: 'answer', launchActivity: 'default' } },
      ],
    },
  });
}

export const stopRinging = (callId: string) => notifee.cancelNotification(callNotificationId(callId)).catch(() => {});

async function decline(callId: string) {
  await stopRinging(callId);
  try {
    // Firebase keeps the sign-in on the phone, so this works with the app closed.
    const { setCallStatus } = await import('./calls');
    await setCallStatus(callId, 'declined');
  } catch {}
}

/** Decline pressed while the app is closed. */
async function onBackground({ type, detail }: Event) {
  const callId = detail.notification?.data?.callId as string | undefined;
  if (!callId) return;
  if (type === EventType.ACTION_PRESS && detail.pressAction?.id === 'decline') await decline(callId);
  if (type === EventType.DISMISSED) await stopRinging(callId);
}

// Registered once, at start-up (index.js), before the app renders.
if (Platform.OS === 'android') {
  TaskManager.defineTask(CALL_TASK, async ({ data }) => {
    const p = findPayload(data);
    if (!p) return;
    if (p.kind === 'call') await showIncomingCall(p);
    else if (p.kind === 'call_end' && p.callId) await stopRinging(p.callId);
  });
  Notifications.registerTaskAsync(CALL_TASK).catch(() => {});
  notifee.onBackgroundEvent(onBackground);
}

/** For the app: what to do when it was opened from the call notification. */
export async function openedFromCall(): Promise<{ callId: string; answer: boolean } | null> {
  const n = await notifee.getInitialNotification().catch(() => null);
  const callId = n?.notification.data?.callId as string | undefined;
  if (!n || !callId) return null;
  return { callId, answer: n.pressAction.id === 'answer' };
}

/** While the app is open: Answer / Decline / tap on the call notification. */
export function onCallNotificationPress(cb: (callId: string, action: 'answer' | 'open' | 'decline') => void) {
  return notifee.onForegroundEvent(({ type, detail }) => {
    const callId = detail.notification?.data?.callId as string | undefined;
    if (!callId || (type !== EventType.ACTION_PRESS && type !== EventType.PRESS)) return;
    const id = detail.pressAction?.id;
    if (id === 'decline') decline(callId);
    else cb(callId, id === 'answer' ? 'answer' : 'open');
  });
}
