import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext.jsx';
import { useLang } from '../i18n.js';
import { PLATFORMS, calcPrice, calcTotal, defaultPricingItems, normalizePhone } from '../utils/pricing.js';
import LanguageSwitcher from '../components/LanguageSwitcher.jsx';
import logoImg from '../assets/logo.jpeg';
import {
  buildStoreLinks,
  clearAllOrders,
  deleteOrderById,
  ensureOwnerStore,
  listenAuth,
  migrateLegacyOrdersIfNeeded,
  resolveRouteStoreSlug,
  saveOrder,
  setOrderStatus,
  signInWithGoogle,
  signOutGoogle,
  subscribeToOrders,
} from '../services/firebase.js';

function formatTime(iso, lang) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(lang === 'ar' ? 'ar-MA' : lang === 'fr' ? 'fr-FR' : 'en-GB');
}

function loadScript(src, globalName) {
  if (globalName && window[globalName]) return Promise.resolve(window[globalName]);
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve(globalName ? window[globalName] : true), { once: true });
      existing.addEventListener('error', reject, { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => resolve(globalName ? window[globalName] : true);
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

const statusLabel = (status, t) => (status === 'done' ? t.done : t.pending);
const clampScale = (value) => Math.min(1.3, Math.max(0.9, value));

export default function AdminDashboard() {
  const { store: routeStore } = useParams();
  const store = useMemo(() => resolveRouteStoreSlug(routeStore), [routeStore]);
  const { theme: T } = useTheme();
  const { lang, setLang, t } = useLang();
  const [view, setView] = useState('login');
  const [user, setUser] = useState(null);
  const [ownerStore, setOwnerStore] = useState(null);
  const [authError, setAuthError] = useState('');
  const [orders, setOrders] = useState([]);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [expandedStat, setExpandedStat] = useState(null);
  const [newOrderFlash, setNewOrderFlash] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [activePlatform, setActivePlatform] = useState('shein');
  const [toast, setToast] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [copiedLink, setCopiedLink] = useState('');
  const [orderSearch, setOrderSearch] = useState('');
  const [adminScale, setAdminScale] = useState(() => {
    const saved = Number(localStorage.getItem('lamar_admin_scale'));
    return Number.isFinite(saved) ? clampScale(saved) : 1;
  });
  const prevCountRef = useRef(0);
  const saveTimersRef = useRef(new Map());
  const invoiceRef = useRef(null);

  useEffect(() => {
    document.documentElement.lang = t.lang;
    document.documentElement.dir = t.dir;
  }, [t.lang, t.dir]);

  useEffect(() => {
    localStorage.setItem('lamar_admin_scale', String(adminScale));
  }, [adminScale]);

  useEffect(() => listenAuth((nextUser) => {
    setUser(nextUser);
    setAuthError('');
    if (!nextUser) {
      setView('login');
      setOrders([]);
      setOwnerStore(null);
    }
  }), []);

  useEffect(() => {
    if (!user) return undefined;
    let unsubscribeOrders = null;
    let cancelled = false;

    setAuthError(t.checkingPermissions);
    ensureOwnerStore(store, user)
      .then(async (foundStore) => {
        if (cancelled) return;
        setOwnerStore(foundStore);
        await migrateLegacyOrdersIfNeeded(store).catch(() => {});
        unsubscribeOrders = subscribeToOrders(
          store,
          (nextOrders) => {
            setOrders(nextOrders);
            if (nextOrders.length > prevCountRef.current && prevCountRef.current > 0) {
              setNewOrderFlash(true);
              setTimeout(() => setNewOrderFlash(false), 3000);
            }
            prevCountRef.current = nextOrders.length;
          },
          (error) => setAuthError(error?.message || String(error)),
        );
        setAuthError('');
        setView('dashboard');
      })
      .catch((error) => {
        if (cancelled) return;
        setAuthError(error?.message || String(error));
        setView('login');
      });

    return () => {
      cancelled = true;
      unsubscribeOrders?.();
    };
  }, [store, user, t.checkingPermissions]);

  useEffect(() => {
    if (!selectedOrder) return;
    const fresh = orders.find((order) => order.id === selectedOrder.id);
    if (fresh) setSelectedOrder(fresh);
  }, [orders, selectedOrder?.id]);

  const pending = orders.filter((o) => o.status === 'pending');
  const done = orders.filter((o) => o.status === 'done');
  const uniqueCustomers = [...new Map(orders.map((o) => [String(o.name || '').toLowerCase(), o])).values()];
  const sorted = [...pending, ...done];
  const visibleOrders = sorted.filter((order) => {
    const q = orderSearch.trim().toLowerCase();
    if (!q) return true;
    return [
      order.orderNumber,
      order.name,
      order.phone,
      order.submittedByName,
      order.link,
      order.status,
    ].join(' ').toLowerCase().includes(q);
  });
  const storeLinks = useMemo(() => buildStoreLinks(store), [store]);
  const sz = useCallback((value) => Math.round(value * adminScale * 10) / 10, [adminScale]);
  const adjustAdminScale = (delta) => {
    setAdminScale((current) => Math.round(clampScale(current + delta) * 100) / 100);
  };

  const queueSave = useCallback((updated) => {
    setOrders((current) => current.map((order) => (order.id === updated.id ? updated : order)));
    setSelectedOrder(updated);
    const oldTimer = saveTimersRef.current.get(updated.id);
    if (oldTimer) clearTimeout(oldTimer);
    const timer = setTimeout(() => {
      saveOrder(store, updated).catch((error) => setToast(error?.message || String(error)));
      saveTimersRef.current.delete(updated.id);
    }, 300);
    saveTimersRef.current.set(updated.id, timer);
  }, [store]);

  const toggleStatus = async (order) => {
    const status = order.status === 'pending' ? 'done' : 'pending';
    setOrders((current) => current.map((item) => (item.id === order.id ? { ...item, status } : item)));
    setSelectedOrder((current) => (current?.id === order.id ? { ...current, status } : current));
    await setOrderStatus(store, order.id, status).catch((error) => setToast(error?.message || String(error)));
  };

  const deleteOrder = async (id) => {
    setOrders((current) => current.filter((order) => order.id !== id));
    setView('dashboard');
    await deleteOrderById(store, id).catch((error) => setToast(error?.message || String(error)));
  };

  const clearAll = async () => {
    if (!window.confirm(t.confirmClear)) return;
    const ids = orders.map((order) => order.id);
    setOrders([]);
    await clearAllOrders(store, ids).catch((error) => setToast(error?.message || String(error)));
  };

  const copyStoreLink = (value, key) => {
    navigator.clipboard?.writeText(value).catch(() => {});
    setCopiedLink(key);
    setToast(t.linkCopied);
    setTimeout(() => setCopiedLink(''), 1800);
  };

  const handleImageUpload = (order, event) => {
    Array.from(event.target.files || []).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const updated = { ...order, images: [...(order.images || []), ev.target.result] };
        queueSave(updated);
        runOcr(updated, ev.target.result);
      };
      reader.readAsDataURL(file);
    });
    event.target.value = '';
  };

  const runOcr = async (order, image) => {
    try {
      const Tesseract = await loadScript('https://cdn.jsdelivr.net/npm/tesseract.js@4/dist/tesseract.min.js', 'Tesseract');
      const result = await Tesseract.recognize(image, 'eng');
      const text = result?.data?.text || '';
      const prices = text.match(/\d+(?:[.,]\d{1,2})?/g) || [];
      const price = prices.find((value) => Number(value.replace(',', '.')) > 0);
      if (!price) return;
      const platform = /market\s*place/i.test(text) ? 'marketplace' : 'shein';
      appendPrice(order, platform, price.replace(',', '.'));
    } catch {
      // OCR is best effort; uploaded images are still saved.
    }
  };

  const removeImage = (order, idx) => queueSave({ ...order, images: order.images.filter((_, i) => i !== idx) });

  const appendPrice = (order, platform, value) => {
    const items = order.pricing?.items?.length ? order.pricing.items : defaultPricingItems();
    const updatedItems = items.map((item) => (
      item.platform === platform ? { ...item, price: item.price ? `${item.price}+${value}` : value } : item
    ));
    queueSave({ ...order, pricing: { items: updatedItems } });
  };

  const startVoice = (order) => {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      setToast(t.voiceUnsupported);
      return;
    }
    const recognition = new Recognition();
    recognition.lang = 'ar-MA';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onstart = () => setIsRecording(true);
    recognition.onend = () => setIsRecording(false);
    recognition.onerror = () => setIsRecording(false);
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results).map((result) => result[0]?.transcript || '').join(' ');
      const platform = /market|ماركت/i.test(transcript) ? 'marketplace' : /plus|\+/i.test(transcript) ? 'sheinPlus' : activePlatform;
      const value = transcript.replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).match(/\d+(?:[.,]\d+)?/g)?.[0];
      if (value) appendPrice(order, platform, value.replace(',', '.'));
    };
    recognition.start();
  };

  const captureInvoice = async (mode) => {
    if (!invoiceRef.current || !selectedOrder) return;
    try {
      const html2canvas = await loadScript('https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js', 'html2canvas');
      const canvas = await html2canvas(invoiceRef.current, { scale: 2, backgroundColor: '#ffffff' });
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (mode === 'copy' && navigator.clipboard?.write && window.ClipboardItem) {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        setToast(t.invoiceImageCopied);
        return;
      }
      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      a.download = `invoice-${selectedOrder.orderNumber || selectedOrder.id}.png`;
      a.click();
      setToast(t.invoiceImageDownloaded);
    } catch (error) {
      setToast(error?.message || String(error));
    }
  };

  const card = { background: T.card, borderRadius: sz(16), padding: sz(14), boxShadow: `0 2px 12px ${T.shadow}` };
  const badge = (status) => ({ display: 'inline-flex', alignItems: 'center', gap: sz(4), padding: `${sz(3)}px ${sz(10)}px`, borderRadius: sz(20), fontSize: sz(11), fontWeight: 700, background: status === 'done' ? '#e8f5e9' : '#fff3e0', color: status === 'done' ? '#388e3c' : '#e65100' });
  const topBtn = (label, onClick) => <button onClick={onClick} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: sz(8), padding: `${sz(5)}px ${sz(9)}px`, color: '#fff', fontSize: sz(11), cursor: 'pointer' }}>{label}</button>;
  const topbar = (title, left, right) => (
    <div style={{ background: `linear-gradient(135deg, ${T.accent}, ${T.accentDark})`, padding: `${sz(14)}px ${sz(18)}px`, flexShrink: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: sz(6), alignItems: 'center' }}>{left}</div>
        <div style={{ color: '#fff', fontWeight: 800, fontSize: sz(14), textAlign: 'center' }}>{title}</div>
        <div style={{ display: 'flex', gap: sz(6) }}>{right}</div>
      </div>
    </div>
  );
  const sidebarButton = {
    width: '100%',
    padding: `${sz(11)}px ${sz(12)}px`,
    borderRadius: sz(10),
    border: `1.5px solid ${T.border}`,
    background: T.bg,
    color: T.text,
    fontSize: sz(12),
    fontWeight: 800,
    fontFamily: 'Tajawal, sans-serif',
    cursor: 'pointer',
  };
  const linkRow = (label, value, key) => (
    <div key={key} style={{ border: `1px solid ${T.border}`, borderRadius: sz(12), padding: sz(10), background: T.bg }}>
      <div style={{ fontSize: sz(11), color: T.textMuted, marginBottom: sz(6) }}>{label}</div>
      <div style={{ direction: 'ltr', textAlign: 'left', color: T.accent, fontSize: sz(10), fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: sz(8) }}>
        {value}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: sz(6) }}>
        <button onClick={() => copyStoreLink(value, key)} style={{ ...sidebarButton, padding: `${sz(8)}px ${sz(10)}px`, background: copiedLink === key ? '#4caf50' : T.accentLight, color: copiedLink === key ? '#fff' : T.accent, border: 'none', fontSize: sz(11) }}>
          {copiedLink === key ? t.copied : t.copy}
        </button>
        <a href={value} target="_blank" rel="noopener noreferrer" style={{ ...sidebarButton, padding: `${sz(8)}px ${sz(10)}px`, boxSizing: 'border-box', textAlign: 'center', textDecoration: 'none', fontSize: sz(11) }}>
          {t.open}
        </a>
      </div>
    </div>
  );
  const adminSidebar = (
    <>
      {sidebarOpen && <button aria-label="Close menu" onClick={() => setSidebarOpen(false)} style={{ position: 'fixed', inset: 0, border: 'none', background: 'rgba(17, 24, 39, 0.34)', zIndex: 40, cursor: 'pointer' }} />}
      <aside style={{ position: 'fixed', top: 0, bottom: 0, right: 0, width: 'min(82vw, 310px)', background: T.card, boxShadow: `-8px 0 28px ${T.shadow}`, zIndex: 41, transform: sidebarOpen ? 'translateX(0)' : 'translateX(105%)', transition: 'transform 0.24s ease', padding: sz(16), boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: sz(12), direction: t.dir }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: sz(10) }}>
          <button onClick={() => setSidebarOpen(false)} style={{ width: sz(32), height: sz(32), borderRadius: sz(9), border: 'none', background: T.accentLight, color: T.accent, fontSize: sz(18), lineHeight: 1, cursor: 'pointer' }}>x</button>
          <div style={{ flex: 1, textAlign: 'right' }}>
            <div style={{ color: T.text, fontWeight: 900, fontSize: sz(14) }}>{ownerStore?.displayName || store}</div>
            <div style={{ color: T.textMuted, fontSize: sz(10), direction: 'ltr', textAlign: 'right' }}>/{store}</div>
          </div>
          <img src={logoImg} alt="" style={{ width: sz(38), height: sz(38), borderRadius: '50%', objectFit: 'cover', border: `2px solid ${T.accentLight}` }} />
        </div>

        <div style={{ height: 1, background: T.border }} />

        <div style={{ display: 'flex', flexDirection: 'column', gap: sz(8) }}>
          {linkRow(t.customerOrderLink, storeLinks.order, 'order')}
          {linkRow(t.adminDashboardLink, storeLinks.admin, 'admin')}
        </div>

        <div style={{ background: T.bg, borderRadius: sz(12), padding: sz(10), border: `1px solid ${T.border}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: sz(8) }}>
            <span style={{ color: T.text, fontSize: sz(12), fontWeight: 800 }}>{t.displaySize}</span>
            <span style={{ color: T.accent, fontSize: sz(12), fontWeight: 900 }}>{Math.round(adminScale * 100)}%</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: sz(8) }}>
            <button aria-label={t.decreaseSize} onClick={() => adjustAdminScale(-0.05)} style={{ ...sidebarButton, padding: `${sz(9)}px`, fontSize: sz(16), background: T.card }}>-</button>
            <button aria-label={t.increaseSize} onClick={() => adjustAdminScale(0.05)} style={{ ...sidebarButton, padding: `${sz(9)}px`, fontSize: sz(16), background: T.card }}>+</button>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', padding: `${sz(4)}px 0` }}>
          <LanguageSwitcher lang={lang} setLang={setLang} theme={T} ghost={false} scale={adminScale} />
        </div>

        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: sz(8) }}>
          <button onClick={clearAll} style={{ ...sidebarButton, color: '#e05c5c', borderColor: '#f4b4b4', background: '#fff6f6' }}>{t.clearAll}</button>
          <button onClick={() => signOutGoogle()} style={{ ...sidebarButton, background: `linear-gradient(135deg, ${T.accent}, ${T.accentDark})`, color: '#fff', border: 'none' }}>{t.signOut}</button>
        </div>
      </aside>
    </>
  );

  if (view === 'login') {
    return (
      <div style={{ minHeight: '100vh', background: T.bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: sz(24), fontFamily: 'Tajawal, sans-serif', direction: t.dir }}>
        <img src={logoImg} alt="logo" style={{ width: sz(96), height: sz(96), borderRadius: '50%', objectFit: 'cover', border: `${sz(3)}px solid ${T.accent}`, marginBottom: sz(14) }} />
        <div style={{ fontSize: sz(20), fontWeight: 800, color: T.text, marginBottom: sz(4) }}>{t.loginTitle}</div>
        <div style={{ fontSize: sz(12), color: T.textMuted, marginBottom: sz(24) }}>{store}</div>
        <div style={{ ...card, width: '100%', maxWidth: sz(320) }}>
          <button onClick={() => signInWithGoogle().catch((error) => setAuthError(error?.message || String(error)))} style={{ width: '100%', padding: sz(13), borderRadius: sz(12), border: `1.5px solid ${T.border}`, background: T.card, color: T.text, fontSize: sz(13), fontWeight: 700, cursor: 'pointer' }}>
            {t.continueWithGoogle}
          </button>
          <div style={{ display: 'flex', justifyContent: 'center', gap: sz(8), marginTop: sz(12) }}>
            <LanguageSwitcher lang={lang} setLang={setLang} theme={T} scale={adminScale} />
          </div>
          {authError && <div style={{ marginTop: sz(12), fontSize: sz(11), color: '#e05c5c', textAlign: 'center', lineHeight: 1.5 }}>{authError}</div>}
        </div>
      </div>
    );
  }

  if (expandedStat) {
    const list = expandedStat === 'pending' ? pending : expandedStat === 'done' ? done : sorted;
    const isCustomers = expandedStat === 'customers';
    return (
      <div style={{ minHeight: '100vh', background: T.bg, display: 'flex', flexDirection: 'column', fontFamily: 'Tajawal, sans-serif', direction: t.dir }}>
        {topbar(isCustomers ? t.customers : t.orders, [topBtn(t.back, () => setExpandedStat(null))], [])}
        <div style={{ flex: 1, overflowY: 'auto', padding: `${sz(12)}px ${sz(14)}px`, display: 'flex', flexDirection: 'column', gap: sz(8) }}>
          {isCustomers ? uniqueCustomers.map((order) => (
            <div key={order.id} style={{ ...card, display: 'flex', alignItems: 'center', gap: sz(12) }}>
              <div style={{ flex: 1 }}><div style={{ fontWeight: 700, color: T.text, fontSize: sz(14) }}>{order.name}</div><div style={{ fontSize: sz(11), color: T.textMuted }}>{order.phone}</div></div>
              <div style={{ color: T.accent, fontWeight: 800, fontSize: sz(14) }}>{orders.filter((x) => x.name.toLowerCase() === order.name.toLowerCase()).length}</div>
            </div>
          )) : list.map((order) => (
            <div key={order.id} onClick={() => { setSelectedOrder(order); setView('detail'); setExpandedStat(null); }} style={{ ...card, cursor: 'pointer' }}>
              {order.orderNumber && <div style={{ color: T.accent, fontSize: sz(10), fontWeight: 800, direction: 'ltr', marginBottom: sz(4) }}>{order.orderNumber}</div>}
              <div style={{ fontWeight: 700, color: T.text, fontSize: sz(14) }}>{order.name}</div>
              <div style={{ fontSize: sz(11), color: T.textMuted }}>{formatTime(order.time, lang)}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (view === 'dashboard') {
    return (
      <div style={{ minHeight: '100vh', background: T.bg, display: 'flex', flexDirection: 'column', fontFamily: 'Tajawal, sans-serif', direction: t.dir }}>
        {adminSidebar}
        {topbar(
          <span>{ownerStore?.displayName || store}<br/><span style={{ fontSize: sz(10), color: 'rgba(255,255,255,0.6)', fontWeight: 400 }}>{t.dashboard}</span></span>,
          [topBtn(t.menu, () => setSidebarOpen(true))],
          [<img key="logo" src={logoImg} alt="" style={{ width: sz(32), height: sz(32), borderRadius: '50%', objectFit: 'cover', border: `${sz(2)}px solid rgba(255,255,255,0.4)` }} />],
        )}
        {newOrderFlash && <div style={{ background: '#4caf50', color: '#fff', textAlign: 'center', padding: sz(7), fontSize: sz(12), fontWeight: 700 }}>{t.newOrder}</div>}
        {toast && <button onClick={() => setToast('')} style={{ background: '#222', color: '#fff', border: 'none', padding: sz(8), fontSize: sz(11) }}>{toast}</button>}
        <div style={{ flex: 1, overflowY: 'auto', padding: `${sz(12)}px ${sz(14)}px` }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: sz(8), marginBottom: sz(14) }}>
            {[
              { key: 'total', label: t.total, value: orders.length, color: T.accent },
              { key: 'pending', label: t.pending, value: pending.length, color: '#e65100' },
              { key: 'done', label: t.done, value: done.length, color: '#388e3c' },
              { key: 'customers', label: t.customers, value: uniqueCustomers.length, color: T.gold },
            ].map((stat) => (
              <div key={stat.key} onClick={() => setExpandedStat(stat.key)} style={{ ...card, padding: `${sz(12)}px ${sz(14)}px`, cursor: 'pointer' }}>
                <div style={{ fontSize: sz(22), fontWeight: 800, color: stat.color }}>{stat.value}</div>
                <div style={{ fontSize: sz(10), color: T.textMuted }}>{stat.label}</div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: sz(13), fontWeight: 700, color: T.text, marginBottom: sz(8) }}>{t.orders}</div>
          <input value={orderSearch} onChange={(e) => setOrderSearch(e.target.value)} placeholder={t.searchOrders} style={{ width: '100%', padding: `${sz(11)}px ${sz(13)}px`, borderRadius: sz(12), border: `1.5px solid ${T.border}`, background: T.card, color: T.text, fontSize: sz(12), fontFamily: 'Tajawal, sans-serif', outline: 'none', boxSizing: 'border-box', marginBottom: sz(10), direction: t.dir, textAlign: t.dir === 'rtl' ? 'right' : 'left' }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: sz(8) }}>
            {visibleOrders.map((order) => {
              const total = calcTotal(order.pricing?.items);
              return (
                <div key={order.id} onClick={() => { setSelectedOrder(order); setView('detail'); }} style={{ ...card, cursor: 'pointer', borderRight: `${sz(4)}px solid ${order.status === 'done' ? '#4caf50' : T.accent}`, direction: 'ltr' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: sz(12), marginBottom: sz(6) }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: sz(5), alignItems: 'flex-start', flexShrink: 0 }}>
                      <span style={badge(order.status)}>{statusLabel(order.status, t)}</span>
                      {order.orderNumber && <span style={{ fontSize: sz(10), fontWeight: 800, color: T.accent, background: T.accentLight, borderRadius: sz(8), padding: `${sz(3)}px ${sz(7)}px`, direction: 'ltr' }}>{order.orderNumber}</span>}
                    </div>
                    <div style={{ flex: 1, minWidth: 0, textAlign: 'right', direction: t.dir }}><div style={{ fontWeight: 700, color: T.text, fontSize: sz(13) }}>{order.name}</div><div style={{ color: T.textMuted, fontSize: sz(10) }}>{formatTime(order.time, lang)}</div></div>
                  </div>
                  <div style={{ color: T.textMuted, fontSize: sz(10), direction: 'ltr', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{order.link}</div>
                  {total > 0 && <div style={{ textAlign: 'left', fontSize: sz(11), fontWeight: 700, color: T.gold, marginTop: sz(4) }}>${total.toFixed(2)}</div>}
                </div>
              );
            })}
            {!visibleOrders.length && <div style={{ ...card, color: T.textMuted, textAlign: 'center', fontSize: sz(12) }}>{t.noMatchingOrders}</div>}
          </div>
        </div>
      </div>
    );
  }

  if (view === 'detail' && selectedOrder) {
    const order = selectedOrder;
    const items = order.pricing?.items?.length ? order.pricing.items : defaultPricingItems();
    const updatePrice = (key, val) => queueSave({ ...order, pricing: { items: items.map((it) => (it.platform === key ? { ...it, price: val.replace(/\s/g, '').replace(/\++$/, '+') } : it)) } });
    const totalCalc = calcTotal(items);
    return (
      <div style={{ minHeight: '100vh', background: T.bg, display: 'flex', flexDirection: 'column', fontFamily: 'Tajawal, sans-serif', direction: t.dir }}>
        {topbar(t.orderDetails, [topBtn(t.invoice, () => setView('invoice')), topBtn(order.status === 'pending' ? t.markDone : t.markPending, () => toggleStatus(order))], [topBtn(t.back, () => setView('dashboard'))])}
        <div style={{ flex: 1, overflowY: 'auto', padding: `${sz(12)}px ${sz(14)}px`, display: 'flex', flexDirection: 'column', gap: sz(10) }}>
          <div style={card}>
            {order.orderNumber && <div style={{ display: 'inline-flex', color: T.accent, background: T.accentLight, fontWeight: 900, fontSize: sz(12), borderRadius: sz(10), padding: `${sz(5)}px ${sz(9)}px`, direction: 'ltr', marginBottom: sz(8) }}>{order.orderNumber}</div>}
            <div style={{ fontWeight: 800, color: T.text, fontSize: sz(15) }}>{order.name}</div>
            <div style={{ color: T.textMuted, fontSize: sz(11), direction: 'ltr' }}>{order.phone}</div>
            <div style={{ marginTop: sz(4) }}><span style={badge(order.status)}>{statusLabel(order.status, t)}</span></div>
          </div>
          <div style={card}>
            <div style={{ fontSize: sz(11), color: T.textMuted, marginBottom: sz(5) }}>{t.productLink}</div>
            <a href={order.link} target="_blank" rel="noopener noreferrer" style={{ color: T.accent, fontSize: sz(11), direction: 'ltr', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: 'none' }}>{order.link}</a>
          </div>
          <div style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: sz(10) }}>
              <div style={{ display: 'flex', gap: sz(6) }}>
                <button onClick={() => startVoice(order)} style={{ padding: `${sz(6)}px ${sz(10)}px`, borderRadius: sz(8), border: 'none', background: isRecording ? '#e05c5c' : T.accentLight, color: isRecording ? '#fff' : T.accent, fontSize: sz(12), cursor: 'pointer' }}>{isRecording ? t.recording : t.voice}</button>
                <label style={{ padding: `${sz(6)}px ${sz(10)}px`, borderRadius: sz(8), background: T.accentLight, color: T.accent, fontSize: sz(12), cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}>
                  {t.images}<input type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={(e) => handleImageUpload(order, e)} />
                </label>
              </div>
              <div style={{ fontSize: sz(13), fontWeight: 700, color: T.text }}>{t.pricing}</div>
            </div>
            <div style={{ display: 'flex', gap: sz(4), marginBottom: sz(10), flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {PLATFORMS.map((p) => <button key={p.key} onClick={() => setActivePlatform(p.key)} style={{ padding: `${sz(3)}px ${sz(8)}px`, borderRadius: sz(10), border: `1.5px solid ${activePlatform === p.key ? T.accent : T.border}`, background: activePlatform === p.key ? T.accentLight : 'transparent', color: activePlatform === p.key ? T.accent : T.textMuted, fontSize: sz(9), fontWeight: 700, cursor: 'pointer' }}>{p.label}</button>)}
            </div>
            {!!order.images?.length && (
              <div style={{ display: 'flex', gap: sz(6), marginBottom: sz(10), flexWrap: 'wrap' }}>
                {order.images.map((img, idx) => (
                  <div key={img.slice(0, 40) + idx} style={{ position: 'relative' }}>
                    <img src={img} alt="upload" style={{ width: sz(52), height: sz(52), borderRadius: sz(8), objectFit: 'cover', border: `1.5px solid ${T.border}` }} />
                    <button onClick={() => removeImage(order, idx)} style={{ position: 'absolute', top: -sz(5), right: -sz(5), width: sz(18), height: sz(18), borderRadius: '50%', background: '#e05c5c', border: 'none', color: '#fff', fontSize: sz(10), cursor: 'pointer' }}>x</button>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: sz(8) }}>
              {PLATFORMS.map((p) => {
                const item = items.find((it) => it.platform === p.key) || { price: '', platform: p.key };
                const calc = calcPrice(p.key, item.price);
                return (
                  <div key={p.key} style={{ display: 'flex', alignItems: 'center', gap: sz(6) }}>
                    <div style={{ flex: 1, background: T.bg, borderRadius: sz(10), padding: `${sz(7)}px ${sz(10)}px`, direction: 'ltr' }}>
                      <input value={item.price} onChange={(e) => updatePrice(p.key, e.target.value)} placeholder="0.00" style={{ background: 'none', border: 'none', outline: 'none', width: '100%', fontSize: sz(13), color: T.text, fontFamily: 'monospace' }} />
                    </div>
                    {calc !== null && <div style={{ fontSize: sz(11), fontWeight: 700, color: T.gold, minWidth: sz(50), textAlign: 'center' }}>${calc.toFixed(2)}</div>}
                    <div style={{ background: T.accentLight, color: T.accent, borderRadius: sz(8), padding: `${sz(4)}px ${sz(8)}px`, fontSize: sz(9), fontWeight: 700, minWidth: sz(72), textAlign: 'center', flexShrink: 0 }}>{p.label}</div>
                  </div>
                );
              })}
            </div>
            {totalCalc > 0 && <div style={{ marginTop: sz(12), paddingTop: sz(10), borderTop: `1px solid ${T.border}`, display: 'flex', justifyContent: 'space-between' }}><div style={{ fontSize: sz(15), fontWeight: 800, color: T.gold }}>${totalCalc.toFixed(2)}</div><div style={{ fontSize: sz(12), color: T.textMuted }}>{t.total2}</div></div>}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: sz(8) }}>
            <button onClick={() => setView('invoice')} style={{ padding: sz(11), borderRadius: sz(11), border: 'none', background: T.gold, color: '#fff', fontSize: sz(12), fontWeight: 700, cursor: 'pointer' }}>{t.invoice}</button>
            <button onClick={() => deleteOrder(order.id)} style={{ padding: sz(11), borderRadius: sz(11), border: `1.5px solid #e05c5c`, background: 'transparent', color: '#e05c5c', fontSize: sz(12), fontWeight: 700, cursor: 'pointer' }}>{t.delete}</button>
          </div>
        </div>
      </div>
    );
  }

  if (view === 'invoice' && selectedOrder) {
    const order = selectedOrder;
    const items = order.pricing?.items || [];
    const total = calcTotal(items);
    const hasPrice = items.some((item) => calcPrice(item.platform, item.price) !== null);
    const openWhatsApp = () => window.open(`https://wa.me/${normalizePhone(order.phone)}`, '_blank');
    return (
      <div style={{ minHeight: '100vh', background: T.bg, display: 'flex', flexDirection: 'column', fontFamily: 'Tajawal, sans-serif', direction: t.dir }}>
        {topbar(t.invoice, [topBtn(t.invoiceCopy, () => captureInvoice('copy')), topBtn(t.whatsapp, openWhatsApp), topBtn(t.print, () => window.print())], [topBtn(t.back, () => setView('detail'))])}
        {toast && <button onClick={() => setToast('')} style={{ background: '#222', color: '#fff', border: 'none', padding: sz(8), fontSize: sz(11) }}>{toast}</button>}
        <div style={{ flex: 1, overflowY: 'auto', padding: sz(14) }}>
          <div ref={invoiceRef} style={{ background: '#fff', borderRadius: sz(20), overflow: 'hidden', boxShadow: `0 4px 24px ${T.shadow}` }}>
            <div style={{ background: `linear-gradient(135deg, ${T.accent}18, ${T.accentLight})`, padding: `${sz(22)}px ${sz(18)}px`, textAlign: 'center', borderBottom: `1px solid ${T.border}` }}>
              <img src={logoImg} alt="logo" style={{ width: sz(76), height: sz(76), borderRadius: '50%', objectFit: 'cover', border: `3px solid ${T.accent}`, marginBottom: sz(8) }} />
              <div style={{ fontWeight: 800, fontSize: sz(15), color: T.text }}>SHEIN By_Fadwa_Hn</div>
              <div style={{ fontSize: sz(11), color: T.textMuted, marginTop: sz(2) }}>{t.deliveryMorocco}</div>
            </div>
            <div style={{ padding: `${sz(14)}px ${sz(18)}px`, borderBottom: `1px solid ${T.border}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: sz(3) }}>
                <div style={{ fontSize: sz(12), color: T.text }}>{order.phone}</div>
                <div style={{ fontSize: sz(13), fontWeight: 700, color: T.text }}>{order.name}</div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <div style={{ fontSize: sz(11), color: T.textMuted }}>{formatTime(order.time, lang)}</div>
                <div style={{ fontSize: sz(11), color: T.textMuted, direction: 'ltr' }}>{t.orderLabel} {order.orderNumber || `#${order.id}`}</div>
              </div>
            </div>
            <div style={{ padding: `0 ${sz(18)}px` }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr style={{ borderBottom: `2px solid ${T.border}` }}><th style={{ padding: `${sz(10)}px 0`, fontSize: sz(11), color: T.textMuted, textAlign: 'left' }}>{t.sale}</th><th style={{ padding: `${sz(10)}px 0`, fontSize: sz(11), color: T.textMuted, textAlign: 'center' }}>{t.cost}</th><th style={{ padding: `${sz(10)}px 0`, fontSize: sz(11), color: T.textMuted, textAlign: 'right' }}>{t.platform}</th></tr></thead>
                <tbody>
                  {hasPrice ? PLATFORMS.map((p) => {
                    const item = items.find((it) => it.platform === p.key);
                    const sell = calcPrice(p.key, item?.price);
                    if (!sell) return null;
                    return <tr key={p.key} style={{ borderBottom: `1px solid ${T.border}` }}><td style={{ padding: `${sz(10)}px 0`, fontSize: sz(13), fontWeight: 700, color: T.gold, textAlign: 'left' }}>${sell.toFixed(2)}</td><td style={{ padding: `${sz(10)}px 0`, fontSize: sz(12), color: T.text, textAlign: 'center' }}>€{item?.price}</td><td style={{ padding: `${sz(10)}px 0`, fontSize: sz(12), color: T.text, textAlign: 'right' }}>{p.label}</td></tr>;
                  }) : <tr><td colSpan={3} style={{ textAlign: 'center', padding: sz(18), color: T.textMuted, fontSize: sz(12) }}>{t.noPrice}</td></tr>}
                </tbody>
              </table>
            </div>
            {hasPrice && <div style={{ margin: `0 ${sz(18)}px`, padding: `${sz(12)}px 0`, borderTop: `2px solid ${T.border}`, display: 'flex', justifyContent: 'space-between' }}><div style={{ fontSize: sz(17), fontWeight: 800, color: T.gold }}>${total.toFixed(2)}</div><div style={{ fontSize: sz(13), fontWeight: 700, color: T.text }}>{t.total2}</div></div>}
            <div style={{ background: `linear-gradient(135deg, ${T.accent}18, ${T.accentLight})`, padding: `${sz(14)}px ${sz(18)}px`, textAlign: 'center' }}>
              <div style={{ fontSize: sz(13), fontWeight: 700, color: T.accent }}>{t.thankYou}</div>
              <div style={{ fontSize: sz(10), color: T.textMuted, marginTop: sz(3) }}>SHEIN By_Fadwa_Hn · Lamar</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
