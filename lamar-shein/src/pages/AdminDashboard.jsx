import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext.jsx';
import { useLang } from '../i18n.js';
import { PLATFORMS, calcPrice, calcTotal, defaultPricingItems, normalizePhone, parsePrice } from '../utils/pricing.js';
import LanguageSwitcher from '../components/LanguageSwitcher.jsx';
import logoImg from '../assets/logo.jpeg';
import {
  buildStoreLinks,
  clearAllOrders,
  createOrder,
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
  updateStore,
} from '../services/firebase.js';

function formatTime(iso, lang) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(lang === 'ar' ? 'ar-MA' : lang === 'fr' ? 'fr-FR' : 'en-GB');
}

function detectCurrencyText(value) {
  const text = String(value || '').toUpperCase();
  if (text.includes('€') || /\bEUR\b/.test(text)) return 'EUR';
  if (/MAD|DHS?|د\.?م/.test(text)) return 'MAD';
  if (text.includes('$') || /\bUSD\b/.test(text)) return 'USD';
  return '';
}

function parseCartPriceText(value) {
  const match = String(value || '').match(/[0-9]+(?:[.,\s][0-9]{3})*(?:[.,][0-9]{1,2})?|[0-9]+/);
  if (!match) return null;
  const parsed = Number(match[0].replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeCurrencyCode(value) {
  const code = String(value || '').trim().toUpperCase();
  return ['EUR', 'MAD', 'USD', 'GBP'].includes(code) ? code : 'EUR';
}

function formatMoney(value, currency = 'EUR') {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '';
  const hasDecimals = Math.abs(amount - Math.round(amount)) > 0.001;
  const formatted = amount.toLocaleString('fr-FR', {
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: 2,
  });
  const code = normalizeCurrencyCode(currency);
  const symbol = code === 'USD' ? '$' : code === 'GBP' ? '£' : code === 'MAD' ? 'MAD' : '€';
  return code === 'USD' || code === 'GBP' ? `${symbol}${formatted}` : `${formatted} ${symbol}`;
}

function formatCartPrice(item, currencyOverride = '') {
  if (!item) return '';
  if (item.priceText) {
    const textCurrency = detectCurrencyText(item.priceText);
    const parsed = parseCartPriceText(item.priceText);
    if (parsed !== null) return formatMoney(parsed, currencyOverride || textCurrency || item.currency || 'EUR');
    return item.priceText;
  }
  if (Number.isFinite(Number(item.price))) return formatMoney(item.price, currencyOverride || item.currency || 'EUR');
  return '';
}

function sumCartPrices(items = []) {
  return items.reduce((sum, item) => {
    const price = Number(item?.price);
    return Number.isFinite(price) ? sum + price : sum;
  }, 0);
}

function currencyFromUrl(value) {
  const text = String(value || '').toLowerCase();
  if (/\/es\/|[?&]localcountry=es\b|[?&]local_country=es\b|[?&]country=es\b/.test(text)) return 'EUR';
  if (/\/ma\/|[?&]localcountry=ma\b|[?&]local_country=ma\b|[?&]country=ma\b/.test(text)) return 'MAD';
  return '';
}

function inferCartCurrency(order) {
  const fromUrl = currencyFromUrl(order.link) || currencyFromUrl(order.sheinCart?.finalUrl);
  if (fromUrl) return fromUrl;

  const items = order.sheinCart?.items || [];
  const fromText = items.find((item) => /€|EUR/i.test(item.priceText || ''));
  if (fromText) return 'EUR';

  return items.find((item) => item.currency)?.currency || 'EUR';
}

function formatCartTotal(value, currency = 'EUR') {
  return formatMoney(value, currency);
}

function formatPricingCost(value, currency = 'EUR') {
  const cost = parsePrice(value);
  return cost === null ? '' : formatMoney(cost, currency);
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
const PRICE_SEPARATOR = ' + ';

function priceToDisplay(value) {
  return String(value || '').replace(/\+/g, PRICE_SEPARATOR);
}

function displayToPrice(value) {
  return String(value || '').replace(/\s/g, '').replace(/\++$/, '+');
}

function pricingItemsFromOrder(order) {
  const source = order?.pricing?.items?.length ? order.pricing.items : defaultPricingItems();
  return PLATFORMS.map((platform) => {
    const item = source.find((it) => it.platform === platform.key);
    return { platform: platform.key, price: typeof item?.price === 'string' ? item.price : '' };
  });
}

function editPriceDisplay(display, start, end, btn) {
  const from = Math.max(0, Math.min(start ?? display.length, display.length));
  const to = Math.max(from, Math.min(end ?? from, display.length));
  let nextDisplay = display;
  let nextPos = from;

  if (btn === '⌫') {
    if (from !== to) {
      nextDisplay = display.slice(0, from) + display.slice(to);
      return { nextDisplay, nextPos: from };
    }
    if (from === 0) return { nextDisplay, nextPos };

    let deleteStart = from - 1;
    let deleteEnd = from;
    const ch = display[deleteStart];
    if (ch === ' ' || ch === '+') {
      while (deleteStart > 0 && (display[deleteStart - 1] === ' ' || display[deleteStart - 1] === '+')) deleteStart--;
      while (deleteEnd < display.length && (display[deleteEnd] === ' ' || display[deleteEnd] === '+')) deleteEnd++;
    }
    nextDisplay = display.slice(0, deleteStart) + display.slice(deleteEnd);
    return { nextDisplay, nextPos: deleteStart };
  }

  if (btn === '+') {
    const before = display.slice(0, from);
    const after = display.slice(to);
    const rawBefore = before.replace(/\s/g, '');
    const rawAfter = after.replace(/\s/g, '');
    if (!rawBefore || rawBefore.endsWith('+') || rawAfter.startsWith('+')) return { nextDisplay, nextPos };
    nextDisplay = before + PRICE_SEPARATOR + after;
    return { nextDisplay, nextPos: before.length + PRICE_SEPARATOR.length };
  }

  if (btn === '.') {
    const before = display.slice(0, from);
    const after = display.slice(to);
    const segmentBefore = before.split('+').pop();
    const segmentAfter = after.split('+')[0];
    if (segmentBefore.includes('.') || segmentAfter.includes('.')) return { nextDisplay, nextPos };
    nextDisplay = before + '.' + after;
    return { nextDisplay, nextPos: before.length + 1 };
  }

  nextDisplay = display.slice(0, from) + btn + display.slice(to);
  return { nextDisplay, nextPos: from + btn.length };
}

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
  const [editingProfile, setEditingProfile] = useState(false);
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editPhotoData, setEditPhotoData] = useState('');
  const [cachedPhoto, setCachedPhoto] = useState(() => localStorage.getItem(`lamar_store_photo_${store}`) || '');
  const [activeKey, setActiveKey] = useState(null);
  const [invoiceEditMode, setInvoiceEditMode] = useState(false);
  const [invoiceHideCustomer, setInvoiceHideCustomer] = useState(false);
  const [invoiceHideCustomerDraft, setInvoiceHideCustomerDraft] = useState(false);
  const [orderItemsExpanded, setOrderItemsExpanded] = useState(true);
  const [orderSearch, setOrderSearch] = useState('');
  const [showCommPanel, setShowCommPanel] = useState(false);
  const [commName, setCommName] = useState('');
  const [commLink, setCommLink] = useState('');
  const [commPricing, setCommPricing] = useState(() => defaultPricingItems());
  const [pricingDraft, setPricingDraft] = useState(() => defaultPricingItems());
  const [pricingDraftOrderId, setPricingDraftOrderId] = useState('');
  const [pricingDraftDirty, setPricingDraftDirty] = useState(false);
  const [pricingSaveState, setPricingSaveState] = useState('idle');
  const [adminScale, setAdminScale] = useState(() => {
    const saved = Number(localStorage.getItem('lamar_admin_scale'));
    return Number.isFinite(saved) ? clampScale(saved) : 1;
  });
  const prevCountRef = useRef(0);
  const saveTimersRef = useRef(new Map());
  const pricingSaveFeedbackTimerRef = useRef(null);
  const invoiceRef = useRef(null);
  const priceCursorRef = useRef({});
  const priceInputRefs = useRef({});

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

  useEffect(() => {
    if (selectedOrder?.id) setOrderItemsExpanded(true);
  }, [selectedOrder?.id]);

  useEffect(() => {
    if (!selectedOrder?.id) {
      setPricingDraft(defaultPricingItems());
      setPricingDraftOrderId('');
      setPricingDraftDirty(false);
      setPricingSaveState('idle');
      return;
    }

    if (pricingDraftOrderId !== selectedOrder.id) {
      setPricingDraft(pricingItemsFromOrder(selectedOrder));
      setPricingDraftOrderId(selectedOrder.id);
      setPricingDraftDirty(false);
      setPricingSaveState('idle');
    }
  }, [selectedOrder?.id, pricingDraftOrderId]);

  useEffect(() => () => {
    if (pricingSaveFeedbackTimerRef.current) clearTimeout(pricingSaveFeedbackTimerRef.current);
  }, []);

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
  const restorePriceCursor = (scope, key, pos) => {
    requestAnimationFrame(() => {
      const input = priceInputRefs.current[`${scope}_${key}`];
      if (!input) return;
      resizePriceEditor(input);
      input.focus();
      input.setSelectionRange(pos, pos);
    });
  };
  const resizePriceEditor = (input) => {
    if (!input) return;
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, sz(92))}px`;
  };
  const openNewOrderForm = () => {
    setCommName('');
    setCommLink('');
    setCommPricing(defaultPricingItems());
    setActiveKey(null);
    setShowCommPanel(false);
    setView('newOrder');
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

  const handleImageUpload = (order, event, onPriceDetected) => {
    Array.from(event.target.files || []).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const updated = { ...order, images: [...(order.images || []), ev.target.result] };
        queueSave(updated);
        runOcr(updated, ev.target.result, onPriceDetected);
      };
      reader.readAsDataURL(file);
    });
    event.target.value = '';
  };

  const runOcr = async (order, image, onPriceDetected) => {
    try {
      const Tesseract = await loadScript('https://cdn.jsdelivr.net/npm/tesseract.js@4/dist/tesseract.min.js', 'Tesseract');
      const result = await Tesseract.recognize(image, 'eng');
      const text = result?.data?.text || '';
      const prices = text.match(/\d+(?:[.,]\d{1,2})?/g) || [];
      const price = prices.find((value) => Number(value.replace(',', '.')) > 0);
      if (!price) return;
      const platform = /market\s*place/i.test(text) ? 'marketplace' : 'shein';
      const normalizedPrice = price.replace(',', '.');
      if (onPriceDetected) onPriceDetected(platform, normalizedPrice);
      else appendPrice(order, platform, normalizedPrice);
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

  const startVoice = (order, onPriceDetected) => {
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
      if (value) {
        const normalizedValue = value.replace(',', '.');
        if (onPriceDetected) onPriceDetected(platform, normalizedValue);
        else appendPrice(order, platform, normalizedValue);
      }
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', direction: 'ltr' }}>
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
      {sidebarOpen && <button aria-label="Close menu" onClick={() => setSidebarOpen(false)} style={{ position: 'fixed', inset: 0, border: 'none', background: 'rgba(17, 24, 39, 0.34)', zIndex: 200, cursor: 'pointer' }} />}
      <aside style={{ position: 'fixed', top: 0, bottom: 0, right: 0, width: 'min(82vw, 310px)', background: T.card, boxShadow: `-8px 0 28px ${T.shadow}`, zIndex: 201, transform: sidebarOpen ? 'translateX(0)' : 'translateX(105%)', transition: 'transform 0.24s ease', padding: sz(16), boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: sz(12), direction: t.dir }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: sz(10) }}>
          <button onClick={() => setSidebarOpen(false)} style={{ width: sz(32), height: sz(32), borderRadius: sz(9), border: 'none', background: T.accentLight, color: T.accent, fontSize: sz(18), lineHeight: 1, cursor: 'pointer' }}>x</button>
          <div style={{ flex: 1, textAlign: 'right' }}>
            <div style={{ color: T.text, fontWeight: 900, fontSize: sz(14) }}>{ownerStore?.displayName || store}</div>
            <div style={{ color: T.textMuted, fontSize: sz(10), direction: 'ltr', textAlign: 'right' }}>/{store}</div>
          </div>
          <div style={{ position: 'relative' }}>
            {(ownerStore?.photoURL || cachedPhoto)
              ? <img src={ownerStore?.photoURL || cachedPhoto} alt="" style={{ width: sz(38), height: sz(38), borderRadius: '50%', objectFit: 'cover', border: `2px solid ${T.accentLight}` }} />
              : <div style={{ width: sz(38), height: sz(38), borderRadius: '50%', background: T.accentLight, border: `2px solid ${T.accentLight}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.accent, fontWeight: 800, fontSize: sz(16) }}>{(ownerStore?.displayName || store || '?')[0].toUpperCase()}</div>
            }
            <button
              onClick={() => { setEditingProfile((v) => !v); setEditDisplayName(ownerStore?.displayName || store); setEditPhotoData(''); }}
              style={{ position: 'absolute', bottom: -2, right: -2, width: sz(18), height: sz(18), borderRadius: '50%', background: T.accent, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
            >
              <svg width={sz(10)} height={sz(10)} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </button>
          </div>
        </div>

        {editingProfile && (
          <div style={{ background: T.bg, borderRadius: sz(12), padding: sz(12), border: `1px solid ${T.border}` }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: sz(10) }}>
              <label style={{ position: 'relative', cursor: 'pointer' }}>
                {(editPhotoData || ownerStore?.photoURL || cachedPhoto)
                  ? <img src={editPhotoData || ownerStore?.photoURL || cachedPhoto} alt="" style={{ width: sz(64), height: sz(64), borderRadius: '50%', objectFit: 'cover', border: `2px solid ${T.accent}` }} />
                  : <div style={{ width: sz(64), height: sz(64), borderRadius: '50%', background: T.accentLight, border: `2px solid ${T.accent}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.accent, fontWeight: 800, fontSize: sz(26) }}>{(ownerStore?.displayName || store || '?')[0].toUpperCase()}</div>
                }
                <div style={{ position: 'absolute', bottom: 0, right: 0, width: sz(20), height: sz(20), borderRadius: '50%', background: T.accent, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width={sz(10)} height={sz(10)} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                </div>
                <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = (ev) => {
                    const img = new Image();
                    img.onload = () => {
                      const MAX = 256;
                      const scale = Math.min(1, MAX / Math.max(img.width, img.height));
                      const canvas = document.createElement('canvas');
                      canvas.width = Math.round(img.width * scale);
                      canvas.height = Math.round(img.height * scale);
                      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
                      setEditPhotoData(canvas.toDataURL('image/jpeg', 0.75));
                    };
                    img.src = ev.target.result;
                  };
                  reader.readAsDataURL(file);
                  e.target.value = '';
                }} />
              </label>
            </div>
            <input
              value={editDisplayName}
              onChange={(e) => setEditDisplayName(e.target.value)}
              style={{ width: '100%', padding: `${sz(9)}px ${sz(10)}px`, borderRadius: sz(9), border: `1.5px solid ${T.border}`, background: T.card, color: T.text, fontSize: sz(13), fontFamily: 'Tajawal, sans-serif', outline: 'none', boxSizing: 'border-box', textAlign: 'right', direction: t.dir }}
            />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: sz(8), marginTop: sz(8) }}>
              <button onClick={() => setEditingProfile(false)} style={{ ...sidebarButton, fontSize: sz(11) }}>{t.back}</button>
              <button
                onClick={async () => {
                  const updates = { displayName: editDisplayName.trim() || store };
                  if (editPhotoData) updates.photoURL = editPhotoData;
                  try {
                    await updateStore(store, updates);
                    if (updates.photoURL) {
                      localStorage.setItem(`lamar_store_photo_${store}`, updates.photoURL);
                      setCachedPhoto(updates.photoURL);
                    }
                    setOwnerStore((s) => ({ ...s, ...updates }));
                    setEditingProfile(false);
                  } catch (err) {
                    setToast(err?.message || String(err));
                  }
                }}
                style={{ ...sidebarButton, background: `linear-gradient(135deg, ${T.accent}, ${T.accentDark})`, color: '#fff', border: 'none', fontSize: sz(11) }}
              >
                {t.save}
              </button>
            </div>
          </div>
        )}

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
        {topbar(isCustomers ? t.customers : t.orders, [topBtn('←', () => setExpandedStat(null))], [])}
        <div style={{ flex: 1, overflowY: 'auto', padding: `${sz(12)}px ${sz(14)}px`, display: 'flex', flexDirection: 'column', gap: sz(8) }}>
          {isCustomers ? uniqueCustomers.map((order) => (
            <div key={order.id} style={{ ...card, display: 'flex', alignItems: 'center', gap: sz(12) }}>
              <div style={{ flex: 1 }}><div style={{ fontWeight: 700, color: T.text, fontSize: sz(14) }}>{order.name}</div><div style={{ fontSize: sz(11), color: T.textMuted }}>{order.phone}</div></div>
              <div style={{ color: T.accent, fontWeight: 800, fontSize: sz(14) }}>{orders.filter((x) => x.name.toLowerCase() === order.name.toLowerCase()).length}</div>
            </div>
          )) : list.map((order) => (
            <div key={order.id} onClick={() => { setSelectedOrder(order); setView('detail'); setExpandedStat(null); setActiveKey(null); }} style={{ ...card, cursor: 'pointer' }}>
              {order.orderNumber && <div style={{ color: T.accent, fontSize: sz(10), fontWeight: 800, direction: 'ltr', marginBottom: sz(4) }}>{order.orderNumber}</div>}
              <div style={{ fontWeight: 700, color: T.text, fontSize: sz(14) }}>{order.name}</div>
              <div style={{ fontSize: sz(11), color: T.textMuted }}>{formatTime(order.time, lang)}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (view === 'newOrder') {
    const commTotal = calcTotal(commPricing);
    const commUpdatePrice = (key, val) => setCommPricing((prev) => prev.map((it) => it.platform === key ? { ...it, price: displayToPrice(val) } : it));
    const commHandleKey = (key, btn) => {
      if (btn === '✓') { setActiveKey(null); return; }
      const item = commPricing.find((it) => it.platform === key) || { price: '' };
      const disp = priceToDisplay(item.price);
      const input = priceInputRefs.current[`comm_${key}`];
      const start = input?.selectionStart ?? priceCursorRef.current[key] ?? disp.length;
      const end = input?.selectionEnd ?? start;
      const { nextDisplay, nextPos } = editPriceDisplay(disp, start, end, btn);
      priceCursorRef.current[key] = nextPos;
      commUpdatePrice(key, nextDisplay);
      restorePriceCursor('comm', key, nextPos);
    };
    const createAdminOrder = () => {
      if (!commName.trim() && commPricing.every((it) => !it.price)) return;
      createOrder(store, { name: commName, phone: '', link: commLink, pricing: { items: commPricing }, submittedByName: '' })
        .then((createdOrder) => {
          setOrders((current) => [createdOrder, ...current.filter((order) => order.id !== createdOrder.id)]);
          setSelectedOrder(createdOrder);
          setPricingDraft(pricingItemsFromOrder(createdOrder));
          setPricingDraftOrderId(createdOrder.id);
          setPricingDraftDirty(false);
          setPricingSaveState('idle');
          setCommName('');
          setCommLink('');
          setCommPricing(defaultPricingItems());
          setActiveKey(null);
          setView('detail');
        })
        .catch((err) => setToast(err?.message || String(err)));
    };
    const inputStyle = { width: '100%', padding: `${sz(11)}px ${sz(13)}px`, borderRadius: sz(11), border: `1.5px solid ${T.border}`, background: T.bg, color: T.text, fontSize: sz(13), fontFamily: 'Tajawal, sans-serif', outline: 'none', boxSizing: 'border-box', direction: t.dir };
    const KB_ROWS = [['7', '8', '9', '⌫'], ['4', '5', '6', '+'], ['1', '2', '3', '.'], ['0', '✓']];
    const btnStyle = (btn) => ({
      padding: `${sz(14)}px 0`,
      borderRadius: sz(10),
      border: 'none',
      fontSize: btn === '⌫' || btn === '✓' ? sz(18) : sz(20),
      fontWeight: btn === '✓' ? 800 : 600,
      cursor: 'pointer',
      background: btn === '✓' ? T.accent : btn === '⌫' ? T.border : T.card,
      color: btn === '✓' ? '#fff' : T.text,
      gridColumn: btn === '0' ? 'span 3' : 'span 1',
      fontFamily: 'monospace',
      boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
    });
    return (
      <>
        <div style={{ minHeight: '100vh', background: T.bg, display: 'flex', flexDirection: 'column', fontFamily: 'Tajawal, sans-serif', direction: t.dir }}>
          {topbar(t.orderTitle, [topBtn('←', () => { setActiveKey(null); setView('dashboard'); })], [])}
          {toast && <button onClick={() => setToast('')} style={{ background: '#222', color: '#fff', border: 'none', padding: sz(8), fontSize: sz(11) }}>{toast}</button>}
          <div style={{ flex: 1, overflowY: 'auto', padding: `${sz(12)}px ${sz(14)}px`, display: 'flex', flexDirection: 'column', gap: sz(10) }}>
            <div style={card}>
              <div style={{ fontSize: sz(13), fontWeight: 800, color: T.text, marginBottom: sz(10), textAlign: t.dir === 'rtl' ? 'right' : 'left' }}>{t.orderDetails}</div>
              <input value={commName} onChange={(e) => setCommName(e.target.value)} placeholder={t.customerLabel} style={{ ...inputStyle, marginBottom: sz(10) }} />
              <input value={commLink} onChange={(e) => setCommLink(e.target.value)} placeholder={t.linkPlaceholder} style={{ ...inputStyle, direction: 'ltr', color: T.accent, textAlign: 'left' }} />
            </div>
            <div style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: sz(10) }}>
                <div style={{ display: 'flex', gap: sz(4), flexWrap: 'wrap' }}>
                  {PLATFORMS.map((p) => <button key={p.key} onClick={() => setActivePlatform(p.key)} style={{ padding: `${sz(3)}px ${sz(8)}px`, borderRadius: sz(10), border: `1.5px solid ${activePlatform === p.key ? T.accent : T.border}`, background: activePlatform === p.key ? T.accentLight : 'transparent', color: activePlatform === p.key ? T.accent : T.textMuted, fontSize: sz(9), fontWeight: 700, cursor: 'pointer' }}>{p.label}</button>)}
                </div>
                <div style={{ fontSize: sz(13), fontWeight: 700, color: T.text }}>{t.pricing}</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: sz(8) }}>
                {PLATFORMS.map((p) => {
                  const item = commPricing.find((it) => it.platform === p.key) || { price: '', platform: p.key };
                  const calc = calcPrice(p.key, item.price);
                  return (
                    <div key={p.key} style={{ display: 'flex', alignItems: 'flex-start', gap: sz(6), direction: 'ltr', flexWrap: 'wrap' }}>
                      <div style={{ background: T.accentLight, color: T.accent, borderRadius: sz(8), padding: `${sz(4)}px ${sz(8)}px`, fontSize: sz(9), fontWeight: 700, minWidth: sz(72), textAlign: 'center', flexShrink: 0, marginTop: sz(5) }}>{p.label}</div>
                      <textarea
                        ref={(el) => { priceInputRefs.current[`comm_${p.key}`] = el; resizePriceEditor(el); }}
                        value={priceToDisplay(item.price)}
                        onFocus={(e) => { resizePriceEditor(e.currentTarget); setActiveKey(p.key); priceCursorRef.current[p.key] = e.currentTarget.selectionStart ?? priceToDisplay(item.price).length; }}
                        onClick={(e) => { priceCursorRef.current[p.key] = e.currentTarget.selectionStart ?? priceToDisplay(item.price).length; }}
                        onSelect={(e) => { priceCursorRef.current[p.key] = e.currentTarget.selectionStart ?? priceToDisplay(item.price).length; }}
                        onChange={(e) => {
                          const cleaned = e.target.value.replace(/[^\d.+\s]/g, '');
                          priceCursorRef.current[p.key] = e.target.selectionStart ?? cleaned.length;
                          commUpdatePrice(p.key, cleaned);
                          resizePriceEditor(e.currentTarget);
                        }}
                        placeholder="0.00"
                        inputMode="decimal"
                        rows={1}
                        style={{ flex: '1 1 170px', minWidth: sz(150), background: activeKey === p.key ? T.accentLight : T.bg, borderRadius: sz(10), padding: `${sz(7)}px ${sz(10)}px`, direction: 'ltr', border: `1.5px solid ${activeKey === p.key ? T.accent : 'transparent'}`, cursor: 'text', position: 'relative', zIndex: 102, transition: 'background 0.15s, border-color 0.15s', width: '100%', fontSize: sz(13), color: item.price ? T.text : T.textMuted, fontFamily: 'monospace', letterSpacing: '-0.3px', minHeight: `${sz(34)}px`, maxHeight: `${sz(92)}px`, lineHeight: 1.45, outline: 'none', boxSizing: 'border-box', resize: 'none', overflowY: 'auto', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}
                      />
                      {calc !== null && <div style={{ flex: '1 0 100%', fontSize: sz(11), fontWeight: 700, color: T.gold, minWidth: sz(70), textAlign: 'right', direction: 'ltr' }}>{formatMoney(calc, 'EUR')}</div>}
                    </div>
                  );
                })}
              </div>
              {commTotal > 0 && <div style={{ marginTop: sz(12), paddingTop: sz(10), borderTop: `1px solid ${T.border}`, display: 'flex', justifyContent: 'space-between', direction: 'ltr' }}><div style={{ fontSize: sz(12), color: T.textMuted }}>{t.total2}</div><div style={{ fontSize: sz(15), fontWeight: 800, color: T.gold }}>{formatMoney(commTotal, 'EUR')}</div></div>}
              <button onClick={createAdminOrder} style={{ width: '100%', marginTop: sz(12), padding: sz(11), borderRadius: sz(11), border: 'none', background: T.accent, color: '#fff', fontSize: sz(12), fontWeight: 800, cursor: 'pointer', fontFamily: 'Tajawal, sans-serif' }}>{t.save}</button>
            </div>
          </div>
        </div>
        {activeKey && (() => (
          <>
            <div onClick={() => setActiveKey(null)} style={{ position: 'fixed', inset: 0, zIndex: 100 }} />
            <div onClick={(e) => e.stopPropagation()} style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 101, background: T.bg, borderTop: `1.5px solid ${T.border}`, borderRadius: `${sz(16)}px ${sz(16)}px 0 0`, padding: sz(12), boxShadow: '0 -4px 24px rgba(0,0,0,0.12)', direction: 'ltr' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: sz(8) }}>
                {KB_ROWS.flat().map((btn) => <button key={btn} style={btnStyle(btn)} onMouseDown={(e) => { e.preventDefault(); commHandleKey(activeKey, btn); }}>{btn}</button>)}
              </div>
            </div>
          </>
        ))()}
      </>
    );
  }

  if (view === 'dashboard') {
    return (
      <div style={{ minHeight: '100vh', background: T.bg, display: 'flex', flexDirection: 'column', fontFamily: 'Tajawal, sans-serif', direction: t.dir }}>
        {adminSidebar}
        {topbar(
          <span>{ownerStore?.displayName || store}<br/><span style={{ fontSize: sz(10), color: 'rgba(255,255,255,0.6)', fontWeight: 400 }}>{t.dashboard}</span></span>,
          [topBtn(t.menu, () => setSidebarOpen(true))],
          [(ownerStore?.photoURL || cachedPhoto)
            ? <img key="logo" src={ownerStore?.photoURL || cachedPhoto} alt="" style={{ width: sz(32), height: sz(32), borderRadius: '50%', objectFit: 'cover', border: `${sz(2)}px solid rgba(255,255,255,0.4)` }} />
            : <div key="logo" style={{ width: sz(32), height: sz(32), borderRadius: '50%', background: 'rgba(255,255,255,0.25)', border: `${sz(2)}px solid rgba(255,255,255,0.4)`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: sz(14) }}>{(ownerStore?.displayName || store || '?')[0].toUpperCase()}</div>
          ],
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
          <div style={{ display: 'flex', gap: sz(8), alignItems: 'center', marginBottom: sz(10) }}>
            <input value={orderSearch} onChange={(e) => setOrderSearch(e.target.value)} placeholder={t.searchOrders} style={{ flex: 1, padding: `${sz(11)}px ${sz(13)}px`, borderRadius: sz(12), border: `1.5px solid ${T.border}`, background: T.card, color: T.text, fontSize: sz(12), fontFamily: 'Tajawal, sans-serif', outline: 'none', boxSizing: 'border-box', direction: t.dir, textAlign: t.dir === 'rtl' ? 'right' : 'left' }} />
            <button onClick={openNewOrderForm} style={{ width: sz(42), height: sz(42), borderRadius: sz(12), border: 'none', background: T.accentLight, color: T.accent, fontSize: sz(22), fontWeight: 700, cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>+</button>
          </div>
          {showCommPanel && (() => {
            const commTotal = calcTotal(commPricing);
            const commUpdatePrice = (key, val) => setCommPricing((prev) => prev.map((it) => it.platform === key ? { ...it, price: displayToPrice(val) } : it));
            const commHandleKey = (key, btn) => {
              if (btn === '✓') { setActiveKey(null); return; }
              const item = commPricing.find((it) => it.platform === key) || { price: '' };
              const disp = priceToDisplay(item.price);
              const input = priceInputRefs.current[`comm_${key}`];
              const start = input?.selectionStart ?? priceCursorRef.current[key] ?? disp.length;
              const end = input?.selectionEnd ?? start;
              const { nextDisplay, nextPos } = editPriceDisplay(disp, start, end, btn);
              priceCursorRef.current[key] = nextPos;
              commUpdatePrice(key, nextDisplay);
              restorePriceCursor('comm', key, nextPos);
            };
            const inputStyle = { width: '100%', padding: `${sz(9)}px ${sz(12)}px`, borderRadius: sz(10), border: `1.5px solid ${T.border}`, background: T.bg, color: T.text, fontSize: sz(13), fontFamily: 'Tajawal, sans-serif', outline: 'none', boxSizing: 'border-box', marginBottom: sz(10), direction: t.dir };
            const KB_ROWS = [['7', '8', '9', '⌫'], ['4', '5', '6', '+'], ['1', '2', '3', '.'], ['0', '✓']];
            const btnStyle = (btn) => ({ padding: `${sz(14)}px 0`, borderRadius: sz(10), border: 'none', fontSize: btn === '⌫' || btn === '✓' ? sz(18) : sz(20), fontWeight: btn === '✓' ? 800 : 600, cursor: 'pointer', background: btn === '✓' ? T.accent : btn === '⌫' ? T.border : T.card, color: btn === '✓' ? '#fff' : T.text, gridColumn: btn === '0' ? 'span 3' : 'span 1', fontFamily: 'monospace', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' });
            return (
              <>
                <style>{`
                  .lamar-comm-cursor { display: inline-block; width: 1.5px; height: 0.85em; background: ${T.accent}; margin: 0 -0.5px; vertical-align: text-bottom; animation: lamar-cursor-blink 1s step-end infinite; }
                `}</style>
                <div style={{ ...card, padding: sz(14), marginBottom: sz(10) }}>
                  <input value={commName} onChange={(e) => setCommName(e.target.value)} placeholder={t.customerLabel} style={inputStyle} />
                  <input value={commLink} onChange={(e) => setCommLink(e.target.value)} placeholder={t.linkPlaceholder} style={{ ...inputStyle, direction: 'ltr', color: T.accent }} />
                  <div style={{ display: 'flex', gap: sz(4), marginBottom: sz(10), flexWrap: 'wrap' }}>
                    {PLATFORMS.map((p) => <button key={p.key} onClick={() => setActivePlatform(p.key)} style={{ padding: `${sz(3)}px ${sz(8)}px`, borderRadius: sz(10), border: `1.5px solid ${activePlatform === p.key ? T.accent : T.border}`, background: activePlatform === p.key ? T.accentLight : 'transparent', color: activePlatform === p.key ? T.accent : T.textMuted, fontSize: sz(9), fontWeight: 700, cursor: 'pointer' }}>{p.label}</button>)}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: sz(8) }}>
                    {PLATFORMS.map((p) => {
                      const item = commPricing.find((it) => it.platform === p.key) || { price: '', platform: p.key };
                      const calc = calcPrice(p.key, item.price);
                      return (
                        <div key={p.key} style={{ display: 'flex', alignItems: 'center', gap: sz(6), direction: 'ltr' }}>
                          <div style={{ background: T.accentLight, color: T.accent, borderRadius: sz(8), padding: `${sz(4)}px ${sz(8)}px`, fontSize: sz(9), fontWeight: 700, minWidth: sz(72), textAlign: 'center', flexShrink: 0 }}>{p.label}</div>
                          <input
                            ref={(el) => { priceInputRefs.current[`comm_${p.key}`] = el; }}
                            value={priceToDisplay(item.price)}
                            onFocus={(e) => { setActiveKey(p.key); priceCursorRef.current[p.key] = e.currentTarget.selectionStart ?? priceToDisplay(item.price).length; }}
                            onClick={(e) => { priceCursorRef.current[p.key] = e.currentTarget.selectionStart ?? priceToDisplay(item.price).length; }}
                            onSelect={(e) => { priceCursorRef.current[p.key] = e.currentTarget.selectionStart ?? priceToDisplay(item.price).length; }}
                            onChange={(e) => {
                              const cleaned = e.target.value.replace(/[^\d.+\s]/g, '');
                              priceCursorRef.current[p.key] = e.target.selectionStart ?? cleaned.length;
                              commUpdatePrice(p.key, cleaned);
                            }}
                            placeholder="0.00"
                            inputMode="decimal"
                            style={{ flex: 1, background: activeKey === p.key ? T.accentLight : T.bg, borderRadius: sz(10), padding: `${sz(7)}px ${sz(10)}px`, direction: 'ltr', border: `1.5px solid ${activeKey === p.key ? T.accent : 'transparent'}`, cursor: 'text', position: 'relative', zIndex: 102, transition: 'background 0.15s, border-color 0.15s', width: '100%', fontSize: sz(13), color: item.price ? T.text : T.textMuted, fontFamily: 'monospace', letterSpacing: '-0.3px', minHeight: `${sz(18)}px`, outline: 'none', boxSizing: 'border-box', textAlign: 'right' }}
                          />
                          {calc !== null && <div style={{ fontSize: sz(11), fontWeight: 700, color: T.gold, minWidth: sz(70), textAlign: 'right', direction: 'ltr', flexShrink: 0 }}>{formatMoney(calc, 'EUR')}</div>}
                        </div>
                      );
                    })}
                  </div>
                  {commTotal > 0 && <div style={{ marginTop: sz(12), paddingTop: sz(10), borderTop: `1px solid ${T.border}`, display: 'flex', justifyContent: 'space-between', direction: 'ltr' }}><div style={{ fontSize: sz(12), color: T.textMuted }}>{t.total2}</div><div style={{ fontSize: sz(15), fontWeight: 800, color: T.gold }}>{formatMoney(commTotal, 'EUR')}</div></div>}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: sz(8), marginTop: sz(14) }}>
                    <button onClick={() => { if (!commName.trim() && commPricing.every((it) => !it.price)) return; createOrder(store, { name: commName, phone: '', link: commLink, pricing: { items: commPricing }, submittedByName: '' }).then(() => { setCommName(''); setCommLink(''); setCommPricing(defaultPricingItems()); setActiveKey(null); setShowCommPanel(false); }).catch((err) => setToast(err?.message || String(err))); }} style={{ padding: sz(11), borderRadius: sz(11), border: 'none', background: T.accent, color: '#fff', fontSize: sz(12), fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: sz(5) }}><span>✓</span><span>{t.saveCommission}</span></button>
                    <button onClick={() => { setShowCommPanel(false); setActiveKey(null); }} style={{ padding: sz(11), borderRadius: sz(11), border: 'none', background: T.accentLight, color: T.accent, fontSize: sz(12), fontWeight: 700, cursor: 'pointer' }}>✕</button>
                  </div>
                </div>
                {activeKey && (() => {
                  return (
                    <>
                      <div onClick={() => setActiveKey(null)} style={{ position: 'fixed', inset: 0, zIndex: 100 }} />
                      <div onClick={(e) => e.stopPropagation()} style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 101, background: T.bg, borderTop: `1.5px solid ${T.border}`, borderRadius: `${sz(16)}px ${sz(16)}px 0 0`, padding: sz(12), boxShadow: '0 -4px 24px rgba(0,0,0,0.12)', direction: 'ltr' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: sz(8) }}>
                          {KB_ROWS.flat().map((btn) => <button key={btn} style={btnStyle(btn)} onMouseDown={(e) => { e.preventDefault(); commHandleKey(activeKey, btn); }}>{btn}</button>)}
                        </div>
                      </div>
                    </>
                  );
                })()}
              </>
            );
          })()}
          <div style={{ display: 'flex', flexDirection: 'column', gap: sz(8) }}>
            {visibleOrders.map((order) => {
              const total = calcTotal(order.pricing?.items);
              const cartTotal = sumCartPrices(order.sheinCart?.items);
              const cartCurrency = inferCartCurrency(order);
              return (
                <div key={order.id} onClick={() => { setSelectedOrder(order); setView('detail'); setActiveKey(null); }} style={{ ...card, padding: `${sz(10)}px ${sz(11)}px`, cursor: 'pointer', borderRight: `${sz(4)}px solid ${order.status === 'done' ? '#4caf50' : T.accent}`, direction: 'ltr' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: sz(8), marginBottom: sz(7) }}>
                    <span style={badge(order.status)}>{statusLabel(order.status, t)}</span>
                    {order.orderNumber && <span style={{ fontSize: sz(10), fontWeight: 900, color: T.accent, background: T.accentLight, borderRadius: sz(8), padding: `${sz(3)}px ${sz(7)}px`, direction: 'ltr' }}>{order.orderNumber}</span>}
                  </div>
                  <div style={{ textAlign: 'right', direction: t.dir, marginBottom: sz(4) }}>
                    <div style={{ fontWeight: 800, color: T.text, fontSize: sz(13), lineHeight: 1.35 }}>{order.name}</div>
                    <div style={{ color: T.textMuted, fontSize: sz(10), marginTop: sz(2) }}>{formatTime(order.time, lang)}</div>
                  </div>
                  <div style={{ color: T.textMuted, fontSize: sz(10), direction: 'ltr', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{order.link}</div>
                  {!!order.sheinCart?.items?.length && (
                    <div style={{ marginTop: sz(6), color: T.text, fontSize: sz(10), fontWeight: 700, textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {order.sheinCart.items[0].name} · {formatCartPrice(order.sheinCart.items[0], cartCurrency)}
                    </div>
                  )}
                  {cartTotal > 0 && <div style={{ textAlign: 'left', fontSize: sz(10), fontWeight: 800, color: T.gold, marginTop: sz(4), direction: 'ltr' }}>{formatCartTotal(cartTotal, cartCurrency)}</div>}
                  {total > 0 && <div style={{ textAlign: 'left', fontSize: sz(11), fontWeight: 700, color: T.gold, marginTop: sz(4), direction: 'ltr' }}>{formatMoney(total, cartCurrency)}</div>}
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
    const items = pricingDraftOrderId === order.id ? pricingDraft : pricingItemsFromOrder(order);
    const updatePrice = (key, val) => {
      const baseItems = pricingDraftOrderId === order.id ? pricingDraft : pricingItemsFromOrder(order);
      setPricingDraft(baseItems.map((it) => (it.platform === key ? { ...it, price: displayToPrice(val) } : it)));
      setPricingDraftOrderId(order.id);
      setPricingDraftDirty(true);
      setPricingSaveState('idle');
    };
    const savePricingChanges = async () => {
      if (!pricingDraftDirty || pricingSaveState === 'saving') return;
      const nextItems = pricingDraftOrderId === order.id ? pricingDraft : pricingItemsFromOrder(order);
      const updated = { ...order, pricing: { items: nextItems } };
      setPricingSaveState('saving');
      setOrders((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setSelectedOrder(updated);
      try {
        await saveOrder(store, updated);
        setPricingDraftDirty(false);
        setActiveKey(null);
        setPricingSaveState('saved');
        if (pricingSaveFeedbackTimerRef.current) clearTimeout(pricingSaveFeedbackTimerRef.current);
        pricingSaveFeedbackTimerRef.current = setTimeout(() => setPricingSaveState('idle'), 1800);
      } catch (error) {
        setPricingSaveState('error');
        setPricingDraftDirty(true);
        setToast(error?.message || String(error));
      }
    };
    const appendPriceToDraft = (platform, value) => {
      const baseItems = pricingDraftOrderId === order.id ? pricingDraft : pricingItemsFromOrder(order);
      setPricingDraft(baseItems.map((item) => (
        item.platform === platform ? { ...item, price: item.price ? `${item.price}+${value}` : value } : item
      )));
      setPricingDraftOrderId(order.id);
      setPricingDraftDirty(true);
      setPricingSaveState('idle');
    };
    const handleKeyInput = (key, btn) => {
      if (btn === '✓') { setActiveKey(null); return; }
      const item = items.find((it) => it.platform === key) || { price: '' };
      const disp = priceToDisplay(item.price);
      const input = priceInputRefs.current[`detail_${key}`];
      const start = input?.selectionStart ?? priceCursorRef.current[key] ?? disp.length;
      const end = input?.selectionEnd ?? start;
      const { nextDisplay, nextPos } = editPriceDisplay(disp, start, end, btn);
      priceCursorRef.current[key] = nextPos;
      updatePrice(key, nextDisplay);
      restorePriceCursor('detail', key, nextPos);
    };
    const totalCalc = calcTotal(items);
    const cartTotal = sumCartPrices(order.sheinCart?.items);
    const cartCurrency = inferCartCurrency(order);
    const isPricingSaving = pricingSaveState === 'saving';
    const pricingSaveButtonLabel = pricingSaveState === 'saving'
      ? 'Saving...'
      : pricingSaveState === 'saved'
        ? 'Saved'
        : pricingSaveState === 'error'
          ? 'Try again'
          : t.save;
    const pricingSaveButtonBg = pricingSaveState === 'saved'
      ? '#4caf50'
      : pricingSaveState === 'error'
        ? '#e05c5c'
        : pricingDraftDirty
          ? T.accent
          : T.border;
    const pricingSaveButtonColor = pricingDraftDirty || pricingSaveState === 'saving' || pricingSaveState === 'saved' || pricingSaveState === 'error' ? '#fff' : T.textMuted;
    return (
      <>
      <style>{`
        .lamar-fake-cursor { display: inline-block; width: 1.5px; height: 0.85em; background: ${T.accent}; margin: 0 -0.5px; vertical-align: text-bottom; animation: lamar-cursor-blink 1s step-end infinite; }
        @keyframes lamar-cursor-blink { 0%,49% { opacity: 1; } 50%,100% { opacity: 0; } }
      `}</style>
      <div style={{ minHeight: '100vh', background: T.bg, display: 'flex', flexDirection: 'column', fontFamily: 'Tajawal, sans-serif', direction: t.dir }}>
        {topbar(t.orderDetails, [topBtn('←', () => setView('dashboard'))], [topBtn(t.invoice, () => setView('invoice')), topBtn(order.status === 'pending' ? t.markDone : t.markPending, () => toggleStatus(order))])}
        <div style={{ flex: 1, overflowY: 'auto', padding: `${sz(12)}px ${sz(14)}px`, display: 'flex', flexDirection: 'column', gap: sz(10) }}>
          <div style={{ ...card, padding: sz(12) }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: sz(8), marginBottom: sz(8), direction: 'ltr' }}>
              <span style={badge(order.status)}>{statusLabel(order.status, t)}</span>
              {order.orderNumber && <div style={{ display: 'inline-flex', color: T.accent, background: T.accentLight, fontWeight: 900, fontSize: sz(12), borderRadius: sz(10), padding: `${sz(5)}px ${sz(9)}px`, direction: 'ltr' }}>{order.orderNumber}</div>}
            </div>
            <div style={{ fontWeight: 800, color: T.text, fontSize: sz(15), textAlign: 'left' }}>{order.name}</div>
            <div style={{ color: T.textMuted, fontSize: sz(11), direction: 'ltr', textAlign: 'left', marginTop: sz(3) }}>{order.phone}</div>
          </div>
          <div style={card}>
            <div style={{ fontSize: sz(11), color: T.textMuted, marginBottom: sz(5), textAlign: 'left' }}>{t.productLink}</div>
            <div style={{ display: 'flex', gap: sz(8), alignItems: 'center', direction: 'ltr' }}>
              <div style={{ flex: 1, minWidth: 0, color: T.accent, fontSize: sz(11), direction: 'ltr', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{order.link}</div>
              <button onClick={() => window.open(order.link, '_blank', 'noopener,noreferrer')} style={{ border: 'none', borderRadius: sz(9), padding: `${sz(7)}px ${sz(10)}px`, background: T.accentLight, color: T.accent, fontSize: sz(11), fontWeight: 800, cursor: 'pointer', flexShrink: 0 }}>{t.openShein}</button>
            </div>
          </div>
          {!!order.sheinCart?.items?.length && (
            <div style={card}>
              <button onClick={() => setOrderItemsExpanded((current) => !current)} style={{ width: '100%', border: 'none', background: 'transparent', padding: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: sz(10), cursor: 'pointer', fontFamily: 'Tajawal, sans-serif' }}>
                <div style={{ color: T.gold, fontSize: sz(12), fontWeight: 900, direction: 'ltr', textAlign: 'left' }}>
                  {cartTotal > 0 ? formatCartTotal(cartTotal, cartCurrency) : formatCartPrice(order.sheinCart.items[0], cartCurrency)}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: sz(8) }}>
                  <span style={{ color: T.textMuted, fontSize: sz(11), fontWeight: 900 }}>{orderItemsExpanded ? '-' : '+'}</span>
                  <span style={{ fontSize: sz(13), fontWeight: 800, color: T.text }}>{t.orderItems}</span>
                </div>
              </button>
              {orderItemsExpanded && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: sz(8), marginTop: sz(10) }}>
                  {order.sheinCart.items.map((item, idx) => (
                    <div key={`${item.name}-${idx}`} style={{ background: T.bg, borderRadius: sz(10), padding: sz(10) }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', marginBottom: sz(6), borderRadius: sz(6), padding: `${sz(2)}px ${sz(6)}px`, background: item.platform === 'marketplace' ? '#111' : T.accentLight, color: item.platform === 'marketplace' ? '#fff' : T.accent, fontSize: sz(9), fontWeight: 900 }}>
                        {item.platform === 'marketplace' ? 'Marketplace' : 'SHEIN'}
                      </div>
                      <div style={{ color: T.text, fontSize: sz(12), fontWeight: 800, lineHeight: 1.5, textAlign: 'right' }}>{item.name}</div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: sz(8), marginTop: sz(6), direction: 'ltr' }}>
                        <span style={{ color: T.textMuted, fontSize: sz(11), overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.choices?.join(' / ')}</span>
                        <span style={{ color: T.gold, fontSize: sz(12), fontWeight: 900, flexShrink: 0 }}>{formatCartPrice(item, cartCurrency)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          <div style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: sz(10) }}>
              <div style={{ display: 'flex', gap: sz(6) }}>
                <button onClick={() => startVoice(order, appendPriceToDraft)} style={{ padding: `${sz(6)}px ${sz(10)}px`, borderRadius: sz(8), border: 'none', background: isRecording ? '#e05c5c' : T.accentLight, color: isRecording ? '#fff' : T.accent, fontSize: sz(12), cursor: 'pointer' }}>{isRecording ? t.recording : t.voice}</button>
                <label style={{ padding: `${sz(6)}px ${sz(10)}px`, borderRadius: sz(8), background: T.accentLight, color: T.accent, fontSize: sz(12), cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}>
                  {t.images}<input type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={(e) => handleImageUpload(order, e, appendPriceToDraft)} />
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
                  <div key={p.key} style={{ display: 'flex', alignItems: 'flex-start', gap: sz(6), direction: 'ltr', flexWrap: 'wrap' }}>
                    <div style={{ background: T.accentLight, color: T.accent, borderRadius: sz(8), padding: `${sz(4)}px ${sz(8)}px`, fontSize: sz(9), fontWeight: 700, minWidth: sz(72), textAlign: 'center', flexShrink: 0, marginTop: sz(5) }}>{p.label}</div>
                    <textarea
                      ref={(el) => { priceInputRefs.current[`detail_${p.key}`] = el; resizePriceEditor(el); }}
                      value={priceToDisplay(item.price)}
                      onFocus={(e) => { resizePriceEditor(e.currentTarget); setActiveKey(p.key); priceCursorRef.current[p.key] = e.currentTarget.selectionStart ?? priceToDisplay(item.price).length; }}
                      onClick={(e) => { priceCursorRef.current[p.key] = e.currentTarget.selectionStart ?? priceToDisplay(item.price).length; }}
                      onSelect={(e) => { priceCursorRef.current[p.key] = e.currentTarget.selectionStart ?? priceToDisplay(item.price).length; }}
                      onChange={(e) => {
                        const cleaned = e.target.value.replace(/[^\d.+\s]/g, '');
                        priceCursorRef.current[p.key] = e.target.selectionStart ?? cleaned.length;
                        updatePrice(p.key, cleaned);
                        resizePriceEditor(e.currentTarget);
                      }}
                      placeholder="0.00"
                      inputMode="decimal"
                      rows={1}
                      style={{ flex: '1 1 170px', minWidth: sz(150), background: activeKey === p.key ? T.accentLight : T.bg, borderRadius: sz(10), padding: `${sz(7)}px ${sz(10)}px`, direction: 'ltr', border: `1.5px solid ${activeKey === p.key ? T.accent : 'transparent'}`, cursor: 'text', position: 'relative', zIndex: 102, transition: 'background 0.15s, border-color 0.15s', width: '100%', fontSize: sz(13), color: item.price ? T.text : T.textMuted, fontFamily: 'monospace', letterSpacing: '-0.3px', minHeight: `${sz(34)}px`, maxHeight: `${sz(92)}px`, lineHeight: 1.45, outline: 'none', boxSizing: 'border-box', resize: 'none', overflowY: 'auto', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}
                    />
                    {calc !== null && <div style={{ flex: '1 0 100%', fontSize: sz(11), fontWeight: 700, color: T.gold, minWidth: sz(70), textAlign: 'right', direction: 'ltr' }}>{formatMoney(calc, cartCurrency)}</div>}
                  </div>
                );
              })}
            </div>
            {totalCalc > 0 && <div style={{ marginTop: sz(12), paddingTop: sz(10), borderTop: `1px solid ${T.border}`, display: 'flex', justifyContent: 'space-between', direction: 'ltr' }}><div style={{ fontSize: sz(12), color: T.textMuted }}>{t.total2}</div><div style={{ fontSize: sz(15), fontWeight: 800, color: T.gold, direction: 'ltr' }}>{formatMoney(totalCalc, cartCurrency)}</div></div>}
            <button
              onClick={savePricingChanges}
              disabled={isPricingSaving || (!pricingDraftDirty && pricingSaveState !== 'error')}
              style={{ width: '100%', marginTop: sz(12), padding: sz(11), borderRadius: sz(11), border: 'none', background: pricingSaveButtonBg, color: pricingSaveButtonColor, fontSize: sz(12), fontWeight: 800, cursor: pricingDraftDirty && !isPricingSaving ? 'pointer' : 'default', fontFamily: 'Tajawal, sans-serif', transition: 'background 0.18s ease, color 0.18s ease, transform 0.12s ease', transform: isPricingSaving ? 'scale(0.99)' : 'scale(1)' }}
            >
              {pricingSaveButtonLabel}
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: sz(8) }}>
            <button onClick={() => setView('invoice')} style={{ padding: sz(11), borderRadius: sz(11), border: 'none', background: T.gold, color: '#fff', fontSize: sz(12), fontWeight: 700, cursor: 'pointer' }}>{t.invoice}</button>
            <button onClick={() => deleteOrder(order.id)} style={{ padding: sz(11), borderRadius: sz(11), border: `1.5px solid #e05c5c`, background: 'transparent', color: '#e05c5c', fontSize: sz(12), fontWeight: 700, cursor: 'pointer' }}>{t.delete}</button>
          </div>
        </div>
      </div>
      {activeKey && (() => {
        const KB_ROWS = [['7', '8', '9', '⌫'], ['4', '5', '6', '+'], ['1', '2', '3', '.'], ['0', '✓']];
        const btnStyle = (btn) => ({
          padding: `${sz(14)}px 0`,
          borderRadius: sz(10),
          border: 'none',
          fontSize: btn === '⌫' || btn === '✓' ? sz(18) : sz(20),
          fontWeight: btn === '✓' ? 800 : 600,
          cursor: 'pointer',
          background: btn === '✓' ? T.accent : btn === '⌫' ? T.border : T.card,
          color: btn === '✓' ? '#fff' : T.text,
          gridColumn: btn === '0' ? 'span 3' : 'span 1',
          fontFamily: 'monospace',
          boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
        });
        return (
          <>
            <div onClick={() => setActiveKey(null)} style={{ position: 'fixed', inset: 0, zIndex: 100 }} />
            <div onClick={(e) => e.stopPropagation()} style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 101, background: T.bg, borderTop: `1.5px solid ${T.border}`, borderRadius: `${sz(16)}px ${sz(16)}px 0 0`, padding: sz(12), boxShadow: '0 -4px 24px rgba(0,0,0,0.12)', direction: 'ltr' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: sz(8) }}>
                {KB_ROWS.flat().map((btn) => (
                  <button key={btn} style={btnStyle(btn)} onMouseDown={(e) => { e.preventDefault(); handleKeyInput(activeKey, btn); }}>
                    {btn}
                  </button>
                ))}
              </div>
            </div>
          </>
        );
      })()}
      </>
    );
  }

  if (view === 'invoice' && selectedOrder) {
    const order = selectedOrder;
    const items = order.pricing?.items || [];
    const total = calcTotal(items);
    const cartCurrency = inferCartCurrency(order);
    const hasPrice = items.some((item) => calcPrice(item.platform, item.price) !== null);
    const openWhatsApp = () => window.open(`https://wa.me/${normalizePhone(order.phone)}`, '_blank');
    return (
      <div style={{ minHeight: '100vh', background: T.bg, display: 'flex', flexDirection: 'column', fontFamily: 'Tajawal, sans-serif', direction: t.dir }}>
        {topbar(t.invoice, [topBtn('←', () => { setView('detail'); setInvoiceEditMode(false); setInvoiceHideCustomerDraft(invoiceHideCustomer); })], invoiceEditMode ? [] : [topBtn(t.invoiceCopy, () => captureInvoice('copy')), topBtn(t.whatsapp, openWhatsApp), topBtn(t.editInvoice, () => { setInvoiceHideCustomerDraft(invoiceHideCustomer); setInvoiceEditMode(true); })])}
        {toast && <button onClick={() => setToast('')} style={{ background: '#222', color: '#fff', border: 'none', padding: sz(8), fontSize: sz(11) }}>{toast}</button>}
        <div style={{ flex: 1, overflowY: 'auto', padding: sz(14) }}>
          <div ref={invoiceRef} style={{ background: '#fff', borderRadius: sz(20), overflow: 'hidden', boxShadow: `0 4px 24px ${T.shadow}`, direction: 'ltr' }}>

            {/* Header */}
            <div style={{ background: `linear-gradient(160deg, #fce4ec 0%, #f8bbd0 55%, #fce4ec 100%)`, padding: `${sz(28)}px ${sz(20)}px ${sz(18)}px`, textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: -sz(30), left: -sz(30), width: sz(130), height: sz(130), borderRadius: '50%', background: 'rgba(255,255,255,0.22)' }} />
              <div style={{ position: 'absolute', bottom: -sz(20), right: -sz(20), width: sz(100), height: sz(100), borderRadius: '50%', background: 'rgba(255,255,255,0.18)' }} />
              <div style={{ position: 'relative' }}>
                {(ownerStore?.photoURL || cachedPhoto)
                  ? <img src={ownerStore?.photoURL || cachedPhoto} alt="logo" style={{ width: sz(96), height: sz(96), borderRadius: '50%', objectFit: 'cover', border: `${sz(4)}px solid #fff`, boxShadow: '0 4px 16px rgba(0,0,0,0.13)', marginBottom: sz(10), display: 'inline-block' }} />
                  : <div style={{ width: sz(96), height: sz(96), borderRadius: '50%', background: T.accent, border: `${sz(4)}px solid #fff`, boxShadow: '0 4px 16px rgba(0,0,0,0.13)', margin: `0 auto ${sz(10)}px`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: sz(38) }}>{(ownerStore?.displayName || store || '?')[0].toUpperCase()}</div>
                }
                <div style={{ fontSize: sz(10), fontWeight: 800, letterSpacing: sz(3), color: T.accent, textTransform: 'uppercase', marginBottom: sz(3) }}>SHEIN</div>
                <div style={{ fontSize: sz(24), fontStyle: 'italic', fontFamily: 'Georgia, "Times New Roman", serif', color: T.accent, fontWeight: 700, lineHeight: 1.2, marginBottom: sz(5) }}>{ownerStore?.displayName || store}</div>
                <div style={{ fontSize: sz(9), color: T.accent, opacity: 0.75, direction: 'rtl', letterSpacing: 0 }}>{t.deliveryMorocco}</div>
              </div>
            </div>

            {/* INVOICE divider */}
            <div style={{ display: 'flex', alignItems: 'center', gap: sz(10), padding: `${sz(14)}px ${sz(20)}px ${sz(10)}px` }}>
              <div style={{ flex: 1, height: 1, background: T.border }} />
              <div style={{ fontSize: sz(9), letterSpacing: sz(4), fontWeight: 800, color: T.textMuted, textTransform: 'uppercase' }}>{t.invoiceTitle}</div>
              <div style={{ flex: 1, height: 1, background: T.border }} />
            </div>

            {/* Customer / Order card */}
            {!(invoiceEditMode ? invoiceHideCustomerDraft : invoiceHideCustomer) && (
              <div style={{ margin: `0 ${sz(14)}px ${sz(12)}px`, position: 'relative' }}>
                <div style={{ background: T.accentLight, borderRadius: sz(14), padding: `${sz(12)}px ${sz(14)}px` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: sz(5) }}>
                    <div style={{ fontSize: sz(8), letterSpacing: sz(2), fontWeight: 800, color: T.accent, textTransform: 'uppercase' }}>Customer</div>
                    <div style={{ fontSize: sz(8), letterSpacing: sz(2), fontWeight: 800, color: T.accent, textTransform: 'uppercase' }}>Order</div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontSize: sz(17), fontWeight: 800, color: T.text }}>{order.name}</div>
                      <div style={{ fontSize: sz(11), color: T.textMuted }}>{order.phone}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: sz(20), fontWeight: 900, color: T.text }}>#{order.orderNumber || order.id}</div>
                      <div style={{ fontSize: sz(10), color: T.textMuted }}>{formatTime(order.time, lang)}</div>
                    </div>
                  </div>
                </div>
                {invoiceEditMode && (
                  <button onClick={() => setInvoiceHideCustomerDraft(true)} style={{ position: 'absolute', top: -sz(8), right: -sz(8), width: sz(26), height: sz(26), borderRadius: '50%', background: '#e05c5c', border: `2px solid #fff`, color: '#fff', fontSize: sz(14), fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 6px rgba(0,0,0,0.18)', lineHeight: 1 }}>
                    ×
                  </button>
                )}
              </div>
            )}

            {/* Table */}
            <div style={{ margin: `0 ${sz(14)}px` }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', background: T.accent, borderRadius: `${sz(10)}px ${sz(10)}px 0 0`, padding: `${sz(10)}px ${sz(26)}px ${sz(10)}px ${sz(20)}px` }}>
                <div style={{ fontSize: sz(9), letterSpacing: 0, fontWeight: 800, color: '#fff', textAlign: 'left' }}>{t.platform}</div>
                <div style={{ fontSize: sz(9), letterSpacing: 0, fontWeight: 800, color: '#fff', textAlign: 'right', paddingRight: sz(14) }}>{t.priceLabel}</div>
              </div>
              {hasPrice ? PLATFORMS.map((p, idx) => {
                const item = items.find((it) => it.platform === p.key);
                const sell = calcPrice(p.key, item?.price);
                if (!sell) return null;
                return (
                  <div key={p.key} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', padding: `${sz(11)}px ${sz(26)}px ${sz(11)}px ${sz(20)}px`, background: idx % 2 === 0 ? '#fff' : T.accentLight, borderBottom: `1px solid ${T.border}` }}>
                    <div style={{ fontSize: sz(13), fontWeight: 700, color: T.text, textAlign: 'left' }}>{p.label}</div>
                    <div style={{ fontSize: sz(13), fontWeight: 800, color: T.gold, textAlign: 'right' }}>{formatMoney(sell, cartCurrency)}</div>
                  </div>
                );
              }) : <div style={{ padding: `${sz(18)}px`, textAlign: 'center', color: T.textMuted, fontSize: sz(12), background: '#fff' }}>{t.noPrice}</div>}
              {hasPrice && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: T.accentLight, borderRadius: `0 0 ${sz(10)}px ${sz(10)}px`, padding: `${sz(12)}px ${sz(26)}px ${sz(12)}px ${sz(20)}px` }}>
                  <div style={{ fontSize: sz(13), fontWeight: 700, color: T.accent }}>Total</div>
                  <div style={{ fontSize: sz(24), fontWeight: 900, color: T.accent }}>{formatMoney(total, cartCurrency)}</div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{ padding: `${sz(18)}px ${sz(16)}px`, textAlign: 'center' }}>
              <div style={{ fontSize: sz(15), fontStyle: 'italic', fontFamily: 'Georgia, "Times New Roman", serif', color: T.accent, marginBottom: sz(4) }}>Thank you for your trust 🌸</div>
              <div style={{ fontSize: sz(10), color: T.textMuted, direction: 'rtl', letterSpacing: 0 }}>{t.thankYou.replace(' 💖', '')} · {ownerStore?.displayName || store}</div>
            </div>

          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: sz(10), marginTop: sz(14) }}>
            <button onClick={() => { setInvoiceHideCustomer(invoiceHideCustomerDraft); setInvoiceEditMode(false); }} style={{ padding: sz(13), borderRadius: sz(12), border: 'none', background: T.accent, color: '#fff', fontSize: sz(13), fontWeight: 800, cursor: 'pointer', fontFamily: 'Tajawal, sans-serif' }}>
              {t.confirmChanges}
            </button>
            <button onClick={() => { setInvoiceHideCustomer(false); setInvoiceHideCustomerDraft(false); setInvoiceEditMode(false); }} style={{ padding: sz(13), borderRadius: sz(12), border: `1.5px solid ${T.border}`, background: 'transparent', color: T.textMuted, fontSize: sz(13), fontWeight: 700, cursor: 'pointer', fontFamily: 'Tajawal, sans-serif' }}>
              {t.resetInvoice}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
