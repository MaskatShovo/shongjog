'use client';

import { useEffect, useRef, useState } from 'react';
import { Activity, ArrowDown, ArrowRight, ArrowUpRight, Check, CheckCheck, ChevronRight, Cloud, Download, FileText, FlaskConical, Globe2, LayoutDashboard, Loader2, MapPin, Minus, Package, Plus, Radio, RefreshCw, Search, Send, ShieldCheck, Signal, Smartphone, Truck, Warehouse, Wifi, WifiOff, X, Zap, CircleHelp, Clock3, LockKeyhole, MessageSquare, Network } from 'lucide-react';
import { PRODUCTS, money, totalOf, validateOrder, type LocalOrder, type OrderPayload, type Receipt, type ServerOrder, type Trace } from '../lib/domain';
import { readDevice, writeDevice } from '../lib/offline';

type View = 'overview' | 'field' | 'warehouse' | 'lab' | 'business';
type Mode = 'online' | 'weak' | 'offline';
const navigation = [
  { id: 'overview', label: 'Mission control', icon: LayoutDashboard },
  { id: 'field', label: 'Field orders', icon: Smartphone },
  { id: 'warehouse', label: 'Warehouse', icon: Warehouse },
  { id: 'lab', label: 'Resilience lab', icon: FlaskConical },
  { id: 'business', label: 'The business case', icon: FileText },
] as const;
const fmtTime = (date: string) => new Date(date).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const shortId = (id: string) => 'SJ-' + id.slice(0, 6).toUpperCase();
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const blank = { orders: [] as LocalOrder[], traces: [] as Trace[] };

export default function Shongjog({ tenant }: { tenant: string }) {
  const [view, setView] = useState<View>('overview');
  const [device, setDevice] = useState(blank), deviceRef = useRef(blank);
  const [server, setServer] = useState<ServerOrder[]>([]);
  const [metrics, setMetrics] = useState({ attempts: 0, duplicates: 0 });
  const [mode, setMode] = useState<Mode>('online'), modeRef = useRef<Mode>('online');
  const [online, setOnline] = useState(true), [ready, setReady] = useState(false);
  const [syncing, setSyncing] = useState(false), busy = useRef(false);
  const [modal, setModal] = useState(false), [detail, setDetail] = useState<LocalOrder | ServerOrder | null>(null);
  const [toast, setToast] = useState(''), [error, setError] = useState('');
  const [query, setQuery] = useState(''), [filter, setFilter] = useState('all');
  const [drilling, setDrilling] = useState(false), [drillStep, setDrillStep] = useState(-1), [drillResult, setDrillResult] = useState('');
  const [offlineReady, setOfflineReady] = useState(false);
  const [bangla, setBangla] = useState(false);
  const [reps, setReps] = useState(20), [fee, setFee] = useState(150), [smsCost, setSmsCost] = useState(20);
  const syncRef = useRef<() => Promise<void>>(async () => {});

  async function persist(orders: LocalOrder[], traces = deviceRef.current.traces) {
    const value = { orders, traces: traces.slice(0, 100) };
    const saved = await writeDevice(tenant, value);
    deviceRef.current = saved; setDevice(saved);
  }
  async function trace(label: string, detail: string, kind: Trace['kind'] = 'info') {
    const event = { id: crypto.randomUUID(), at: new Date().toISOString(), label, detail, kind };
    await persist(deviceRef.current.orders, [event, ...deviceRef.current.traces]);
  }
  function notify(message: string) { setToast(message); }
  function changeMode(next: Mode) {
    modeRef.current = next; setMode(next);
    localStorage.setItem('shongjog-mode-v1', next);
    if (next !== 'offline') void syncRef.current();
  }
  async function refresh() {
    if (!navigator.onLine) return;
    const response = await fetch('/api/orders', { cache: 'no-store', signal: AbortSignal.timeout(10000) });
    const data = await response.json() as { orders: ServerOrder[]; metrics: { attempts: number; duplicates: number }; error?: string };
    if (!response.ok) throw new Error(data.error || 'Could not reach the warehouse.');
    setServer(data.orders); setMetrics(data.metrics); setError('');
    const confirmed = new Map(data.orders.map(order => [order.id, order]));
    if (deviceRef.current.orders.some(order => confirmed.has(order.id))) {
      await persist(deviceRef.current.orders.map(order => {
        const remote = confirmed.get(order.id);
        const matches = remote && JSON.stringify(validateOrder(remote)) === JSON.stringify(validateOrder(order));
        return matches ? { ...order, state: 'received', error: undefined, receipt: { receipt: remote.receipt, status: remote.status, receivedAt: remote.receivedAt, total: remote.total, channel: remote.channel, duplicate: false } } : order;
      }));
    }
    return data.orders as ServerOrder[];
  }
  async function deliver(order: LocalOrder | OrderPayload, channel: 'data' | 'sms_simulator' = 'data'): Promise<Receipt> {
    const payload: OrderPayload = { id: order.id, shop: order.shop, area: order.area, createdAt: order.createdAt, items: order.items, demo: order.demo };
    const response = await fetch('/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order: payload, channel }), signal: AbortSignal.timeout(10000) });
    const result = await response.json() as Receipt & { error?: string };
    if (!response.ok) { const e = new Error(result.error || 'Delivery failed.'); Object.assign(e, { conflict: response.status === 409 }); throw e; }
    return result;
  }
  async function sync() {
    if (busy.current || modeRef.current === 'offline' || !navigator.onLine || !ready) return;
    busy.current = true; setSyncing(true);
    try {
      for (const pending of deviceRef.current.orders.filter(o => o.state === 'queued')) {
        if ((modeRef.current as Mode) === 'offline' || !navigator.onLine) break;
        if (modeRef.current === 'weak') { await wait(1600); if (modeRef.current as Mode === 'offline') break; }
        try {
          const receipt = await deliver(pending);
          await persist(deviceRef.current.orders.map(o => o.id === pending.id ? { ...o, state: 'received', receipt, error: undefined } : o));
          await trace(receipt.duplicate ? 'Duplicate safely reconciled' : 'Warehouse receipt confirmed', shortId(pending.id) + ' · ' + pending.shop, 'success');
        } catch (e) {
          const message = e instanceof Error ? e.message : 'Could not sync. Your order is still on this device.';
          const conflict = Boolean((e as { conflict?: boolean }).conflict);
          await persist(deviceRef.current.orders.map(o => o.id === pending.id ? { ...o, state: conflict ? 'conflict' : 'queued', error: message, interrupted: true } : o));
          setError(message); break;
        }
      }
      await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : 'Warehouse temporarily unreachable.'); }
    finally { busy.current = false; setSyncing(false); }
  }
  useEffect(() => { syncRef.current = sync; });
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }); }, [view]);
  useEffect(() => {
    let alive = true;
    void readDevice(tenant).then(value => { if (alive) { deviceRef.current = value; setDevice(value); setReady(true); } }).catch(() => setError('Device storage is unavailable. Enable browser storage before creating orders.'));
    const storedMode = localStorage.getItem('shongjog-mode-v1');
    if (storedMode === 'offline' || storedMode === 'weak') { modeRef.current = storedMode; setMode(storedMode); }
    const connection = () => { setOnline(navigator.onLine); if (navigator.onLine) void syncRef.current(); };
    connection(); window.addEventListener('online', connection); window.addEventListener('offline', connection);
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      void navigator.serviceWorker.register('/sw.js').then(() => navigator.serviceWorker.ready).then(registration => {
        const urls = performance.getEntriesByType('resource').map(entry => entry.name).filter(name => { const u = new URL(name); return u.origin === location.origin && /\.(js|css|svg|woff2?)$/.test(u.pathname); });
        registration.active?.postMessage({ type: 'CACHE_SHELL', urls });
      }).catch(() => {});
    }
    const message = (event: MessageEvent) => { if (event.data?.type === 'SHELL_CACHED') setOfflineReady(true); };
    navigator.serviceWorker?.addEventListener('message', message);
    const crossTab = new BroadcastChannel('shongjog-device');
    crossTab.onmessage = () => { void readDevice(tenant).then(value => { if(alive) {deviceRef.current=value;setDevice(value);} }); };
    return () => { alive = false; window.removeEventListener('online', connection); window.removeEventListener('offline', connection); navigator.serviceWorker?.removeEventListener('message', message); crossTab.close(); };
  }, [tenant]);
  useEffect(() => { if (ready) { void syncRef.current(); } const timer = setInterval(() => void syncRef.current(), 12000); return () => clearInterval(timer); }, [ready]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 6000); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => { const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { setModal(false); setDetail(null); } }; window.addEventListener('keydown', esc); return () => window.removeEventListener('keydown', esc); }, []);

  const queued = device.orders.filter(o => o.state === 'queued');
  const recovered = device.orders.filter(o => o.interrupted && o.state === 'received');
  const value = server.reduce((s, o) => s + o.total, 0);
  const blocked = mode === 'offline' || !online;
  const allOrders = [...device.orders, ...server.filter(s => !device.orders.some(d => d.id === s.id))];
  const shown = (view === 'warehouse' ? server : allOrders).filter(o => (o.shop + ' ' + o.area + ' ' + shortId(o.id)).toLowerCase().includes(query.toLowerCase())).filter(o => filter === 'all' || (filter === 'queued' ? 'state' in o && o.state === 'queued' : server.some(s => s.id === o.id && s.status === filter)));

  async function saveOrder(payload: OrderPayload) {
    if (!ready) throw new Error('Device storage is not ready.');
    const order: LocalOrder = { ...payload, savedAt: new Date().toISOString(), state: 'queued', interrupted: blocked || mode === 'weak' };
    await persist([order, ...deviceRef.current.orders]);
    await trace('Order secured on device', shortId(order.id) + ' · ' + money(totalOf(order.items)), blocked ? 'warning' : 'success');
    notify(blocked ? 'Saved on this device. It will sync when the connection returns.' : 'Saved on this device. Sending to the warehouse…');
    setModal(false); void syncRef.current();
  }
  async function replay(order: LocalOrder | ServerOrder) {
    if (!navigator.onLine) { notify('The SMS simulator needs a real internet connection. No SMS has been sent.'); return; }
    try {
      const receipt = await deliver(order, 'sms_simulator');
      await persist(deviceRef.current.orders.map(o => o.id === order.id ? { ...o, state: 'received', receipt, error: undefined } : o));
      await trace(receipt.duplicate ? 'Delayed SMS replay deduplicated' : 'SMS simulation delivered', shortId(order.id) + ' · No real SMS sent', receipt.duplicate ? 'success' : 'info');
      await refresh(); notify(receipt.duplicate ? 'Same receipt returned. No duplicate order was created.' : 'Simulated SMS delivered to the real server. No real SMS was sent.');
    } catch (e) { notify(e instanceof Error ? e.message : 'Replay failed.'); }
  }
  async function accept(order: ServerOrder) {
    try {
      const response = await fetch('/api/orders', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: order.id, status: 'accepted' }), signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error('Could not accept the order.');
      await refresh(); await trace('Warehouse accepted order', shortId(order.id), 'success'); notify('Order accepted by the warehouse.');
    } catch (e) { notify(e instanceof Error ? e.message : 'Could not accept.'); }
  }
  async function runDrill() {
    if (!ready || busy.current || !navigator.onLine) { notify('Connect to the internet and let the current sync finish before starting the drill.'); return; }
    setDrilling(true); setDrillResult(''); setDrillStep(0); busy.current = true;
    const original = modeRef.current;
    try {
      modeRef.current = 'offline'; setMode('offline'); localStorage.setItem('shongjog-mode-v1', 'offline');
      const order: LocalOrder = { id: crypto.randomUUID(), shop: 'Resilience demo · Rahman Store', area: 'Mirpur, Dhaka', createdAt: new Date().toISOString(), savedAt: new Date().toISOString(), items: [{ productId: 'rice', quantity: 3 }, { productId: 'oil', quantity: 6 }], demo: true, state: 'queued', interrupted: true };
      await persist([order, ...deviceRef.current.orders]); await trace('Drill · mobile data cut', shortId(order.id) + ' saved while lab data channel is blocked', 'warning'); await wait(800);
      setDrillStep(1); const disk = await readDevice(tenant); if (!disk.orders.some(o => o.id === order.id)) throw new Error('Device persistence check failed.');
      await trace('Drill · durable storage verified', 'Read the saved order back from IndexedDB', 'success'); await wait(800);
      setDrillStep(2); const first = await deliver(order, 'sms_simulator');
      await trace('Drill · fallback simulation received', 'Real database receipt · SMS transport simulated', 'success'); await wait(800);
      setDrillStep(3); modeRef.current = 'online'; setMode('online');
      const second = await deliver(order, 'data');
      if (!second.duplicate || second.receipt !== first.receipt) throw new Error('Receipt reconciliation check failed.');
      await persist(deviceRef.current.orders.map(o => o.id === order.id ? { ...o, state: 'received', receipt: second } : o));
      await trace('Drill · data retry deduplicated', 'Both channels resolved to the same immutable receipt', 'success'); await wait(800);
      setDrillStep(4); const received = await refresh();
      if (received?.filter(o => o.id === order.id).length !== 1) throw new Error('Warehouse uniqueness check failed.');
      setDrillResult('Passed. One durable order. Two delivery attempts. One warehouse receipt.'); await trace('Resilience drill passed', 'Persistence, fallback simulation, and duplicate reconciliation verified', 'success');
    } catch (e) { setDrillResult('Drill incomplete: ' + (e instanceof Error ? e.message : 'Connection failed.')); }
    finally { modeRef.current = original; setMode(original); localStorage.setItem('shongjog-mode-v1', original); busy.current = false; setDrilling(false); }
  }
  function downloadReport() {
    const report = { product: 'Shongjog', generatedAt: new Date().toISOString(), scope: 'Prototype workspace. Demo orders are labeled. Order value is not revenue.', serverOrders: server, deliveryMetrics: metrics, deviceQueue: device.orders, events: device.traces };
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'shongjog-evidence.json'; anchor.click(); URL.revokeObjectURL(url);
  }

  return <div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="#" onClick={e => { e.preventDefault(); setView('overview'); }} aria-label="Shongjog home"><span className="brand-mark"><Network size={23}/></span><span>shongjog<span className="brand-dot">.</span><small>BUSINESS, UNINTERRUPTED</small></span></a>
      <div className="workspace-label">YOUR WORKSPACE <span>01</span></div>
      <nav aria-label="Main navigation">{navigation.map(n => <button key={n.id} className={view === n.id ? 'nav-item active' : 'nav-item'} onClick={() => { setView(n.id); setQuery(''); setFilter('all'); }}><n.icon size={18}/><span>{n.label}</span>{n.id === 'field' && queued.length > 0 ? <b>{queued.length}</b> : n.id === 'lab' ? <span className="new-tag">LIVE</span> : null}</button>)}</nav>
      <div className="sidebar-note"><span className="tiny-orbit"><ShieldCheck size={19}/></span><strong>Built for the last mile.</strong><p>Because important work shouldn’t depend on perfect signal.</p><button onClick={() => setView('lab')}>Put it to the test <ArrowUpRight size={14}/></button></div>
      <div className="sidebar-bottom"><div className="avatar">MS</div><div><strong>Maskat’s workspace</strong><small>Private prototype · v1.0</small></div><LockKeyhole size={14}/></div>
    </aside>
    <div className="main-shell">
      <header className="topbar"><div className="breadcrumb">Workspace <ChevronRight size={13}/><strong>{navigation.find(n => n.id === view)?.label}</strong></div><div className="topbar-right"><span className="prototype-label">INDEPENDENT PROTOTYPE</span><button className="icon-button" aria-label="Open product guide" onClick={() => setView('business')}><CircleHelp size={18}/></button><span className="avatar small">MS</span></div></header>
      <main>
        <div className="page-title"><div><div className="eyebrow">THE LAST MILE, CONNECTED</div><h1>{view === 'overview' ? 'A good day to keep moving.' : view === 'field' ? 'Every order deserves to arrive.' : view === 'warehouse' ? 'From the field. Ready for action.' : view === 'lab' ? 'Don’t take our word for it.' : 'Reliability is good business.'}</h1><p>{view === 'overview' ? 'Your field operations, with a little more certainty.' : view === 'field' ? 'Capture now. Deliver when you can. Never guess what happened.' : view === 'warehouse' ? 'Server-confirmed orders, with a receipt you can trace.' : view === 'lab' ? 'Break the connection. Watch the recovery. Inspect the evidence.' : 'A focused enterprise product with a measurable path to a pilot.'}</p></div><button className="button secondary compact" onClick={downloadReport}><Download size={15}/> Export evidence</button></div>
        {error ? <div className="error-banner" role="alert"><WifiOff size={16}/><span>{error} Your device-saved orders are retained.</span><button onClick={() => void syncRef.current()}>Retry</button></div> : null}
        <section className={'connection-strip ' + (blocked || error ? 'disconnected' : '')} aria-label="Connection controls"><div className="connection-copy"><span className={'status-light ' + (blocked || error ? 'orange' : '')}/><strong>{!online ? 'Device is offline' : blocked ? 'Mobile data paused' : error ? 'Warehouse unreachable' : !ready ? 'Preparing your device' : mode === 'weak' ? 'Weak connection simulated' : 'You’re connected'}</strong><span>{blocked || error ? 'New orders stay safe on this device.' : mode === 'weak' ? 'An extra 1.6 seconds before each delivery.' : 'Your device and warehouse can talk.'}</span></div><div className="mode-control" aria-label="Lab network mode">{(['online', 'weak', 'offline'] as const).map(m => <button key={m} disabled={drilling} aria-pressed={mode === m} onClick={() => changeMode(m)} className={mode === m ? 'selected' : ''}>{m === 'online' ? <Wifi size={13}/> : m === 'weak' ? <Signal size={13}/> : <WifiOff size={13}/>} {m === 'online' ? 'Online' : m === 'weak' ? 'Weak' : 'Cut data'}</button>)}</div></section>

        {view === 'overview' ? <>
          <section className="hero"><div className="hero-copy"><div className="pill"><span/> CONNECTIVITY HAS A BACKUP PLAN</div><h2>Keep moving.<br/>Even when the<br/><em>network doesn’t.</em></h2><p>From a shop counter to your warehouse.<br/>Every order saved. Every receipt accounted for.</p><div className="hero-actions"><button className="button primary" onClick={() => setModal(true)} disabled={!ready}><Plus size={17}/> Create an order</button><button className="hero-link" onClick={() => setView('lab')}>Try the resilience lab <ArrowUpRight size={16}/></button></div></div><NetworkArt blocked={blocked} pending={queued.length}/><div className="hero-bottom"><span><ShieldCheck size={14}/> Device-first storage</span><span><CheckCheck size={14}/> Duplicate-safe delivery</span><span><Globe2 size={14}/> Made for Bangladesh</span></div></section>
          <section className="stats-grid"><Stat icon={Package} title="Orders received" value={String(server.length)} sub="Confirmed by the warehouse"/><Stat icon={Clock3} title="Safely queued" value={String(queued.length)} sub="On this device, awaiting receipt" accent={queued.length > 0}/><Stat icon={ShieldCheck} title="Duplicates prevented" value={String(metrics.duplicates)} sub="Repeated deliveries, one order"/><Stat icon={ArrowUpRight} title="Order value received" value={money(value)} sub="Order value, not collected revenue"/></section>
          <div className="two-column"><section className="panel"><PanelTitle eyebrow="END-TO-END VISIBILITY" title="The journey of an order" right={<span className="muted tiny">No guesswork.</span>}/><div className="journey">{[{icon: Smartphone,title:'Saved on device',sub:'Written to durable local storage',count:device.orders.length},{icon:Cloud,title:'Warehouse received',sub:'A server receipt confirms arrival',count:server.length},{icon:CheckCheck,title:'Accepted for fulfillment',sub:'A deliberate warehouse decision',count:server.filter(o=>o.status==='accepted').length}].map((j,i)=><div className="journey-step" key={j.title}><span className="step-icon"><j.icon size={20}/></span><div><strong>{j.title}</strong><small>{j.sub}</small></div><b>{j.count}</b>{i<2?<span className="journey-line"/>:null}</div>)}</div><div className="panel-foot"><span className="status-light"/> Independent states. Honest confirmations.</div></section><section className="panel dark-panel"><span className="eyebrow">ENGINEERED TO RECOVER</span><FlaskConical className="lab-watermark"/><h3>Go ahead.<br/>Break the connection.</h3><p>Save an order without data, replay a delayed message, and prove that only one order arrives.</p><button className="button light" onClick={()=>setView('lab')}>Enter the resilience lab <ArrowRight size={16}/></button><div className="lab-note">Real storage & server receipts. Simulated SMS.</div></section></div>
          <section className="panel orders-panel"><PanelTitle eyebrow="FIELD → WAREHOUSE" title="Recent orders" right={<button className="text-button" onClick={()=>setView('field')}>View all orders <ArrowRight size={14}/></button>}/><OrderTable orders={allOrders.slice(0,5)} server={server} onDetail={setDetail} onReplay={replay} onCreate={()=>setModal(true)} /></section>
        </> : null}

        {view === 'field' || view === 'warehouse' ? <>
          <section className="stats-grid three"><Stat icon={Smartphone} title={view==='field'?'Orders on this device':'Warehouse orders'} value={String(view==='field'?device.orders.length:server.length)} sub={view==='field'?'Persisted in your browser':'Persisted in the server database'}/><Stat icon={Clock3} title={view==='field'?'Waiting to sync':'Awaiting acceptance'} value={String(view==='field'?queued.length:server.filter(o=>o.status==='received').length)} sub={view==='field'?'Saved does not mean received':'Ready for a warehouse decision'}/><Stat icon={ShieldCheck} title={view==='field'?'Recovered after interruption':'Accepted orders'} value={String(view==='field'?recovered.length:server.filter(o=>o.status==='accepted').length)} sub={view==='field'?'Local records with a later receipt':'Confirmed for fulfillment'}/></section>
          <section className="panel orders-panel"><div className="orders-toolbar"><div><h2>{view==='field'?'Your field orders':'Warehouse inbox'}</h2><p>{view==='field'?'A local copy stays with you.':'This view uses server-confirmed records.'}</p></div><div className="toolbar-actions"><button className="button secondary" disabled={syncing||blocked} onClick={()=>void syncRef.current()}><RefreshCw size={15} className={syncing?'spin':''}/>{syncing?'Syncing…':'Sync now'}</button>{view==='field'?<button className="button primary" disabled={!ready} onClick={()=>setModal(true)}><Plus size={16}/> New order</button>:null}</div></div><div className="table-controls"><div className="tabs">{['all',...(view==='field'?['queued']:[]),'received','accepted'].map(f=><button key={f} className={filter===f?'active':''} onClick={()=>setFilter(f)}>{f==='all'?'All orders':f==='queued'?'Queued':f==='received'?'Received':'Accepted'}</button>)}</div><label className="search-box"><Search size={15}/><input aria-label="Search orders" placeholder="Search shop or order…" value={query} onChange={e=>setQuery(e.target.value)}/></label></div><OrderTable orders={shown} server={server} onDetail={setDetail} onReplay={replay} onAccept={view==='warehouse'?accept:undefined} onCreate={()=>setModal(true)}/></section>
          {view==='field'?<div className="info-note"><ShieldCheck size={17}/><span>Orders are stored on this browser until the warehouse confirms receipt. Keep this device’s site data to retain unsynced work.</span><span className="offline-badge">{offlineReady?'Offline shell ready':'Device storage enabled'}</span></div>:<div className="info-note"><LockKeyhole size={17}/><span>This prototype gives your signed-in account both field and warehouse views. Team roles and membership are a pilot-stage feature.</span></div>}
        </> : null}

        {view === 'lab' ? <>
          <section className="lab-hero panel"><div><span className="eyebrow">FAILURE IS PART OF THE DEMO</span><h2>One order.<br/>Two paths. <em>Zero duplicates.</em></h2><p>A controlled drill using durable device storage and the real warehouse API. SMS transport is simulated; no messages are sent.</p><button className="button primary" disabled={drilling||syncing||!ready||!online} onClick={()=>void runDrill()}>{drilling?<Loader2 size={17} className="spin"/>:<Zap size={17}/>} {drilling?'Running the drill…':'Run resilience drill'}</button></div><div className="drill-steps">{['Cut the app’s data channel','Save & read back from device','Deliver through SMS simulator','Restore data & replay the order','Verify one warehouse receipt'].map((s,i)=><div key={s} className={(drillStep>i||drillStep===4&&drillResult.startsWith('Passed')?'done ':drillStep===i?'current ':'')+'drill-step'}><span>{drillStep>i||drillStep===4&&drillResult.startsWith('Passed')?<Check size={14}/>:String(i+1).padStart(2,'0')}</span>{s}{drilling&&drillStep===i?<Loader2 size={14} className="spin"/>:null}</div>)}</div></section>
          {drillResult?<div className={drillResult.startsWith('Passed')?'result-banner':'error-banner'} role="status"><ShieldCheck size={20}/>{drillResult}</div>:null}
          <div className="two-column"><section className="panel"><PanelTitle eyebrow="MANUAL EXPERIMENT" title="You’re in control"/><div className="experiment-list"><div><span className="step-number">01</span><div><strong>Pause mobile data</strong><p>Use “Cut data” above. The warehouse API remains reachable for the SMS simulator.</p></div></div><div><span className="step-number">02</span><div><strong>Create, close, reopen</strong><p>Save an order, then reload this page. Your queue and lab mode survive.</p></div></div><div><span className="step-number">03</span><div><strong>Restore and replay</strong><p>Switch online, then replay a delayed SMS. Inspect the same receipt ID.</p></div></div></div><button className="button secondary full" disabled={!ready||drilling} onClick={()=>setModal(true)}><Plus size={16}/> Create a test order</button></section><section className="panel"><PanelTitle eyebrow="WHAT IS REAL" title="Evidence over theater"/><div className="truth-list"><p><Check size={16}/><span>Orders persist in IndexedDB on this device.</span></p><p><Check size={16}/><span>Receipts are created in a real server database.</span></p><p><Check size={16}/><span>Repeated delivery IDs resolve to one order.</span></p><p><Check size={16}/><span>Different contents under the same ID are rejected.</span></p><p><MessageSquare size={16}/><span>SMS is a transport simulation, not a gateway.</span></p><p><WifiOff size={16}/><span>Full outages stay pending. There is no magic connection.</span></p></div><button className="text-button" onClick={downloadReport}>Download the evidence <Download size={14}/></button></section></div>
          <section className="panel"><PanelTitle eyebrow="PERSISTED ON THIS DEVICE" title="Recovery timeline" right={<span className="live-label"><span className="status-light"/> LIVE EVENTS</span>}/><div className="event-log">{device.traces.length?device.traces.slice(0,20).map(t=><div className="event-row" key={t.id}><span className={'event-dot '+t.kind}/><time>{fmtTime(t.at)}</time><div><strong>{t.label}</strong><p>{t.detail}</p></div><span className="event-kind">{t.kind}</span></div>):<div className="empty-state"><Activity size={30}/><h3>Your evidence starts here.</h3><p>Run a drill or create an order to see its recovery timeline.</p></div>}</div></section>
        </> : null}

        {view === 'business' ? <>
          <section className="business-hero"><div className="eyebrow">A PRODUCT THESIS, READY TO TEST</div><h2>Sell the certainty.<br/><em>Measure the difference.</em></h2><p>A continuity layer for distributors and field-sales platforms. Start with one route, one warehouse, and ten representatives.</p><div className="business-chips"><span>Enterprise SaaS</span><span>Telecom distribution partner</span><span>Reusable delivery SDK</span></div></section>
          <div className="two-column"><section className="panel"><PanelTitle eyebrow="ILLUSTRATIVE UNIT ECONOMICS" title="What could a pilot earn?"/><div className="calculator"><label>Active representatives <strong>{reps}</strong><input type="range" min="10" max="200" step="10" value={reps} onChange={e=>setReps(+e.target.value)}/></label><label>Monthly fee per representative <strong>{money(fee)}</strong><input type="range" min="50" max="500" step="25" value={fee} onChange={e=>setFee(+e.target.value)}/></label><label>Messaging cost per representative <strong>{money(smsCost)}</strong><input type="range" min="0" max="100" step="5" value={smsCost} onChange={e=>setSmsCost(+e.target.value)}/></label><div className="calc-result"><span>Monthly contribution before other costs</span><strong>{money(reps*(fee-smsCost))}</strong><small>{money(reps*fee)} subscription revenue − {money(reps*smsCost)} messaging</small></div><p className="tiny muted">Assumptions, not forecasts or market pricing. Hosting, support, onboarding, taxes, and acquisition costs are excluded. No paid pilot has been run.</p></div></section><section className="panel"><PanelTitle eyebrow="A PRACTICAL NEXT STEP" title="The pilot we would run"/><div className="pilot-list"><div><span>01</span><div><h3>Understand the interruptions</h3><p>Interview one distributor and ten reps. Observe failed submissions and manual follow-up.</p></div></div><div><span>02</span><div><h3>Compare real routes</h3><p>Measure completion, confirmation time, duplicates, data usage, and support calls against a baseline.</p></div></div><div><span>03</span><div><h3>Prove willingness to pay</h3><p>Offer a paid trial only after reliable results. Treat order value and realized revenue separately.</p></div></div></div></section></div>
          <section className="panel"><PanelTitle eyebrow="BUILT WITH A CLEAR BOUNDARY" title="Prototype → pilot → product"/><div className="roadmap"><div><span className="roadmap-status">WORKING NOW</span><h3>Reliability foundation</h3><p>Offline order storage, authenticated server receipts, duplicate reconciliation, warehouse acceptance, and repeatable failure drills.</p></div><div><span className="roadmap-status next">PILOT INTEGRATIONS</span><h3>Connect the real operation</h3><p>Approved SMS gateway, separate team roles, distributor catalogues, attachment queues, device-loss recovery, and field measurements.</p></div><div><span className="roadmap-status future">COMMERCIAL HYPOTHESIS</span><h3>Embed into business software</h3><p>A reusable delivery component with enterprise support. Potential telco partnership; no Banglalink affiliation or integration is claimed.</p></div></div></section>
        </> : null}
        <footer className="app-footer"><span><span className="footer-logo">s.</span> A little certainty, all the way.</span><span>Designed & built by Maskat Ibne Wahid Shovo <span className="footer-dot">·</span> Independent prototype</span></footer>
      </main>
    </div>
    {toast?<div className="toast" role="status"><ShieldCheck size={18}/><span>{toast}</span><button aria-label="Dismiss notification" onClick={()=>setToast('')}><X size={15}/></button></div>:null}
    {modal?<NewOrder bangla={bangla} setBangla={setBangla} blocked={blocked} onClose={()=>setModal(false)} onSave={saveOrder}/>:null}
    {detail?<OrderDetail order={detail} actual={server.find(o=>o.id===detail.id)} onClose={()=>setDetail(null)} onReplay={()=>void replay(detail)}/>:null}
  </div>;
}

function Stat({ icon: Icon, title, value, sub, accent=false }: {icon: typeof Package; title:string; value:string; sub:string; accent?:boolean}) { return <div className={'stat-card '+(accent?'stat-accent':'')}><div className="stat-label">{title}<Icon size={17}/></div><strong>{value}</strong><small>{sub}</small></div>; }
function PanelTitle({eyebrow,title,right}:{eyebrow:string;title:string;right?:React.ReactNode}) { return <div className="panel-title"><div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2></div>{right}</div>; }
function NetworkArt({blocked,pending}:{blocked:boolean;pending:number}) { return <div className={'network-art '+(blocked?'paused':'')} aria-label={blocked?'Orders held safely at the device':'Data path from field device to warehouse'}><div className="art-grid"/><span className="art-coordinate">23.8103° N · 90.4125° E</span><div className="orbit orbit-one"/><div className="orbit orbit-two"/><svg className="network-path" viewBox="0 0 440 320"><path d="M83 215 C170 215 130 85 238 85 S315 175 362 175"/><path className="moving-path" d="M83 215 C170 215 130 85 238 85 S315 175 362 175"/></svg><div className="art-node field-node"><Smartphone size={29}/><span>FIELD DEVICE</span><small>{blocked?'Stored locally':'Order captured'}</small></div><div className="art-relay"><Network size={24}/></div><div className="art-node warehouse-node"><Warehouse size={29}/><span>WAREHOUSE</span><small>{blocked?'Awaiting delivery':'Receipt confirmed'}</small></div><div className="packet-card"><span className="packet-icon">{blocked?<LockKeyhole size={17}/>:<CheckCheck size={17}/>}</span><div><strong>{blocked?'Safe on this device':'A connection you can trust'}</strong><small>{blocked?`${pending} order${pending===1?'':'s'} awaiting connection`:'Same order. One source of truth.'}</small></div><span className="packet-dot"/></div><span className="art-caption"><span className="status-light"/>{blocked?'DEVICE-FIRST PROTECTION':'RESILIENT BY DESIGN'}</span></div>; }

function OrderTable({orders,server,onDetail,onReplay,onAccept,onCreate}:{orders:(LocalOrder|ServerOrder)[];server:ServerOrder[];onDetail:(o:LocalOrder|ServerOrder)=>void;onReplay:(o:LocalOrder|ServerOrder)=>void;onAccept?:(o:ServerOrder)=>void;onCreate:()=>void}) {
 return <div className="table-scroll"><table className="orders-table"><thead><tr><th>ORDER / SHOP</th><th>AREA</th><th>ORDER VALUE</th><th>DELIVERY STATUS</th><th aria-label="Actions"/></tr></thead><tbody>{orders.map(order=>{const remote=server.find(o=>o.id===order.id);const state='state'in order&&order.state==='conflict'?'conflict':remote?.status??('state'in order?order.receipt?.status??order.state:'received');return <tr key={order.id}><td><button className="order-name" onClick={()=>onDetail(order)}>{shortId(order.id)} {order.demo?<span className="demo-tag">DEMO</span>:null}</button><small>{order.shop}</small></td><td><span className="area"><MapPin size={12}/>{order.area}</span></td><td><strong className="amount">{money(totalOf(order.items))}</strong><small>{order.items.reduce((s,i)=>s+i.quantity,0)} units</small></td><td><span className={'badge '+state}>{state==='queued'?<Clock3 size={12}/>:state==='accepted'?<CheckCheck size={12}/>:state==='conflict'?<X size={12}/>:<Check size={12}/>} {state==='queued'?'Saved · pending':state==='accepted'?'Accepted':state==='conflict'?'Needs attention':'Received'}</span></td><td>{onAccept&&remote?.status==='received'?<button className="accept-button" onClick={()=>onAccept(remote)}>Accept <Check size={13}/></button>:<button className="icon-button" title="Replay SMS simulation" aria-label={'Replay SMS for '+shortId(order.id)} onClick={()=>onReplay(order)}><MessageSquare size={16}/></button>}<button className="icon-button" aria-label={'Inspect '+shortId(order.id)} onClick={()=>onDetail(order)}><ChevronRight size={16}/></button></td></tr>;})}</tbody></table>{!orders.length?<div className="empty-state"><span className="empty-icon"><Package size={24}/></span><h3>A clear route ahead.</h3><p>Create your first field order or run the resilience drill.<br/>Your real activity will appear here.</p><button className="text-button" onClick={onCreate}>Create an order <ArrowRight size={14}/></button></div>:null}</div>;
}

function NewOrder({bangla,setBangla,blocked,onClose,onSave}:{bangla:boolean;setBangla:(v:boolean)=>void;blocked:boolean;onClose:()=>void;onSave:(p:OrderPayload)=>Promise<void>}) {
 const [shop,setShop]=useState(''),[area,setArea]=useState('Mirpur, Dhaka'),[items,setItems]=useState<Record<string,number>>({}),[saving,setSaving]=useState(false),[error,setError]=useState(''),[demo,setDemo]=useState(true);
 const lines=Object.entries(items).filter(([,q])=>q>0).map(([productId,quantity])=>({productId,quantity}));
 const firstInput=useRef<HTMLInputElement>(null), dialogRef=useRef<HTMLDivElement>(null);
 useEffect(()=>{firstInput.current?.focus();const old=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{document.body.style.overflow=old;};},[]);
 function trap(e:React.KeyboardEvent) {if(e.key!=='Tab')return;const nodes=dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input,select,a[href]');if(!nodes?.length)return;const first=nodes[0],last=nodes[nodes.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}
 async function submit(e:React.FormEvent){e.preventDefault();if(!lines.length){setError('Choose at least one product.');return;}setSaving(true);try{await onSave({id:crypto.randomUUID(),shop:shop.trim(),area:area.trim(),items:lines,createdAt:new Date().toISOString(),demo});}catch(e){setError(e instanceof Error?e.message:'Could not save to this device.');setSaving(false);}}
 return <div className="modal-backdrop" onClick={e=>{if(e.target===e.currentTarget&&!saving)onClose();}}><div ref={dialogRef} className="order-modal" role="dialog" aria-modal="true" aria-labelledby="new-order-title" onKeyDown={trap}><form onSubmit={submit}><div className="modal-heading"><div><span className="eyebrow">FROM THE FIELD</span><h2 id="new-order-title">{bangla?'নতুন অর্ডার':'A new order, secured.'}</h2></div><button type="button" className="icon-button" aria-label="Close order form" onClick={onClose}><X size={20}/></button></div><div className="modal-body"><div className="modal-status"><ShieldCheck size={16}/>{blocked?'No data? Your order will stay on this device.':'Saved on your device before it leaves.'}<button type="button" onClick={()=>setBangla(!bangla)}>{bangla?'English':'বাংলা'}</button></div><div className="form-grid"><label>{bangla?'দোকানের নাম':'Shop name'}<input ref={firstInput} required maxLength={80} placeholder={bangla?'যেমন: রহমান স্টোর':'e.g. Rahman General Store'} value={shop} onChange={e=>setShop(e.target.value)}/></label><label>{bangla?'এলাকা':'Delivery area'}<input required maxLength={80} value={area} onChange={e=>setArea(e.target.value)}/></label></div><div className="catalogue-header"><strong>{bangla?'পণ্য বেছে নিন':'Choose the essentials'}</strong><span>Illustrative catalogue · BDT</span></div><div className="catalogue">{PRODUCTS.map(p=><div className="product-row" key={p.id}><span className="product-pack" style={{background:p.color}}><Package size={19}/><small>{p.code}</small></span><div className="product-copy"><strong>{bangla?p.bn:p.name}</strong><small>{p.unit} · {money(p.price)}</small></div><div className="quantity"><button type="button" aria-label={'Remove '+p.name} disabled={!items[p.id]} onClick={()=>setItems(v=>({...v,[p.id]:Math.max(0,(v[p.id]||0)-1)}))}><Minus size={13}/></button><input aria-label={p.name+' quantity'} type="number" min="0" max="500" value={items[p.id]||0} onChange={e=>setItems(v=>({...v,[p.id]:Math.max(0,Math.min(500,Math.floor(Number(e.target.value)||0)))}))}/><button type="button" aria-label={'Add '+p.name} disabled={items[p.id]>=500} onClick={()=>setItems(v=>({...v,[p.id]:(v[p.id]||0)+1}))}><Plus size={13}/></button></div></div>)}</div><label className="checkbox-label"><input type="checkbox" checked={demo} onChange={e=>setDemo(e.target.checked)}/> Label as a demo order</label>{error?<p role="alert" className="form-error">{error}</p>:null}</div><div className="modal-footer"><div><small>{bangla?'অর্ডারের মূল্য':'ORDER VALUE'}</small><strong>{money(totalOf(lines))}</strong></div><button className="button primary" disabled={saving}>{saving?<Loader2 className="spin" size={16}/>:<ShieldCheck size={16}/>} {saving?'Saving…':bangla?'নিরাপদে সেভ করুন':'Save order safely'}</button></div></form></div></div>;
}

function OrderDetail({order,actual,onClose,onReplay}:{order:LocalOrder|ServerOrder;actual?:ServerOrder;onClose:()=>void;onReplay:()=>void}) {
 const receipt=actual??('receipt'in order&&typeof order.receipt==='object'?order.receipt:null);
 return <div className="modal-backdrop" onClick={e=>{if(e.target===e.currentTarget)onClose();}}><div className="detail-modal" role="dialog" aria-modal="true" aria-labelledby="detail-title"><div className="modal-heading"><div><span className="eyebrow">TRACEABLE, END TO END</span><h2 id="detail-title">{shortId(order.id)}</h2></div><button autoFocus className="icon-button" aria-label="Close order details" onClick={onClose}><X size={20}/></button></div><div className="modal-body"><h3>{order.shop}</h3><p className="muted">{order.area}</p><div className="detail-items">{order.items.map(i=><div key={i.productId}><span>{PRODUCTS.find(p=>p.id===i.productId)?.name} × {i.quantity}</span><strong>{money(totalOf([i]))}</strong></div>)}</div><div className="detail-total"><span>Order value</span><strong>{money(totalOf(order.items))}</strong></div><div className="receipt-box"><ShieldCheck size={21}/><div><strong>{receipt?'Warehouse receipt verified':'Saved locally · no warehouse receipt yet'}</strong><code>{receipt?.receipt??order.id}</code><small>{receipt?`${receipt.status} · ${receipt.channel==='sms_simulator'?'SMS simulation':'mobile data'} · ${fmtTime(receipt.receivedAt)}`:'Pending means pending. No remote delivery is claimed.'}</small></div></div><button className="button secondary full" onClick={onReplay}><MessageSquare size={16}/> Replay delayed SMS simulation</button><p className="tiny muted">Uses the real API with the same order ID. No real SMS is sent.</p></div></div></div>;
}
