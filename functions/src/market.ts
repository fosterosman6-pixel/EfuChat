import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { bumpStats, db, FieldValue, getConfig, int, logAdmin, notify, REGION, requireActive, requireRole, text, Timestamp, uidOf } from './common.js';
import { ledgerEntry, moneySecrets, startCollection, startPayout, walletOf } from './payments.js';
import { C, Delivery, Dispute, feeFor, Order, OrderStatus } from './schema.js';

const opts = { region: REGION, secrets: moneySecrets };
const DEFAULT_FARE = 3500; // MWK, until fares come from EfuLogistix
const AUTO_COMPLETE_DAYS = 3;

function historyItem(status: OrderStatus, by: string) {
  return FieldValue.arrayUnion({ status, at: Timestamp.now(), by });
}

/** Buyer taps "Buy now". Creates the order and asks their network for the money. */
export const createOrder = onCall(opts, async (req) => {
  const buyer = uidOf(req);
  await requireActive(buyer);
  const listingId = text(req.data?.listingId, 'listingId', 64);
  const withDelivery = req.data?.withDelivery === true;
  const { fees } = await getConfig();

  const listing = await db.collection(C.listings).doc(listingId).get();
  if (!listing.exists || listing.get('status') !== 'live') throw new HttpsError('failed-precondition', 'This item is no longer for sale.');
  const seller = listing.get('sellerUid') as string;
  if (seller === buyer) throw new HttpsError('invalid-argument', 'You cannot buy your own item.');
  if (!listing.get('walletPayment')) throw new HttpsError('failed-precondition', 'This seller only takes cash. Message them.');
  if (withDelivery && !listing.get('matolaDelivery')) throw new HttpsError('failed-precondition', 'This seller does not offer matola delivery.');
  const { network } = await walletOf(buyer);
  await walletOf(seller); // seller must be able to receive the money

  const price = listing.get('priceMWK') as number;
  const deliveryMWK = withDelivery ? DEFAULT_FARE : 0;
  const order: Omit<Order, 'createdAt'> & { createdAt: FirebaseFirestore.FieldValue } = {
    listingId,
    buyerUid: buyer,
    sellerUid: seller,
    members: [buyer, seller],
    item: { title: listing.get('title'), photo: (listing.get('photos') as string[])[0] },
    priceMWK: price,
    deliveryMWK,
    feeMWK: feeFor(price, fees.marketPercent),
    totalMWK: price + deliveryMWK,
    network,
    status: 'awaiting_payment',
    history: [{ status: 'awaiting_payment', at: Timestamp.now(), by: buyer }],
    createdAt: FieldValue.serverTimestamp(),
  };
  const ref = await db.collection(C.orders).add(order);
  await bumpStats({ orders: 1 });
  const pay = await startCollection(buyer, 'order_payment', order.totalMWK, `orders/${ref.id}`);
  return { orderId: ref.id, ...pay };
});

/** Seller marks the order packed (and a matola is requested), or cancels before packing. */
export const updateOrder = onCall(opts, async (req) => {
  const uid = uidOf(req);
  const orderId = text(req.data?.orderId, 'orderId', 64);
  const action = req.data?.action;
  if (action !== 'packed' && action !== 'cancel') throw new HttpsError('invalid-argument', 'Unknown action.');
  const ref = db.collection(C.orders).doc(orderId);

  const result = await db.runTransaction(async (t) => {
    const o = (await t.get(ref)).data() as Order | undefined;
    if (!o || o.sellerUid !== uid) throw new HttpsError('permission-denied', 'Not your order.');
    if (action === 'cancel') {
      if (o.status !== 'paid') throw new HttpsError('failed-precondition', 'Only paid, unpacked orders can be cancelled.');
      t.update(ref, { status: 'refunded', history: historyItem('refunded', uid) });
      t.update(db.collection(C.listings).doc(o.listingId), { status: 'live' });
      t.set(db.collection(C.wallets).doc(o.sellerUid), { heldMWK: FieldValue.increment(-o.priceMWK), updatedAt: Timestamp.now() }, { merge: true });
      ledgerEntry(t, { kind: 'order_refund', fromUid: 'efuchat', toUid: o.buyerUid, members: o.members, amountMWK: o.totalMWK, feeMWK: 0, ref: `orders/${orderId}`, note: 'Seller cancelled' });
      return { o, refund: true, delivery: null as string | null };
    }
    if (o.status !== 'paid') throw new HttpsError('failed-precondition', 'This order is not waiting to be packed.');
    let deliveryId: string | null = null;
    if (o.deliveryMWK > 0) {
      const dRef = db.collection(C.deliveries).doc();
      deliveryId = dRef.id;
      const d: Omit<Delivery, 'createdAt' | 'updatedAt'> & { createdAt: Timestamp; updatedAt: Timestamp } = {
        source: 'market', orderId, requesterUid: o.sellerUid, members: o.members,
        pickup: req.data?.pickup ?? { label: 'Seller', lat: 0, lng: 0 },
        dropoff: req.data?.dropoff ?? { label: 'Buyer', lat: 0, lng: 0 },
        fareMWK: o.deliveryMWK, commissionMWK: 0, status: 'requested', createdAt: Timestamp.now(), updatedAt: Timestamp.now(),
      };
      t.create(dRef, d);
    }
    t.update(ref, { status: deliveryId ? 'on_the_way' : 'packed', deliveryId, history: historyItem(deliveryId ? 'on_the_way' : 'packed', uid) });
    return { o, refund: false, delivery: deliveryId };
  });

  if (result.refund) {
    await startPayout(result.o.buyerUid, 'order_refund', result.o.totalMWK, `orders/${orderId}`);
    await notify(result.o.buyerUid, { type: 'order', text: `The seller cancelled ${result.o.item.title}. Your money is coming back.`, targetPath: `orders/${orderId}` });
  } else {
    await notify(result.o.buyerUid, { type: 'order', text: `${result.o.item.title} is packed${result.delivery ? ' and a matola is on the way' : ''}.`, targetPath: `orders/${orderId}` });
  }
  return { ok: true, deliveryId: result.delivery };
});

/** Releases held money to the seller, less EfuChat's fee. Used by the buyer and the daily auto-complete. */
async function releaseOrder(orderId: string, by: string) {
  const { fees } = await getConfig();
  const ref = db.collection(C.orders).doc(orderId);
  const o = await db.runTransaction(async (t) => {
    const order = (await t.get(ref)).data() as Order | undefined;
    if (!order) throw new HttpsError('not-found', 'Order not found.');
    if (!['paid', 'packed', 'on_the_way', 'delivered'].includes(order.status)) throw new HttpsError('failed-precondition', 'This order cannot be completed now.');
    const sellerGets = order.priceMWK - order.feeMWK;
    const commission = order.deliveryMWK ? feeFor(order.deliveryMWK, fees.matolaPercent) : 0;
    t.update(ref, { status: 'completed', history: historyItem('completed', by) });
    t.set(db.collection(C.wallets).doc(order.sellerUid), {
      heldMWK: FieldValue.increment(-order.priceMWK), earnedMWK: FieldValue.increment(sellerGets), updatedAt: Timestamp.now(),
    }, { merge: true });
    t.update(db.collection(C.users).doc(order.sellerUid), { 'counts.sales': FieldValue.increment(1) });
    ledgerEntry(t, { kind: 'order_release', fromUid: 'efuchat', toUid: order.sellerUid, members: order.members, amountMWK: sellerGets, feeMWK: order.feeMWK, ref: `orders/${orderId}` });
    ledgerEntry(t, { kind: 'fee', fromUid: order.sellerUid, toUid: 'efuchat', members: [order.sellerUid], amountMWK: order.feeMWK, feeMWK: order.feeMWK, ref: `orders/${orderId}`, note: `Market fee ${fees.marketPercent}%` });
    if (order.deliveryMWK) {
      ledgerEntry(t, { kind: 'delivery', fromUid: 'efuchat', toUid: 'external', members: order.members, amountMWK: order.deliveryMWK - commission, feeMWK: commission, ref: order.deliveryId ? `deliveries/${order.deliveryId}` : `orders/${orderId}`, note: 'Paid to EfuLogistix' });
    }
    return { ...order, sellerGets, commission };
  });
  await bumpStats({ earnedMWK: o.feeMWK + o.commission });
  await startPayout(o.sellerUid, 'order_release', o.sellerGets, `orders/${orderId}`);
  await notify(o.sellerUid, { type: 'order', text: `MWK ${o.sellerGets.toLocaleString('en-US')} for ${o.item.title} is on its way to you.`, targetPath: `orders/${orderId}`, amount: o.sellerGets });
}

/** Buyer taps "I got it, pay seller". */
export const confirmDelivery = onCall(opts, async (req) => {
  const uid = uidOf(req);
  const orderId = text(req.data?.orderId, 'orderId', 64);
  const o = (await db.collection(C.orders).doc(orderId).get()).data() as Order | undefined;
  if (!o || o.buyerUid !== uid) throw new HttpsError('permission-denied', 'Not your order.');
  await releaseOrder(orderId, uid);
  return { ok: true };
});

/** Buyer reports a problem before confirming. Money stays held until staff decide. */
export const openDispute = onCall(opts, async (req) => {
  const uid = uidOf(req);
  const orderId = text(req.data?.orderId, 'orderId', 64);
  const reason = text(req.data?.reason, 'reason', 80);
  const statement = text(req.data?.statement, 'statement', 1000);
  const evidence = Array.isArray(req.data?.evidence) ? (req.data.evidence as unknown[]).filter((e): e is string => typeof e === 'string').slice(0, 6) : [];
  const oRef = db.collection(C.orders).doc(orderId);
  const dRef = db.collection(C.disputes).doc();
  const o = await db.runTransaction(async (t) => {
    const order = (await t.get(oRef)).data() as Order | undefined;
    if (!order || order.buyerUid !== uid) throw new HttpsError('permission-denied', 'Not your order.');
    if (!['paid', 'packed', 'on_the_way', 'delivered'].includes(order.status)) throw new HttpsError('failed-precondition', 'It is too late to open a dispute.');
    const d: Omit<Dispute, 'createdAt'> & { createdAt: Timestamp } = {
      orderId, members: order.members, openedBy: uid, reason, buyerStatement: statement, evidence, status: 'open', createdAt: Timestamp.now(),
    };
    t.create(dRef, d);
    t.update(oRef, { status: 'disputed', history: historyItem('disputed', uid) });
    return order;
  });
  await notify(o.sellerUid, { type: 'order', text: `The buyer reported a problem with ${o.item.title}. Tell your side.`, targetPath: `disputes/${dRef.id}` });
  return { disputeId: dRef.id };
});

export const answerDispute = onCall(opts, async (req) => {
  const uid = uidOf(req);
  const ref = db.collection(C.disputes).doc(text(req.data?.disputeId, 'disputeId', 64));
  const d = (await ref.get()).data() as Dispute | undefined;
  if (!d || d.members[1] !== uid || d.status !== 'open') throw new HttpsError('permission-denied', 'You cannot answer this dispute.');
  await ref.update({ sellerStatement: text(req.data?.statement, 'statement', 1000) });
  return { ok: true };
});

/** Staff decide a dispute: refund the buyer, pay the seller, or split. */
export const resolveDispute = onCall(opts, async (req) => {
  const staff = uidOf(req);
  const role = requireRole(req, ['owner', 'moderator', 'support', 'finance']);
  const decision = req.data?.decision;
  if (!['refund_buyer', 'pay_seller', 'split'].includes(decision)) throw new HttpsError('invalid-argument', 'Unknown decision.');
  const dRef = db.collection(C.disputes).doc(text(req.data?.disputeId, 'disputeId', 64));
  const d = (await dRef.get()).data() as Dispute | undefined;
  if (!d || d.status !== 'open') throw new HttpsError('failed-precondition', 'This dispute is already closed.');
  const oRef = db.collection(C.orders).doc(d.orderId);

  if (decision === 'pay_seller') {
    await oRef.update({ status: 'delivered' });
    await releaseOrder(d.orderId, staff);
  } else {
    const o = await db.runTransaction(async (t) => {
      const order = (await t.get(oRef)).data() as Order;
      const toBuyer = decision === 'refund_buyer' ? order.totalMWK : Math.floor(order.priceMWK / 2) + order.deliveryMWK;
      const toSeller = order.totalMWK - toBuyer;
      t.update(oRef, { status: 'refunded', history: historyItem('refunded', staff) });
      t.set(db.collection(C.wallets).doc(order.sellerUid), { heldMWK: FieldValue.increment(-order.priceMWK), earnedMWK: FieldValue.increment(toSeller), updatedAt: Timestamp.now() }, { merge: true });
      ledgerEntry(t, { kind: 'order_refund', fromUid: 'efuchat', toUid: order.buyerUid, members: order.members, amountMWK: toBuyer, feeMWK: 0, ref: `orders/${d.orderId}`, note: decision });
      if (toSeller > 0) ledgerEntry(t, { kind: 'order_release', fromUid: 'efuchat', toUid: order.sellerUid, members: order.members, amountMWK: toSeller, feeMWK: 0, ref: `orders/${d.orderId}`, note: 'split' });
      return { order, toBuyer, toSeller };
    });
    await startPayout(o.order.buyerUid, 'order_refund', o.toBuyer, `orders/${d.orderId}`);
    if (o.toSeller > 0) await startPayout(o.order.sellerUid, 'order_release', o.toSeller, `orders/${d.orderId}`);
  }
  await dRef.update({ status: decision, resolvedBy: staff, resolvedAt: Timestamp.now() });
  await logAdmin(staff, role, `dispute:${decision}`, dRef.path);
  for (const m of d.members) await notify(m, { type: 'order', text: 'EfuChat has decided your dispute. Open it to see the result.', targetPath: dRef.path });
  return { ok: true };
});

/** One review per completed order. */
export const reviewOrder = onCall({ region: REGION }, async (req) => {
  const uid = uidOf(req);
  const orderId = text(req.data?.orderId, 'orderId', 64);
  const stars = int(req.data?.stars, 'stars', 1, 5);
  const o = (await db.collection(C.orders).doc(orderId).get()).data() as Order | undefined;
  if (!o || o.buyerUid !== uid || o.status !== 'completed') throw new HttpsError('failed-precondition', 'You can review after the order is complete.');
  const rRef = db.collection(C.reviews).doc(orderId);
  const sRef = db.collection(C.users).doc(o.sellerUid);
  await db.runTransaction(async (t) => {
    const [r, s] = await Promise.all([t.get(rRef), t.get(sRef)]);
    if (r.exists) throw new HttpsError('already-exists', 'You already reviewed this order.');
    const old = (s.get('rating') as { avg: number; count: number } | undefined) ?? { avg: 0, count: 0 };
    const count = old.count + 1;
    t.create(rRef, { orderId, sellerUid: o.sellerUid, buyerUid: uid, stars, text: typeof req.data?.text === 'string' ? req.data.text.slice(0, 500) : null, createdAt: Timestamp.now() });
    t.update(sRef, { rating: { avg: Math.round(((old.avg * old.count + stars) / count) * 10) / 10, count } });
  });
  return { ok: true };
});

/** Every night: delivered orders nobody complained about are completed after 3 days. */
export const autoCompleteOrders = onSchedule({ region: REGION, schedule: '0 2 * * *', timeZone: 'Africa/Blantyre', secrets: moneySecrets }, async () => {
  const cutoff = Timestamp.fromMillis(Date.now() - AUTO_COMPLETE_DAYS * 86400_000);
  const due = await db.collection(C.orders).where('status', '==', 'delivered').where('createdAt', '<', cutoff).limit(200).get();
  for (const d of due.docs) await releaseOrder(d.id, 'efuchat').catch(() => undefined);
});
