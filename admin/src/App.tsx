import { getRedirectResult, onIdTokenChanged, signInWithPopup, signInWithRedirect, signOut, User } from 'firebase/auth';
import { useEffect, useState } from 'react';
import { auth, google, Role } from './firebase';
import * as P from './pages';
import { Icon, Logo, ToastProvider } from './ui';

// Plain-language reasons for the sign-in errors people actually hit.
function signInMessage(e: unknown): string {
  const code = (e as { code?: string })?.code ?? '';
  if (code === 'auth/operation-not-allowed')
    return 'Google sign-in is switched off for EfuChat. Turn it on in the Firebase console: Authentication > Sign-in method > Google.';
  if (code === 'auth/unauthorized-domain')
    return 'This website is not on the allowed list. Add it in the Firebase console: Authentication > Settings > Authorized domains.';
  if (code === 'auth/network-request-failed') return 'No internet connection. Check your data and try again.';
  return `Sign-in did not work (${code || 'unknown error'}). Try again, or open this page in Chrome.`;
}

// Errors where the pop-up could not run, so a full-page redirect is tried instead.
const POPUP_FAILED = ['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment', 'auth/web-storage-unsupported'];

const NAV = [
  ['home', 'Dashboard', P.Dashboard],
  ['person', 'Users', P.Users],
  ['flag', 'Reports', P.Reports],
  ['reels', 'Content', P.Content],
  ['bag', 'Market', P.Market],
  ['wallet', 'Money', P.Money],
  ['star', 'Ads and boosts', P.Ads],
  ['truck', 'Matola', P.Matola],
  ['megaphone', 'Channels', P.Channels],
  ['lock', 'Settings', P.Settings],
] as const;
type Page = (typeof NAV)[number][1];

export default function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [role, setRole] = useState<Role | null>(null);
  const [signInError, setSignInError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getRedirectResult(auth).catch((e) => setSignInError(signInMessage(e)));
  }, []);

  async function signIn() {
    setSignInError('');
    setBusy(true);
    try {
      await signInWithPopup(auth, google);
    } catch (e) {
      const code = (e as { code?: string })?.code ?? '';
      if (POPUP_FAILED.includes(code)) {
        await signInWithRedirect(auth, google).catch((err) => setSignInError(signInMessage(err)));
      } else if (code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request') {
        setSignInError(signInMessage(e));
      }
    } finally {
      setBusy(false);
    }
  }
  const [page, setPage] = useState<Page>(() => (decodeURIComponent(location.hash.slice(1)) as Page) || 'Dashboard');

  useEffect(
    () =>
      onIdTokenChanged(auth, async (u) => {
        setUser(u);
        const r = u ? (await u.getIdTokenResult()).claims.role : null;
        setRole(r === 'owner' || r === 'moderator' || r === 'finance' || r === 'support' ? r : null);
      }),
    [],
  );
  useEffect(() => {
    location.hash = page;
  }, [page]);

  if (user === undefined) return <div className="gate" />;

  if (!user || !role) {
    return (
      <div className="gate">
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Logo size={44} />
            <div>
              <div style={{ fontSize: 22, fontWeight: 800 }}>
                Efu<span style={{ color: 'var(--lime6)' }}>Chat</span> Admin
              </div>
              <div className="muted">For EfuChat staff only</div>
            </div>
          </div>
          {!user ? (
            <>
              <p style={{ margin: 0, lineHeight: 1.5 }}>Sign in with the Google account your owner added as staff.</p>
              <button className="btn lime" style={{ height: 48, fontSize: 15 }} disabled={busy} onClick={signIn}>
                {busy ? 'Signing in…' : 'Sign in with Google'}
              </button>
              {signInError ? (
                <p role="alert" style={{ margin: 0, lineHeight: 1.5, color: '#c62828' }}>
                  {signInError}
                </p>
              ) : null}
            </>
          ) : (
            <>
              <p style={{ margin: 0, lineHeight: 1.5 }}>
                Signed in as <b>{user.email}</b>, but this account is not EfuChat staff yet. Ask the owner to add you, then tap Check again.
              </p>
              <div className="btns">
                <button className="btn primary" onClick={() => user.getIdToken(true).then(() => auth.currentUser?.reload()).then(() => location.reload())}>
                  Check again
                </button>
                <button className="btn" onClick={() => signOut(auth)}>
                  Sign out
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  const Current = NAV.find((n) => n[1] === page)?.[2] ?? P.Dashboard;
  return (
    <ToastProvider>
      <div className="shell">
        <aside className="side" aria-label="Admin sections">
          <div className="brand">
            <Logo />
            <div>
              <b>
                Efu<span>Chat</span>
              </b>
              <small>ADMIN</small>
            </div>
          </div>
          {NAV.map(([icon, label]) => (
            <button key={label} className={`nav ${page === label ? 'on' : ''}`} aria-current={page === label ? 'page' : undefined} onClick={() => setPage(label)}>
              <Icon name={icon} color={page === label ? 'var(--lime)' : 'var(--soft)'} />
              {label}
            </button>
          ))}
          <div className="who">
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.displayName ?? user.email}</div>
              <small style={{ textTransform: 'capitalize' }}>{role}</small>
            </div>
            <button className="nav" style={{ width: 36, padding: 0, justifyContent: 'center' }} aria-label="Sign out" onClick={() => signOut(auth)}>
              <Icon name="logout" color="var(--soft)" />
            </button>
          </div>
        </aside>
        <main>
          <Current role={role} />
        </main>
      </div>
    </ToastProvider>
  );
}
