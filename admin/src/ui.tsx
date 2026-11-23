import { onSnapshot, Query, DocumentData } from 'firebase/firestore';
import { createContext, ReactNode, useContext, useEffect, useState } from 'react';

const ICONS: Record<string, string> = {
  home: 'M12 3 2 11h3v9h5v-6h4v6h5v-9h3z',
  person: 'M12 2a5 5 0 1 1 0 10 5 5 0 0 1 0-10zm0 12c5 0 9 2.5 9 6v2H3v-2c0-3.5 4-6 9-6z',
  flag: 'M5 2h2v1h12l-2 5 2 5H7v9H5z',
  reels: 'M4 3h16a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm6 5v8l6-4z',
  bag: 'M7 7V6a5 5 0 0 1 10 0v1h3l-1 15H5L4 7zm2 0h6V6a3 3 0 0 0-6 0z',
  wallet: 'M4 5h14a2 2 0 0 1 2 2v1h-5a4 4 0 0 0 0 8h5v1a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zm11 5h7v4h-7a2 2 0 0 1 0-4z',
  star: 'M12 2l3 6.5 7 .8-5.2 4.8 1.4 6.9L12 17.6 5.8 21l1.4-6.9L2 9.3l7-.8z',
  truck: 'M2 6h12v9h1V9h4l3 4v4h-2a2.5 2.5 0 0 1-5 0H9a2.5 2.5 0 0 1-5 0H2zm4.5 10a1 1 0 1 0 0 2 1 1 0 0 0 0-2zm11 0a1 1 0 1 0 0 2 1 1 0 0 0 0-2z',
  megaphone: 'M18 4v16l-6-3.5H7l1 4H5.5l-1-4.2A3 3 0 0 1 2 13.5v-3a3 3 0 0 1 3-3h7zm2 5.5a3 3 0 0 1 0 5z',
  lock: 'M7 10V7a5 5 0 0 1 10 0v3h1a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2zm2.5 0h5V7a2.5 2.5 0 0 0-5 0z',
  chat: 'M5 3h14a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3h-8l-5 4v-4H5a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3z',
  verified: 'M12 1.5 14.6 4l3.6-.4.7 3.5 3.1 1.9-1.5 3.3 1.5 3.3-3.1 1.9-.7 3.5-3.6-.4L12 22.5 9.4 20l-3.6.4-.7-3.5L2 15l1.5-3.3L2 8.4l3.1-1.9.7-3.5 3.6.4zm-1.3 14.3 6-6-1.4-1.4-4.6 4.6-2.3-2.3-1.4 1.4z',
  logout: 'M10 3h9a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-9v-2h9V5h-9zm-1 5 1.4 1.4L8.8 11H16v2H8.8l1.6 1.6L9 16l-4-4z',
};

export function Icon({ name, color = 'currentColor', size = 20, label }: { name: keyof typeof ICONS | string; color?: string; size?: number; label?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <path fill={color} d={ICONS[name]} />
    </svg>
  );
}

export function Logo({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 30 30" aria-hidden="true">
      <rect width="30" height="30" rx="9" fill="#A6D41C" />
      <path d="M8 9h14a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3h-7l-5 4v-4H8a3 3 0 0 1-3-3v-6a3 3 0 0 1 3-3z" fill="#0A2253" />
    </svg>
  );
}

const PAIRS = [
  { bg: '#0A2253', fg: '#FFFFFF' },
  { bg: '#EEF8D2', fg: '#4D7300' },
  { bg: '#E3E8F2', fg: '#0A2253' },
  { bg: '#A6D41C', fg: '#0A2253' },
];
export function initials(name = '?') {
  const p = name.trim().split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] ?? '?') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
}
export function Avatar({ name = '?', size = 36 }: { name?: string; size?: number }) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const c = PAIRS[h % PAIRS.length];
  return (
    <span className="av" style={{ width: size, height: size, background: c.bg, color: c.fg, fontSize: Math.round(size * 0.36) }}>
      {initials(name)}
    </span>
  );
}

export function Person({ name, sub, size = 36 }: { name: string; sub?: ReactNode; size?: number }) {
  return (
    <span className="person">
      <Avatar name={name} size={size} />
      <span style={{ minWidth: 0 }}>
        <b>{name}</b>
        {sub ? <small>{sub}</small> : null}
      </span>
    </span>
  );
}

export function Pill({ kind, children }: { kind: 'ok' | 'warn' | 'bad' | 'info'; children: ReactNode }) {
  return <span className={`pill ${kind}`}>{children}</span>;
}

export function Stat({ label, value, note, icon }: { label: string; value: ReactNode; note?: ReactNode; icon: string }) {
  return (
    <section className="panel stat" style={{ gap: 8 }}>
      <div className="row">
        <span className="label">{label}</span>
        <span className="av" style={{ width: 36, height: 36, background: 'var(--lime1)' }}>
          <Icon name={icon} color="var(--navy)" size={18} />
        </span>
      </div>
      <span className="value">{value}</span>
      {note ? <span className="muted">{note}</span> : null}
    </section>
  );
}

export function Panel({ title, right, children }: { title?: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="panel">
      {title || right ? (
        <div className="row">
          {title ? <h2>{title}</h2> : <span />}
          {right}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function Chips<T extends string>({ options, value, onChange }: { options: T[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="chips" role="tablist">
      {options.map((o) => (
        <button key={o} role="tab" aria-selected={o === value} className={`chip ${o === value ? 'on' : ''}`} onClick={() => onChange(o)}>
          {o}
        </button>
      ))}
    </div>
  );
}

/** Live Firestore query. `undefined` while loading, `null` when the read was refused. */
export function useQuery<T>(q: Query<DocumentData> | null, deps: unknown[]) {
  const [rows, setRows] = useState<(T & { id: string })[] | null | undefined>(undefined);
  useEffect(() => {
    if (!q) return;
    setRows(undefined);
    return onSnapshot(
      q,
      (s) => setRows(s.docs.map((d) => ({ id: d.id, ...(d.data() as T) }))),
      () => setRows(null),
    );
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  return rows;
}

export function Rows<T>({ rows, empty, children }: { rows: T[] | null | undefined; empty: string; children: (rows: T[]) => ReactNode }) {
  if (rows === undefined) return <p className="empty">Loading…</p>;
  if (rows === null) return <p className="empty">Your admin role can't see this.</p>;
  if (!rows.length) return <p className="empty">{empty}</p>;
  return <>{children(rows)}</>;
}

export const mwk = (n?: number) => `MWK ${(n ?? 0).toLocaleString('en-US')}`;
export function when(ts?: { toDate: () => Date } | null) {
  if (!ts) return '—';
  return ts.toDate().toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

const ToastCtx = createContext<(msg: string) => void>(() => {});
export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState('');
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(''), 3000);
    return () => clearTimeout(t);
  }, [msg]);
  return (
    <ToastCtx.Provider value={setMsg}>
      {children}
      {msg ? (
        <div className="toast" role="status">
          {msg}
        </div>
      ) : null}
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

/** Runs a write and reports success or the refusal in a toast. */
export function useAct() {
  const toast = useToast();
  return async (label: string, fn: () => Promise<unknown>) => {
    try {
      await fn();
      toast(label);
    } catch (e) {
      toast(e instanceof Error && /permission/i.test(e.message) ? 'Your admin role cannot do this.' : 'That did not work. Try again.');
    }
  };
}
