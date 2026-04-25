import React from 'react';

/**
 * LanguageSwitcher — compact 3-button language selector.
 * Props:
 *   lang: 'ar' | 'fr' | 'en'
 *   setLang: (lang: string) => void
 *   ghost?: boolean  — white-on-transparent style for dark headers
 *   theme?: object   — theme object for non-ghost styles
 */
export default function LanguageSwitcher({ lang, setLang, ghost = true, theme }) {
  const T = theme;
  return (
    <div style={{ display: 'flex', gap: 3, background: ghost ? 'rgba(255,255,255,0.15)' : (T ? T.accentLight : '#f5f5f5'), borderRadius: 20, padding: 3 }}>
      {['ar', 'fr', 'en'].map(l => (
        <button
          key={l}
          onClick={() => setLang(l)}
          style={{
            padding: '3px 8px', borderRadius: 16, border: 'none',
            fontSize: 10, fontWeight: 700, cursor: 'pointer',
            background: lang === l
              ? (ghost ? '#fff' : (T ? T.card : '#fff'))
              : 'transparent',
            color: lang === l
              ? (ghost ? (T ? T.accent : '#c9637a') : (T ? T.accent : '#c9637a'))
              : (ghost ? 'rgba(255,255,255,0.7)' : (T ? T.textMuted : '#999')),
            fontFamily: 'Tajawal, sans-serif',
            transition: 'all 0.2s',
          }}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
