"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "abbsey-theme";

const ThemeContext = createContext({ theme: "light", toggleTheme: () => {} });

/**
 * Light / night mode.
 *
 * The theme lives in a `dark` class on <html> — the whole palette resolves
 * through CSS variables (see app/globals.css), so one class flips everything.
 *
 * The first visit follows the operating system preference; once the user picks
 * a theme it is remembered. The class is applied by a tiny inline script in the
 * root layout BEFORE the first paint, so a dark-theme reload never flashes
 * white.
 */
export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState("light");
  // The server cannot know the theme, so the first client paint stays on the
  // markup's default until the stored/system value is applied.
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    let stored = null;
    try {
      stored = window.localStorage.getItem(STORAGE_KEY);
    } catch {
      /* storage unavailable */
    }
    const prefersDark =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches;
    const next = stored === "dark" || stored === "light" ? stored : prefersDark ? "dark" : "light";
    setTheme(next);
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const root = document.documentElement;
    if (theme === "dark") root.classList.add("dark");
    else root.classList.remove("dark");
    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      /* storage unavailable */
    }
  }, [theme, mounted]);

  // Follow the OS while the user has not made an explicit choice.
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return undefined;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e) => {
      let stored = null;
      try {
        stored = window.localStorage.getItem(STORAGE_KEY);
      } catch {
        /* storage unavailable */
      }
      if (stored === "dark" || stored === "light") return;
      setTheme(e.matches ? "dark" : "light");
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((current) => (current === "dark" ? "light" : "dark"));
  }, []);

  const value = useMemo(() => ({ theme, mounted, toggleTheme }), [theme, mounted, toggleTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
