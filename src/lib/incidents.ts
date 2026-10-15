import { distanceKm } from "@/lib/locations";

export type IncidentType = "accident" | "closure" | "construction" | "other";

export type Incident = {
  id: string;
  lat: number;
  lon: number;
  type: IncidentType;
  note?: string;
  /** Nearest known location name at report time, for display (e.g. "Marathahalli"). */
  roadHint: string;
  reportedAt: number;
  expiresAt: number;
};

export const INCIDENT_LABEL: Record<IncidentType, string> = {
  accident: "Accident",
  closure: "Road Closure",
  construction: "Construction",
  other: "Other Hazard",
};

const STORAGE_KEY = "cityflow-incidents";
// Reports expire on their own so stale ones don't linger after the incident clears.
const TTL_MS = 3 * 60 * 60 * 1000;
// Rough corridor-width tolerance for matching a report to a route's geometry.
const NEAR_ROUTE_KM = 0.35;

export function loadIncidents(): Incident[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Incident[];
    if (!Array.isArray(parsed)) return [];
    const now = Date.now();
    return parsed.filter((incident) => incident.expiresAt > now);
  } catch {
    return [];
  }
}

function saveIncidents(incidents: Incident[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(incidents));
  } catch {
    // localStorage unavailable (private mode, etc.) — silently skip persistence
  }
}

export function reportIncident(input: {
  lat: number;
  lon: number;
  type: IncidentType;
  note?: string;
  roadHint: string;
}): Incident[] {
  const now = Date.now();
  const trimmedNote = input.note?.trim();
  const incident: Incident = {
    id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
    lat: input.lat,
    lon: input.lon,
    type: input.type,
    roadHint: input.roadHint,
    reportedAt: now,
    expiresAt: now + TTL_MS,
    ...(trimmedNote ? { note: trimmedNote } : {}),
  };
  const updated = [...loadIncidents(), incident];
  saveIncidents(updated);
  return updated;
}

export function removeIncident(id: string): Incident[] {
  const updated = loadIncidents().filter((incident) => incident.id !== id);
  saveIncidents(updated);
  return updated;
}

/** Closest distance (km) from a point to any vertex of a route's geometry. */
function distanceToRouteKm(point: { lat: number; lon: number }, geometry: [number, number][]) {
  let min = Infinity;
  for (const [lat, lon] of geometry) {
    const d = distanceKm(point, { lat, lon });
    if (d < min) min = d;
  }
  return min;
}

/** Active incidents that fall within this route's corridor. */
export function incidentsOnRoute(incidents: Incident[], geometry: [number, number][]) {
  if (!geometry.length) return [];
  return incidents.filter((incident) => distanceToRouteKm(incident, geometry) <= NEAR_ROUTE_KM);
}
