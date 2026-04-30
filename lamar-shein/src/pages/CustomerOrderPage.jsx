import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext.jsx';
import { useLang } from '../i18n.js';
import LanguageSwitcher from '../components/LanguageSwitcher.jsx';
import logoImg from '../assets/logo.jpeg';
import { createOrder, getStore, isValidStoreSlug, resolveRouteStoreSlug } from '../services/firebase.js';
import { scanSheinCartLink } from '../services/sheinCart.js';

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

export default function CustomerOrderPage() {
  const { store: routeStore } = useParams();
  const store = useMemo(() => resolveRouteStoreSlug(routeStore), [routeStore]);
  const { theme: T } = useTheme();
  const { lang, setLang, t } = useLang();
  const isRTL = lang === 'ar';
  const profileKey = `lamar_profile_${store}`;

  const [storeStatus, setStoreStatus] = useState('checking');
  const [storeData, setStoreData] = useState(null);
  const [cachedPhoto, setCachedPhoto] = useState(() => localStorage.getItem(`lamar_store_photo_${store}`) || '');
  const [storeError, setStoreError] = useState('');
  const [editingProfile, setEditingProfile] = useState(false);
  const [profile, setProfile] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(profileKey)) || { name: '', phone: '' };
    } catch {
      return { name: '', phone: '' };
    }
  });
  const [order, setOrder] = useState({ link: '' });
  const [sending, setSending] = useState(false);
  const [submitStage, setSubmitStage] = useState('idle');
  const [sent, setSent] = useState(false);
  const [createdOrderNumber, setCreatedOrderNumber] = useState('');
  const [createdOrder, setCreatedOrder] = useState(null);
  const [errors, setErrors] = useState({});
  const [shake, setShake] = useState('');
  const confirmationRef = useRef(null);

  const storeValid = store && isValidStoreSlug(store);
  const showReveal = false;
  const profileComplete = !!(profile.name.trim() && profile.phone.trim()) && !editingProfile;

  const isValidPhone = (v) => /^\d{10}$/.test(v.trim());
  const isValidLink = (v) => { try { const url = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`); return url.hostname.includes('.'); } catch { return false; } };

  useEffect(() => {
    document.documentElement.lang = t.lang;
    document.documentElement.dir = t.dir;
  }, [t.lang, t.dir]);

  useEffect(() => {
    let mounted = true;
    if (!storeValid) {
      setStoreStatus('missing');
      return undefined;
    }

    setStoreStatus('checking');
    getStore(store)
      .then((foundStore) => {
        if (mounted) {
          setStoreData(foundStore);
          setStoreStatus(foundStore ? 'ready' : 'missing');
          if (foundStore?.photoURL) {
            localStorage.setItem(`lamar_store_photo_${store}`, foundStore.photoURL);
            setCachedPhoto(foundStore.photoURL);
          }
        }
      })
      .catch((error) => {
        if (!mounted) return;
        setStoreError(error?.message || String(error));
        setStoreStatus('missing');
      });

    return () => { mounted = false; };
  }, [store, storeValid]);

  const shakeIt = (key) => {
    setShake(key);
    setTimeout(() => setShake(''), 400);
  };

  const saveProfile = (nextProfile) => {
    setProfile(nextProfile);
    localStorage.setItem(profileKey, JSON.stringify(nextProfile));
  };

  const handleSubmit = async () => {
    const nextErrors = {};
    if (!profile.name.trim()) nextErrors.name = true;
    if (!isValidPhone(profile.phone)) nextErrors.phone = true;
    if (!isValidLink(order.link.trim())) nextErrors.orderLink = true;
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      shakeIt('order');
      return;
    }

    setErrors({});
    saveProfile(profile);
    setSending(true);
    setSubmitStage('scanning');

    try {
      const submittedLink = String(order.link || '').match(/^https?:\/\//i)
        ? order.link.trim()
        : `https://${order.link.trim()}`;
      let sheinCart = null;
      try {
        sheinCart = await scanSheinCartLink(submittedLink);
      } catch (scanError) {
        sheinCart = {
          status: 'error',
          finalUrl: '',
          scannedAt: new Date().toISOString(),
          error: scanError?.message || String(scanError),
          items: [],
        };
      }

      setSubmitStage('saving');
      const created = await createOrder(store, {
        name: profile.name.trim(),
        phone: profile.phone,
        link: submittedLink,
        submittedByName: profile.name,
        sheinCart,
      });

      setSending(false);
      setSubmitStage('idle');
      setCreatedOrderNumber(created.orderNumber || '');
      setCreatedOrder(created);
      setEditingProfile(false);
      setSent(true);
    } catch (error) {
      setSending(false);
      setSubmitStage('idle');
      alert(`تعذر إرسال الطلب لمتجر "${store}". ${error?.code || ''} ${error?.message || error}`);
    }
  };

  const buildConfirmationText = () => [
    `رقم الطلب: ${createdOrder?.orderNumber || createdOrderNumber}`,
    `المتجر: ${store}`,
    `اسم الزبونة: ${createdOrder?.name || profile.name}`,
    `الهاتف: ${createdOrder?.phone || profile.phone}`,
    `رابط المنتج: ${createdOrder?.link || order.link}`,
    `أرسلت بواسطة: ${createdOrder?.submittedByName || profile.name}`,
  ].filter(Boolean).join('\n');

  const shareConfirmationOnWhatsApp = () => {
    window.open(`https://wa.me/?text=${encodeURIComponent(`Order number: ${createdOrder?.orderNumber || createdOrderNumber}`)}`, '_blank');
  };

  const downloadConfirmationImage = async () => {
    if (!confirmationRef.current) return;
    try {
      const html2canvas = await loadScript('https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js', 'html2canvas');
      const canvas = await html2canvas(confirmationRef.current, { scale: 2, backgroundColor: '#ffffff' });
      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      a.download = `order-${createdOrder?.orderNumber || createdOrderNumber || 'confirmation'}.png`;
      a.click();
    } catch (error) {
      alert(error?.message || String(error));
    }
  };

  const startNewOrder = () => {
    setSent(false);
    setCreatedOrderNumber('');
    setCreatedOrder(null);
    setOrder({ link: '' });
    setEditingProfile(false);
  };

  const inputStyle = (hasError) => ({
    width: '100%',
    padding: '14px 16px',
    borderRadius: 12,
    border: `1.5px solid ${hasError ? '#e05c5c' : T.border}`,
    background: T.card,
    color: T.text,
    fontSize: 15,
    fontFamily: 'Tajawal, sans-serif',
    direction: t.dir,
    textAlign: isRTL ? 'right' : 'left',
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'border-color 0.2s',
  });
  const labelStyle = {
    fontSize: 13,
    fontWeight: 600,
    color: T.textMuted,
    marginBottom: 6,
    display: 'block',
    textAlign: isRTL ? 'right' : 'left',
  };

  if (!storeValid || storeStatus === 'missing') {
    return (
      <div style={{ minHeight: '100vh', background: T.bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 28, textAlign: 'center', fontFamily: 'Tajawal, sans-serif', direction: t.dir }}>
        <img src={logoImg} alt="Lamar" style={{ width: 72, height: 72, borderRadius: '50%', objectFit: 'cover', border: `3px solid ${T.accent}`, marginBottom: 16 }} />
        <div style={{ fontSize: 20, fontWeight: 800, color: T.text, marginBottom: 8 }}>{t.unavailableTitle}</div>
        <div style={{ fontSize: 13, color: T.textMuted, lineHeight: 1.7, marginBottom: 20 }}>{t.unavailableBody}</div>
        <div style={{ background: T.accentLight, borderRadius: 12, padding: '12px 18px', direction: 'ltr', fontFamily: 'monospace', fontSize: 13, color: T.accent, border: `1px dashed ${T.accent}` }}>
          /store-name/orders
        </div>
        {storeError && <div style={{ marginTop: 12, fontSize: 11, color: '#e05c5c' }}>{storeError}</div>}
      </div>
    );
  }

  if (storeStatus === 'checking') {
    return (
      <div style={{ minHeight: '100vh', background: T.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.text, fontFamily: 'Tajawal, sans-serif', direction: t.dir }}>
        {t.sending}
      </div>
    );
  }

  const Header = ({ children }) => (
    <div style={{ background: `linear-gradient(160deg, ${T.accent} 0%, ${T.accentDark} 100%)`, padding: '24px 20px 28px', borderRadius: '0 0 28px 28px', position: 'relative', overflow: 'hidden', flexShrink: 0 }}>
      <div style={{ position: 'absolute', top: -20, left: -20, width: 100, height: 100, borderRadius: '50%', background: 'rgba(255,255,255,0.08)' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'relative', marginBottom: 14 }}>
        <LanguageSwitcher lang={lang} setLang={setLang} />
        <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 10 }}>{store}</span>
      </div>
      <div style={{ position: 'relative', textAlign: 'center' }}>{children}</div>
    </div>
  );

  const Steps = ({ active }) => (
    <div style={{ textAlign: 'center', paddingBottom: 16, flexShrink: 0 }}>
      <span style={{ display: 'inline-flex', gap: 6 }}>
        {[0, 1, 2].map((i) => (
          <span key={i} style={{ width: 20, height: 4, borderRadius: 2, background: i === active ? T.accent : T.border, display: 'inline-block', transition: 'background 0.3s' }} />
        ))}
      </span>
    </div>
  );

  if (sent && createdOrder) {
    const confirmationRows = [
      ['رقم الطلب', createdOrder.orderNumber || createdOrderNumber],
      ['اسم الزبونة', createdOrder.name],
      ['الهاتف', createdOrder.phone],
      ['أرسلت بواسطة', createdOrder.submittedByName],
      ['رابط المنتج', createdOrder.link],
    ];

    return (
      <div style={{ minHeight: '100vh', background: T.bg, display: 'flex', flexDirection: 'column', direction: t.dir }}>
        <Header>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            {(storeData?.photoURL || cachedPhoto)
              ? <img src={storeData?.photoURL || cachedPhoto} alt="logo" style={{ width: 80, height: 80, borderRadius: '50%', objectFit: 'cover', border: '3px solid rgba(255,255,255,0.4)', boxShadow: '0 4px 16px rgba(0,0,0,0.18)' }} />
              : <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'rgba(255,255,255,0.25)', border: '3px solid rgba(255,255,255,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 34 }}>{(storeData?.displayName || store || '?')[0].toUpperCase()}</div>
            }
            <div style={{ textAlign: 'center' }}>
              <div style={{ color: '#fff', fontSize: 18, fontWeight: 800, letterSpacing: 0.5 }}>{(storeData?.displayName || store).toUpperCase()}</div>
              <div style={{ color: 'rgba(255,255,255,0.78)', fontSize: 12, marginTop: 2 }}>تم استلام طلبك ✓</div>
            </div>
          </div>
        </Header>

        <div style={{ flex: 1, padding: '20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div ref={confirmationRef} style={{ background: T.card, borderRadius: 16, padding: '28px 16px', boxShadow: `0 3px 18px ${T.shadow}`, border: `1px solid ${T.border}` }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ color: T.textMuted, fontSize: 11, marginBottom: 6 }}>رقم الطلب</div>
              <div style={{ color: T.accent, fontSize: 25, fontWeight: 900, letterSpacing: 0, direction: 'ltr' }}>
                {createdOrder.orderNumber || createdOrderNumber}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {confirmationRows.map(([label, value]) => (
                <div key={label} style={{ background: T.bg, borderRadius: 11, padding: '10px 12px' }}>
                  <div style={{ color: T.textMuted, fontSize: 10, marginBottom: 4, textAlign: isRTL ? 'right' : 'left' }}>{label}</div>
                  <div style={{ color: T.text, fontSize: label === 'رابط المنتج' ? 11 : 13, fontWeight: 700, direction: label === 'رابط المنتج' || label === 'الهاتف' ? 'ltr' : t.dir, textAlign: label === 'رابط المنتج' || label === 'الهاتف' ? 'left' : (isRTL ? 'right' : 'left'), overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: label === 'رابط المنتج' ? 'nowrap' : 'normal' }}>
                    {value}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <button onClick={shareConfirmationOnWhatsApp} style={{ padding: '13px 10px', borderRadius: 13, border: 'none', background: '#25d366', color: '#fff', fontSize: 13, fontWeight: 800, fontFamily: 'Tajawal, sans-serif', cursor: 'pointer' }}>
              واتساب
            </button>
            <button onClick={downloadConfirmationImage} style={{ padding: '13px 10px', borderRadius: 13, border: `1.5px solid ${T.border}`, background: T.card, color: T.text, fontSize: 13, fontWeight: 800, fontFamily: 'Tajawal, sans-serif', cursor: 'pointer' }}>
              حفظ صورة
            </button>
          </div>

          <button onClick={startNewOrder} style={{ padding: '13px', borderRadius: 13, border: 'none', background: `linear-gradient(135deg, ${T.accent}, ${T.accentDark})`, color: '#fff', fontSize: 14, fontWeight: 800, fontFamily: 'Tajawal, sans-serif', cursor: 'pointer' }}>
            طلب جديد
          </button>
        </div>
        <Steps active={2} />
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: T.bg, display: 'flex', flexDirection: 'column', direction: t.dir }}>
      <Header>
        {!showReveal && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            {(storeData?.photoURL || cachedPhoto)
              ? <img src={storeData?.photoURL || cachedPhoto} alt="logo" style={{ width: 80, height: 80, borderRadius: '50%', objectFit: 'cover', border: '3px solid rgba(255,255,255,0.4)', boxShadow: '0 4px 16px rgba(0,0,0,0.18)' }} />
              : <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'rgba(255,255,255,0.25)', border: '3px solid rgba(255,255,255,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 34 }}>{(storeData?.displayName || store || '?')[0].toUpperCase()}</div>
            }
            <div style={{ textAlign: 'center' }}>
              <div style={{ color: '#fff', fontSize: 18, fontWeight: 800, letterSpacing: 0.5 }}>{(storeData?.displayName || store).toUpperCase()}</div>
              <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, marginTop: 2 }}>{t.orderSubtitle}</div>
            </div>
          </div>
        )}
        {showReveal && (
          <div style={{ marginBottom: 12 }}>
            <img src="/assets/images/order/shein-by-fadwa.png" alt="SHEIN By Fadwa" onError={(e) => { e.currentTarget.src = logoImg; }} style={{ width: 98, height: 98, borderRadius: '50%', objectFit: 'cover', border: '3px solid rgba(255,255,255,0.4)', marginBottom: 8 }} />
            <div><Link to={`/${store}/admin`} style={{ color: '#fff', fontSize: 12, fontWeight: 800, textDecoration: 'underline' }}>{t.dashboard}</Link></div>
          </div>
        )}
      </Header>
      <div style={{ flex: 1, padding: '20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className={shake === 'order' ? 'shake' : ''}>
          {profileComplete ? (
            <div style={{ background: T.card, borderRadius: 14, padding: '12px 14px', border: `1.5px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: T.accentLight, border: `2px solid ${T.accent}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.accent, fontWeight: 800, fontSize: 18, flexShrink: 0 }}>
                {profile.name.trim()[0].toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: T.text, textAlign: isRTL ? 'right' : 'left' }}>{profile.name}</div>
                <div style={{ fontSize: 12, color: T.textMuted, direction: 'ltr', textAlign: isRTL ? 'right' : 'left' }}>{profile.phone}</div>
              </div>
              <button onClick={() => setEditingProfile(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.accent, fontSize: 12, fontWeight: 700, fontFamily: 'Tajawal, sans-serif', flexShrink: 0, padding: '4px 8px' }}>
                {t.notYou}
              </button>
            </div>
          ) : (
            <>
              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>{t.nameLabel}</label>
                <input style={inputStyle(errors.name)} value={profile.name} onChange={(e) => setProfile((p) => ({ ...p, name: e.target.value }))} placeholder={t.namePlaceholder} type="text" autoComplete="name" />
                {errors.name && <div style={{ color: '#e05c5c', fontSize: 11, textAlign: isRTL ? 'right' : 'left', marginTop: 4 }}>{t.required}</div>}
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>{t.phoneLabel}</label>
                <input style={{ ...inputStyle(errors.phone), direction: 'ltr', textAlign: 'left' }} value={profile.phone} onChange={(e) => setProfile((p) => ({ ...p, phone: e.target.value.replace(/\D/g, '').slice(0, 10) }))} placeholder={t.phonePlaceholder} type="tel" inputMode="numeric" autoComplete="tel" />
                {errors.phone && <div style={{ color: '#e05c5c', fontSize: 11, textAlign: isRTL ? 'right' : 'left', marginTop: 4 }}>{t.phoneError}</div>}
              </div>
            </>
          )}
          <div>
            <label style={labelStyle}>{t.linkLabel}</label>
            <div style={{ position: 'relative' }}>
              <input style={{ ...inputStyle(errors.orderLink), direction: 'ltr', textAlign: 'left', paddingRight: 44 }} value={order.link} onChange={(e) => setOrder((o) => ({ ...o, link: e.target.value }))} placeholder={t.linkPlaceholder} type="url" autoComplete="off" />
              <button
                type="button"
                onClick={async () => { try { const text = await navigator.clipboard.readText(); setOrder((o) => ({ ...o, link: text.trim() })); } catch {} }}
                style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: T.textMuted, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
              </button>
            </div>
            {errors.orderLink && <div style={{ color: '#e05c5c', fontSize: 11, textAlign: isRTL ? 'right' : 'left', marginTop: 4 }}>{t.linkError}</div>}
          </div>
        </div>
        <div style={{ background: T.accentLight, borderRadius: 10, padding: '10px 14px', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <span style={{ width: 22, height: 22, borderRadius: '50%', background: T.card, color: T.accent, fontSize: 13, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>!</span>
          <p style={{ margin: 0, fontSize: 11, color: T.textMuted, textAlign: isRTL ? 'right' : 'left', lineHeight: 1.5 }}>{t.hint}</p>
        </div>
        {submitStage !== 'idle' && (
          <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: '12px 14px', boxShadow: `0 2px 10px ${T.shadow}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ color: T.textMuted, fontSize: 11, fontWeight: 700 }}>{submitStage === 'scanning' ? t.scanningCart : t.savingOrder}</span>
              <span style={{ color: T.accent, fontSize: 11, fontWeight: 800 }}>{submitStage === 'scanning' ? '1/2' : '2/2'}</span>
            </div>
            <div style={{ height: 6, background: T.bg, borderRadius: 999, overflow: 'hidden' }}>
              <div style={{ width: submitStage === 'scanning' ? '55%' : '88%', height: '100%', background: `linear-gradient(135deg, ${T.accent}, ${T.accentDark})`, borderRadius: 999, transition: 'width 0.25s ease' }} />
            </div>
          </div>
        )}
        <button onClick={handleSubmit} disabled={sending || sent} style={{ width: '100%', padding: '15px', borderRadius: 14, border: 'none', background: sent ? '#4caf50' : `linear-gradient(135deg, ${T.accent}, ${T.accentDark})`, color: '#fff', fontSize: 15, fontWeight: 700, cursor: sending || sent ? 'default' : 'pointer', boxShadow: `0 4px 16px ${sent ? '#4caf5055' : T.accent + '55'}`, transition: 'background 0.4s' }}>
          {submitStage === 'scanning' ? t.scanningCart : submitStage === 'saving' ? t.savingOrder : sent ? t.sentBtn : t.submitBtn}
        </button>
      </div>
      <Steps active={1} />
    </div>
  );
}
