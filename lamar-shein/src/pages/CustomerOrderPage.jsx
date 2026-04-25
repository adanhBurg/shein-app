import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext.jsx';
import { useLang } from '../i18n.js';
import LanguageSwitcher from '../components/LanguageSwitcher.jsx';
import logoImg from '../assets/logo.jpeg';
import { createOrder, getStore, isValidStoreSlug, resolveRouteStoreSlug } from '../services/firebase.js';

export default function CustomerOrderPage() {
  const { store: routeStore } = useParams();
  const store = useMemo(() => resolveRouteStoreSlug(routeStore), [routeStore]);
  const { theme: T } = useTheme();
  const { lang, setLang, t } = useLang();
  const isRTL = lang === 'ar';
  const profileKey = `lamar_profile_${store}`;

  const [storeStatus, setStoreStatus] = useState('checking');
  const [storeError, setStoreError] = useState('');
  const [step, setStep] = useState(() => {
    try {
      const p = JSON.parse(localStorage.getItem(profileKey));
      return p?.name && p?.phone ? 1 : 0;
    } catch {
      return 0;
    }
  });
  const [profile, setProfile] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(profileKey)) || { name: '', phone: '' };
    } catch {
      return { name: '', phone: '' };
    }
  });
  const [order, setOrder] = useState({ name: '', link: '' });
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [errors, setErrors] = useState({});
  const [shake, setShake] = useState('');

  const storeValid = store && isValidStoreSlug(store);
  const showReveal = order.name.trim().toLowerCase() === 'fadwa.hn';

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
        if (mounted) setStoreStatus(foundStore ? 'ready' : 'missing');
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

  const handleProfileContinue = () => {
    const nextErrors = {};
    if (!profile.name.trim()) nextErrors.profileName = true;
    if (!profile.phone.trim()) nextErrors.profilePhone = true;
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      shakeIt('profile');
      return;
    }

    setErrors({});
    saveProfile(profile);
    setStep(1);
  };

  const handleSubmit = async () => {
    const nextErrors = {};
    if (!order.name.trim()) nextErrors.orderName = true;
    if (!order.link.trim()) nextErrors.orderLink = true;
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      shakeIt('order');
      return;
    }

    setErrors({});
    setSending(true);

    try {
      await createOrder(store, {
        name: order.name.trim(),
        phone: profile.phone,
        link: order.link,
        submittedByName: profile.name,
      });

      setSending(false);
      setSent(true);
      setTimeout(() => {
        setSent(false);
        setOrder({ name: '', link: '' });
        localStorage.removeItem(profileKey);
        setProfile({ name: '', phone: '' });
        setStep(0);
      }, 2200);
    } catch (error) {
      setSending(false);
      alert(`تعذر إرسال الطلب لمتجر "${store}". ${error?.code || ''} ${error?.message || error}`);
    }
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
        {[0, 1].map((i) => (
          <span key={i} style={{ width: 20, height: 4, borderRadius: 2, background: i === active ? T.accent : T.border, display: 'inline-block', transition: 'background 0.3s' }} />
        ))}
      </span>
    </div>
  );

  if (step === 0) {
    return (
      <div style={{ minHeight: '100vh', background: T.bg, display: 'flex', flexDirection: 'column', direction: t.dir }}>
        <Header>
          <img src={logoImg} alt="logo" style={{ width: 80, height: 80, borderRadius: '50%', objectFit: 'cover', border: '3px solid rgba(255,255,255,0.3)', marginBottom: 10 }} />
          <div style={{ color: '#fff', fontSize: 20, fontWeight: 800, marginBottom: 4 }}>{t.welcome}</div>
          <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12 }}>{t.profileSubtitle}</div>
          <div style={{ marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 5, background: 'rgba(255,255,255,0.15)', borderRadius: 20, padding: '4px 12px' }}>
            <span style={{ color: '#fff', fontSize: 10 }}>{t.delivery}</span>
          </div>
        </Header>
        <div style={{ flex: 1, padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className={shake === 'profile' ? 'shake' : ''}>
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>{t.nameLabel}</label>
              <input style={inputStyle(errors.profileName)} value={profile.name} onChange={(e) => setProfile((p) => ({ ...p, name: e.target.value }))} placeholder={t.namePlaceholder} type="text" autoComplete="name" />
              {errors.profileName && <div style={{ color: '#e05c5c', fontSize: 11, textAlign: isRTL ? 'right' : 'left', marginTop: 4 }}>{t.required}</div>}
            </div>
            <div>
              <label style={labelStyle}>{t.phoneLabel}</label>
              <input style={{ ...inputStyle(errors.profilePhone), direction: 'ltr', textAlign: 'left' }} value={profile.phone} onChange={(e) => setProfile((p) => ({ ...p, phone: e.target.value }))} placeholder={t.phonePlaceholder} type="tel" autoComplete="tel" />
              {errors.profilePhone && <div style={{ color: '#e05c5c', fontSize: 11, textAlign: isRTL ? 'right' : 'left', marginTop: 4 }}>{t.required}</div>}
            </div>
          </div>
          <button onClick={handleProfileContinue} style={{ marginTop: 8, width: '100%', padding: '15px', borderRadius: 14, border: 'none', background: `linear-gradient(135deg, ${T.accent}, ${T.accentDark})`, color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer', boxShadow: `0 4px 16px ${T.accent}55` }}>
            {t.continueBtn}
          </button>
        </div>
        <Steps active={0} />
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: T.bg, display: 'flex', flexDirection: 'column', direction: t.dir }}>
      <Header>
        {!showReveal && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'center', marginBottom: 12 }}>
            <img src={logoImg} alt="logo" style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', border: '2px solid rgba(255,255,255,0.4)' }} />
            <div>
              <div style={{ color: '#fff', fontSize: 16, fontWeight: 800 }}>{t.orderTitle}</div>
              <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11 }}>{t.orderSubtitle}</div>
            </div>
          </div>
        )}
        {showReveal && (
          <div style={{ marginBottom: 12 }}>
            <img src="/assets/images/order/shein-by-fadwa.png" alt="SHEIN By Fadwa" onError={(e) => { e.currentTarget.src = logoImg; }} style={{ width: 98, height: 98, borderRadius: '50%', objectFit: 'cover', border: '3px solid rgba(255,255,255,0.4)', marginBottom: 8 }} />
            <div><Link to={`/${store}/admin`} style={{ color: '#fff', fontSize: 12, fontWeight: 800, textDecoration: 'underline' }}>{t.dashboard}</Link></div>
          </div>
        )}
        <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 12, padding: '8px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button onClick={() => { setStep(0); localStorage.removeItem(profileKey); setErrors({}); }} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.7)', fontSize: 11, cursor: 'pointer' }}>{t.notYou}</button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ textAlign: isRTL ? 'right' : 'left' }}>
              <div style={{ color: '#fff', fontSize: 12, fontWeight: 700 }}>{profile.name}</div>
              <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 10 }}>{profile.phone}</div>
            </div>
            <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'rgba(255,255,255,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 13 }}>
              {profile.name?.[0]?.toUpperCase() || '?'}
            </div>
          </div>
        </div>
      </Header>
      <div style={{ flex: 1, padding: '20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className={shake === 'order' ? 'shake' : ''}>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>{t.customerLabel}</label>
            <input style={inputStyle(errors.orderName)} value={order.name} onChange={(e) => setOrder((o) => ({ ...o, name: e.target.value }))} placeholder={t.customerPlaceholder} type="text" />
            {errors.orderName && <div style={{ color: '#e05c5c', fontSize: 11, textAlign: isRTL ? 'right' : 'left', marginTop: 4 }}>{t.required}</div>}
          </div>
          <div>
            <label style={labelStyle}>{t.linkLabel}</label>
            <input style={{ ...inputStyle(errors.orderLink), direction: 'ltr', textAlign: 'left' }} value={order.link} onChange={(e) => setOrder((o) => ({ ...o, link: e.target.value }))} placeholder={t.linkPlaceholder} type="url" autoComplete="off" />
            {errors.orderLink && <div style={{ color: '#e05c5c', fontSize: 11, textAlign: isRTL ? 'right' : 'left', marginTop: 4 }}>{t.required}</div>}
          </div>
        </div>
        <div style={{ background: T.accentLight, borderRadius: 10, padding: '10px 14px', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <span style={{ width: 22, height: 22, borderRadius: '50%', background: T.card, color: T.accent, fontSize: 13, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>!</span>
          <p style={{ margin: 0, fontSize: 11, color: T.textMuted, textAlign: isRTL ? 'right' : 'left', lineHeight: 1.5 }}>{t.hint}</p>
        </div>
        <button onClick={handleSubmit} disabled={sending || sent} style={{ width: '100%', padding: '15px', borderRadius: 14, border: 'none', background: sent ? '#4caf50' : `linear-gradient(135deg, ${T.accent}, ${T.accentDark})`, color: '#fff', fontSize: 15, fontWeight: 700, cursor: sending || sent ? 'default' : 'pointer', boxShadow: `0 4px 16px ${sent ? '#4caf5055' : T.accent + '55'}`, transition: 'background 0.4s' }}>
          {sending ? t.sending : sent ? t.sentBtn : t.submitBtn}
        </button>
      </div>
      <Steps active={1} />
    </div>
  );
}
