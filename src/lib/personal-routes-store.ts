import { useSyncExternalStore } from "react";
import type { AlertDraft, AlertPrefs, PersonalRoute, RouteAlert } from "@/lib/personal-routes";

type State = {
  routes: PersonalRoute[];
  alerts: RouteAlert[];
  prefs: AlertPrefs;
  /** Route whose analysis is open, if any. */
  analysis: { routeId: string; alternative: boolean; test: boolean } | null;
};

const KEYS = {
  routes: "cityflow.personalRoutes.v1",
  alerts: "cityflow.routeAlerts.v1",
  prefs: "cityflow.alertPrefs.v1",
};
const MAX_ALERTS = 60;
const DEFAULT_PREFS: AlertPrefs = { frequency: "smart", desktop: false };

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage unavailable (private mode, quota) — keep working in memory.
  }
}

const empty: State = { routes: [], alerts: [], prefs: DEFAULT_PREFS, analysis: null };
let state: State | null = null;
const listeners = new Set<() => void>();

function current(): State {
  if (state) return state;
  if (typeof window === "undefined") return empty;
  state = {
    routes: read<PersonalRoute[]>(KEYS.routes, []),
    alerts: read<RouteAlert[]>(KEYS.alerts, []),
    prefs: { ...DEFAULT_PREFS, ...read<Partial<AlertPrefs>>(KEYS.prefs, {}) },
    analysis: null,
  };
  return state;
}

function set(patch: Partial<State>) {
  const prev = current();
  state = { ...prev, ...patch };
  if (patch.routes) write(KEYS.routes, patch.routes);
  if (patch.alerts) write(KEYS.alerts, patch.alerts);
  if (patch.prefs) write(KEYS.prefs, patch.prefs);
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useRouteAlertStore() {
  return useSyncExternalStore(subscribe, current, () => empty);
}

const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export const routeAlertActions = {
  newId,
  saveRoute(route: PersonalRoute) {
    const routes = current().routes;
    const exists = routes.some((r) => r.id === route.id);
    set({
      routes: exists ? routes.map((r) => (r.id === route.id ? route : r)) : [...routes, route],
    });
  },
  deleteRoute(id: string) {
    const s = current();
    set({
      routes: s.routes.filter((r) => r.id !== id),
      alerts: s.alerts.filter((a) => a.routeId !== id),
      analysis: s.analysis?.routeId === id ? null : s.analysis,
    });
  },
  setRouteAlerts(id: string, on: boolean) {
    set({ routes: current().routes.map((r) => (r.id === id ? { ...r, alertsOn: on } : r)) });
  },
  /** Adds new alerts (skipping duplicate keys) and returns the ones actually added. */
  pushAlerts(drafts: AlertDraft[]): RouteAlert[] {
    if (!drafts.length) return [];
    const s = current();
    const known = new Set(s.alerts.map((a) => a.key));
    const fresh = drafts
      .filter((d) => !known.has(d.key))
      .map((d) => ({ ...d, id: newId(), createdAt: new Date().toISOString(), read: false }));
    if (fresh.length) set({ alerts: [...fresh, ...s.alerts].slice(0, MAX_ALERTS) });
    return fresh;
  },
  markRead(id: string) {
    set({ alerts: current().alerts.map((a) => (a.id === id ? { ...a, read: true } : a)) });
  },
  markAllRead() {
    set({ alerts: current().alerts.map((a) => ({ ...a, read: true })) });
  },
  clearAlerts() {
    set({ alerts: [] });
  },
  setPrefs(patch: Partial<AlertPrefs>) {
    set({ prefs: { ...current().prefs, ...patch } });
  },
  openAnalysis(routeId: string, alternative = false, test = false) {
    set({ analysis: { routeId, alternative, test } });
  },
  closeAnalysis() {
    set({ analysis: null });
  },
};
