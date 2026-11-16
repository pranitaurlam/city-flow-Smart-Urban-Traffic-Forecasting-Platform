import type { ApiVenue, EventOnRoute } from "@/lib/cityflow-api";

/**
 * Helpers for event-driven traffic (concerts, matches, expos). The backend
 * finds events near a route and returns time windows with an estimated delay
 * (see backend/app/event_impact.py); these helpers apply those windows to a
 * specific trip and pick a detour point around a venue.
 */

/** Keeps a route light enough to send to the API while preserving its shape. */
export function downsample(geometry: [number, number][], maxPoints = 300): [number, number][] {
  if (geometry.length <= maxPoints) return geometry;
  const step = (geometry.length - 1) / (maxPoints - 1);
  return Array.from({ length: maxPoints }, (_, i) => geometry[Math.round(i * step)]!);
}

/**
 * Estimated extra minutes for a trip between `start` and `end`: for each
 * event, the worst delay among its windows that overlap the trip, summed.
 */
export function eventDelayForTrip(events: EventOnRoute[], start: Date, end: Date): number {
  const s = start.getTime();
  const e = end.getTime();
  return events.reduce((total, ev) => {
    const worst = ev.windows.reduce((max, w) => {
      const overlaps = new Date(w.start).getTime() < e && new Date(w.end).getTime() > s;
      return overlaps ? Math.max(max, w.delay_min) : max;
    }, 0);
    return total + worst;
  }, 0);
}

/** Events whose impact actually overlaps the given trip. */
export function eventsDuringTrip(events: EventOnRoute[], start: Date, end: Date) {
  return events.filter((ev) => eventDelayForTrip([ev], start, end) > 0);
}

/** The window phase overlapping the trip, for a human label. */
export function phaseDuringTrip(ev: EventOnRoute, start: Date, end: Date) {
  const s = start.getTime();
  const e = end.getTime();
  const hits = ev.windows.filter(
    (w) => new Date(w.start).getTime() < e && new Date(w.end).getTime() > s,
  );
  return hits.sort((a, b) => b.delay_min - a.delay_min)[0]?.phase ?? null;
}

export const PHASE_LABEL = {
  arrival: "crowd arriving",
  during: "event in progress",
  dispersal: "crowd leaving",
} as const;

const KM_PER_DEG_LAT = 110.57;
const kmPerDegLon = (lat: number) => 111.32 * Math.cos((lat * Math.PI) / 180);

/**
 * Two candidate points to route through so the trip skirts a venue, one on
 * each side, pushed just past its impact radius. Which side is better
 * depends on the road network, so callers route via both and compare.
 */
export function detourWaypoints(
  venue: ApiVenue,
  geometry: [number, number][],
): [[number, number], [number, number]] {
  const kx = kmPerDegLon(venue.lat);
  const toKm = ([lat, lon]: [number, number]) => [
    (lon - venue.lon) * kx,
    (lat - venue.lat) * KM_PER_DEG_LAT,
  ];

  let closest = 0;
  let best = Infinity;
  geometry.forEach((p, i) => {
    const [x, y] = toKm(p);
    const d = Math.hypot(x!, y!);
    if (d < best) {
      best = d;
      closest = i;
    }
  });

  let [dx, dy] = toKm(geometry[closest]!);
  if (Math.hypot(dx!, dy!) < 0.2) {
    // The route runs right past the venue: step sideways, perpendicular to the road.
    const a = toKm(geometry[Math.max(0, closest - 1)]!);
    const b = toKm(geometry[Math.min(geometry.length - 1, closest + 1)]!);
    [dx, dy] = [-(b[1]! - a[1]!), b[0]! - a[0]!];
  }
  const len = Math.hypot(dx!, dy!) || 1;
  const push = venue.impact_radius_km + 1;
  const at = (side: 1 | -1): [number, number] => [
    venue.lat + (side * (dy! / len) * push) / KM_PER_DEG_LAT,
    venue.lon + (side * (dx! / len) * push) / kx,
  ];
  return [at(1), at(-1)];
}

/** The point of `route` farthest from `reference`, used as a Google Maps waypoint so it follows the same alternative. */
export function distinctivePoint(
  route: [number, number][],
  reference: [number, number][],
): [number, number] | null {
  if (route.length < 3) return null;
  const ref = downsample(reference, 150);
  let best: [number, number] | null = null;
  let bestDist = 0;
  for (const p of downsample(route, 150)) {
    const kx = kmPerDegLon(p[0]);
    const d = Math.min(
      ...ref.map((q) => Math.hypot((p[1] - q[1]) * kx, (p[0] - q[0]) * KM_PER_DEG_LAT)),
    );
    if (d > bestDist) {
      bestDist = d;
      best = p;
    }
  }
  return bestDist > 0.3 ? best : null;
}

/** Local Date for minute-of-day `minute` on `isoDate` (yyyy-mm-dd); minutes may run past midnight. */
export function dateAtMinute(isoDate: string, minute: number) {
  const d = new Date(`${isoDate}T00:00:00`);
  d.setMinutes(minute);
  return d;
}
