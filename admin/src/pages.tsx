import {
  collection,
  doc,
  getCountFromServer,
  getDoc,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { ReactNode, useEffect, useMemo, useState } from 'react';
import { db, Role } from './firebase';
import { Chips, Icon, mwk, Panel, Person, Pill, Rows, Stat, useAct, useQuery, when } from './ui';

type Props = { role: Role };
type Any = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const isMod = (r: Role) => r === 'owner' || r === 'moderator';
const isFinance = (r: Role) => r === 'owner' || r === 'finance';

function Top({ title, sub, right }: { title: string; sub: string; right?: ReactNode }) {
  return (
    <header className="top">
      <div style={{ flex: 1 }}>
        <h1>{title}</h1>
        <p>{sub}</p>
      </div>
      {right}
    </header>
  );
}

function Count({ q }: { q: ReturnType<typeof query> }) {
  const [n, setN] = useState<number | null>(null);
  useEffect(() => {
    getCountFromServer(q)
      .then((s) => setN(s.data().count))
      .catch(() => setN(-1));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return <>{n === null ? '…' : n < 0 ? '—' : n.toLocaleString('en-US')}</>;
}

const NEEDS_FUNCTIONS = 'This step runs on the server functions, which go live with the Blaze plan.';

/* ---------------- Dashboard ---------------- */

function last7() {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(Date.now() + 2 * 3600_000 - (6 - i) * 86400_000);
    return d.toISOString().slice(0, 10);
  });
}

export function Dashboard(_: Props) {
  const days = useMemo(last7, []);
  const [stats, setStats] = useState<Any[]>([]);
  useEffect(() => {
    Promise.all(days.map((d) => getDoc(doc(db, 'stats', d)).then((s) => ({ day: d, ...(s.data() ?? {}) })).catch(() => ({ day: d }))))
      .then(setStats)
      .catch(() => {});
  }, [days]);
  const today = stats[6] ?? {};
  const max = Math.max(1, ...stats.map((s) => s.signups ?? 0), ...stats.map((s) => Math.round((s.messages ?? 0) / 10)));
  const reports = useQuery<Any>(query(collection(db, 'reports'), where('status', '==', 'open'), orderBy('urgent', 'desc'), orderBy('updatedAt', 'desc'), limit(5)), []);

  return (
    <>
      <Top title="Dashboard" sub={new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })} />
      <div className="body">
        <div className="grid4">
          <Stat label="People on EfuChat" value={<Count q={query(collection(db, 'users'))} />} icon="person" note={`${today.signups ?? 0} new today`} />
          <Stat label="Live posts" value={<Count q={query(collection(db, 'posts'), where('status', '==', 'live'))} />} icon="reels" note={`${today.posts ?? 0} today`} />
          <Stat label="Items for sale" value={<Count q={query(collection(db, 'listings'), where('status', '==', 'live'))} />} icon="bag" note={`${today.orders ?? 0} orders today`} />
          <Stat label="Earned today" value={mwk(today.earnedMWK)} icon="wallet" note={`${mwk(today.movedMWK)} moved`} />
        </div>
        <div className="grid2">
          <Panel title="Last 7 days" right={<span className="muted">Sign-ups and messages (÷10)</span>}>
            <svg width="100%" height="220" viewBox="0 0 700 220" role="img" aria-label="Sign-ups and messages over the last 7 days">
              {stats.map((s, i) => {
                const x = 40 + i * 95;
                const su = ((s.signups ?? 0) / max) * 160;
                const ms = (Math.round((s.messages ?? 0) / 10) / max) * 160;
                return (
                  <g key={s.day}>
                    <rect x={x} y={180 - su} width="22" height={su} rx="4" fill="#A6D41C" />
                    <rect x={x + 26} y={180 - ms} width="22" height={ms} rx="4" fill="#0A2253" />
                    <text x={x + 24} y="204" textAnchor="middle" fontSize="12" fill="#566079">
                      {new Date(s.day).toLocaleDateString('en-GB', { weekday: 'short' })}
                    </text>
                  </g>
                );
              })}
            </svg>
            {stats.every((s) => !s.signups && !s.messages) ? <p className="muted">Daily numbers fill in once the server functions are live.</p> : null}
          </Panel>
          <Panel title="Needs your attention">
            <Rows rows={reports} empty="No open reports.">
              {(rows) => (
                <table className="table">
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id}>
                        <td>{r.target?.type}</td>
                        <td>{r.count} reports</td>
                        <td>{r.urgent ? <Pill kind="bad">Urgent</Pill> : <Pill kind="warn">Open</Pill>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Rows>
          </Panel>
        </div>
      </div>
    </>
  );
}

/* ---------------- Users ---------------- */

export function Users({ role }: Props) {
  const act = useAct();
  const [filter, setFilter] = useState<'All' | 'Businesses' | 'Creators' | 'Under review' | 'Suspended'>('All');
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<Any | null>(null);
  const [phone, setPhone] = useState('');
  const users = useQuery<Any>(query(collection(db, 'users'), orderBy('createdAt', 'desc'), limit(200)), []);

  useEffect(() => {
    setPhone('');
    if (picked) getDoc(doc(db, 'users', picked.id, 'private', 'account')).then((s) => setPhone(s.data()?.phone ?? '')).catch(() => {});
  }, [picked?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const shown = (users ?? []).filter((u) => {
    if (search && !String(u.name ?? '').toLowerCase().includes(search.toLowerCase())) return false;
    if (filter === 'Businesses') return u.accountType === 'business';
    if (filter === 'Creators') return u.accountType === 'creator';
    if (filter === 'Under review') return u.status === 'under_review';
    if (filter === 'Suspended') return u.status === 'suspended' || u.status === 'banned';
    return true;
  });
  const live = picked ? (users ?? []).find((u) => u.id === picked.id) ?? picked : null;
  const statusPill = (s: string) => (s === 'active' ? <Pill kind="ok">Active</Pill> : s === 'under_review' ? <Pill kind="warn">Under review</Pill> : <Pill kind="bad">{s}</Pill>);

  return (
    <>
      <Top title="Users" sub={`${users?.length ?? '…'} newest people`} right={<input className="input" style={{ width: 260 }} placeholder="Search by name" aria-label="Search by name" value={search} onChange={(e) => setSearch(e.target.value)} />} />
      <div className="body">
        <Chips options={['All', 'Businesses', 'Creators', 'Under review', 'Suspended']} value={filter} onChange={setFilter} />
        <div className="grid2" style={{ gridTemplateColumns: 'minmax(0,2.2fr) minmax(280px,1fr)' }}>
          <Panel>
            <Rows rows={users === undefined || users === null ? users : shown} empty="Nobody matches.">
              {(rows) => (
                <div className="scroll">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>NAME</th>
                        <th>TOWN</th>
                        <th>JOINED</th>
                        <th>STATUS</th>
                        <th>ACCOUNT</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((u) => (
                        <tr key={u.id} style={{ cursor: 'pointer', background: live?.id === u.id ? 'var(--lime1)' : undefined }} onClick={() => setPicked(u)}>
                          <td>
                            <Person name={u.name ?? '?'} sub={u.about} />
                          </td>
                          <td>{u.town ?? '—'}</td>
                          <td>{when(u.createdAt)}</td>
                          <td>{statusPill(u.status)}</td>
                          <td style={{ textTransform: 'capitalize' }}>
                            {u.accountType} {u.verified ? <Icon name="verified" color="var(--lime6)" size={16} label="Verified" /> : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Rows>
          </Panel>
          <Panel title={live ? undefined : 'Pick a person'}>
            {live ? (
              <>
                <Person name={live.name} sub={phone || 'Phone hidden'} size={56} />
                <div className="muted">
                  {live.accountType} · plan {live.plan} · wallet {live.walletLinked ? 'linked' : 'not linked'}
                </div>
                <div className="muted">Joined {when(live.createdAt)}</div>
                {isMod(role) ? (
                  <div className="btns">
                    <button className="btn" onClick={() => act(live.verified ? 'Badge removed' : 'Verified', () => updateDoc(doc(db, 'users', live.id), { verified: !live.verified }))}>
                      {live.verified ? 'Remove badge' : 'Verify'}
                    </button>
                    {live.status === 'active' ? (
                      <button className="btn danger" onClick={() => act('Suspended', () => updateDoc(doc(db, 'users', live.id), { status: 'suspended' }))}>
                        Suspend
                      </button>
                    ) : (
                      <button className="btn primary" onClick={() => act('Restored', () => updateDoc(doc(db, 'users', live.id), { status: 'active' }))}>
                        Restore
                      </button>
                    )}
                  </div>
                ) : (
                  <p className="muted">Only owners and moderators can change accounts.</p>
                )}
              </>
            ) : (
              <p className="muted">Tap a row to see the person and act on their account.</p>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}

/* ---------------- Reports ---------------- */

export function Reports({ role }: Props) {
  const act = useAct();
  const [tab, setTab] = useState<'Open' | 'Done'>('Open');
  const reports = useQuery<Any>(
    tab === 'Open'
      ? query(collection(db, 'reports'), where('status', '==', 'open'), orderBy('urgent', 'desc'), orderBy('updatedAt', 'desc'), limit(100))
      : query(collection(db, 'reports'), orderBy('updatedAt', 'desc'), limit(100)),
    [tab],
  );
  const [pick, setPick] = useState<Any | null>(null);
  const [target, setTarget] = useState<Any | null>(null);
  useEffect(() => {
    setTarget(null);
    if (pick?.target?.path) getDoc(doc(db, pick.target.path)).then((s) => setTarget(s.exists() ? s.data() ?? null : null)).catch(() => {});
  }, [pick?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function decide(status: 'kept' | 'removed' | 'warned' | 'banned') {
    if (!pick) return;
    const t = pick.target;
    await act(`Marked ${status}`, async () => {
      if ((status === 'removed' || status === 'banned') && ['post', 'reel', 'comment', 'listing'].includes(t.type)) await updateDoc(doc(db, t.path), { status: 'removed' });
      if (status === 'kept' && ['post', 'reel'].includes(t.type)) await updateDoc(doc(db, t.path), { status: 'live' });
      if (status === 'banned') await updateDoc(doc(db, 'users', t.ownerUid), { status: 'banned' });
      await updateDoc(doc(db, 'reports', pick.id), { status, decidedBy: role, updatedAt: serverTimestamp() });
    });
    setPick(null);
  }

  return (
    <>
      <Top title="Reports" sub="Things people flagged. Private chats are never shown here." />
      <div className="body">
        <Chips options={['Open', 'Done']} value={tab} onChange={setTab} />
        <div className="grid2" style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.6fr)' }}>
          <Panel>
            <Rows rows={reports} empty={tab === 'Open' ? 'Nothing to review. Reports appear once the server functions are live.' : 'No decided reports yet.'}>
              {(rows) => (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {rows.map((r) => (
                    <button key={r.id} className="btn" style={{ height: 'auto', padding: 12, textAlign: 'left', borderWidth: pick?.id === r.id ? 2 : 1, borderColor: pick?.id === r.id ? 'var(--navy)' : undefined }} onClick={() => setPick(r)}>
                      <div className="row">
                        <b style={{ textTransform: 'capitalize' }}>{r.target?.type}</b>
                        {r.urgent ? <Pill kind="bad">Urgent</Pill> : <Pill kind="info">{r.status}</Pill>}
                      </div>
                      <div className="muted" style={{ fontWeight: 600 }}>
                        {Object.entries(r.reasons ?? {})
                          .map(([k, v]) => `${k.replace('_', ' ')} ${v}`)
                          .join(' · ')}{' '}
                        · {r.count} reports · {when(r.updatedAt)}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </Rows>
          </Panel>
          <Panel title={pick ? `Report on ${pick.target?.type}` : 'Pick a report'}>
            {pick ? (
              <>
                <div style={{ border: '1px solid var(--line)', borderRadius: 16, padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <Person name={target?.author?.name ?? target?.name ?? target?.seller?.name ?? 'Unknown'} sub={pick.target?.path} />
                  <p style={{ margin: 0, lineHeight: 1.5 }}>{target?.text ?? target?.title ?? target?.about ?? (target === null ? 'Already gone.' : 'Loading…')}</p>
                </div>
                {isMod(role) && pick.status === 'open' ? (
                  <div className="btns" style={{ justifyContent: 'flex-end' }}>
                    <button className="btn" onClick={() => decide('kept')}>
                      Keep, no problem
                    </button>
                    <button className="btn" onClick={() => decide('warned')}>
                      Warn user
                    </button>
                    <button className="btn primary" onClick={() => decide('removed')}>
                      Remove
                    </button>
                    <button className="btn danger" onClick={() => decide('banned')}>
                      Ban account
                    </button>
                  </div>
                ) : (
                  <p className="muted">{pick.status === 'open' ? 'Only owners and moderators decide reports.' : `Decided: ${pick.status}`}</p>
                )}
              </>
            ) : (
              <p className="muted">Pick a report on the left to see what was flagged.</p>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}

/* ---------------- Content ---------------- */

export function Content({ role }: Props) {
  const act = useAct();
  const [tab, setTab] = useState<'Newest' | 'Featured' | 'Hidden'>('Newest');
  const posts = useQuery<Any>(
    tab === 'Newest'
      ? query(collection(db, 'posts'), orderBy('createdAt', 'desc'), limit(60))
      : tab === 'Featured'
        ? query(collection(db, 'posts'), where('status', '==', 'live'), where('featured', '==', true), orderBy('createdAt', 'desc'), limit(60))
        : query(collection(db, 'posts'), where('status', '==', 'hidden'), orderBy('createdAt', 'desc'), limit(60)),
    [tab],
  );
  const tags = useQuery<Any>(query(collection(db, 'hashtags'), orderBy('postsToday', 'desc'), limit(15)), []);
  const set = (id: string, data: Any, label: string) => act(label, () => updateDoc(doc(db, 'posts', id), data));

  return (
    <>
      <Top title="Content" sub="Public posts and polls. Feature good ones, hide what breaks the rules." />
      <div className="body">
        <Chips options={['Newest', 'Featured', 'Hidden']} value={tab} onChange={setTab} />
        <div className="grid2" style={{ gridTemplateColumns: 'minmax(0,2fr) minmax(280px,1fr)' }}>
          <Panel>
            <Rows rows={posts} empty="No posts here.">
              {(rows) => (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {rows.map((p) => (
                    <div key={p.id} style={{ border: '1px solid var(--line)', borderRadius: 14, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div className="row">
                        <Person name={p.author?.name ?? '?'} sub={`${p.kind} · ${when(p.createdAt)}`} />
                        {p.status === 'live' ? (p.featured ? <Pill kind="ok">Featured</Pill> : <Pill kind="info">Live</Pill>) : <Pill kind="bad">{p.status}</Pill>}
                      </div>
                      <div style={{ lineHeight: 1.5 }}>{p.text || (p.poll ? `Poll: ${p.poll.options.join(' / ')}` : '')}</div>
                      {isMod(role) ? (
                        <div className="btns">
                          {p.status === 'live' && (
                            <button className="btn primary" onClick={() => set(p.id, { featured: !p.featured }, p.featured ? 'Unfeatured' : 'Featured')}>
                              {p.featured ? 'Unfeature' : 'Feature'}
                            </button>
                          )}
                          {p.status !== 'live' ? (
                            <button className="btn" onClick={() => set(p.id, { status: 'live' }, 'Shown again')}>
                              Show again
                            </button>
                          ) : (
                            <button className="btn" onClick={() => set(p.id, { status: 'hidden' }, 'Hidden')}>
                              Hide
                            </button>
                          )}
                          {p.status !== 'removed' && (
                            <button className="btn danger" onClick={() => set(p.id, { status: 'removed' }, 'Removed')}>
                              Remove
                            </button>
                          )}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </Rows>
          </Panel>
          <Panel title="Hashtags">
            <Rows rows={tags} empty="Hashtag counts appear once the server functions are live.">
              {(rows) => (
                <table className="table">
                  <tbody>
                    {rows.map((t) => (
                      <tr key={t.id}>
                        <td>
                          <b>#{t.id}</b>
                          <div className="muted">{t.postsToday ?? 0} today</div>
                        </td>
                        <td>{t.state === 'pinned' ? <Pill kind="ok">Pinned</Pill> : t.state === 'hidden' ? <Pill kind="bad">Hidden</Pill> : null}</td>
                        <td>
                          {isMod(role) ? (
                            <select
                              className="input"
                              style={{ height: 34 }}
                              aria-label={`State of #${t.id}`}
                              value={t.state ?? 'normal'}
                              onChange={(e) => act('Saved', () => updateDoc(doc(db, 'hashtags', t.id), { state: e.target.value }))}
                            >
                              <option value="normal">Normal</option>
                              <option value="pinned">Pinned</option>
                              <option value="hidden">Hidden</option>
                            </select>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Rows>
          </Panel>
        </div>
      </div>
    </>
  );
}

/* ---------------- Market ---------------- */

export function Market({ role }: Props) {
  const act = useAct();
  const listings = useQuery<Any>(query(collection(db, 'listings'), orderBy('createdAt', 'desc'), limit(60)), []);
  const disputes = useQuery<Any>(query(collection(db, 'disputes'), where('status', '==', 'open'), orderBy('createdAt', 'asc'), limit(20)), []);
  return (
    <>
      <Top title="Market" sub="Listings, orders and disputes between buyers and sellers" />
      <div className="body">
        <div className="grid4">
          <Stat label="Live listings" value={<Count q={query(collection(db, 'listings'), where('status', '==', 'live'))} />} icon="bag" />
          <Stat label="Orders" value={<Count q={query(collection(db, 'orders'))} />} icon="star" />
          <Stat label="Open disputes" value={<Count q={query(collection(db, 'disputes'), where('status', '==', 'open'))} />} icon="flag" />
        </div>
        <div className="grid2" style={{ gridTemplateColumns: 'minmax(0,1.4fr) minmax(0,1fr)' }}>
          <Panel title="Listings">
            <Rows rows={listings} empty="Nothing for sale yet.">
              {(rows) => (
                <div className="scroll">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>ITEM</th>
                        <th>SELLER</th>
                        <th>PRICE</th>
                        <th>STATUS</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((l) => (
                        <tr key={l.id}>
                          <td>
                            <b>{l.title}</b>
                          </td>
                          <td>{l.seller?.name}</td>
                          <td>{mwk(l.priceMWK)}</td>
                          <td>{l.status === 'live' ? <Pill kind="ok">Live</Pill> : <Pill kind={l.status === 'removed' ? 'bad' : 'info'}>{l.status}</Pill>}</td>
                          <td>
                            {isMod(role) && l.status === 'live' ? (
                              <button className="btn danger" onClick={() => act('Removed', () => updateDoc(doc(db, 'listings', l.id), { status: 'removed' }))}>
                                Remove
                              </button>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Rows>
          </Panel>
          <Panel title="Disputes">
            <Rows rows={disputes} empty="No open disputes.">
              {(rows) =>
                rows.map((d) => (
                  <div key={d.id} style={{ border: '1px solid var(--line)', borderRadius: 14, padding: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <b>
                      {d.reason} · order {d.orderId}
                    </b>
                    <span className="muted">Buyer: "{d.buyerStatement}"</span>
                    <span className="muted">Seller: {d.sellerStatement ? `"${d.sellerStatement}"` : 'no answer yet'}</span>
                    <span className="muted">{NEEDS_FUNCTIONS}</span>
                  </div>
                ))
              }
            </Rows>
          </Panel>
        </div>
      </div>
    </>
  );
}

/* ---------------- Money ---------------- */

export function Money({ role }: Props) {
  const ledger = useQuery<Any>(isFinance(role) ? query(collection(db, 'ledger'), orderBy('createdAt', 'desc'), limit(60)) : null, [role]);
  const [fees, setFees] = useState<Any | null>(null);
  useEffect(() => {
    getDoc(doc(db, 'config', 'fees')).then((s) => setFees(s.data() ?? null)).catch(() => {});
  }, []);
  return (
    <>
      <Top title="Money" sub="Every money movement through EfuChat wallets (Airtel Money and TNM Mpamba)" />
      <div className="body">
        <div className="grid2" style={{ gridTemplateColumns: 'minmax(0,2.4fr) minmax(260px,1fr)' }}>
          <Panel title="Latest money movements">
            {!isFinance(role) ? (
              <p className="empty">Only owners and finance staff can see money.</p>
            ) : (
              <Rows rows={ledger} empty="No money has moved yet. Payments start once Airtel Money and TNM Mpamba are connected.">
                {(rows) => (
                  <div className="scroll">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>TIME</th>
                          <th>WHAT</th>
                          <th>AMOUNT</th>
                          <th>EFUCHAT FEE</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((e) => (
                          <tr key={e.id}>
                            <td>{when(e.createdAt)}</td>
                            <td style={{ textTransform: 'capitalize' }}>
                              {String(e.kind).replace('_', ' ')} <span className="muted">{e.note ?? ''}</span>
                            </td>
                            <td>{mwk(e.amountMWK)}</td>
                            <td>{mwk(e.feeMWK)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Rows>
            )}
          </Panel>
          <Panel title="Fees">
            {fees ? (
              <>
                <div className="row">
                  <span>Market sales</span>
                  <b>{fees.marketPercent}%</b>
                </div>
                <div className="row">
                  <span>Tips</span>
                  <b>{fees.tipsPercent}%</b>
                </div>
                <div className="row">
                  <span>Matola delivery</span>
                  <b>{fees.matolaPercent}%</b>
                </div>
                <div className="row">
                  <span>Sending to friends</span>
                  <b style={{ color: 'var(--lime6)' }}>Free</b>
                </div>
                <span className="muted">Change fees in Settings.</span>
              </>
            ) : (
              <p className="empty">Loading…</p>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}

/* ---------------- Ads ---------------- */

export function Ads({ role }: Props) {
  const act = useAct();
  const ads = useQuery<Any>(query(collection(db, 'ads'), orderBy('createdAt', 'desc'), limit(60)), []);
  const boosts = useQuery<Any>(query(collection(db, 'boosts'), where('status', '==', 'running'), limit(60)), []);
  return (
    <>
      <Top title="Ads and boosts" sub="Approve sponsored posts and see what is running" />
      <div className="body">
        <div className="grid2">
          <Panel title="Sponsored posts">
            <Rows rows={ads} empty="No ads submitted yet.">
              {(rows) =>
                rows.map((a) => (
                  <div key={a.id} style={{ border: '1px solid var(--line)', borderRadius: 14, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div className="row">
                      <Person name={a.business ?? '?'} sub={`${a.placement} · budget ${mwk(a.budgetMWK)}`} />
                      <Pill kind={a.status === 'running' ? 'ok' : a.status === 'to_approve' ? 'warn' : 'info'}>{String(a.status).replace('_', ' ')}</Pill>
                    </div>
                    {isMod(role) && a.status === 'to_approve' ? (
                      <div className="btns">
                        <button className="btn primary" onClick={() => act('Approved', () => updateDoc(doc(db, 'ads', a.id), { status: 'running', reviewedBy: role }))}>
                          Approve
                        </button>
                        <button className="btn" onClick={() => act('Asked for changes', () => updateDoc(doc(db, 'ads', a.id), { status: 'changes_requested', reviewedBy: role }))}>
                          Ask for changes
                        </button>
                        <button className="btn danger" onClick={() => act('Rejected', () => updateDoc(doc(db, 'ads', a.id), { status: 'rejected', reviewedBy: role }))}>
                          Reject
                        </button>
                      </div>
                    ) : null}
                  </div>
                ))
              }
            </Rows>
          </Panel>
          <Panel title="Boosts running now">
            <Rows rows={boosts} empty="No boosts running. Boosts start once payments are connected.">
              {(rows) => (
                <table className="table">
                  <tbody>
                    {rows.map((b) => (
                      <tr key={b.id}>
                        <td style={{ textTransform: 'capitalize' }}>{b.target?.type}</td>
                        <td>{b.days} days</td>
                        <td>{mwk(b.priceMWK)}</td>
                        <td>ends {when(b.endsAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Rows>
          </Panel>
        </div>
      </div>
    </>
  );
}

/* ---------------- Matola ---------------- */

export function Matola(_: Props) {
  const deliveries = useQuery<Any>(query(collection(db, 'deliveries'), orderBy('createdAt', 'desc'), limit(60)), []);
  const kind = (s: string) => (s === 'delivered' ? 'ok' : s === 'cancelled' ? 'bad' : s === 'requested' ? 'warn' : 'info');
  return (
    <>
      <Top title="Matola" sub="Deliveries booked in EfuChat and run by EfuLogistix" />
      <div className="body">
        <Panel title="Deliveries">
          <Rows rows={deliveries} empty="No deliveries yet.">
            {(rows) => (
              <div className="scroll">
                <table className="table">
                  <thead>
                    <tr>
                      <th>BOOKED</th>
                      <th>ROUTE</th>
                      <th>DRIVER</th>
                      <th>STATUS</th>
                      <th>FARE</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((d) => (
                      <tr key={d.id}>
                        <td>{when(d.createdAt)}</td>
                        <td>
                          {d.pickup?.label} → {d.dropoff?.label}
                        </td>
                        <td>{d.driver?.name ?? '—'}</td>
                        <td>
                          <Pill kind={kind(d.status)}>{String(d.status).replace('_', ' ')}</Pill>
                        </td>
                        <td>{mwk(d.fareMWK)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Rows>
        </Panel>
      </div>
    </>
  );
}

/* ---------------- Channels ---------------- */

export function Channels({ role }: Props) {
  const act = useAct();
  const channels = useQuery<Any>(query(collection(db, 'channels'), orderBy('createdAt', 'desc'), limit(100)), []);
  return (
    <>
      <Top title="Channels" sub="Approve official channels and give them a verified badge" />
      <div className="body">
        <Panel title="Channels">
          <Rows rows={channels} empty="No channels yet.">
            {(rows) => (
              <div className="scroll">
                <table className="table">
                  <thead>
                    <tr>
                      <th>CHANNEL</th>
                      <th>CATEGORY</th>
                      <th>FOLLOWERS</th>
                      <th>BADGE</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((c) => (
                      <tr key={c.id}>
                        <td>
                          <Person name={c.name} sub={c.about} />
                        </td>
                        <td style={{ textTransform: 'capitalize' }}>{c.category}</td>
                        <td>{c.followers ?? 0}</td>
                        <td>{c.verified ? <Pill kind="ok">Verified</Pill> : c.verification?.status === 'waiting' ? <Pill kind="warn">Waiting</Pill> : null}</td>
                        <td>
                          {isMod(role) ? (
                            <button
                              className={`btn ${c.verified ? '' : 'primary'}`}
                              onClick={() =>
                                act(c.verified ? 'Badge removed' : 'Verified', () =>
                                  updateDoc(doc(db, 'channels', c.id), { verified: !c.verified, verification: { ...(c.verification ?? {}), status: c.verified ? 'declined' : 'verified', proof: c.verification?.proof ?? [] } }),
                                )
                              }
                            >
                              {c.verified ? 'Remove badge' : 'Verify'}
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Rows>
        </Panel>
      </div>
    </>
  );
}

/* ---------------- Settings ---------------- */

function NumberField({ label, value, onChange, unit }: { label: string; value: number; onChange: (n: number) => void; unit?: string }) {
  return (
    <label className="field">
      {label}
      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {unit ? <span className="muted">{unit}</span> : null}
        <input className="input" type="number" min={0} step="any" value={value} onChange={(e) => onChange(Number(e.target.value))} />
      </span>
    </label>
  );
}

export function Settings({ role }: Props) {
  const act = useAct();
  const [pricing, setPricing] = useState<Any | null>(null);
  const [fees, setFees] = useState<Any | null>(null);
  const [rules, setRules] = useState<Any | null>(null);
  useEffect(() => {
    getDoc(doc(db, 'config', 'pricing')).then((s) => setPricing(s.data() ?? null));
    getDoc(doc(db, 'config', 'fees')).then((s) => setFees(s.data() ?? null));
    getDoc(doc(db, 'config', 'rules')).then((s) => setRules(s.data() ?? null));
  }, []);
  const owner = role === 'owner';

  return (
    <>
      <Top title="Settings" sub="Prices, fees and app rules" />
      <div className="body">
        <div className="grid2">
          <Panel title="Prices" right={owner && pricing ? <button className="btn primary" onClick={() => act('Prices saved', () => setDoc(doc(db, 'config', 'pricing'), pricing))}>Save prices</button> : null}>
            {pricing ? (
              <div className="grid4" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))' }}>
                {(['1', '3', '7'] as const).map((d) => (
                  <NumberField key={d} label={`Boost, ${d} day${d === '1' ? '' : 's'}`} unit="MWK" value={pricing.boost[d]} onChange={(n) => setPricing({ ...pricing, boost: { ...pricing.boost, [d]: n } })} />
                ))}
                <NumberField label="Shop plan / month" unit="MWK" value={pricing.plans.shop} onChange={(n) => setPricing({ ...pricing, plans: { ...pricing.plans, shop: n } })} />
                <NumberField label="Pro plan / month" unit="MWK" value={pricing.plans.pro} onChange={(n) => setPricing({ ...pricing, plans: { ...pricing.plans, pro: n } })} />
                <NumberField label="Plus / month" unit="MWK" value={pricing.plans.plusMonth} onChange={(n) => setPricing({ ...pricing, plans: { ...pricing.plans, plusMonth: n } })} />
              </div>
            ) : (
              <p className="empty">Loading…</p>
            )}
          </Panel>
          <Panel title="Fees" right={isFinance(role) && fees ? <button className="btn primary" onClick={() => act('Fees saved', () => setDoc(doc(db, 'config', 'fees'), fees))}>Save fees</button> : null}>
            {fees ? (
              <div className="grid4" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))' }}>
                <NumberField label="Market sales %" value={fees.marketPercent} onChange={(n) => setFees({ ...fees, marketPercent: n })} />
                <NumberField label="Tips %" value={fees.tipsPercent} onChange={(n) => setFees({ ...fees, tipsPercent: n })} />
                <NumberField label="Matola delivery %" value={fees.matolaPercent} onChange={(n) => setFees({ ...fees, matolaPercent: n })} />
              </div>
            ) : (
              <p className="empty">Loading…</p>
            )}
          </Panel>
        </div>
        <Panel title="App rules" right={owner && rules ? <button className="btn primary" onClick={() => act('Rules saved', () => setDoc(doc(db, 'config', 'rules'), rules))}>Save rules</button> : null}>
          {rules ? (
            <div className="grid4" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))' }}>
              <NumberField label="Minimum age" value={rules.minAge} onChange={(n) => setRules({ ...rules, minAge: n })} />
              <NumberField label="Wallet minimum age" value={rules.walletMinAge} onChange={(n) => setRules({ ...rules, walletMinAge: n })} />
              <NumberField label="Hide posts after this many reports" value={rules.autoHideAfterReports} onChange={(n) => setRules({ ...rules, autoHideAfterReports: n })} />
              <label className="field">
                Hold posts from new accounts
                <select className="input" value={rules.holdNewAccountPosts ? 'yes' : 'no'} onChange={(e) => setRules({ ...rules, holdNewAccountPosts: e.target.value === 'yes' })}>
                  <option value="no">No</option>
                  <option value="yes">Yes, for 1 day</option>
                </select>
              </label>
            </div>
          ) : (
            <p className="empty">Loading…</p>
          )}
        </Panel>
        <Panel title="Admin team">
          <p style={{ margin: 0, lineHeight: 1.5 }}>
            You are signed in as <b style={{ textTransform: 'capitalize' }}>{role}</b>. Staff roles are added by the owner from the GitHub repo: <b>Actions → Set staff role</b>. Enter the
            person's Google email and a role (owner, moderator, finance or support). They must sign in here once first.
          </p>
          <table className="table">
            <tbody>
              <tr>
                <td>
                  <b>Owner</b>
                </td>
                <td className="muted">Everything</td>
              </tr>
              <tr>
                <td>
                  <b>Moderator</b>
                </td>
                <td className="muted">Reports, content, users, channels, ads</td>
              </tr>
              <tr>
                <td>
                  <b>Finance</b>
                </td>
                <td className="muted">Money and fees</td>
              </tr>
              <tr>
                <td>
                  <b>Support</b>
                </td>
                <td className="muted">Can look, but cannot change accounts or money</td>
              </tr>
            </tbody>
          </table>
        </Panel>
      </div>
    </>
  );
}
