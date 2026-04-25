import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext.jsx';
import logoImg from '../assets/logo.jpeg';
import {
  buildStoreLinks,
  createStore,
  listenAuth,
  sanitizeStoreSlug,
  signInWithGoogle,
  signOutGoogle,
} from '../services/firebase.js';

const FeatureIcon = ({ type, color }) => {
  const common = {
    fill: 'none',
    stroke: color,
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  };

  const paths = {
    link: (
      <>
        <path {...common} d="M10 13a5 5 0 0 0 7.07 0l2.12-2.12a5 5 0 0 0-7.07-7.07L11 4.93" />
        <path {...common} d="M14 11a5 5 0 0 0-7.07 0L4.81 13.12a5 5 0 0 0 7.07 7.07L13 19.07" />
      </>
    ),
    dashboard: (
      <>
        <rect {...common} x="3" y="3" width="7" height="7" rx="1.5" />
        <rect {...common} x="14" y="3" width="7" height="7" rx="1.5" />
        <rect {...common} x="3" y="14" width="7" height="7" rx="1.5" />
        <rect {...common} x="14" y="14" width="7" height="7" rx="1.5" />
      </>
    ),
    invoice: (
      <>
        <path {...common} d="M7 3h8l4 4v14l-3-2-3 2-3-2-3 2-3-2V6a3 3 0 0 1 3-3Z" />
        <path {...common} d="M15 3v5h5" />
        <path {...common} d="M8 11h8" />
        <path {...common} d="M8 15h6" />
      </>
    ),
    globe: (
      <>
        <circle {...common} cx="12" cy="12" r="9" />
        <path {...common} d="M3 12h18" />
        <path {...common} d="M12 3a13 13 0 0 1 0 18" />
        <path {...common} d="M12 3a13 13 0 0 0 0 18" />
      </>
    ),
  };

  return (
    <span style={{ width: 30, height: 30, borderRadius: 10, background: 'rgba(255,255,255,0.75)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
        {paths[type]}
      </svg>
    </span>
  );
};

export default function OwnerSetup() {
  const { theme: T } = useTheme();
  const [state, setState] = useState('gate');
  const [user, setUser] = useState(null);
  const [storeName, setStoreName] = useState('');
  const [storeSlug, setStoreSlug] = useState('');
  const [slugManual, setSlugManual] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [links, setLinks] = useState(null);
  const [copied, setCopied] = useState('');
  const didPrefillStoreName = useRef(false);

  useEffect(() => listenAuth((nextUser) => {
    setUser(nextUser);
    setState(nextUser ? 'form' : 'gate');
    if (!nextUser) {
      didPrefillStoreName.current = false;
      return;
    }

    if (!didPrefillStoreName.current) {
      didPrefillStoreName.current = true;
      setStoreName(nextUser.displayName ? `${nextUser.displayName} SHEIN` : '');
    }
  }), []);

  const effectiveSlug = slugManual ? storeSlug : (storeName ? sanitizeStoreSlug(storeName) : '');
  const previewSlug = effectiveSlug || 'store-name';

  const handleLogin = async () => {
    setError('');
    try {
      await signInWithGoogle();
    } catch (err) {
      setError(err?.message || String(err));
    }
  };

  const handleSignOut = async () => {
    await signOutGoogle();
    setLinks(null);
    setStoreName('');
    setStoreSlug('');
    setSlugManual(false);
  };

  const handleCreate = async () => {
    if (!storeName.trim()) {
      setError('اسم المتجر مطلوب.');
      return;
    }

    setError('');
    setCreating(true);
    try {
      const created = await createStore({
        slug: slugManual ? storeSlug : storeName,
        displayName: storeName,
      });
      setLinks({ ...buildStoreLinks(created.slug || created.id), slug: created.slug || created.id });
      setState('created');
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setCreating(false);
    }
  };

  const copy = (val, key) => {
    navigator.clipboard?.writeText(val).catch(() => {});
    setCopied(key);
    setTimeout(() => setCopied(''), 2000);
  };

  const s = {
    card: { background: T.card, borderRadius: 16, padding: '18px', boxShadow: `0 2px 16px ${T.shadow}`, marginBottom: 12 },
    input: { width: '100%', padding: '13px 14px', borderRadius: 12, border: `1.5px solid ${T.border}`, background: T.bg, color: T.text, fontSize: 14, fontFamily: 'Tajawal, sans-serif', outline: 'none', boxSizing: 'border-box', direction: 'rtl', textAlign: 'right' },
    label: { fontSize: 12, fontWeight: 700, color: T.textMuted, marginBottom: 6, display: 'block', textAlign: 'right' },
    primaryBtn: { width: '100%', padding: '14px', borderRadius: 13, border: 'none', background: `linear-gradient(135deg, ${T.accent}, ${T.accentDark})`, color: '#fff', fontSize: 14, fontWeight: 700, fontFamily: 'Tajawal, sans-serif', cursor: 'pointer', boxShadow: `0 4px 16px ${T.accent}44` },
  };

  const googleBtn = (onClick, label) => (
    <button onClick={onClick} style={{ width: '100%', padding: '13px', borderRadius: 12, border: `1.5px solid ${T.border}`, background: T.card, color: T.text, fontSize: 13, fontWeight: 700, fontFamily: 'Tajawal, sans-serif', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
      <svg width="18" height="18" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
      {label}
    </button>
  );

  if (state === 'gate') {
    return (
      <div style={{ minHeight: '100vh', background: T.bg, fontFamily: 'Tajawal, sans-serif', direction: 'rtl', display: 'flex', flexDirection: 'column' }}>
        <div style={{ background: `linear-gradient(160deg, ${T.accent}, ${T.accentDark})`, padding: '48px 24px 56px', textAlign: 'center', borderRadius: '0 0 32px 32px', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: -40, left: -40, width: 160, height: 160, borderRadius: '50%', background: 'rgba(255,255,255,0.07)' }} />
          <img src={logoImg} alt="logo" style={{ width: 88, height: 88, borderRadius: '50%', objectFit: 'cover', border: '3px solid rgba(255,255,255,0.35)', marginBottom: 14, position: 'relative' }} />
          <div style={{ color: '#fff', fontSize: 22, fontWeight: 800, position: 'relative' }}>إنشاء متجرك</div>
          <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13, marginTop: 6, position: 'relative' }}>أنشئي روابط طلبات Lamar الخاصة بك</div>
        </div>
        <div style={{ flex: 1, padding: '28px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={s.card}>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.text, textAlign: 'center', marginBottom: 14 }}>مرحبا بك في Lamar</div>
            {googleBtn(handleLogin, 'متابعة مع Google')}
            {error && <div style={{ color: '#e05c5c', fontSize: 12, textAlign: 'center', marginTop: 10 }}>{error}</div>}
          </div>
          {[
            { icon: 'link', text: 'رابط مخصص للطلبات' },
            { icon: 'dashboard', text: 'لوحة تحكم مباشرة' },
            { icon: 'invoice', text: 'فواتير احترافية' },
            { icon: 'globe', text: 'دعم العربية والفرنسية والإنجليزية' },
          ].map((item) => (
            <div key={item.text} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: T.accentLight, borderRadius: 12 }}>
              <FeatureIcon type={item.icon} color={T.accent} />
              <span style={{ fontSize: 13, color: T.text, fontWeight: 600 }}>{item.text}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (state === 'form') {
    return (
      <div style={{ minHeight: '100vh', background: T.bg, fontFamily: 'Tajawal, sans-serif', direction: 'rtl', display: 'flex', flexDirection: 'column' }}>
        <div style={{ background: `linear-gradient(135deg, ${T.accent}, ${T.accentDark})`, padding: '16px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button onClick={handleSignOut} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 8, padding: '5px 10px', color: '#fff', fontSize: 11, cursor: 'pointer' }}>خروج</button>
            <div style={{ color: '#fff', fontWeight: 800, fontSize: 15 }}>إنشاء المتجر</div>
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 14, fontWeight: 700 }}>{user?.displayName?.[0] || user?.email?.[0] || 'L'}</div>
          </div>
          <div style={{ marginTop: 10, background: 'rgba(255,255,255,0.15)', borderRadius: 10, padding: '8px 12px' }}>
            <div style={{ color: '#fff', fontSize: 12, fontWeight: 700 }}>{user?.displayName || 'مالكة المتجر'}</div>
            <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 10 }}>{user?.email}</div>
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '18px' }}>
          <div style={s.card}>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 16 }}>معلومات المتجر</div>
            <div style={{ marginBottom: 14 }}>
              <label style={s.label}>اسم المتجر *</label>
              <input style={s.input} value={storeName} onChange={(e) => { setStoreName(e.target.value); if (!slugManual) setStoreSlug(''); }} placeholder="Fadwa SHEIN" autoComplete="organization" />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={s.label}>رابط المتجر</label>
              <input style={{ ...s.input, direction: 'ltr', textAlign: 'left' }} value={slugManual ? storeSlug : sanitizeStoreSlug(storeName) || ''} onChange={(e) => { setSlugManual(true); setStoreSlug(e.target.value); }} placeholder="fadwa-shein" />
            </div>
            <div style={{ background: T.accentLight, borderRadius: 10, padding: '10px 12px' }}>
              <div style={{ fontSize: 10, color: T.textMuted, marginBottom: 3, textAlign: 'right' }}>معاينة رابط الطلبات</div>
              <div style={{ fontSize: 11, color: T.accent, direction: 'ltr', fontFamily: 'monospace', textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {buildStoreLinks(previewSlug).order}
              </div>
            </div>
            {error && <div style={{ color: '#e05c5c', fontSize: 12, textAlign: 'right', marginTop: 8 }}>{error}</div>}
          </div>
          <button onClick={handleCreate} disabled={creating} style={{ ...s.primaryBtn, opacity: creating ? 0.7 : 1 }}>
            {creating ? 'جاري الإنشاء...' : 'إنشاء المتجر'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: T.bg, fontFamily: 'Tajawal, sans-serif', direction: 'rtl', display: 'flex', flexDirection: 'column' }}>
      <div style={{ background: `linear-gradient(135deg, ${T.accent}, ${T.accentDark})`, padding: '16px 20px', textAlign: 'center' }}>
        <div style={{ color: '#fff', fontWeight: 800, fontSize: 16 }}>تم إنشاء المتجر</div>
        <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 12, marginTop: 3 }}>/{links?.slug}</div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ textAlign: 'center', padding: '20px 0 12px' }}>
          <img src={logoImg} alt="" style={{ width: 72, height: 72, borderRadius: '50%', objectFit: 'cover', border: `3px solid ${T.accent}` }} />
          <div style={{ marginTop: 12, fontSize: 16, fontWeight: 800, color: T.text }}>{storeName}</div>
          <div style={{ fontSize: 12, color: T.textMuted, marginTop: 4 }}>متجرك جاهز لاستقبال الطلبات.</div>
        </div>
        {[{ label: 'رابط الطلبات للزبونات', val: links?.order, key: 'order' }, { label: 'رابط لوحة التحكم', val: links?.admin, key: 'admin' }].map(({ label, val, key }) => (
          <div key={key} style={{ background: T.card, borderRadius: 14, padding: '14px 16px', boxShadow: `0 2px 10px ${T.shadow}` }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: T.textMuted, marginBottom: 6 }}>{label}</div>
            <div style={{ fontSize: 11, color: T.accent, direction: 'ltr', fontFamily: 'monospace', marginBottom: 10, wordBreak: 'break-all' }}>{val}</div>
            <button onClick={() => copy(val, key)} style={{ width: '100%', padding: '10px', borderRadius: 10, border: 'none', background: copied === key ? '#4caf50' : T.accentLight, color: copied === key ? '#fff' : T.accent, fontSize: 13, fontWeight: 700, cursor: 'pointer', transition: 'background 0.3s' }}>
              {copied === key ? 'تم النسخ' : 'نسخ الرابط'}
            </button>
          </div>
        ))}
        <Link to={links?.admin ? new URL(links.admin).pathname + new URL(links.admin).search : '/'} style={{ textAlign: 'center', padding: '13px', borderRadius: 13, border: `1.5px solid ${T.border}`, background: 'transparent', color: T.text, fontSize: 13, fontWeight: 700, cursor: 'pointer', textDecoration: 'none' }}>
          فتح لوحة التحكم
        </Link>
      </div>
    </div>
  );
}
