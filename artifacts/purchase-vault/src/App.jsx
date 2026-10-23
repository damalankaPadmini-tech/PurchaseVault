import { useEffect, useMemo, useState } from 'react';
import { Link, Route, Switch, useLocation, useRoute } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetCurrentUserQueryKey, getGetDashboardSummaryQueryKey, getGetPurchasesQueryKey,
  getGetPurchaseQueryKey, getGetPurchaseClaimSummaryQueryKey, useGetPurchase,
  useGetPurchaseClaimSummary, useGetCurrentUser,
  useGetDashboardSummary, useGetPurchases, useCreatePurchase, useUpdatePurchase,
  useDeletePurchase, useLoginAuth, useRegisterAuth, useLogoutAuth,
} from '@workspace/api-client-react';
import {
  Archive, ArrowLeft, ArrowUpRight, BadgeCheck, CalendarDays, ChevronRight,
  CircleAlert, ClipboardList, Clock3, FileText, Headphones, Home, Laptop,
  LayoutDashboard, Plus, Search, Settings as SettingsIcon, Shield,
  ShieldCheck, Tag, Trash2, Pencil, Package, Wrench,
} from 'lucide-react';

const STORAGE_KEY = 'purchase-vault-purchases-v1';
const categories = ['Electronics', 'Home & Kitchen', 'Appliances', 'Furniture', 'Other'];
const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const shiftDate = (date, days) => { const d = new Date(date); d.setDate(d.getDate() + days); return d; };
const dateInput = (date) => { const d = new Date(date); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const dateFrom = (value) => { if (!value) return null; const [y, m, d] = value.split('-').map(Number); return new Date(y, m - 1, d); };
const fmtDate = (value) => value ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(dateFrom(value)) : 'Not provided';
const currency = (value) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value || 0));
const addMonths = (date, months) => { const out = new Date(date); const day = out.getDate(); out.setMonth(out.getMonth() + Number(months)); if (out.getDate() < day) out.setDate(0); return out; };
const warrantyExpiry = (purchase) => addMonths(dateFrom(purchase.purchaseDate), Number(purchase.warrantyMonths || 0));
const warrantyStatus = (purchase) => {
  const days = Math.floor((warrantyExpiry(purchase) - today()) / 86400000);
  if (days <= 0) return { label: 'Expired', kind: 'expired', days };
  if (days <= 30) return { label: 'Expiring soon', kind: 'soon', days };
  return { label: 'Active', kind: 'active', days };
};
const returnStatus = (purchase) => {
  if (!purchase.returnDeadline) return null;
  const days = Math.floor((dateFrom(purchase.returnDeadline) - today()) / 86400000);
  return days >= 0 && days <= 7 ? { label: 'Return Window Closing', days } : null;
};
const daysLabel = (days) => days === 0 ? 'today' : `${days} day${days === 1 ? '' : 's'}`;
const normalizePurchase = (p) => ({ ...p, returnDeadline: p.returnDeadline || '', serialNumber: p.serialNumber || '' });
const readableError = (error) => error?.data?.message || error?.message || 'Something went wrong. Please try again.';
const purchasePayload = (item) => ({ ...item, currency: 'USD', returnDeadline: item.returnDeadline || null });

function App() {
  const [toast, setToast] = useState('');
  const [location, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const session = useGetCurrentUser({ query: { retry: false, queryKey: getGetCurrentUserQueryKey() } });
  const user = session.data?.user;
  const purchasesQuery = useGetPurchases({ page: 1, limit: 100, sort: 'purchaseDateDesc' }, { query: { enabled: !!user, queryKey: getGetPurchasesQueryKey({ page: 1, limit: 100, sort: 'purchaseDateDesc' }) } });
  const summaryQuery = useGetDashboardSummary({ query: { enabled: !!user, queryKey: getGetDashboardSummaryQueryKey() } });
  const createMutation = useCreatePurchase();
  const updateMutation = useUpdatePurchase();
  const deleteMutation = useDeletePurchase();
  const loginMutation = useLoginAuth();
  const registerMutation = useRegisterAuth();
  const logoutMutation = useLogoutAuth();
  const purchases = (purchasesQuery.data?.items || []).map(normalizePurchase);
  const [importState, setImportState] = useState({ count: 0, result: '', busy: false, eligible: false });
  const [authError, setAuthError] = useState('');
  useEffect(() => {
    if (!user) return;
    try {
      const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '[]');
      setImportState((old) => ({ ...old, count: Array.isArray(saved) ? saved.length : 0, eligible: purchases.length === 0 && Array.isArray(saved) && saved.length > 0 }));
    } catch { setImportState({ count: 0, result: '', busy: false, eligible: false }); }
  }, [user?.id, purchases.length]);
  useEffect(() => { if (!toast) return undefined; const timer = setTimeout(() => setToast(''), 3200); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => {
    if (!session.isError || session.error?.status < 500) return undefined;
    const timer = window.setInterval(() => { void session.refetch(); }, 15_000);
    return () => window.clearInterval(timer);
  }, [session.isError, session.error?.status, session.refetch]);
  const refreshRecords = async (id) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: getGetPurchasesQueryKey({ page: 1, limit: 100, sort: 'purchaseDateDesc' }) }),
      queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() }),
      ...(id ? [queryClient.invalidateQueries({ queryKey: getGetPurchaseQueryKey(id) }), queryClient.invalidateQueries({ queryKey: getGetPurchaseClaimSummaryQueryKey(id) })] : []),
    ]);
  };
  const addPurchase = async (item) => {
    const record = await createMutation.mutateAsync({ data: purchasePayload(item) });
    await refreshRecords(record.id); setToast('Purchase saved to your vault.'); return normalizePurchase(record);
  };
  const updatePurchase = async (id, item) => {
    const record = await updateMutation.mutateAsync({ purchaseId: id, data: purchasePayload(item) });
    await refreshRecords(id); setToast('Purchase details updated.'); return normalizePurchase(record);
  };
  const deletePurchase = async (id) => {
    const item = purchases.find((p) => p.id === id);
    if (!item || !window.confirm(`Delete ${item.productName}? This cannot be undone.`)) return;
    try { await deleteMutation.mutateAsync({ purchaseId: id }); await refreshRecords(id); setToast('Purchase deleted.'); if (location.startsWith('/purchases/')) setLocation('/purchases'); }
    catch (error) { setToast(readableError(error)); }
  };
  const authenticate = async (mode, values) => {
    setAuthError('');
    try {
      const response = await (mode === 'register' ? registerMutation.mutateAsync({ data: values }) : loginMutation.mutateAsync({ data: { email: values.email, password: values.password } }));
      queryClient.setQueryData(getGetCurrentUserQueryKey(), response);
      await queryClient.invalidateQueries({ queryKey: getGetCurrentUserQueryKey() });
    } catch (error) { setAuthError(readableError(error)); }
  };
  const logout = async () => {
    try { await logoutMutation.mutateAsync(); queryClient.clear(); setLocation('/'); }
    catch (error) { setToast(readableError(error)); }
  };
  const importLocal = async () => {
    if (!window.confirm(`Import ${importState.count} browser-local purchase${importState.count === 1 ? '' : 's'} into this account? The local source will remain unchanged.`)) return;
    setImportState((s) => ({ ...s, busy: true, result: '' }));
    let imported = 0;
    try {
      const rows = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '[]');
      for (const row of rows) {
        const { id, ...fields } = row;
        await createMutation.mutateAsync({ data: purchasePayload({ ...fields, price: Number(fields.price), warrantyMonths: Number(fields.warrantyMonths) }) });
        imported += 1;
      }
      await refreshRecords();
      setImportState((s) => ({ ...s, busy: false, eligible: false, result: `${imported} of ${rows.length} purchases imported successfully. Your browser-local source remains available.` }));
    } catch (error) {
      await refreshRecords();
      setImportState((s) => ({ ...s, busy: false, result: `${imported} imported; the rest were not imported. ${readableError(error)}` }));
    }
  };
  const shared = { purchases, addPurchase, updatePurchase, deletePurchase, toast, setToast, summary: summaryQuery.data, loading: purchasesQuery.isLoading, loadError: purchasesQuery.error, retry: () => { purchasesQuery.refetch(); summaryQuery.refetch(); } };
  if (session.isLoading) return <main className="session-state" data-testid="status-session-loading"><span className="skeleton-line wide" /><span className="skeleton-line" /><p>Checking your vault session…</p></main>;
  if (session.isError && session.error?.status >= 500) return <AuthScreen onSubmit={authenticate} error={authError} connectionError={readableError(session.error)} onRetry={() => session.refetch()} busy={loginMutation.isPending || registerMutation.isPending} />;
  if (session.isError && ![401, 404].includes(session.error?.status)) return <main className="session-state" data-testid="status-session-error"><div className="empty-mark"><CircleAlert size={20} /></div><h2>We couldn’t check your session</h2><p>{readableError(session.error)}</p><button className="btn btn-primary" onClick={() => session.refetch()} data-testid="button-retry-session">Try again</button></main>;
  if (!user) return <AuthScreen onSubmit={authenticate} error={authError} busy={loginMutation.isPending || registerMutation.isPending} />;
  return <div className="app-shell"><Shell location={location} onLogout={logout} /><div className="main-area">
    <header className="topbar"><div className="crumb">Your personal purchase record</div><div className="top-right"><span data-testid="text-account-email">{user.email}</span><div className="avatar" aria-label={user.name}>{(user.name || user.email).slice(0, 2).toUpperCase()}</div></div></header>
    <header className="mobile-header"><Brand /><div className="avatar">{(user.name || user.email).slice(0, 2).toUpperCase()}</div></header>
    {importState.eligible && <section className="import-banner" data-testid="panel-local-import"><div><b>Browser purchases found</b><p>{importState.count} local purchase{importState.count === 1 ? '' : 's'} can be imported. Nothing is uploaded until you choose to import. Your local copy will not be deleted.</p></div><button className="btn btn-primary" disabled={importState.busy} onClick={importLocal} data-testid="button-import-local">{importState.busy ? 'Importing…' : `Review & import ${importState.count}`}</button></section>}
    {importState.result && <div className="import-result" role="status" data-testid="status-import-result">{importState.result}</div>}
    <Switch>
      <Route path="/"><Dashboard {...shared} /></Route>
      <Route path="/purchases"><Purchases {...shared} /></Route>
      <Route path="/add"><PurchaseForm {...shared} /></Route>
      <Route path="/purchases/:id"><PurchaseDetail {...shared} /></Route>
      <Route path="/warranties"><Warranties {...shared} /></Route>
      <Route path="/claims"><Claims {...shared} /></Route>
      <Route path="/settings"><Settings {...shared} user={user} onLogout={logout} /></Route>
      <Route><NotFound /></Route>
    </Switch>
    <MobileNav location={location} />
    {purchasesQuery.isError && <div className="feedback error global-error" role="alert" data-testid="status-purchase-load-error">Purchases could not be loaded. <button onClick={shared.retry} data-testid="button-retry-purchases">Try again</button></div>}
  </div>{toast && <div className="toast" role="status" data-testid="status-toast">{toast}</div>}</div>;
}

function AuthScreen({ onSubmit, error, busy, connectionError, onRetry }) {
  const [mode, setMode] = useState('login');
  const [values, setValues] = useState({ name: '', email: '', password: '' });
  const update = (key) => (event) => setValues((v) => ({ ...v, [key]: event.target.value }));
  const submit = (event) => { event.preventDefault(); onSubmit(mode, values); };
  return <main className="auth-page" data-testid="screen-auth"><div className="auth-art"><Brand /><div className="auth-art-copy"><p className="eyebrow">A calmer kind of ownership</p><h1>Everything you bought.<br />Right where you need it.</h1><p>Keep dates, warranty details, and the little facts that are easy to forget in one dependable place.</p><div className="auth-art-foot"><ShieldCheck size={16} /> Your account, your records, your next step.</div></div></div><section className="auth-card"><div className="auth-card-inner"><p className="eyebrow">{mode === 'login' ? 'Welcome back' : 'Make room for peace of mind'}</p><h2>{mode === 'login' ? 'Sign in to your vault' : 'Create your account'}</h2><p className="subtitle">{mode === 'login' ? 'Your purchase record is ready when you are.' : 'Start keeping the details that matter close.'}</p>{connectionError && <div className="feedback error" role="alert" data-testid="status-session-error"><p>We couldn’t reach your vault. {connectionError}</p><button className="btn btn-quiet" type="button" onClick={onRetry} data-testid="button-retry-session">Retry connection</button></div>}<form onSubmit={submit} className="auth-form">{mode === 'register' && <label className="form-field">Your name<input className="input" value={values.name} onChange={update('name')} required maxLength="80" autoComplete="name" disabled={!!connectionError} data-testid="input-auth-name" /></label>}<label className="form-field">Email address<input className="input" type="email" value={values.email} onChange={update('email')} required autoComplete="email" disabled={!!connectionError} data-testid="input-auth-email" /></label><label className="form-field">Password<input className="input" type="password" value={values.password} onChange={update('password')} required minLength={mode === 'register' ? 8 : 1} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} disabled={!!connectionError} data-testid="input-auth-password" /></label>{error && <div className="feedback error" role="alert" data-testid="status-auth-error">{error}</div>}<button className="btn btn-primary auth-submit" type="submit" disabled={busy || !!connectionError} data-testid="button-auth-submit">{busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}<ArrowUpRight size={15} /></button></form><p className="auth-switch">{mode === 'login' ? 'New to PurchaseVault?' : 'Already have an account?'} <button disabled={!!connectionError} onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); }} data-testid="button-auth-toggle">{mode === 'login' ? 'Create an account' : 'Sign in'}</button></p><div className="auth-note"><Shield size={14} /> Private purchase records, under your control.</div></div></section></main>;
}

const navItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/purchases', label: 'My Purchases', icon: Package },
  { href: '/add', label: 'Add Purchase', icon: Plus },
  { href: '/warranties', label: 'Warranty Tracker', icon: ShieldCheck },
  { href: '/claims', label: 'Claim Mode', icon: ClipboardList },
  { href: '/settings', label: 'Settings', icon: SettingsIcon },
];
function isNavActive(href, location) {
  if (href === '/') return location === '/';
  if (href === '/purchases') return location === href || location.startsWith('/purchases/');
  if (href === '/add') return location.startsWith('/add');
  return location === href;
}
function Brand() { return <div className="brand"><span className="brand-mark"><Archive size={18} /></span><span>PurchaseVault</span></div>; }
function Shell({ location, onLogout }) {
  return <aside className="sidebar"><Brand /><div className="side-label">Workspace</div><nav className="nav-list">{navItems.map(({ href, label, icon: Icon }) => <Link key={href} href={href} className={`nav-link ${isNavActive(href, location) ? 'active' : ''}`} data-testid={`link-nav-${label.toLowerCase().replaceAll(' ', '-')}`}><Icon size={17} strokeWidth={1.8} /><span>{label}</span></Link>)}</nav><div className="side-bottom"><div className="local-note"><Shield size={14} /><span>Your account records sync securely with your vault.</span></div><button className="logout-link" onClick={onLogout} data-testid="button-logout"><ArrowLeft size={14} /> Sign out</button></div></aside>;
}
function MobileNav({ location }) {
  return <nav className="mobile-nav" aria-label="Main navigation">{navItems.map(({ href, label, icon: Icon }) => <Link key={href} href={href} className={`nav-link ${isNavActive(href, location) ? 'active' : ''}`} data-testid={`mobile-nav-${label.toLowerCase().replaceAll(' ', '-')}`}><Icon size={17} /><span>{label}</span></Link>)}</nav>;
}
function Heading({ eyebrow, title, description, action }) { return <div className="page-heading"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="subtitle">{description}</p></div>{action}</div>; }
function Status({ status }) { if (!status) return <span className="badge badge-neutral">No return deadline</span>; return <span className={`badge badge-${status.kind}`} data-testid={`status-warranty-${status.kind}`}><span>{status.label}</span></span>; }
function WarrantyBadge({ purchase }) { return <Status status={warrantyStatus(purchase)} />; }
function ReturnBadge({ purchase }) {
  const status = returnStatus(purchase);
  return status ? <span className="badge badge-soon" data-testid={`status-return-${purchase.id}`}>{status.label} · {daysLabel(status.days)}</span> : null;
}
function ProductIcon({ category }) {
  const Icon = category === 'Electronics' ? Laptop : category === 'Appliances' ? Headphones : category === 'Furniture' ? Package : category === 'Home & Kitchen' ? Home : Tag;
  return <span className="product-avatar"><Icon size={17} strokeWidth={1.7} /></span>;
}
function PurchaseRow({ purchase, onDelete }) {
  const status = warrantyStatus(purchase);
  return <tr data-testid={`row-purchase-${purchase.id}`}><td><Link href={`/purchases/${purchase.id}`} className="product-cell" data-testid={`link-purchase-${purchase.id}`}><ProductIcon category={purchase.category} /><span><span className="product-name">{purchase.productName}</span><span className="product-brand">{purchase.brand} · {purchase.category}</span></span></Link></td><td>{fmtDate(purchase.purchaseDate)}</td><td>{currency(purchase.price)}</td><td><div className="status-stack"><WarrantyBadge purchase={purchase} /><ReturnBadge purchase={purchase} /></div></td><td>{fmtDate(dateInput(warrantyExpiry(purchase)))}</td><td><div style={{ display: 'flex', gap: 2 }}><Link href={`/purchases/${purchase.id}`} className="icon-btn" aria-label={`View ${purchase.productName}`} data-testid={`button-view-${purchase.id}`}><ArrowUpRight size={15} /></Link><Link href={`/add?edit=${purchase.id}`} className="icon-btn" aria-label={`Edit ${purchase.productName}`} data-testid={`button-edit-${purchase.id}`}><Pencil size={14} /></Link><button className="icon-btn" aria-label={`Delete ${purchase.productName}`} onClick={() => onDelete(purchase.id)} data-testid={`button-delete-${purchase.id}`}><Trash2 size={15} /></button></div></td></tr>;
}
function PurchaseTable({ purchases, onDelete, emptyTitle = 'No purchases yet', emptyText = 'Add a purchase to keep its important dates and details close at hand.', compact = false }) {
  if (!purchases.length) return <div className="empty-state"><div className="empty-mark"><Package size={20} /></div><h3>{emptyTitle}</h3><p>{emptyText}</p><Link href="/add" className="btn btn-primary" data-testid="button-empty-add"><Plus size={15} /> Add a purchase</Link></div>;
  return <div className="table-wrap"><table className="purchase-table"><thead><tr><th>Purchase</th><th>Purchase date</th><th>Price</th><th>Warranty</th><th>{compact ? 'Expires' : 'Warranty ends'}</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{purchases.map((purchase) => <PurchaseRow key={purchase.id} purchase={purchase} onDelete={onDelete} />)}</tbody></table></div>;
}
function Summary({ purchases, summary }) {
  const soon = purchases.filter((p) => warrantyStatus(p).kind === 'soon');
  const active = purchases.filter((p) => warrantyStatus(p).kind !== 'expired');
  const returnDue = purchases.filter((p) => returnStatus(p));
  const stats = [
    { label: 'Total purchases', value: summary?.totalPurchases ?? purchases.length, detail: 'Items in your vault', icon: Package },
    { label: 'Active warranties', value: summary?.activeWarranties ?? active.length, detail: 'Including expiring soon', icon: ShieldCheck },
    { label: 'Expiring soon', value: summary?.expiringSoon ?? soon.length, detail: 'Within the next 30 days', icon: Clock3 },
    { label: 'Return deadlines', value: summary?.returnDeadlines ?? returnDue.length, detail: 'Closing within 7 days', icon: CalendarDays },
  ];
  return <div className="stats-grid">{stats.map(({ label, value, detail, icon: Icon }) => <div className="stat-card" key={label} data-testid={`card-summary-${label.toLowerCase().replaceAll(' ', '-')}`}><div className="stat-top"><span>{label}</span><span className="stat-icon"><Icon size={15} /></span></div><div className="stat-number">{value}</div><div className="stat-foot">{detail}</div></div>)}</div>;
}
function Dashboard({ purchases, deletePurchase, summary, loading }) {
  const soon = purchases.filter((p) => warrantyStatus(p).kind === 'soon');
  const returnDue = purchases.filter((p) => returnStatus(p));
  const sorted = [...purchases].sort((a, b) => dateFrom(b.purchaseDate) - dateFrom(a.purchaseDate));
  return <main className="content"><Heading eyebrow="Your home base" title="Good to have it all in one place." description="A clear view of what you own, what’s covered, and what needs a little attention." action={<Link href="/add" className="btn btn-primary" data-testid="button-add-purchase"><Plus size={16} /> Add purchase</Link>} />{loading ? <LoadingPanel /> : <Summary purchases={purchases} summary={summary} />}
    {loading ? <LoadingPanel /> : <>
    {(soon.length || returnDue.length) ? <section className="panel" style={{ marginBottom: 18 }}><div className="panel-head"><h2>Worth a look</h2><Link className="text-link" href={returnDue.length ? '/purchases' : '/warranties'} data-testid="link-view-reminders">Review details <ChevronRight size={13} style={{ verticalAlign: 'middle' }} /></Link></div><div style={{ padding: '5px 20px 14px' }}>{returnDue.slice(0, 2).map((p) => <div key={`return-${p.id}`} className="status-line" style={{ padding: '11px 0', borderBottom: '1px solid #f0f3f2' }} data-testid={`reminder-return-${p.id}`}><span><CalendarDays size={14} style={{ verticalAlign: 'middle', marginRight: 8, color: '#a36c17' }} /><b>{p.productName}</b></span><ReturnBadge purchase={p} /></div>)}{soon.slice(0, 2).map((p) => <div key={`warranty-${p.id}`} className="status-line" style={{ padding: '11px 0' }} data-testid={`reminder-warranty-${p.id}`}><span><ShieldCheck size={14} style={{ verticalAlign: 'middle', marginRight: 8, color: '#a36c17' }} />Warranty ends for <b>{p.productName}</b></span><span className="badge badge-soon">{daysLabel(warrantyStatus(p).days)}</span></div>)}</div></section> : null}
    <section className="panel"><div className="panel-head"><div><h2>Recent purchases</h2><div className="subtitle" style={{ fontSize: 11, marginTop: 4 }}>The latest additions to your personal record</div></div><Link className="text-link" href="/purchases" data-testid="link-all-purchases">All purchases <ChevronRight size={13} style={{ verticalAlign: 'middle' }} /></Link></div><PurchaseTable purchases={sorted.slice(0, 5)} onDelete={deletePurchase} compact /></section></>}
  </main>;
}
function LoadingPanel() { return <div className="panel loading-panel" aria-label="Loading purchase data" data-testid="status-data-loading"><span className="skeleton-line wide" /><span className="skeleton-line" /><span className="skeleton-line medium" /></div>; }
function Purchases({ purchases, deletePurchase, loading }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All categories');
  const filtered = useMemo(() => purchases.filter((p) => {
    const haystack = `${p.productName} ${p.brand} ${p.category} ${p.serialNumber || ''}`.toLowerCase();
    return haystack.includes(query.toLowerCase()) && (category === 'All categories' || p.category === category);
  }), [purchases, query, category]);
  return <main className="content"><Heading eyebrow="Your record" title="Purchases" description={`${purchases.length} ${purchases.length === 1 ? 'item' : 'items'} in your personal vault.`} action={<Link href="/add" className="btn btn-primary" data-testid="button-add-purchase"><Plus size={16} /> Add purchase</Link>} />
    <div className="toolbar"><div className="field-search"><Search size={16} /><input className="input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search products, brands, serial numbers…" aria-label="Search purchases" data-testid="input-search-purchases" /></div><select className="select" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Filter by category" data-testid="select-category-filter"><option>All categories</option>{categories.map((c) => <option key={c}>{c}</option>)}</select></div>
     <section className="panel"><div className="panel-head"><h2>{category === 'All categories' ? 'All purchases' : category}<span className="count" style={{ marginLeft: 8 }} data-testid="text-filtered-count">{filtered.length}</span></h2><span className="subtitle" style={{ fontSize: 11 }}>{query || category !== 'All categories' ? 'Filtered results' : 'Sorted by most recent'}</span></div>{loading ? <LoadingPanel /> : <PurchaseTable purchases={[...filtered].sort((a, b) => dateFrom(b.purchaseDate) - dateFrom(a.purchaseDate))} onDelete={deletePurchase} emptyTitle={purchases.length ? 'No matching purchases' : 'Your vault is ready'} emptyText={purchases.length ? 'Try a different search or category.' : 'Start with a purchase you want to keep track of.'} />}</section>
  </main>;
}
const emptyForm = { productName: '', brand: '', category: 'Electronics', price: '', purchaseDate: dateInput(today()), warrantyMonths: '12', returnDeadline: '', serialNumber: '' };
function PurchaseForm({ purchases, addPurchase, updatePurchase, loading }) {
  const [location, setLocation] = useLocation();
  const params = new URLSearchParams(window.location.search);
  const editId = params.get('edit');
  const existing = purchases.find((p) => p.id === editId);
  const [values, setValues] = useState(() => existing ? { ...existing, price: String(existing.price), warrantyMonths: String(existing.warrantyMonths) } : emptyForm);
  const [error, setError] = useState('');
  const [localSuccess, setLocalSuccess] = useState('');
  useEffect(() => { setValues(existing ? { ...existing, price: String(existing.price), warrantyMonths: String(existing.warrantyMonths) } : emptyForm); }, [editId]);
  const change = (key) => (event) => setValues((v) => ({ ...v, [key]: event.target.value }));
  const [saving, setSaving] = useState(false);
  const submit = async (event) => {
    event.preventDefault(); setError(''); setLocalSuccess('');
    if (!values.productName.trim() || !values.brand.trim() || !values.purchaseDate || values.price === '' || values.warrantyMonths === '') { setError('Complete each required field before saving.'); return; }
    if (!Number.isFinite(Number(values.price)) || Number(values.price) < 0) { setError('Enter a valid purchase price of zero or more.'); return; }
    if (!Number.isInteger(Number(values.warrantyMonths)) || Number(values.warrantyMonths) < 0 || Number(values.warrantyMonths) > 120) { setError('Warranty duration must be a whole number from 0 to 120 months.'); return; }
    if (values.returnDeadline && dateFrom(values.returnDeadline) < dateFrom(values.purchaseDate)) { setError('Return deadline cannot come before the purchase date.'); return; }
    const payload = { productName: values.productName.trim(), brand: values.brand.trim(), category: values.category, price: Number(values.price), purchaseDate: values.purchaseDate, warrantyMonths: Number(values.warrantyMonths), returnDeadline: values.returnDeadline || '', serialNumber: values.serialNumber.trim(), invoiceNumber: values.invoiceNumber || null, sellerName: values.sellerName || null, notes: values.notes || null };
    setSaving(true);
    try {
      if (existing) { await updatePurchase(existing.id, payload); setLocalSuccess('Your purchase details have been updated.'); setLocation(`/purchases/${existing.id}`); }
      else { const created = await addPurchase(payload); setLocalSuccess('Purchase added. Opening your purchase record…'); setLocation(`/purchases/${created.id}`); }
    } catch (saveError) { setError(readableError(saveError)); }
    finally { setSaving(false); }
  };
  if (editId && loading) return <main className="content"><LoadingPanel /></main>;
  return <main className="content"><Heading eyebrow={existing ? 'Update your record' : 'Add to your record'} title={existing ? 'Edit purchase' : 'Add a purchase'} description="Keep the details you’ll want when you need them." action={<Link href={existing ? `/purchases/${existing.id}` : '/purchases'} className="btn btn-quiet" data-testid="button-cancel-form"><ArrowLeft size={15} /> Back</Link>} />
    <form className="panel form-panel" onSubmit={submit} noValidate data-testid="form-purchase"><p className="subtitle" style={{ marginBottom: 22 }}>Fields marked <b style={{ color: '#314b52' }}>required</b> help keep your warranty timeline accurate.</p>
      {error && <div className="feedback error" role="alert" data-testid="status-form-error">{error}</div>}{localSuccess && <div className="feedback success" role="status">{localSuccess}</div>}
      <div className="form-grid">
        <div className="form-field"><label htmlFor="productName">Product name <span>Required</span></label><input id="productName" className="input" value={values.productName} onChange={change('productName')} placeholder="e.g. Wireless headphones" required data-testid="input-product-name" /></div>
        <div className="form-field"><label htmlFor="brand">Brand <span>Required</span></label><input id="brand" className="input" value={values.brand} onChange={change('brand')} placeholder="e.g. Sony" required data-testid="input-brand" /></div>
        <div className="form-field"><label htmlFor="category">Category</label><select id="category" className="select" value={values.category} onChange={change('category')} data-testid="select-purchase-category">{categories.map((c) => <option key={c}>{c}</option>)}</select></div>
        <div className="form-field"><label htmlFor="price">Purchase price <span>Required</span></label><input id="price" className="input" type="number" min="0" step="0.01" value={values.price} onChange={change('price')} placeholder="0.00" required data-testid="input-purchase-price" /></div>
        <div className="form-field"><label htmlFor="purchaseDate">Purchase date <span>Required</span></label><input id="purchaseDate" className="input" type="date" value={values.purchaseDate} onChange={change('purchaseDate')} required data-testid="input-purchase-date" /></div>
        <div className="form-field"><label htmlFor="warrantyMonths">Warranty duration <span>Months · Required</span></label><input id="warrantyMonths" className="input" type="number" min="0" max="120" step="1" value={values.warrantyMonths} onChange={change('warrantyMonths')} required data-testid="input-warranty-months" /></div>
        <div className="form-field"><label htmlFor="returnDeadline">Return deadline <span>Optional</span></label><input id="returnDeadline" className="input" type="date" value={values.returnDeadline || ''} onChange={change('returnDeadline')} data-testid="input-return-deadline" /></div>
        <div className="form-field"><label htmlFor="serialNumber">Serial number <span>Optional</span></label><input id="serialNumber" className="input" value={values.serialNumber || ''} onChange={change('serialNumber')} placeholder="Add it when you have it" data-testid="input-serial-number" /></div>
      </div><div className="form-actions"><Link href={existing ? `/purchases/${existing.id}` : '/purchases'} className="btn btn-quiet" data-testid="button-cancel-form-secondary">Cancel</Link><button type="submit" className="btn btn-primary" disabled={saving} data-testid="button-save-purchase"><BadgeCheck size={15} />{saving ? 'Saving…' : existing ? 'Save changes' : 'Save purchase'}</button></div>
    </form>
  </main>;
}
function PurchaseDetail({ purchases, deletePurchase }) {
  const [, params] = useRoute('/purchases/:id');
  const detailQuery = useGetPurchase(params?.id || '', { query: { enabled: !!params?.id, queryKey: getGetPurchaseQueryKey(params?.id || '') } });
  const claimQuery = useGetPurchaseClaimSummary(params?.id || '', { query: { enabled: !!params?.id, queryKey: getGetPurchaseClaimSummaryQueryKey(params?.id || '') } });
  const purchase = detailQuery.data ? normalizePurchase(detailQuery.data) : purchases.find((p) => p.id === params?.id);
  if (detailQuery.isLoading) return <main className="content"><LoadingPanel /></main>;
  if (detailQuery.isError && !purchase) return <main className="content"><div className="feedback error" role="alert" data-testid="status-detail-error">This purchase could not be loaded. Return to your purchases and try again.</div><Link href="/purchases" className="btn btn-quiet">Back to purchases</Link></main>;
  if (!purchase) return <main className="content"><div className="empty-state"><div className="empty-mark"><Package size={20} /></div><h3>Purchase not found</h3><p>It may have been removed from your vault.</p><Link href="/purchases" className="btn btn-primary" data-testid="link-back-purchases">Back to purchases</Link></div></main>;
  const status = warrantyStatus(purchase);
  const returnInfo = returnStatus(purchase);
  return <main className="content"><Heading eyebrow="Purchase record" title={purchase.productName} description={`${purchase.brand} · ${purchase.category}`} action={<div style={{ display: 'flex', gap: 8 }}><Link href="/purchases" className="btn btn-quiet" data-testid="button-back-purchases"><ArrowLeft size={15} /> Back</Link><Link href={`/add?edit=${purchase.id}`} className="btn btn-primary" data-testid="button-edit-purchase"><Pencil size={14} /> Edit</Link></div>} />
    <div className="detail-grid"><section className="panel detail-card"><div className="detail-title"><div><div className="product-cell"><ProductIcon category={purchase.category} /><div><div className="eyebrow" style={{ margin: 0 }}>Purchase details</div><h2>{purchase.productName}</h2><p className="subtitle">{purchase.brand}</p></div></div></div><div className="detail-price">{currency(purchase.price)}</div></div>
      <div className="detail-meta"><Meta label="Category" value={purchase.category} /><Meta label="Purchase date" value={fmtDate(purchase.purchaseDate)} /><Meta label="Serial number" value={purchase.serialNumber || 'Not recorded'} /><Meta label="Warranty duration" value={`${purchase.warrantyMonths} months`} /></div>
      <div className="status-box"><div className="status-line"><span><ShieldCheck size={15} style={{ verticalAlign: 'middle', marginRight: 7 }} />Warranty status</span><WarrantyBadge purchase={purchase} /></div><div className="status-line" style={{ marginTop: 12 }}><span>Warranty ends</span><strong>{fmtDate(dateInput(warrantyExpiry(purchase)))}</strong></div>{status.kind !== 'expired' && <div className="status-line" style={{ marginTop: 8 }}><span>Time remaining</span><strong>{daysLabel(status.days)}</strong></div>}</div>
      {purchase.returnDeadline && <div className="status-box" style={{ background: returnInfo ? '#fff8e9' : '#f7f9f8' }}><div className="status-line"><span><CalendarDays size={15} style={{ verticalAlign: 'middle', marginRight: 7 }} />Return deadline</span><strong>{fmtDate(purchase.returnDeadline)}</strong></div>{returnInfo && <div style={{ marginTop: 9 }}><ReturnBadge purchase={purchase} /></div>}</div>}
      {claimQuery.isError && <div className="feedback error" role="status" data-testid="status-claim-summary-error">Claim preparation details are temporarily unavailable; the purchase record above remains available.</div>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}><button className="btn btn-danger" onClick={() => deletePurchase(purchase.id)} data-testid="button-delete-purchase"><Trash2 size={14} /> Delete purchase</button></div>
    </section><div><section className="panel detail-card" style={{ marginBottom: 15 }}><h2 style={{ marginBottom: 14 }}>Documents</h2><div className="placeholder"><FileText size={21} /><div><b>Document management isn’t available yet</b></div>Files are not uploaded or stored by this version of PurchaseVault.</div></section><section className="panel detail-card"><h2 style={{ marginBottom: 14 }}>Repair history</h2><div className="placeholder"><Wrench size={21} /><div><b>Repair history isn’t available yet</b></div>Repair records can’t be added or managed here today.</div></section></div></div>
  </main>;
}
function Meta({ label, value }) { return <div><div className="meta-label">{label}</div><div className="meta-value">{value}</div></div>; }
function Warranties({ purchases, summary, loading }) {
  const groups = [
    { title: 'Expiring soon', kind: 'soon', detail: 'Ends within the next 30 days' },
    { title: 'Active', kind: 'active', detail: 'Coverage is still in place' },
    { title: 'Expired', kind: 'expired', detail: 'Warranty period has ended' },
  ];
  return <main className="content"><Heading eyebrow="Coverage timeline" title="Warranties" description="Know what’s covered and when each warranty reaches its end." action={<Link href="/add" className="btn btn-primary" data-testid="button-add-purchase"><Plus size={16} /> Add purchase</Link>} />{loading ? <LoadingPanel /> : <><Summary purchases={purchases} summary={summary} />
    {groups.map((group) => {
      const items = purchases.filter((p) => warrantyStatus(p).kind === group.kind).sort((a, b) => warrantyExpiry(a) - warrantyExpiry(b));
      return <section className="warranty-group" key={group.kind} data-testid={`group-warranty-${group.kind}`}><h2 className="group-heading">{group.title}<span className="count">{items.length}</span></h2>{items.length ? <div className="panel"><div className="table-wrap"><table className="purchase-table"><thead><tr><th>Purchase</th><th>Purchased</th><th>Warranty ends</th><th>Time left</th><th>Status</th></tr></thead><tbody>{items.map((p) => <tr key={p.id} data-testid={`row-warranty-${p.id}`}><td><Link href={`/purchases/${p.id}`} className="product-cell" data-testid={`link-warranty-purchase-${p.id}`}><ProductIcon category={p.category} /><span><span className="product-name">{p.productName}</span><span className="product-brand">{p.brand}</span></span></Link></td><td>{fmtDate(p.purchaseDate)}</td><td>{fmtDate(dateInput(warrantyExpiry(p)))}</td><td>{warrantyStatus(p).kind === 'expired' ? 'Ended' : daysLabel(warrantyStatus(p).days)}</td><td><WarrantyBadge purchase={p} /></td></tr>)}</tbody></table></div></div> : <div className="panel" style={{ padding: '19px 21px', color: '#8a999d', fontSize: 11 }}>{group.detail}. Nothing to show here right now.</div>}</section>;
    })}
    {purchases.some((p) => p.returnDeadline) && <p className="subtitle">Return deadlines are tracked separately from warranty coverage.</p>}
  </>}</main>;
}
function Claims({ purchases, loading }) {
  const eligible = purchases;
  if (loading) return <main className="content"><Heading eyebrow="Claim Mode" title="Prepare with the details you have." description="A handy, honest checklist for a warranty conversation." /><LoadingPanel /></main>;
  return <main className="content"><Heading eyebrow="Claim Mode" title="Prepare with the details you have." description="A handy, honest checklist for a warranty conversation. Nothing is submitted or sent from PurchaseVault." />
    <div className="claim-banner"><div><h2>You're in control of the next step.</h2><p>Use the information below when you contact the manufacturer yourself. PurchaseVault does not contact brands, confirm coverage, or file claims on your behalf.</p></div><span className="badge badge-active">Private preparation only</span></div>
    {eligible.length ? eligible.map((p) => {
      const s = warrantyStatus(p);
      return <section className="panel claim-card" key={p.id} data-testid={`card-claim-${p.id}`}><div className="claim-card-head"><div><h2>{p.productName}</h2><p className="subtitle">{p.brand} · Purchased {fmtDate(p.purchaseDate)}</p></div><WarrantyBadge purchase={p} /></div><div className="claim-data"><Meta label="Brand" value={p.brand} /><Meta label="Serial number" value={p.serialNumber || 'Not recorded'} /><Meta label="Purchase date" value={fmtDate(p.purchaseDate)} /><Meta label="Warranty duration" value={`${p.warrantyMonths} months`} /><Meta label="Calculated warranty end" value={fmtDate(dateInput(warrantyExpiry(p)))} /><Meta label="Warranty timeline" value={s.kind === 'expired' ? 'Expired' : `${daysLabel(s.days)} remaining`} /></div><p className="subtitle" style={{ margin: '13px 0 0' }}>These are the details saved in your vault; confirm coverage and any requirements directly with {p.brand}.</p></section>;
    }) : <section className="panel"><div className="empty-state"><div className="empty-mark"><ClipboardList size={20} /></div><h3>No purchase details to prepare with</h3><p>Add a purchase to build a clear reference for a future warranty conversation.</p><Link href="/add" className="btn btn-primary" data-testid="button-claim-add">Add a purchase</Link></div></section>}
  </main>;
}
function Settings({ user, onLogout }) {
  const [showPrivacy, setShowPrivacy] = useState(false);
  return <main className="content"><Heading eyebrow="Preferences" title="Settings" description="A few straightforward details about how your vault works." />
    <section className="panel settings-card"><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 15 }}><div><h2>Signed in account</h2><p>Your purchases are associated with this account.</p><div className="account-identity" data-testid="text-account-identity"><strong>{user?.name}</strong><span>{user?.email}</span></div></div><span className="stat-icon"><Shield size={16} /></span></div><button className="btn btn-quiet" onClick={onLogout} style={{ marginTop: 16 }} data-testid="button-settings-logout">Sign out <ArrowLeft size={14} /></button></section>
    <section className="panel settings-card"><h2>Browser-local import source</h2><p>Older browser-local purchases are kept only as an optional import source. When this account has no server purchases, you can review and explicitly import them from the dashboard. Importing does not erase the browser copy.</p><button className="btn btn-quiet" onClick={() => setShowPrivacy((v) => !v)} style={{ marginTop: 16 }} data-testid="button-storage-details">{showPrivacy ? 'Hide details' : 'How it works'} <ChevronRight size={14} /></button>{showPrivacy && <div className="status-box" style={{ fontSize: 11, lineHeight: 1.7, color: '#597178' }} data-testid="text-storage-details">PurchaseVault reads the existing browser-local record only to offer a user-confirmed import. New and edited purchases are stored in your account, not continuously in browser storage.</div>}</section>
    <section className="panel settings-card"><h2>About this vault</h2><p>PurchaseVault keeps purchase dates, prices, serial numbers, and calculated warranty timelines together so ownership details are easier to find when you need them. Document upload and manufacturer verification are not available here.</p></section>
  </main>;
}
function NotFound() { return <main className="content"><div className="empty-state"><div className="empty-mark"><CircleAlert size={20} /></div><h3>That page isn’t in your vault</h3><p>Head back to your purchase overview.</p><Link className="btn btn-primary" href="/" data-testid="link-home">Go to overview</Link></div></main>; }
export default App;
