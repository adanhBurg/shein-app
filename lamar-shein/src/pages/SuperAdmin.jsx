import React, { useEffect, useMemo, useState } from 'react';
import { useTheme } from '../context/ThemeContext.jsx';
import {
  SUPER_ADMIN_EMAIL,
  isSuperAdminUser,
  listenAuth,
  signInWithGoogle,
  signOutGoogle,
  subscribeToAllOrders,
  subscribeToStores,
} from '../services/firebase.js';

function formatTime(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString();
}

const orderStatusLabel = (status) => (status === 'done' ? 'تم' : 'انتظار');

export default function SuperAdmin() {
  const { theme: T } = useTheme();
  const [user, setUser] = useState(null);
  const [denied, setDenied] = useState(false);
  const [error, setError] = useState('');
  const [stores, setStores] = useState([]);
  const [allOrders, setAllOrders] = useState([]);
  const [storeSearch, setStoreSearch] = useState('');
  const [orderSearch, setOrderSearch] = useState('');
  const [selectedStore, setSelectedStore] = useState(null);
  const [activeTab, setActiveTab] = useState('orders');

  useEffect(() => listenAuth((nextUser) => {
    setUser(nextUser);
    setDenied(Boolean(nextUser && !isSuperAdminUser(nextUser)));
  }), []);

  useEffect(() => {
    if (!isSuperAdminUser(user)) return undefined;
    const unsubs = [
      subscribeToStores(setStores, (err) => setError(err?.message || String(err))),
      subscribeToAllOrders(setAllOrders, (err) => setError(err?.message || String(err))),
    ];
    return () => unsubs.forEach((unsubscribe) => unsubscribe?.());
  }, [user]);

  const orderCounts = useMemo(() => allOrders.reduce((map, order) => {
    map[order.storeId] = (map[order.storeId] || 0) + 1;
    return map;
  }, {}), [allOrders]);

  const filteredStores = stores.filter((store) => {
    const q = storeSearch.toLowerCase();
    return !q || [store.id, store.slug, store.displayName, store.ownerEmail || ''].join(' ').toLowerCase().includes(q);
  });

  const filteredOrders = (selectedStore
    ? allOrders.filter((order) => order.storeId === selectedStore)
    : allOrders
  ).filter((order) => {
    const q = orderSearch.trim().toLowerCase();
    if (!q) return true;
    return [
      order.orderNumber,
      order.storeId,
      order.name,
      order.phone,
      order.submittedByName,
      order.link,
      order.status,
    ].join(' ').toLowerCase().includes(q);
  });

  const totalPending = allOrders.filter((order) => order.status === 'pending').length;
  const totalDone = allOrders.filter((order) => order.status === 'done').length;
  const storeById = Object.fromEntries(stores.map((store) => [store.id, store]));

  const badge = (status) => ({
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: 20,
    fontSize: 10,
    fontWeight: 700,
    background: status === 'done' ? '#e8f5e9' : '#fff3e0',
    color: status === 'done' ? '#388e3c' : '#e65100',
  });
  const card = { background: T.card, borderRadius: 14, padding: '12px', boxShadow: `0 2px 8px ${T.shadow}` };

  const handleLogin = async () => {
    setError('');
    try {
      const result = await signInWithGoogle();
      setDenied(!isSuperAdminUser(result.user));
    } catch (err) {
      setError(err?.message || String(err));
    }
  };

  if (!isSuperAdminUser(user)) {
    return (
      <div style={{ minHeight: '100vh', background: '#fff1f5', fontFamily: 'Tajawal, sans-serif', direction: 'rtl', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ width: 64, height: 64, borderRadius: 18, background: '#b64968', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 17 }}>
          <svg width="25" height="25" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 3.4c2.15 1.46 4.24 1.35 6.1.55.5 2.4.42 4.6-.18 6.58-.85 2.8-2.77 5.04-5.92 6.65-3.15-1.61-5.07-3.85-5.92-6.65-.6-1.98-.68-4.18-.18-6.58 1.86.8 3.95.91 6.1-.55Z" fill="none" stroke="#2f1720" strokeWidth="1.2" strokeLinejoin="round" />
          </svg>
        </div>
        <div style={{ fontSize: 18, fontWeight: 800, color: '#111827', marginBottom: 7, lineHeight: 1.2 }}>Super Admin</div>
        <div style={{ fontSize: 12, color: '#b98393', marginBottom: 28 }}>صلاحيات المشرف العام</div>
        {denied && <div style={{ color: '#e05c5c', fontSize: 12, marginBottom: 12, background: '#ffe4eb', padding: '8px 14px', borderRadius: 8 }}>غير مصرح لك بالوصول</div>}
        {error && <div style={{ color: '#e05c5c', fontSize: 12, marginBottom: 12, background: '#ffe4eb', padding: '8px 14px', borderRadius: 8 }}>{error}</div>}
        <div style={{ background: '#fff', borderRadius: 14, padding: '14px', boxShadow: '0 8px 24px rgba(180, 73, 104, 0.10)', width: '100%', maxWidth: 300 }}>
          <button onClick={handleLogin} style={{ width: '100%', padding: '13px 14px', borderRadius: 12, border: '1.5px solid #f1aebe', background: '#fff', color: '#111827', fontSize: 13, fontWeight: 800, fontFamily: 'Tajawal, sans-serif', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
            <span>تسجيل الدخول كـ saidhnad7</span>
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
          </button>
          <p style={{ textAlign: 'center', fontSize: 10, color: '#c293a1', marginTop: 11, marginBottom: 0 }}>للمشرف العام فقط</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: T.bg, fontFamily: 'Tajawal, sans-serif', direction: 'rtl', display: 'flex', flexDirection: 'column' }}>
      <div style={{ background: `linear-gradient(135deg, ${T.accent}, ${T.accentDark})`, padding: '14px 18px', flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button onClick={() => signOutGoogle()} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 8, padding: '4px 9px', color: '#fff', fontSize: 11, cursor: 'pointer' }}>خروج</button>
          <div style={{ textAlign: 'center' }}>
            <div style={{ color: '#fff', fontWeight: 800, fontSize: 15 }}>Super Admin</div>
            <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 10 }}>{user.email}</div>
          </div>
          <div style={{ fontSize: 14, color: '#fff', fontWeight: 800 }}>SA</div>
        </div>
      </div>

      {error && <button onClick={() => setError('')} style={{ background: '#ffeaea', color: '#e05c5c', border: 'none', padding: 8, fontSize: 11 }}>{error}</button>}

      <div style={{ padding: '12px 14px 0', flexShrink: 0 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          {[
            { label: 'المتاجر', value: stores.length, color: T.accent },
            { label: 'الطلبات', value: allOrders.length, color: T.gold },
            { label: 'انتظار', value: totalPending, color: '#e65100' },
            { label: 'تم', value: totalDone, color: '#388e3c' },
          ].map((stat) => (
            <div key={stat.label} style={{ background: T.card, borderRadius: 12, padding: '10px 6px', textAlign: 'center', boxShadow: `0 1px 6px ${T.shadow}` }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: stat.color, lineHeight: 1.2 }}>{stat.value}</div>
              <div style={{ fontSize: 9, color: T.textMuted }}>{stat.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', margin: '10px 14px 0', background: T.accentLight, borderRadius: 10, padding: 3, flexShrink: 0 }}>
        {[['stores', 'المتاجر'], ['orders', 'الطلبات']].map(([key, label]) => (
          <button key={key} onClick={() => setActiveTab(key)} style={{ flex: 1, padding: '8px', borderRadius: 8, border: 'none', background: activeTab === key ? T.card : 'transparent', color: activeTab === key ? T.accent : T.textMuted, fontSize: 12, fontWeight: 700, cursor: 'pointer', boxShadow: activeTab === key ? `0 1px 4px ${T.shadow}` : 'none', transition: 'all 0.2s' }}>{label}</button>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 14px 20px' }}>
        {activeTab === 'stores' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input value={storeSearch} onChange={(e) => setStoreSearch(e.target.value)} placeholder="بحث في المتاجر..." style={{ width: '100%', padding: '10px 14px', borderRadius: 12, border: `1.5px solid ${T.border}`, background: T.card, color: T.text, fontSize: 13, fontFamily: 'Tajawal, sans-serif', outline: 'none', boxSizing: 'border-box', direction: 'rtl', textAlign: 'right' }} />
            <div onClick={() => { setSelectedStore(null); setActiveTab('orders'); }} style={{ ...card, cursor: 'pointer', borderRight: !selectedStore ? `3px solid ${T.accent}` : '3px solid transparent' }}>
              <div style={{ fontWeight: 700, color: T.text, fontSize: 13 }}>كل المتاجر</div>
              <div style={{ fontSize: 10, color: T.textMuted }}>{allOrders.length} طلب</div>
            </div>
            {filteredStores.map((store) => (
              <div key={store.id} onClick={() => { setSelectedStore(store.id); setActiveTab('orders'); }} style={{ ...card, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, borderRight: selectedStore === store.id ? `3px solid ${T.accent}` : '3px solid transparent' }}>
                <div style={{ flex: 1, textAlign: 'right' }}>
                  <div style={{ fontWeight: 700, color: T.text, fontSize: 13 }}>{store.displayName || store.id}</div>
                  <div style={{ fontSize: 10, color: T.textMuted, direction: 'ltr', textAlign: 'right' }}>/{store.slug || store.id}</div>
                  <div style={{ fontSize: 10, color: T.textMuted }}>{store.ownerEmail || 'لا يوجد بريد'}</div>
                </div>
                <div style={{ background: T.accentLight, borderRadius: 8, padding: '4px 8px', textAlign: 'center' }}>
                  <div style={{ fontSize: 16, fontWeight: 800, color: T.accent }}>{orderCounts[store.id] || 0}</div>
                  <div style={{ fontSize: 9, color: T.textMuted }}>طلب</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'orders' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input value={orderSearch} onChange={(e) => setOrderSearch(e.target.value)} placeholder="بحث برقم الطلب، المتجر، الاسم أو الهاتف..." style={{ width: '100%', padding: '10px 14px', borderRadius: 12, border: `1.5px solid ${T.border}`, background: T.card, color: T.text, fontSize: 13, fontFamily: 'Tajawal, sans-serif', outline: 'none', boxSizing: 'border-box', direction: 'rtl', textAlign: 'right' }} />
            {selectedStore && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: T.accentLight, borderRadius: 10 }}>
                <button onClick={() => setSelectedStore(null)} style={{ background: 'none', border: 'none', color: T.accent, cursor: 'pointer', fontSize: 16 }}>×</button>
                <span style={{ fontSize: 12, color: T.accent, fontWeight: 700 }}>متجر: {selectedStore}</span>
              </div>
            )}
            {filteredOrders.map((order) => {
              const storeInfo = storeById[order.storeId];
              return (
                <div key={`${order.storeId}-${order.id}`} style={{ ...card, borderRight: `3px solid ${order.status === 'done' ? '#4caf50' : T.accent}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={badge(order.status)}>{orderStatusLabel(order.status)}</span>
                      <span style={{ fontSize: 10, color: T.textMuted }}>{formatTime(order.time)}</span>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      {order.orderNumber && <div style={{ display: 'inline-flex', color: T.accent, background: T.accentLight, fontSize: 10, fontWeight: 900, borderRadius: 8, padding: '3px 7px', direction: 'ltr', marginBottom: 4 }}>{order.orderNumber}</div>}
                      <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{order.name}</div>
                      <div style={{ fontSize: 10, color: T.textMuted, direction: 'ltr' }}>{order.phone}</div>
                      <div style={{ fontSize: 10, color: T.textMuted }}>{order.submittedByName}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: 9, color: T.accent, background: T.accentLight, padding: '2px 6px', borderRadius: 6 }}>{storeInfo?.displayName || order.storeId}</div>
                    <a href={order.link} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, color: T.textMuted, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', direction: 'ltr', textDecoration: 'none' }}>
                      {order.link}
                    </a>
                  </div>
                </div>
              );
            })}
            {!filteredOrders.length && <div style={{ ...card, color: T.textMuted, textAlign: 'center', fontSize: 12 }}>لا توجد طلبات.</div>}
          </div>
        )}
      </div>
    </div>
  );
}
