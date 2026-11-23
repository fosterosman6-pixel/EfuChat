import { HttpsError, onCall, onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';
import { timingSafeEqual } from 'node:crypto';
import { db, FieldValue, getConfig, notify, REGION, requireActive, text, Timestamp, uidOf } from './common.js';
import { C, Delivery, feeFor } from './schema.js';

const EFULOGISTIX_SECRET = defineSecret('EFULOGISTIX_WEBHOOK_SECRET');
const STATUSES: Delivery['status'][] = ['requested', 'assigned', 'picking_up', 'on_the_way', 'delivered', 'cancelled'];

function place(v: unknown, name: string) {
  const p = v as { label?: unknown; lat?: unknown; lng?: unknown } | undefined;
  if (!p || typeof p.label !== 'string' || typeof p.lat !== 'number' || typeof p.lng !== 'number') {
    throw new HttpsError('invalid-argument', `${name} needs a label, lat and lng.`);
  }
  return { label: p.label.slice(0, 120), lat: p.lat, lng: p.lng };
}

/** "Book matola" from a chat. EfuLogistix picks it up from the deliveries collection. */
export const requestMatola = onCall({ region: REGION }, async (req) => {
  const uid = uidOf(req);
  await requireActive(uid);
  const chatId = text(req.data?.chatId, 'chatId', 128);
  const chat = await db.collection(C.chats).doc(chatId).get();
  if (!chat.exists || !(chat.get('members') as string[]).includes(uid)) throw new HttpsError('permission-denied', 'Not your chat.');
  const { fees } = await getConfig();
  const fare = 3500; // TODO: get a quote from EfuLogistix
  const ref = db.collection(C.deliveries).doc();
  const d: Delivery = {
    source: 'chat', chatId, requesterUid: uid, members: chat.get('members'),
    pickup: place(req.data?.pickup, 'pickup'), dropoff: place(req.data?.dropoff, 'dropoff'),
    fareMWK: fare, commissionMWK: feeFor(fare, fees.matolaPercent), status: 'requested',
    createdAt: Timestamp.now(), updatedAt: Timestamp.now(),
  };
  await ref.create(d);
  // A matola card in the chat that follows the delivery.
  await db.collection(C.messages(chatId)).add({ from: uid, type: 'matola', ref: ref.path, text: 'Matola booked', createdAt: FieldValue.serverTimestamp() });
  return { deliveryId: ref.id, fareMWK: fare };
});

/**
 * EfuLogistix calls this as the driver moves.
 * Body: { deliveryId, status, efulogistixJobId?, driver?, etaMinutes?, location? }
 */
export const efulogistixWebhook = onRequest({ region: REGION, secrets: [EFULOGISTIX_SECRET] }, async (req, res) => {
  const secret = EFULOGISTIX_SECRET.value();
  const got = req.get('x-efulogistix-signature') ?? '';
  const ok = !!secret && got.length === secret.length && timingSafeEqual(Buffer.from(got), Buffer.from(secret));
  if (req.method !== 'POST' || !ok) {
    res.status(401).send('no');
    return;
  }
  const b = req.body ?? {};
  if (typeof b.deliveryId !== 'string' || !STATUSES.includes(b.status)) {
    res.status(400).send('bad body');
    return;
  }
  const ref = db.collection(C.deliveries).doc(b.deliveryId);
  const d = (await ref.get()).data() as Delivery | undefined;
  if (!d) {
    res.status(404).send('unknown delivery');
    return;
  }
  const update: Record<string, unknown> = { status: b.status, updatedAt: Timestamp.now() };
  if (typeof b.efulogistixJobId === 'string') update.efulogistixJobId = b.efulogistixJobId;
  if (b.driver && typeof b.driver.name === 'string') update.driver = { name: b.driver.name, phone: String(b.driver.phone ?? ''), plate: b.driver.plate ?? null };
  if (typeof b.etaMinutes === 'number') update.etaMinutes = b.etaMinutes;
  if (b.location && typeof b.location.lat === 'number') update.lastLocation = { lat: b.location.lat, lng: b.location.lng, at: Timestamp.now() };
  await ref.update(update);

  if (b.status === 'delivered' && d.orderId) {
    await db.collection(C.orders).doc(d.orderId).update({
      status: 'delivered', history: FieldValue.arrayUnion({ status: 'delivered', at: Timestamp.now(), by: 'efulogistix' }),
    });
    const buyer = d.members[0];
    await notify(buyer, { type: 'delivery', text: 'Your matola has arrived. Check the item, then tap "I got it, pay seller".', targetPath: `orders/${d.orderId}` });
  } else if (b.status !== d.status) {
    for (const m of d.members) await notify(m, { type: 'delivery', text: `Matola: ${String(b.status).replace('_', ' ')}`, targetPath: ref.path });
  }
  logger.info('Delivery update', { deliveryId: b.deliveryId, status: b.status });
  res.status(200).send('ok');
});
