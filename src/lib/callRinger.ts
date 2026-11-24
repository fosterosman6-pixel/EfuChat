/**
 * Incoming calls that ring with EfuChat closed (Android), using expo-notifications only.
 *
 * The server sends a data-only push for a call. expo-notifications wakes this background task,
 * which shows a high-priority call notification on the "Incoming calls" channel (30-second ring)
 * with Decline / Answer buttons. A second push ("call_end") removes it.
 * Every step is guarded so a problem here can never stop the app from opening.
 */
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';

export const CALL_TASK = 'efuchat-incoming-call';
const CATEGORY = 'incoming_call';
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
  if (o.kind === 'call' || o.kind === 'call_end') return o as unknown as CallPush;
  for (const v of Object.values(o)) {
    const hit = findPayload(v, depth + 1);
    if (hit) return hit;
  }
  return null;
}

export async function setupCallCategory() {
  try {
    await Notifications.setNotificationCategoryAsync(CATEGORY, [
      { identifier: 'decline', buttonTitle: 'Decline', options: { opensAppToForeground: false, isDestructive: true } },
      { identifier: 'answer', buttonTitle: 'Answer', options: { opensAppToForeground: true } },
    ]);
  } catch {}
}

export async function showIncomingCall(p: CallPush) {
  if (!p.callId) return;
  await setupCallCategory();
  await Notifications.scheduleNotificationAsync({
    identifier: callNotificationId(p.callId),
    content: {
      title: p.fromName || 'EfuChat',
      body: p.callKind === 'video' ? '📹 Incoming video call' : '📞 Incoming voice call',
      data: { kind: 'call', callId: p.callId },
      categoryIdentifier: CATEGORY,
      sound: 'efuchat_ring.wav',
      priority: Notifications.AndroidNotificationPriority.MAX,
      sticky: true,
      autoDismiss: false,
      color: '#0A2253',
    },
    trigger: { channelId: 'calls' },
  });
}

export function stopRinging(callId: string) {
  return Notifications.dismissNotificationAsync(callNotificationId(callId)).catch(() => {});
}

async function decline(callId: string) {
  await stopRinging(callId);
  try {
    const { setCallStatus } = await import('./calls');
    await setCallStatus(callId, 'declined');
  } catch {}
}

/** Registered once at start-up (index.js). Never throws. */
export function registerCallRinger() {
  if (Platform.OS !== 'android') return;
  try {
    TaskManager.defineTask(CALL_TASK, async ({ data }) => {
      try {
        const d = data as Record<string, unknown> | undefined;
        if (d && typeof d === 'object' && 'actionIdentifier' in d) {
          const callId = findPayload(d)?.callId;
          if (callId && d.actionIdentifier === 'decline') await decline(callId);
          return;
        }
        const p = findPayload(data);
        if (!p) return;
        if (p.kind === 'call') await showIncomingCall(p);
        else if (p.kind === 'call_end' && p.callId) await stopRinging(p.callId);
      } catch {}
    });
    Notifications.registerTaskAsync(CALL_TASK).catch(() => {});
  } catch {}
}

/** While the app runs: Answer / Decline / tap on a call notification. */
export function onCallNotificationPress(cb: (callId: string, answer: boolean) => void) {
  const handle = (r: Notifications.NotificationResponse | null) => {
    if (!r) return;
    const data = r.notification.request.content.data as { kind?: string; callId?: string } | undefined;
    if (data?.kind !== 'call' || !data.callId) return;
    if (r.actionIdentifier === 'decline') return void decline(data.callId);
    cb(data.callId, r.actionIdentifier === 'answer');
  };
  try {
    Notifications.getLastNotificationResponseAsync().then(handle, () => {});
    const sub = Notifications.addNotificationResponseReceivedListener(handle);
    return () => sub.remove();
  } catch {
    return () => {};
  }
}
