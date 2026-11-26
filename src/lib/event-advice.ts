import type { ApiEvent } from "@/lib/cityflow-api";
import { bengaluruLocations, distanceKm, type BengaluruLocation } from "@/lib/locations";

/**
 * Turns a scheduled event into plain departure advice: when the crowd starts
 * arriving, how much earlier to leave, and which tracked areas are affected.
 *
 * The delay figures come from the backend's rule-based estimate
 * (backend/app/event_impact.py), so everything here is an estimate too. The
 * windows mirror ARRIVAL_BEFORE / DISPERSAL_AFTER in that module.
 */

/** Crowds start building this long before the event starts. */
export const ARRIVAL_LEAD_MIN = 90;
/** And keep leaving this long after it ends. */
export const DISPERSAL_TAIL_MIN = 60;

export type EventAdvice = {
  event: ApiEvent;
  /** When roads near the venue start to feel the crowd. */
  arrivalFrom: Date;
  /** When the venue empties out. */
  dispersalUntil: Date;
  /** Minutes to leave earlier to get past the venue before the crowd. */
  leaveEarlierMin: number;
  /** The latest departure that still beats the crowd. */
  beatTheCrowdBy: Date;
  /** Tracked areas inside the venue's impact radius, nearest first. */
  affectedAreas: BengaluruLocation[];
  /** Nearest tracked area, used as a journey destination. */
  nearestArea: BengaluruLocation | null;
  /** Whole days from today until the event (0 = today). */
  daysAway: number;
};

function startOfDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

/**
 * Areas within the venue's impact radius, nearest first. The radius is the
 * venue's own, so a 3 km Palace Grounds reaches further than a 1 km hall.
 */
export function areasNearVenue(event: ApiEvent): BengaluruLocation[] {
  const venue = { lat: event.venue.lat, lon: event.venue.lon };
  return bengaluruLocations
    .map((location) => ({ location, km: distanceKm(venue, location) }))
    .filter(({ km }) => km <= event.venue.impact_radius_km)
    .sort((a, b) => a.km - b.km)
    .map(({ location }) => location);
}

/** The tracked area closest to the venue, whether or not it is in the radius. */
export function nearestAreaToVenue(event: ApiEvent): BengaluruLocation | null {
  const venue = { lat: event.venue.lat, lon: event.venue.lon };
  return (
    [...bengaluruLocations].sort((a, b) => distanceKm(venue, a) - distanceKm(venue, b))[0] ?? null
  );
}

export function adviceForEvent(event: ApiEvent, now = new Date()): EventAdvice {
  const starts = new Date(event.starts_at);
  const ends = new Date(event.ends_at);
  const arrivalFrom = new Date(starts.getTime() - ARRIVAL_LEAD_MIN * 60_000);
  const dispersalUntil = new Date(ends.getTime() + DISPERSAL_TAIL_MIN * 60_000);
  // Leaving before the crowd builds is what avoids the delay, so the advice is
  // to be past the venue by then — with a short buffer on top of the estimate.
  const leaveEarlierMin = Math.max(10, Math.round(event.peak_delay_min * 1.5));

  return {
    event,
    arrivalFrom,
    dispersalUntil,
    leaveEarlierMin,
    beatTheCrowdBy: new Date(arrivalFrom.getTime() - 15 * 60_000),
    affectedAreas: areasNearVenue(event),
    nearestArea: nearestAreaToVenue(event),
    daysAway: Math.round((startOfDay(starts).getTime() - startOfDay(now).getTime()) / 86_400_000),
  };
}

/** Events whose arrival-to-dispersal span covers `at`. */
export function eventsAffecting(events: ApiEvent[], at: Date): ApiEvent[] {
  const t = at.getTime();
  return events.filter((event) => {
    const { arrivalFrom, dispersalUntil } = adviceForEvent(event);
    return arrivalFrom.getTime() <= t && t <= dispersalUntil.getTime();
  });
}

const TIME = { hour: "numeric", minute: "2-digit" } as const;

export function formatTime(date: Date) {
  return date.toLocaleTimeString([], TIME);
}

/** "today", "tomorrow", or a short date. */
export function formatWhen(advice: EventAdvice) {
  if (advice.daysAway === 0) return "today";
  if (advice.daysAway === 1) return "tomorrow";
  return new Date(advice.event.starts_at).toLocaleDateString([], {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

/** Journey-page search params that plan a trip ahead of this event's crowd. */
export function journeySearchFor(advice: EventAdvice): {
  to?: string | undefined;
  day: number;
  hour: number;
  event: string;
} {
  return {
    ...(advice.nearestArea ? { to: advice.nearestArea.slug } : {}),
    day: Math.max(0, Math.min(6, advice.daysAway)),
    hour: advice.beatTheCrowdBy.getHours(),
    event: advice.event.title,
  };
}
