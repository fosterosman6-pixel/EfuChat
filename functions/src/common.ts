import { initializeApp, getApps } from 'firebase-admin/app';
import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore';
import { CallableRequest, HttpsError } from 'firebase-functions/v2/https';
import { C, DEFAULT_FEES, DEFAULT_PRICING, DEFAULT_RULES, Fees, Pricing, AppRules, Role } from './schema.js';

if (!getApps().length) initializeApp();
export const db = getFirestore();
export { FieldValue, Timestamp };

export const REGION = 'europe-west1'; // closest Firebase region to Malawi with all products

/** The caller's uid, or an error if they are not signed in. */
export function uidOf(req: CallableRequest): string {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first.');
  return req.auth.uid;
}

export function roleOf(req: CallableRequest): Role | null {
  const r = req.auth?.token.role;
  return r === 'owner' || r === 'moderator' || r === 'finance' || r === 'support' ? r : null;
}

export function requireRole(req: CallableRequest, allowed: Role[]): Role {
  const r = roleOf(req);
  if (!r || !allowed.includes(r)) throw new HttpsError('permission-denied', 'Your admin role cannot do this.');
  return r;
}

/** Makes sure the caller's account is active (not suspended or banned). */
export async function requireActive(uid: string) {
  const u = await db.collection(C.users).doc(uid).get();
  if (!u.exists) throw new HttpsError('failed-precondition', 'Set up your profile first.');
  if (u.get('status') !== 'active') throw new HttpsError('permission-denied', 'Your account is not active.');
  return u;
}

export function int(v: unknown, name: string, min = 1, max = 50_000_000): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) {
    throw new HttpsError('invalid-argument', `${name} must be a whole number between ${min} and ${max}.`);
  }
  return v;
}

export function text(v: unknown, name: string, max: number, min = 1): string {
  if (typeof v !== 'string' || v.trim().length < min || v.length > max) {
    throw new HttpsError('invalid-argument', `${name} must be ${min} to ${max} characters.`);
  }
  return v.trim();
}

export async function getConfig() {
  const [p, f, r] = await Promise.all(['pricing', 'fees', 'rules'].map((d) => db.collection(C.config).doc(d).get()));
  return {
    pricing: { ...DEFAULT_PRICING, ...(p.data() as Partial<Pricing> | undefined) },
    fees: { ...DEFAULT_FEES, ...(f.data() as Partial<Fees> | undefined) },
    rules: { ...DEFAULT_RULES, ...(r.data() as Partial<AppRules> | undefined) },
  };
}

export function notify(
  uid: string,
  n: { type: string; text: string; actorUid?: string; actorName?: string; targetPath?: string; amount?: number },
) {
  return db.collection(C.notifications(uid)).add({ ...n, read: false, createdAt: FieldValue.serverTimestamp() });
}

export function logAdmin(by: string, role: Role, action: string, target: string, note?: string) {
  return db.collection(C.adminLog).add({ by, role, action, target, note: note ?? null, at: FieldValue.serverTimestamp() });
}

/** Adds to today's dashboard numbers (stats/yyyy-mm-dd), Malawi time. */
export function bumpStats(fields: Partial<Record<'signups' | 'messages' | 'posts' | 'orders' | 'earnedMWK' | 'movedMWK', number>>) {
  const day = new Date(Date.now() + 2 * 3600_000).toISOString().slice(0, 10);
  const inc: Record<string, FieldValue> = {};
  for (const [k, v] of Object.entries(fields)) if (v) inc[k] = FieldValue.increment(v);
  return db.collection(C.stats).doc(day).set(inc, { merge: true });
}
