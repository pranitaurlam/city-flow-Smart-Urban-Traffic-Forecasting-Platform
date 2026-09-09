import { useEffect, useState } from "react";

const THEME_KEY = "cityflow-theme";

function getInitialTheme(): boolean {
  const stored = localStorage.getItem(THEME_KEY);
  if (stored) return stored === "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function useTheme() {
  const [dark, setDark] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setDark(getInitialTheme());
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem(THEME_KEY, dark ? "dark" : "light");
  }, [dark, ready]);

  return { dark, toggleDark: () => setDark((value) => !value) };
}
