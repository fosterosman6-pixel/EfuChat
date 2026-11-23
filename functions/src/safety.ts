import { getAuth } from 'firebase-admin/auth';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db, FieldValue, getConfig, logAdmin, notify, REGION, requireRole, text, Timestamp, uidOf } from './common.js';
import { C, Role } from './schema.js';

const at = { region: REGION };
const REASONS = ['scam', 'spam', 'violence', 'nudity', 'hate', 'insult', 'fake_item', 'child_safety', 'other'] as const;
const URGENT = new Set(['scam', 'violence', 'child_safety', 'nudity']);
const TYPES = { post: 'posts', reel: 'posts', comment: 'posts', listing: 'listings', user: 'users', channel: 'channels', story: 'stories' } as const;

/**
 * Report a post, reel, comment, item, person, channel or story.
 * One report per person per target; repeat reports from many people raise the count.
 */
export const reportContent = onCall(at, async (req) => {
  const uid = uidOf(req);
  const type = req.data?.type as keyof typeof TYPES;
  const path = text(req.data?.path, 'path', 200);
  const reason = req.data?.reason as (typeof REASONS)[number];
  if (!(type in TYPES) || !path.startsWith(`${TYPES[type]}/`)) throw new HttpsError('invalid-argument', 'Unknown target.');
  if (!REASONS.includes(reason)) throw new HttpsError('invalid-argument', 'Unknown reason.');

  const target = await db.doc(path).get();
  if (!target.exists) throw new HttpsError('not-found', 'It has already been removed.');
  const ownerUid = (target.get('uid') ?? target.get('sellerUid') ?? target.get('ownerUid') ?? target.id) as string;

  const { rules } = await getConfig();
  const id = path.replace(/\//g, '__'); // one report document per target
  const ref = db.collection(C.reports).doc(id);
  const count = await db.runTransaction(async (t) => {
    const r = await t.get(ref);
    const reporters: string[] = r.get('reporters') ?? [];
    if (reporters.includes(uid)) return reporters.length;
    const urgent = URGENT.has(reason) || r.get('urgent') === true;
    if (!r.exists) {
      t.create(ref, {
        target: { type, path, ownerUid }, reasons: { [reason]: 1 }, reporters: [uid], count: 1, urgent,
        status: 'open', createdAt: Timestamp.now(), updatedAt: Timestamp.now(),
      });
    } else {
      t.update(ref, {
        [`reasons.${reason}`]: FieldValue.increment(1), reporters: FieldValue.arrayUnion(uid), count: FieldValue.increment(1),
        urgent, status: 'open', updatedAt: Timestamp.now(),
      });
    }
    return reporters.length + 1;
  });

  // Hide public posts while they wait for review once enough people report them.
  if (count >= rules.autoHideAfterReports && (type === 'post' || type === 'reel')) await db.doc(path).update({ status: 'hidden' });
  return { ok: true };
});

/** Moderator decision on a report. */
export const decideReport = onCall(at, async (req) => {
  const staff = uidOf(req);
  const role = requireRole(req, ['owner', 'moderator']);
  const ref = db.collection(C.reports).doc(text(req.data?.reportId, 'reportId', 300));
  const decision = req.data?.decision;
  if (!['kept', 'removed', 'warned', 'banned'].includes(decision)) throw new HttpsError('invalid-argument', 'Unknown decision.');
  const r = await ref.get();
  if (!r.exists) throw new HttpsError('not-found', 'Report not found.');
  const { path, ownerUid, type } = r.get('target');

  if (decision === 'kept' && (type === 'post' || type === 'reel')) await db.doc(path).update({ status: 'live' });
  if (decision === 'removed' || decision === 'banned') {
    if (type === 'user') {
      // handled below
    } else if (type === 'story') await db.doc(path).delete();
    else await db.doc(path).update({ status: 'removed' });
  }
  if (decision === 'warned') {
    await notify(ownerUid, { type: 'system', text: 'Something you posted broke the EfuChat community rules. Next time it may be removed.' });
  }
  if (decision === 'banned') {
    await db.collection(C.users).doc(ownerUid).update({ status: 'banned' });
    await getAuth().updateUser(ownerUid, { disabled: true });
    await getAuth().revokeRefreshTokens(ownerUid);
  }
  await ref.update({ status: decision, decidedBy: staff, note: typeof req.data?.note === 'string' ? req.data.note.slice(0, 500) : null, updatedAt: Timestamp.now() });
  await logAdmin(staff, role, `report:${decision}`, path);
  return { ok: true };
});

/** Suspend or restore an account (Admin > Users). */
export const setUserStatus = onCall(at, async (req) => {
  const staff = uidOf(req);
  const role = requireRole(req, ['owner', 'moderator']);
  const uid = text(req.data?.uid, 'uid', 128);
  const status = req.data?.status;
  if (!['active', 'under_review', 'suspended', 'banned'].includes(status)) throw new HttpsError('invalid-argument', 'Unknown status.');
  await db.collection(C.users).doc(uid).update({ status });
  await getAuth().updateUser(uid, { disabled: status === 'banned' });
  if (status === 'banned' || status === 'suspended') await getAuth().revokeRefreshTokens(uid);
  await logAdmin(staff, role, `user:${status}`, `users/${uid}`);
  return { ok: true };
});

/** Owner only: give someone an admin role, or remove it (role: null). */
export const setStaffRole = onCall(at, async (req) => {
  const staff = uidOf(req);
  requireRole(req, ['owner']);
  const uid = text(req.data?.uid, 'uid', 128);
  const role = req.data?.role as Role | null;
  if (role !== null && !['owner', 'moderator', 'finance', 'support'].includes(role)) throw new HttpsError('invalid-argument', 'Unknown role.');
  if (uid === staff && role !== 'owner') throw new HttpsError('failed-precondition', 'Ask another owner to change your own role.');
  await getAuth().setCustomUserClaims(uid, role ? { role } : {});
  await logAdmin(staff, 'owner', `role:${role ?? 'none'}`, `users/${uid}`);
  return { ok: true }; // the person must sign in again (or refresh their token) to see the change
});
