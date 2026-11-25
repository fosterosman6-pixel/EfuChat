// EfuChat call-token server (Cloudflare Worker).
// POST /token  { channel }  with  Authorization: Bearer <Firebase ID token>
// Replies { token, appId, expiresIn } for Agora RTC, uid 0, publisher.
// POST /notify { kind: 'message' | 'call', id }  (same auth) sends push notifications through FCM.
// Secrets/vars: AGORA_APP_ID, AGORA_APP_CERT (secret), FIREBASE_PROJECT_ID,
//   GCP_PROVIDER (projects/N/locations/global/workloadIdentityPools/P/providers/X), PUSH_SA (service account email).
// KV binding KEYS holds this Worker's own signing key. Google trusts that key through Workload Identity
// Federation (issuer = this Worker's URL, keys at /jwks), so no Google key file is needed.

const TOKEN_SECONDS = 3600;
const JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
let jwks = null;
let jwksAt = 0;

const enc = new TextEncoder();
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' } });

function b64urlToBytes(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

/** Checks a Firebase Auth ID token and returns its uid, or throws. */
async function verifyFirebase(idToken, projectId) {
  const [h, p, sig] = idToken.split('.');
  if (!sig) throw new Error('bad token');
  const header = JSON.parse(new TextDecoder().decode(b64urlToBytes(h)));
  const claims = JSON.parse(new TextDecoder().decode(b64urlToBytes(p)));
  const now = Math.floor(Date.now() / 1000);
  if (header.alg !== 'RS256') throw new Error('bad alg');
  if (claims.aud !== projectId || claims.iss !== `https://securetoken.google.com/${projectId}`) throw new Error('wrong project');
  if (!(claims.exp > now) || !(claims.iat <= now + 300) || !claims.sub) throw new Error('expired');
  if (!jwks || Date.now() - jwksAt > 3600_000) {
    jwks = (await (await fetch(JWKS_URL)).json()).keys;
    jwksAt = Date.now();
  }
  const jwk = jwks.find((k) => k.kid === header.kid);
  if (!jwk) throw new Error('unknown key');
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlToBytes(sig), enc.encode(`${h}.${p}`));
  if (!ok) throw new Error('bad signature');
  return claims.sub;
}

// ---------- Agora AccessToken2 ("007"), RTC service ----------
class Buf {
  constructor() { this.parts = []; }
  u16(v) { const b = new Uint8Array(2); new DataView(b.buffer).setUint16(0, v, true); this.parts.push(b); return this; }
  u32(v) { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, v >>> 0, true); this.parts.push(b); return this; }
  bytes(b) { this.u16(b.length); this.parts.push(b); return this; }
  str(s) { return this.bytes(enc.encode(s)); }
  map32(m) { const keys = Object.keys(m).map(Number).sort((a, b) => a - b); this.u16(keys.length); for (const k of keys) this.u16(k).u32(m[k]); return this; }
  pack() { const n = this.parts.reduce((a, p) => a + p.length, 0); const out = new Uint8Array(n); let o = 0; for (const p of this.parts) { out.set(p, o); o += p.length; } return out; }
}
const concat = (...a) => new Buf().parts.concat(a) && (() => { const b = new Buf(); b.parts = a; return b.pack(); })();

async function hmac(key, msg) {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, msg));
}

async function zlib(bytes) {
  const s = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}

function b64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Same layout as Agora's RtcTokenBuilder2.buildTokenWithUid (role publisher). */
export async function rtcToken(appId, appCert, channel, uid, expire, issueTs = Math.floor(Date.now() / 1000), salt = 1 + Math.floor(Math.random() * 99999999)) {
  const priv = { 1: expire, 2: expire, 3: expire, 4: expire }; // join, publish audio, video, data
  const service = new Buf().u16(1).map32(priv).str(channel).str(uid === 0 ? '' : String(uid)).pack();
  const info = concat(new Buf().str(appId).u32(issueTs).u32(expire).u32(salt).u16(1).pack(), service);
  let signing = await hmac(new Buf().u32(issueTs).pack(), enc.encode(appCert));
  signing = await hmac(new Buf().u32(salt).pack(), signing);
  const signature = await hmac(signing, info);
  return '007' + b64(await zlib(concat(new Buf().bytes(signature).pack(), info)));
}


// ---------- keyless Google access (Workload Identity Federation) ----------
const ISSUER_SUB = 'efuchat-worker';
const b64url = (bytes) => b64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64urlJson = (o) => b64url(enc.encode(JSON.stringify(o)));

async function signingKey(env) {
  const saved = await env.KEYS.get('signing-key', 'json');
  if (saved) return saved;
  const pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const kid = crypto.randomUUID();
  const key = { kid, privateJwk: await crypto.subtle.exportKey('jwk', pair.privateKey), publicJwk: await crypto.subtle.exportKey('jwk', pair.publicKey) };
  await env.KEYS.put('signing-key', JSON.stringify(key));
  return key;
}

async function publicJwks(env) {
  const k = await signingKey(env);
  const { kty, n, e } = k.publicJwk;
  return { keys: [{ kty, n, e, kid: k.kid, alg: 'RS256', use: 'sig' }] };
}

let google = { token: '', exp: 0 };
async function googleToken(env, origin) {
  if (google.token && Date.now() < google.exp - 60_000) return google.token;
  const k = await signingKey(env);
  const now = Math.floor(Date.now() / 1000);
  const audience = `//iam.googleapis.com/${env.GCP_PROVIDER}`;
  const head = b64urlJson({ alg: 'RS256', typ: 'JWT', kid: k.kid });
  const body = b64urlJson({ iss: origin, sub: ISSUER_SUB, aud: audience, iat: now, exp: now + 600 });
  const priv = await crypto.subtle.importKey('jwk', k.privateJwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', priv, enc.encode(`${head}.${body}`)));
  const sts = await fetch('https://sts.googleapis.com/v1/token', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      grantType: 'urn:ietf:params:oauth:grant-type:token-exchange',
      audience,
      scope: 'https://www.googleapis.com/auth/cloud-platform',
      requestedTokenType: 'urn:ietf:params:oauth:token-type:access_token',
      subjectToken: `${head}.${body}.${b64url(sig)}`,
      subjectTokenType: 'urn:ietf:params:oauth:token-type:jwt',
    }),
  });
  const fed = await sts.json();
  if (!sts.ok) throw new Error(`sts: ${JSON.stringify(fed)}`);
  const sa = await fetch(`https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${env.PUSH_SA}:generateAccessToken`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${fed.access_token}` },
    body: JSON.stringify({ scope: ['https://www.googleapis.com/auth/cloud-platform'] }),
  });
  const at = await sa.json();
  if (!sa.ok) throw new Error(`impersonate: ${JSON.stringify(at)}`);
  google = { token: at.accessToken, exp: Date.parse(at.expireTime) };
  return google.token;
}

// ---------- Firestore REST (reads only) ----------
function fsValue(v) {
  if (!v) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('timestampValue' in v) return Date.parse(v.timestampValue);
  if ('nullValue' in v) return null;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fsValue);
  if ('mapValue' in v) return fsFields(v.mapValue.fields || {});
  return null;
}
const fsFields = (f) => Object.fromEntries(Object.entries(f).map(([k, v]) => [k, fsValue(v)]));
async function fsGet(env, token, path) {
  const r = await fetch(`https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/${path}`, { headers: { authorization: `Bearer ${token}` } });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`firestore ${r.status}`);
  return fsFields((await r.json()).fields || {});
}

async function sendPush(env, token, to, msg) {
  const doc = await fsGet(env, token, `pushTokens/${to}`);
  const tokens = Array.isArray(doc?.tokens) ? doc.tokens.slice(-5) : [];
  console.log('push', to, 'tokens', tokens.length);
  await Promise.all(
    tokens.map((t) =>
      fetch(`https://fcm.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/messages:send`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ message: { ...msg, token: t } }),
      })
        .then(async (r) => {
          if (!r.ok) console.error('fcm', r.status, (await r.text()).slice(0, 300));
        })
        .catch((e) => console.error('fcm fetch', String(e))),
    ),
  );
  return tokens.length;
}

const first = (n) => String(n || 'Someone').split(' ')[0];

/** Signs the account out on every phone: old sign-ins stop working, and pushes stop. */
async function signOutAll(env, origin, uid) {
  const token = await googleToken(env, origin);
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/accounts:update`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ localId: uid, validSince: String(Math.floor(Date.now() / 1000)) }),
  });
  if (!r.ok) throw new Error(`revoke ${r.status}`);
  await fetch(`https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/pushTokens/${uid}`, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${token}` },
  }).catch(() => null);
}

async function notify(env, origin, uid, kind, id) {
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(id)) return { status: 400, body: { error: 'bad id' } };
  const token = await googleToken(env, origin);
  if (kind === 'message') {
    const chat = await fsGet(env, token, `chats/${id}`);
    if (!chat || !Array.isArray(chat.members) || !chat.members.includes(uid)) return { status: 403, body: { error: 'not in chat' } };
    const last = chat.lastMessage || {};
    if (last.from !== uid) return { status: 200, body: { sent: 0 } };
    const names = chat.names || {};
    const group = chat.type === 'group';
    const title = group ? chat.groupName || 'Group' : names[uid] || 'EfuChat';
    const text = String(last.text || 'New message').slice(0, 180);
    const body = group ? `${first(names[uid])}: ${text}` : text;
    let sent = 0;
    const muted = chat.muted || {};
    for (const to of chat.members.filter((m) => m !== uid && !muted[m])) {
      sent += await sendPush(env, token, to, {
        notification: { title, body },
        data: { kind: 'message', chatId: id },
        android: { priority: 'HIGH', notification: { channel_id: 'messages', tag: id, sound: 'default', icon: 'notification_icon', color: '#0A2253' } },
      });
    }
    return { status: 200, body: { sent } };
  }
  if (kind === 'call') {
    const call = await fsGet(env, token, `calls/${id}`);
    if (!call || call.from !== uid) return { status: 403, body: { error: 'not your call' } };
    if (call.status !== 'ringing' || (call.createdAt && Date.now() - call.createdAt > 60_000)) return { status: 200, body: { sent: 0 } };
    // Data only: the app's background task shows a full-screen call that keeps ringing.
    const sent = await sendPush(env, token, call.to, {
      data: { kind: 'call', callId: id, fromName: String(call.fromName || 'EfuChat'), callKind: call.kind === 'video' ? 'video' : 'voice' },
      android: { priority: 'HIGH', ttl: '45s' },
    });
    return { status: 200, body: { sent } };
  }
  if (kind === 'call_end') {
    const call = await fsGet(env, token, `calls/${id}`);
    if (!call || call.from !== uid) return { status: 403, body: { error: 'not your call' } };
    if (call.status === 'ringing') return { status: 200, body: { sent: 0 } };
    const sent = await sendPush(env, token, call.to, { data: { kind: 'call_end', callId: id }, android: { priority: 'HIGH', ttl: '60s' } });
    return { status: 200, body: { sent } };
  }
  return { status: 400, body: { error: 'bad kind' } };
}


// ---------- Send money (PayChangu, Airtel Money / TNM Mpamba) ----------
// No balance is held: the sender's mobile money is charged, and as soon as that succeeds the same
// amount is paid out to the receiver's mobile money number. Needs the PAYCHANGU_SECRET secret.
const PC = 'https://api.paychangu.com';
const MAX_SEND = 500000; // MWK per transfer
function toFs(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toFs) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toFs(x)])) } };
}
async function fsPatch(env, token, path, data) {
  const mask = Object.keys(data).map((k) => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join('&');
  const r = await fetch(`https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/${path}?${mask}`, {
    method: 'PATCH',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, toFs(v)])) }),
  });
  if (!r.ok) throw new Error(`firestore write ${r.status} ${(await r.text()).slice(0, 200)}`);
}
async function pc(env, path, init = {}) {
  const r = await fetch(`${PC}${path}`, {
    ...init,
    headers: { accept: 'application/json', 'content-type': 'application/json', authorization: `Bearer ${env.PAYCHANGU_SECRET}`, ...(init.headers || {}) },
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) console.error('paychangu', path, r.status, JSON.stringify(body).slice(0, 300));
  return { ok: r.ok, status: r.status, body };
}
async function operatorId(env, kind) {
  const cached = await env.KEYS.get(`pc-op-${kind}`);
  if (cached) return cached;
  const { body } = await pc(env, '/mobile-money');
  const list = Array.isArray(body?.data) ? body.data : [];
  const want = kind === 'airtel' ? /airtel/i : /tnm|mpamba/i;
  const op = list.find((o) => want.test(o.name || ''));
  if (!op) throw new Error(`operator ${kind} not found`);
  await env.KEYS.put(`pc-op-${kind}`, op.ref_id, { expirationTtl: 86400 });
  return op.ref_id;
}
const localNumber = (m) => {
  const d = String(m || '').replace(/\D/g, '');
  return d.startsWith('265') ? `0${d.slice(3)}` : d.startsWith('0') ? d : `0${d}`;
};
const opOf = (m) => (/^0(99|98|97|96|95)/.test(localNumber(m)) ? 'airtel' : /^0(88|89|87|86|85)/.test(localNumber(m)) ? 'tnm' : null);

async function payStart(env, origin, uid, body) {
  if (!env.PAYCHANGU_SECRET) return { status: 503, body: { error: 'not_ready', message: 'Send money is being set up.' } };
  const amount = Math.round(Number(body.amount));
  const to = String(body.to || '');
  const from = localNumber(body.fromMobile);
  if (!(amount >= 100 && amount <= MAX_SEND)) return { status: 400, body: { error: 'amount', message: `Send between MK 100 and MK ${MAX_SEND.toLocaleString()}.` } };
  if (!to || to === uid) return { status: 400, body: { error: 'to' } };
  const fromOp = opOf(from);
  if (!fromOp || from.length !== 10) return { status: 400, body: { error: 'from', message: 'Use an Airtel Money (099…) or TNM Mpamba (088…) number.' } };
  const token = await googleToken(env, origin);
  const [sender, receiver, payout] = await Promise.all([fsGet(env, token, `users/${uid}`), fsGet(env, token, `users/${to}`), fsGet(env, token, `payouts/${to}`)]);
  if (!sender || sender.status !== 'active' || !receiver) return { status: 403, body: { error: 'not allowed' } };
  if (!payout?.mobile || !opOf(payout.mobile)) return { status: 409, body: { error: 'no_receiver_number', message: `${receiver.name || 'They'} hasn't added a mobile money number yet.` } };
  const id = `EC-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`.toUpperCase();
  await fsPatch(env, token, `payments/${id}`, {
    from: uid, to, fromName: sender.name || '', toName: receiver.name || '', amount, currency: 'MWK',
    fromMobile: `${from.slice(0, 3)}••••${from.slice(-3)}`, fromOperator: fromOp, toOperator: opOf(payout.mobile),
    note: String(body.note || '').slice(0, 120), chatId: String(body.chatId || '').slice(0, 200),
    members: [uid, to], status: 'charging', createdAt: new Date(), updatedAt: new Date(),
  });
  const charge = await pc(env, '/mobile-money/payments/initialize', {
    method: 'POST',
    body: JSON.stringify({ mobile: from, mobile_money_operator_ref_id: await operatorId(env, fromOp), amount: String(amount), charge_id: id, first_name: (sender.name || '').split(' ')[0] || undefined }),
  });
  if (!charge.ok) {
    await fsPatch(env, token, `payments/${id}`, { status: 'failed', updatedAt: new Date() });
    return { status: 502, body: { error: 'charge_failed', message: charge.body?.message || 'Mobile money did not accept the request.', id } };
  }
  return { status: 200, body: { id, status: 'charging' } };
}

/** Checks the charge; once it succeeded, pays the receiver (once). Safe to call again and again. */
async function payStatus(env, origin, uid, id) {
  if (!env.PAYCHANGU_SECRET) return { status: 503, body: { error: 'not_ready' } };
  const token = await googleToken(env, origin);
  const p = await fsGet(env, token, `payments/${id}`);
  if (!p || !(p.members || []).includes(uid)) return { status: 404, body: { error: 'not found' } };
  if (['paid', 'failed', 'payout_failed'].includes(p.status)) return { status: 200, body: { id, status: p.status } };
  if (p.status === 'charging') {
    const v = await pc(env, `/mobile-money/payments/${encodeURIComponent(id)}/verify`);
    const st = String(v.body?.data?.status || v.body?.status || '').toLowerCase();
    if (['failed', 'cancelled', 'canceled', 'declined', 'expired'].includes(st)) {
      await fsPatch(env, token, `payments/${id}`, { status: 'failed', updatedAt: new Date() });
      return { status: 200, body: { id, status: 'failed' } };
    }
    if (st !== 'success' && st !== 'successful') return { status: 200, body: { id, status: 'charging' } };
    // Charged: claim the payout step so it only ever runs once.
    if (await env.KEYS.get(`pay-out-${id}`)) return { status: 200, body: { id, status: 'paying' } };
    await env.KEYS.put(`pay-out-${id}`, '1', { expirationTtl: 30 * 86400 });
    await fsPatch(env, token, `payments/${id}`, { status: 'paying', updatedAt: new Date() });
    const payout = await fsGet(env, token, `payouts/${p.to}`);
    const out = await pc(env, '/mobile-money/payouts/initialize', {
      method: 'POST',
      body: JSON.stringify({ mobile: localNumber(payout?.mobile), mobile_money_operator_ref_id: await operatorId(env, opOf(payout?.mobile)), amount: String(p.amount), charge_id: `${id}-OUT` }),
    });
    const done = out.ok ? 'paid' : 'payout_failed';
    await fsPatch(env, token, `payments/${id}`, { status: done, updatedAt: new Date() });
    if (done === 'paid') await sendPush(env, token, p.to, { notification: { title: `${p.fromName || 'Someone'} sent you MK ${Number(p.amount).toLocaleString()}`, body: 'It is on its way to your mobile money.' }, android: { priority: 'HIGH', notification: { channel_id: 'messages' } } }).catch(() => {});
    return { status: 200, body: { id, status: done } };
  }
  return { status: 200, body: { id, status: p.status } };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = url.origin;
    if (request.method === 'OPTIONS') return new Response(null, { headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type', 'access-control-allow-methods': 'POST' } });
    // OpenID discovery, so Google can check the tokens this Worker signs for itself.
    if (request.method === 'GET' && url.pathname === '/.well-known/openid-configuration')
      return json({ issuer: origin, jwks_uri: `${origin}/jwks`, id_token_signing_alg_values_supported: ['RS256'], response_types_supported: ['id_token'], subject_types_supported: ['public'] });
    if (request.method === 'GET' && url.pathname === '/jwks') return json(await publicJwks(env));
    if (request.method !== 'POST' || !['/token', '/notify', '/signout-all', '/pay/start', '/pay/status'].includes(url.pathname)) return json({ error: 'not found' }, 404);
    let uid;
    try {
      const auth = request.headers.get('authorization') || '';
      uid = await verifyFirebase(auth.replace(/^Bearer\s+/i, ''), env.FIREBASE_PROJECT_ID);
    } catch (e) {
      return json({ error: 'sign in required' }, 401);
    }
    if (url.pathname === '/signout-all') {
      try {
        await signOutAll(env, origin, uid);
        return json({ ok: true });
      } catch (e) {
        console.error('signout-all failed', String(e));
        return json({ error: 'not available' }, 502);
      }
    }
    if (url.pathname === '/pay/start' || url.pathname === '/pay/status') {
      const body = await request.json().catch(() => ({}));
      try {
        const r = url.pathname === '/pay/start' ? await payStart(env, origin, uid, body) : await payStatus(env, origin, uid, String(body.id || ''));
        return json(r.body, r.status);
      } catch (e) {
        console.error('pay failed', String(e));
        return json({ error: 'pay_error', message: 'Payment service is not available right now.' }, 502);
      }
    }
    if (url.pathname === '/notify') {
      const { kind, id } = await request.json().catch(() => ({}));
      try {
        const r = await notify(env, origin, uid, kind, id);
        return json(r.body, r.status);
      } catch (e) {
        console.error('notify failed', String(e));
        return json({ error: 'push not available' }, 502);
      }
    }
    if (!env.AGORA_APP_CERT) return json({ error: 'AGORA_APP_CERT secret is not set' }, 500);
    const { channel } = await request.json().catch(() => ({}));
    if (typeof channel !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(channel)) return json({ error: 'bad channel' }, 400);
    const token = await rtcToken(env.AGORA_APP_ID, env.AGORA_APP_CERT, channel, 0, TOKEN_SECONDS);
    return json({ token, appId: env.AGORA_APP_ID, expiresIn: TOKEN_SECONDS });
  },
};
