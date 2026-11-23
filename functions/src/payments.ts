import { HttpsError, onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { bumpStats, db, FieldValue, notify, REGION, Timestamp } from './common.js';
import { collect, payout, verifyWebhook, WEBHOOK_SECRET, FAKE_PAYMENTS, AIRTEL_CLIENT_ID, AIRTEL_CLIENT_SECRET, TNM_API_KEY } from './mobileMoney.js';
import { C, LedgerEntry, Network, Payment } from './schema.js';

export const moneySecrets = [WEBHOOK_SECRET, AIRTEL_CLIENT_ID, AIRTEL_CLIENT_SECRET, TNM_API_KEY];
export { FAKE_PAYMENTS };

/** The person's linked mobile money wallet, or an error if there is none. */
export async function walletOf(uid: string): Promise<{ network: Network; msisdn: string }> {
  const p = await db.doc(`${C.userPrivate(uid)}/account`).get();
  const w = p.get('wallet') as { network: Network; msisdn: string } | undefined;
  if (!w) throw new HttpsError('failed-precondition', 'Link Airtel Money or TNM Mpamba in Me first.');
  return w;
}

export function ledgerEntry(t: FirebaseFirestore.Transaction, e: Omit<LedgerEntry, 'createdAt'>) {
  const ref = db.collection(C.ledger).doc();
  t.create(ref, { ...e, createdAt: FieldValue.serverTimestamp() });
  return ref.id;
}

/**
 * Asks the person's network to collect money (they approve with their PIN).
 * The effect (order paid, boost on, plan active...) happens in settlePayment,
 * when the network confirms.
 */
export async function startCollection(uid: string, purpose: Payment['purpose'], amountMWK: number, ref: string, feeMWK = 0) {
  const wallet = await walletOf(uid);
  const pay = db.collection(C.payments).doc();
  const doc: Payment = {
    uid,
    network: wallet.network,
    msisdn: wallet.msisdn,
    direction: 'collect',
    amountMWK,
    purpose,
    ref,
    feeMWK,
    status: 'pending',
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  };
  await pay.create(doc);
  const res = await collect({ paymentId: pay.id, network: wallet.network, msisdn: wallet.msisdn, amountMWK, reason: `EfuChat ${purpose}` });
  if (!res.accepted) {
    await pay.update({ status: 'failed', error: res.error ?? 'Rejected', updatedAt: Timestamp.now() });
    throw new HttpsError('unavailable', res.error ?? 'The payment could not start. Try again.');
  }
  await pay.update({ providerRef: res.providerRef ?? null, updatedAt: Timestamp.now() });
  if (res.settled) await settlePayment(pay.id, res.settled);
  return { paymentId: pay.id, status: res.settled ?? 'pending' };
}

/** Sends money out to someone's mobile money (seller payouts, tips, refunds). */
export async function startPayout(uid: string, purpose: Payment['purpose'], amountMWK: number, ref: string) {
  if (amountMWK <= 0) return null;
  const wallet = await walletOf(uid);
  const pay = db.collection(C.payments).doc();
  await pay.create({
    uid, network: wallet.network, msisdn: wallet.msisdn, direction: 'payout', amountMWK, purpose, ref,
    status: 'pending', createdAt: Timestamp.now(), updatedAt: Timestamp.now(),
  } satisfies Payment);
  const res = await payout({ paymentId: pay.id, network: wallet.network, msisdn: wallet.msisdn, amountMWK, reason: `EfuChat ${purpose}` });
  await pay.update({
    status: res.accepted ? (res.settled ?? 'pending') : 'failed',
    providerRef: res.providerRef ?? null,
    error: res.error ?? null,
    updatedAt: Timestamp.now(),
  });
  if (!res.accepted) logger.error('Payout failed, finance must retry', { paymentId: pay.id, error: res.error });
  return pay.id;
}

/** Applies a confirmed collection exactly once. */
export async function settlePayment(paymentId: string, outcome: 'success' | 'failed') {
  const payRef = db.collection(C.payments).doc(paymentId);
  const after = await db.runTransaction(async (t) => {
    // Firestore transactions must do every read before any write.
    const snap = await t.get(payRef);
    if (!snap.exists) throw new Error(`No payment ${paymentId}`);
    const p = snap.data() as Payment;
    if (p.status !== 'pending' || p.direction !== 'collect') return null; // already handled
    const [col, id] = p.ref.split('/');
    const target = outcome === 'success' ? (await t.get(db.collection(col).doc(id))).data() : undefined;
    let boostListing: FirebaseFirestore.DocumentSnapshot | null = null;
    if (p.purpose === 'boost' && target?.target?.type === 'listing') boostListing = await t.get(db.collection(C.listings).doc(target.target.id));

    t.update(payRef, { status: outcome, updatedAt: Timestamp.now() });
    if (outcome === 'failed') return { p, follow: null as null | (() => Promise<unknown>) };

    switch (p.purpose) {
      case 'order_payment': {
        const oRef = db.collection(C.orders).doc(id);
        const o = target;
        if (!o || o.status !== 'awaiting_payment') break;
        t.update(oRef, { status: 'paid', history: FieldValue.arrayUnion({ status: 'paid', at: Timestamp.now(), by: 'efuchat' }) });
        t.set(db.collection(C.wallets).doc(o.sellerUid), { heldMWK: FieldValue.increment(o.priceMWK), updatedAt: Timestamp.now() }, { merge: true });
        t.update(db.collection(C.listings).doc(o.listingId), { status: 'sold' });
        ledgerEntry(t, {
          kind: 'order_payment', fromUid: o.buyerUid, toUid: 'efuchat', members: [o.buyerUid, o.sellerUid],
          amountMWK: o.totalMWK, feeMWK: 0, ref: p.ref, network: p.network, paymentId, note: 'Held until delivery',
        });
        return { p, follow: () => notify(o.sellerUid, { type: 'order', text: `New order paid: ${o.item.title}. Pack it for the matola.`, targetPath: p.ref }) };
      }
      case 'boost': {
        const bRef = db.collection(C.boosts).doc(id);
        const b = target;
        if (!b) break;
        const ends = Timestamp.fromMillis(Date.now() + b.days * 86400_000);
        t.update(bRef, { status: 'running', startsAt: Timestamp.now(), endsAt: ends });
        if (boostListing?.exists) t.update(boostListing.ref, { boostedUntil: ends });
        ledgerEntry(t, { kind: 'boost', fromUid: p.uid, toUid: 'efuchat', members: [p.uid], amountMWK: p.amountMWK, feeMWK: p.amountMWK, ref: p.ref, network: p.network, paymentId });
        break;
      }
      case 'subscription': {
        const sRef = db.collection(C.subscriptions).doc(id);
        const s = target;
        if (!s) break;
        const days = s.period === 'week' ? 7 : s.period === 'year' ? 365 : 30;
        t.update(sRef, { status: 'active', renewsAt: Timestamp.fromMillis(Date.now() + days * 86400_000), updatedAt: Timestamp.now() });
        t.update(db.collection(C.users).doc(p.uid), s.plan === 'plus' ? { plus: true } : { plan: s.plan });
        ledgerEntry(t, { kind: 'subscription', fromUid: p.uid, toUid: 'efuchat', members: [p.uid], amountMWK: p.amountMWK, feeMWK: p.amountMWK, ref: p.ref, network: p.network, paymentId });
        break;
      }
      case 'tip': {
        // ref is posts/{id}; the tip goes to the post's author, less the tip fee.
        const postRef = db.collection(col).doc(id);
        const post = target;
        const fee = p.feeMWK ?? 0;
        if (!post) break;
        t.update(postRef, { 'counts.tips': FieldValue.increment(p.amountMWK) });
        t.set(db.collection(C.wallets).doc(post.uid), { earnedMWK: FieldValue.increment(p.amountMWK - fee), updatedAt: Timestamp.now() }, { merge: true });
        ledgerEntry(t, { kind: 'tip', fromUid: p.uid, toUid: post.uid, members: [p.uid, post.uid], amountMWK: p.amountMWK, feeMWK: fee, ref: p.ref, network: p.network, paymentId });
        return {
          p,
          follow: async () => {
            await startPayout(post.uid, 'tip', p.amountMWK - fee, p.ref);
            await notify(post.uid, { type: 'tip', text: `You got a tip of MWK ${(p.amountMWK - fee).toLocaleString('en-US')}`, actorUid: p.uid, targetPath: p.ref, amount: p.amountMWK - fee });
          },
        };
      }
      case 'ad': {
        t.update(db.collection(C.ads).doc(id), { paid: true });
        ledgerEntry(t, { kind: 'ad', fromUid: p.uid, toUid: 'efuchat', members: [p.uid], amountMWK: p.amountMWK, feeMWK: p.amountMWK, ref: p.ref, network: p.network, paymentId });
        break;
      }
      default:
        logger.warn('Payment with no handler', { paymentId, purpose: p.purpose });
    }
    return { p, follow: null };
  });

  if (after?.p && outcome === 'success') await bumpStats({ movedMWK: after.p.amountMWK });
  if (after?.follow) await after.follow();
}

/**
 * Airtel Money / TNM Mpamba call this when a payment finishes.
 * Body: { paymentId, status: 'success' | 'failed', providerRef }
 */
export const paymentsWebhook = onRequest({ region: REGION, secrets: [WEBHOOK_SECRET] }, async (req, res) => {
  if (req.method !== 'POST' || !verifyWebhook(req.get('x-efuchat-signature'))) {
    res.status(401).send('no');
    return;
  }
  const { paymentId, status } = req.body ?? {};
  if (typeof paymentId !== 'string' || (status !== 'success' && status !== 'failed')) {
    res.status(400).send('bad body');
    return;
  }
  try {
    await settlePayment(paymentId, status);
    res.status(200).send('ok');
  } catch (e) {
    logger.error('Webhook failed', e);
    res.status(500).send('error');
  }
});
