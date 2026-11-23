/**
 * Airtel Money and TNM Mpamba adapter.
 *
 * Both networks work the same way for EfuChat: we ask them to collect money
 * from a phone (the person approves with their PIN), and later they call our
 * webhook to say whether it worked. Payouts go the other way.
 *
 * The real API calls need merchant accounts and keys from Airtel and TNM.
 * Until those exist, set FAKE_PAYMENTS=true (emulator or testing only) and
 * every payment succeeds straight away.
 */
import { timingSafeEqual } from 'node:crypto';
import { defineSecret, defineString } from 'firebase-functions/params';
import type { Network } from './schema.js';

export const AIRTEL_CLIENT_ID = defineSecret('AIRTEL_CLIENT_ID');
export const AIRTEL_CLIENT_SECRET = defineSecret('AIRTEL_CLIENT_SECRET');
export const TNM_API_KEY = defineSecret('TNM_API_KEY');
export const WEBHOOK_SECRET = defineSecret('PAYMENTS_WEBHOOK_SECRET');
export const FAKE_PAYMENTS = defineString('FAKE_PAYMENTS', { default: 'false' });

export type MoneyRequest = { paymentId: string; network: Network; msisdn: string; amountMWK: number; reason: string };
export type MoneyResult = { accepted: boolean; providerRef?: string; error?: string; settled?: 'success' | 'failed' };

export async function collect(req: MoneyRequest): Promise<MoneyResult> {
  if (FAKE_PAYMENTS.value() === 'true') return { accepted: true, providerRef: `fake-${req.paymentId}`, settled: 'success' };
  // TODO: call Airtel Money "USSD push" collection or TNM Mpamba merchant collection here.
  return { accepted: false, error: `${req.network} payments are not connected yet.` };
}

export async function payout(req: MoneyRequest): Promise<MoneyResult> {
  if (FAKE_PAYMENTS.value() === 'true') return { accepted: true, providerRef: `fake-${req.paymentId}`, settled: 'success' };
  // TODO: call the Airtel Money / TNM Mpamba disbursement API here.
  return { accepted: false, error: `${req.network} payouts are not connected yet.` };
}

/** Checks the shared secret the networks send with each webhook call. */
export function verifyWebhook(headerValue: string | undefined) {
  const secret = WEBHOOK_SECRET.value();
  if (!secret || !headerValue) return false;
  const a = Buffer.from(secret);
  const b = Buffer.from(headerValue);
  return a.length === b.length && timingSafeEqual(a, b);
}
