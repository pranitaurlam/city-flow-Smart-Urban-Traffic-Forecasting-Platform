import { useSyncExternalStore } from "react";
import type { PlannerMode } from "@/lib/route-intelligence";
import type { SavedPlace, RouteSummary } from "@/lib/personal-routes";
import type { ReliabilityTarget, SafetyBufferMin } from "@/lib/arrival-planner";

// ---------------------------------------------------------------------------
// Saved Arrival Plans — recurring journeys with an arrival deadline instead
// of a fixed departure time (e.g. "Home → College, arrive by 9:00 AM").
// Persisted the same way the rest of CityFlow persists personal state: to
// localStorage, via useSyncExternalStore. There is no backend database or
// auth system in this project yet, so this mirrors personal-routes-store.ts
// rather than inventing a different persistence mechanism.
// ---------------------------------------------------------------------------

export type ArrivalPlan = {
  id: string;
  name: string;
  origin: SavedPlace;
  destination: SavedPlace;
  mode: PlannerMode;
  /** 0 = Monday … 6 = Sunday. */
  days: number[];
  /** "HH:MM", 24-hour required arrival time. */
  arrivalTime: string;
  reliabilityTarget: ReliabilityTarget;
  bufferMin: SafetyBufferMin;
  departureReminder: boolean;
  reminderMinutesBefore: number;
  notifyOnWorsening: boolean;
  active: boolean;
  primary: RouteSummary;
  alternative: RouteSummary | null;
  createdAt: string;
  /** Last computed snapshot, used only to detect meaningful changes between ticks. */
  lastKnownProbability?: number;
  lastRemindedKey?: string;
};

type State = { plans: ArrivalPlan[] };

const STORAGE_KEY = "cityflow.arrivalPlans.v1";
const empty: State = { plans: [] };
let state: State | null = null;
const listeners = new Set<() => void>();

function read(): ArrivalPlan[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(plans: ArrivalPlan[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(plans));
  } catch {
    // Storage unavailable (private mode, quota) — keep working in memory.
  }
}

function current(): State {
  if (state) return state;
  if (typeof window === "undefined") return empty;
  state = { plans: read() };
  return state;
}

function set(plans: ArrivalPlan[]) {
  state = { plans };
  write(plans);
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useArrivalPlansStore() {
  return useSyncExternalStore(subscribe, current, () => empty);
}

const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export const arrivalPlanActions = {
  newId,
  savePlan(plan: ArrivalPlan) {
    const plans = current().plans;
    const exists = plans.some((p) => p.id === plan.id);
    set(exists ? plans.map((p) => (p.id === plan.id ? plan : p)) : [...plans, plan]);
  },
  deletePlan(id: string) {
    set(current().plans.filter((p) => p.id !== id));
  },
  setActive(id: string, active: boolean) {
    set(current().plans.map((p) => (p.id === id ? { ...p, active } : p)));
  },
  /** Patches lightweight tracking fields without touching plan config (avoids re-triggering forms). */
  patchTracking(id: string, patch: Pick<ArrivalPlan, "lastKnownProbability" | "lastRemindedKey">) {
    const plans = current().plans;
    const next = plans.map((p) => (p.id === id ? { ...p, ...patch } : p));
    state = { plans: next };
    write(next);
    listeners.forEach((l) => l());
  },
};
