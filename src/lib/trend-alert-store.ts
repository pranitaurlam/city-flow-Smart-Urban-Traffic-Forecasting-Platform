import { useSyncExternalStore } from "react";
import { TREND_THRESHOLDS } from "@/lib/trend-alert-engine";

// ---------------------------------------------------------------------------
// Per-key cooldown/dedupe state for the native alert() trend detector.
//
// Deliberately NOT a single global boolean — every (location/route + alert
// kind) combination gets its own independent entry, keyed by the detector's
// `key` string, so Marathahalli spiking doesn't suppress or get suppressed
// by MG Road improving.
// ---------------------------------------------------------------------------

type KeyState = { lastFiredAt: number };

type State = { enabled: boolean; fired: Record<string, KeyState> };

const STORAGE_KEY = "cityflow.trendAlerts.v1";
const empty: State = { enabled: true, fired: {} };
let state: State | null = null;
const listeners = new Set<() => void>();

function read(): State {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...empty };
    const parsed = JSON.parse(raw) as Partial<State>;
    return { enabled: parsed.enabled ?? true, fired: parsed.fired ?? {} };
  } catch {
    return { ...empty };
  }
}

function write(next: State) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage unavailable (private mode, quota) — keep working in memory for this session.
  }
}

function current(): State {
  if (state) return state;
  if (typeof window === "undefined") return empty;
  state = read();
  return state;
}

function set(next: State) {
  state = next;
  write(next);
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useTrendAlertStore() {
  return useSyncExternalStore(subscribe, current, () => empty);
}

export const trendAlertActions = {
  setEnabled(enabled: boolean) {
    set({ ...current(), enabled });
  },
  /**
   * True if `key` is allowed to fire right now (not enabled -> false; within
   * cooldown of its own last firing -> false). Does not mutate state.
   */
  canFire(key: string, now: number) {
    const s = current();
    if (!s.enabled) return false;
    const last = s.fired[key];
    if (!last) return true;
    return now - last.lastFiredAt >= TREND_THRESHOLDS.cooldownMs;
  },
  markFired(key: string, now: number) {
    const s = current();
    set({ ...s, fired: { ...s.fired, [key]: { lastFiredAt: now } } });
  },
  /** Clears a key's cooldown once the underlying condition subsides, so the next genuinely new spike can alert promptly. */
  clearKey(key: string) {
    const s = current();
    if (!(key in s.fired)) return;
    const fired = { ...s.fired };
    delete fired[key];
    set({ ...s, fired });
  },
};
