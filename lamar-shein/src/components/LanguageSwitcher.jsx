import React from 'react';

/**
 * LanguageSwitcher — compact 3-button language selector.
 * Props:
 *   lang: 'ar' | 'fr' | 'en'
 *   setLang: (lang: string) => void
 *   ghost?: boolean  — white-on-transparent style for dark headers
 *   theme?: object   — theme object for non-ghost styles
 *   scale?: number   — optional size multiplier
 */
export default function LanguageSwitcher({ lang, setLang, ghost = true, theme, scale = 1 }) {
  const T = theme;
  const sz = (value) => Math.round(value * scale * 10) / 10;
  return (
    <div style={{ display: 'flex', gap: sz(3), background: ghost ? 'rgba(255,255,255,0.15)' : (T ? T.accentLight : '#f5f5f5'), borderRadius: sz(20), padding: sz(3) }}>
      {['ar', 'fr', 'en'].map(l => (
        <button
          key={l}
          onClick={() => setLang(l)}
          style={{
            padding: `${sz(3)}px ${sz(8)}px`, borderRadius: sz(16), border: 'none',
            fontSize: sz(10), fontWeight: 700, cursor: 'pointer',
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
