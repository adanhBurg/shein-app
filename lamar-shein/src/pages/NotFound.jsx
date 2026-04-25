import React from 'react';
import { Link } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext.jsx';

export default function NotFound() {
  const { theme: T } = useTheme();
  return (
    <div style={{ minHeight: '100vh', background: T.bg, fontFamily: 'Tajawal, sans-serif', direction: 'rtl', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 28, textAlign: 'center' }}>
      <div style={{ fontSize: 64, marginBottom: 20 }}>🔗</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: T.text, marginBottom: 8 }}>رابط الطلب غير متاح</div>
      <div style={{ fontSize: 13, color: T.textMuted, lineHeight: 1.7, marginBottom: 24, maxWidth: 280 }}>
        الرابط الذي استخدمتِه غير صحيح أو لم يتم إنشاؤه بعد. يرجى استخدام رابط من الشكل التالي:
      </div>
      <div style={{ background: T.accentLight, borderRadius: 12, padding: '12px 18px', marginBottom: 28, direction: 'ltr', fontFamily: 'monospace', fontSize: 13, color: T.accent, border: `1px dashed ${T.accent}` }}>
        /store-name/orders
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%', maxWidth: 280 }}>
        {[['📌', 'اطلبي الرابط الصحيح من البائعة'], ['💬', 'تواصلي عبر واتساب للمساعدة']].map(([icon, text]) => (
          <div key={text} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: T.card, borderRadius: 12, boxShadow: `0 2px 8px ${T.shadow}` }}>
            <span style={{ fontSize: 20 }}>{icon}</span>
            <span style={{ fontSize: 12, color: T.text }}>{text}</span>
          </div>
        ))}
        <Link to="/" style={{ marginTop: 8, padding: '12px', borderRadius: 12, background: T.accentLight, color: T.accent, fontSize: 13, fontWeight: 700, textDecoration: 'none', textAlign: 'center' }}>
          → العودة للمتجر
        </Link>
      </div>
    </div>
  );
}
