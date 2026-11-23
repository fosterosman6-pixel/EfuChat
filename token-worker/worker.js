// EfuChat call-token server (Cloudflare Worker).
// POST /token  { channel }  with  Authorization: Bearer <Firebase ID token>
// Replies { token, appId, expiresIn } for Agora RTC, uid 0, publisher.
// Secrets/vars: AGORA_APP_ID, AGORA_APP_CERT (secret), FIREBASE_PROJECT_ID.

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

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type', 'access-control-allow-methods': 'POST' } });
    if (request.method !== 'POST' || new URL(request.url).pathname !== '/token') return json({ error: 'not found' }, 404);
    if (!env.AGORA_APP_CERT) return json({ error: 'AGORA_APP_CERT secret is not set' }, 500);
    try {
      const auth = request.headers.get('authorization') || '';
      await verifyFirebase(auth.replace(/^Bearer\s+/i, ''), env.FIREBASE_PROJECT_ID);
    } catch (e) {
      return json({ error: 'sign in required' }, 401);
    }
    const { channel } = await request.json().catch(() => ({}));
    if (typeof channel !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(channel)) return json({ error: 'bad channel' }, 400);
    const token = await rtcToken(env.AGORA_APP_ID, env.AGORA_APP_CERT, channel, 0, TOKEN_SECONDS);
    return json({ token, appId: env.AGORA_APP_ID, expiresIn: TOKEN_SECONDS });
  },
};
