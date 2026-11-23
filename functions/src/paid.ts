import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { db, FieldValue, getConfig, logAdmin, REGION, requireActive, requireRole, text, Timestamp, uidOf } from './common.js';
import { moneySecrets, startCollection } from './payments.js';
import { Boost, C, Subscription } from './schema.js';

const opts = { region: REGION, secrets: moneySecrets };

/** Boost a listing or post for 1, 3 or 7 days. It starts when the payment is confirmed. */
export const buyBoost = onCall(opts, async (req) => {
  const uid = uidOf(req);
  await requireActive(uid);
  const days = req.data?.days;
  if (days !== 1 && days !== 3 && days !== 7) throw new HttpsError('invalid-argument', 'Choose 1, 3 or 7 days.');
  const type = req.data?.type === 'post' ? 'post' : 'listing';
  const id = text(req.data?.id, 'id', 64);
  const target = await db.collection(type === 'post' ? C.posts : C.listings).doc(id).get();
  const owner = type === 'post' ? target.get('uid') : target.get('sellerUid');
  if (!target.exists || owner !== uid) throw new HttpsError('permission-denied', 'You can only boost your own items.');
  const { pricing } = await getConfig();
  const price = pricing.boost[days as 1 | 3 | 7];
  const ref = db.collection(C.boosts).doc();
  const boost: Boost = {
    uid, target: { type, id }, days, priceMWK: price,
    startsAt: Timestamp.now(), endsAt: Timestamp.now(), status: 'ended', views: 0, clicks: 0, // becomes 'running' when paid
  };
  await ref.create(boost);
  return { boostId: ref.id, ...(await startCollection(uid, 'boost', price, `boosts/${ref.id}`)) };
});

/** Shop, Pro or EfuChat Plus. The plan turns on when the payment is confirmed. */
export const subscribe = onCall(opts, async (req) => {
  const uid = uidOf(req);
  await requireActive(uid);
  const plan = req.data?.plan;
  const period = req.data?.period ?? 'month';
  if (!['shop', 'pro', 'plus'].includes(plan)) throw new HttpsError('invalid-argument', 'Unknown plan.');
  if (!['week', 'month', 'year'].includes(period) || (period === 'week' && plan !== 'plus')) throw new HttpsError('invalid-argument', 'Unknown period.');
  const { pricing } = await getConfig();
  const monthly = plan === 'shop' ? pricing.plans.shop : plan === 'pro' ? pricing.plans.pro : pricing.plans.plusMonth;
  const price = period === 'week' ? pricing.plans.plusWeek : period === 'year' ? monthly * 10 : monthly; // yearly: 2 months free
  const sub: Subscription = { plan, period, priceMWK: price, renewsAt: Timestamp.now(), status: 'expired', updatedAt: Timestamp.now() };
  await db.collection(C.subscriptions).doc(uid).set(sub);
  return startCollection(uid, 'subscription', price, `subscriptions/${uid}`);
});

export const cancelSubscription = onCall({ region: REGION }, async (req) => {
  const uid = uidOf(req);
  await db.collection(C.subscriptions).doc(uid).update({ status: 'cancelled', updatedAt: Timestamp.now() });
  return { ok: true }; // it stays on until renewsAt, then the nightly job turns it off
});

/** Staff approve a sponsored post; the business then pays its budget. */
export const reviewAd = onCall(opts, async (req) => {
  const staff = uidOf(req);
  const role = requireRole(req, ['owner', 'moderator']);
  const ref = db.collection(C.ads).doc(text(req.data?.adId, 'adId', 64));
  const decision = req.data?.decision;
  if (!['approve', 'changes', 'reject'].includes(decision)) throw new HttpsError('invalid-argument', 'Unknown decision.');
  const ad = await ref.get();
  if (!ad.exists || ad.get('status') !== 'to_approve') throw new HttpsError('failed-precondition', 'This ad is not waiting for review.');
  const status = decision === 'approve' ? 'running' : decision === 'changes' ? 'changes_requested' : 'rejected';
  await ref.update({ status, reviewedBy: staff });
  if (ad.get('postId') && status === 'running') await db.collection(C.posts).doc(ad.get('postId')).update({ sponsored: { adId: ref.id } });
  await logAdmin(staff, role, `ad:${decision}`, ref.path);
  if (status === 'running') await startCollection(ad.get('uid'), 'ad', ad.get('budgetMWK'), ref.path).catch(() => undefined);
  return { ok: true };
});

/** Every night: end finished boosts and ads, and turn off expired plans. */
export const expirePaidFeatures = onSchedule({ region: REGION, schedule: '30 0 * * *', timeZone: 'Africa/Blantyre' }, async () => {
  const now = Timestamp.now();
  const boosts = await db.collection(C.boosts).where('status', '==', 'running').where('endsAt', '<', now).get();
  const ads = await db.collection(C.ads).where('status', '==', 'running').where('endsAt', '<', now).get();
  const subs = await db.collection(C.subscriptions).where('renewsAt', '<', now).where('status', 'in', ['active', 'cancelled']).get();
  const batch = db.batch();
  boosts.docs.forEach((d) => batch.update(d.ref, { status: 'ended' }));
  ads.docs.forEach((d) => {
    batch.update(d.ref, { status: 'ended' });
    if (d.get('postId')) batch.update(db.collection(C.posts).doc(d.get('postId')), { sponsored: FieldValue.delete() });
  });
  subs.docs.forEach((d) => {
    // Renewal: a real system would collect again here; for now plans simply end.
    batch.update(d.ref, { status: 'expired', updatedAt: now });
    batch.update(db.collection(C.users).doc(d.id), d.get('plan') === 'plus' ? { plus: false } : { plan: 'free' });
  });
  await batch.commit();
});
