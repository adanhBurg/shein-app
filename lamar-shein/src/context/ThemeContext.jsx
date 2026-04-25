import React, { createContext, useContext, useState } from 'react';
import { THEMES, DEFAULT_THEME } from '../themes.js';

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [themeName, setThemeName] = useState(
    () => localStorage.getItem('lamar_theme') || DEFAULT_THEME
  );

  const theme = THEMES[themeName] || THEMES[DEFAULT_THEME];

  const setTheme = (name) => {
    setThemeName(name);
    localStorage.setItem('lamar_theme', name);
  };

  return (
    <ThemeContext.Provider value={{ theme, themeName, setTheme, themes: THEMES }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
