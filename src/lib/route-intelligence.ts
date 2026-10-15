import {
  bengaluruLocations,
  distanceKm,
  type BengaluruLocation,
  type TrafficTier,
} from "@/lib/locations";
import { DAY_SHAPE } from "@/lib/hourly";
import { estimateTravelTime, minutesToClockLabel, trafficMultiplier } from "@/lib/route-forecast";
import type { RouteResult, TravelMode } from "@/lib/route-server";
import type { WeatherReading } from "@/lib/weather-server";

// ---------------------------------------------------------------------------
// Travel modes
// ---------------------------------------------------------------------------

export type PlannerMode = "driving" | "two-wheeler" | "walking" | "transit";

export const PLANNER_MODES: {
  key: PlannerMode;
  label: string;
  /** Google Maps URLs `travelmode` value. */
  googleMode: string;
  /** Routing profile used to measure the route. */
  routing: TravelMode;
  /** Multiplier on the routed baseline duration. */
  speedFactor: number;
  /** Fixed minutes added (e.g. waiting for transit). */
  overheadMin: number;
  /** How strongly road congestion affects this mode (0 = not at all). */
  trafficSensitivity: number;
}[] = [
  {
    key: "driving",
    label: "Driving",
    googleMode: "driving",
    routing: "car",
    speedFactor: 1,
    overheadMin: 0,
    trafficSensitivity: 1,
  },
  // Google Maps supports a dedicated two-wheeler mode in India; bicycling would route a bicycle.
  {
    key: "two-wheeler",
    label: "Two-wheeler",
    googleMode: "two-wheeler",
    routing: "car",
    speedFactor: 0.82,
    overheadMin: 0,
    trafficSensitivity: 0.7,
  },
  {
    key: "walking",
    label: "Walking",
    googleMode: "walking",
    routing: "foot",
    speedFactor: 1,
    overheadMin: 0,
    trafficSensitivity: 0,
  },
  {
    key: "transit",
    label: "Transit",
    googleMode: "transit",
    routing: "car",
    speedFactor: 1.3,
    overheadMin: 8,
    trafficSensitivity: 1.1,
  },
];

/**
 * Free-flow minutes for a route. Routing engines assume open-road speeds (~50 km/h) that
 * Bengaluru streets rarely reach even when empty, so cap vehicle speeds at an urban 30 km/h.
 */
export function urbanFreeFlowMin(distanceKm: number, durationMin: number, routing: TravelMode) {
  if (routing === "foot") return durationMin;
  return Math.max(durationMin, (distanceKm / 30) * 60);
}

/** "12 min" when both ends round the same, otherwise "12–15 min". */
export function rangeLabel(low: number, high: number) {
  return low === high ? `${low} min` : `${low}–${high} min`;
}

export function plannerMode(key: PlannerMode) {
  return PLANNER_MODES.find((m) => m.key === key) ?? PLANNER_MODES[0]!;
}

export function googleMapsDirectionsUrl(origin: string, destination: string, mode: PlannerMode) {
  const params = new URLSearchParams({
    api: "1",
    origin: origin.trim(),
    destination: destination.trim(),
    travelmode: plannerMode(mode).googleMode,
  });
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

export function openInGoogleMaps(origin: string, destination: string, mode: PlannerMode) {
  window.open(googleMapsDirectionsUrl(origin, destination, mode), "_blank", "noopener,noreferrer");
}

// ---------------------------------------------------------------------------
// Departure options
// ---------------------------------------------------------------------------

export type Departure = { offset: number; hour: number; label: string };

export function departureOptions(now: Date = new Date()): Departure[] {
  const h = now.getHours();
  const options: Departure[] = [1, 2, 3].map((add) => {
    const total = h + add;
    return {
      offset: total >= 24 ? 1 : 0,
      hour: total % 24,
      label: `In ${add} hr${add > 1 ? "s" : ""} · ${minutesToClockLabel((total % 24) * 60)}`,
    };
  });
  if (h < 17) options.push({ offset: 0, hour: 18, label: "This evening · 6:00 PM" });
  options.push({ offset: 1, hour: 9, label: "Tomorrow · 9:00 AM" });
  options.push({ offset: 1, hour: 18, label: "Tomorrow · 6:00 PM" });
  return options;
}

// ---------------------------------------------------------------------------
// Route analysis
// ---------------------------------------------------------------------------

export const TIER_CORRIDOR_FACTOR: Record<TrafficTier, number> = {
  Low: 0.88,
  Moderate: 0.97,
  High: 1.05,
  "Very High": 1.12,
};
export const TIER_PENALTY: Record<TrafficTier, number> = {
  Low: 8,
  Moderate: 18,
  High: 28,
  "Very High": 38,
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Points along the route spaced roughly every `stepKm`, so corridors near the line can be found. */
function samplePoints(geometry: [number, number][], stepKm = 0.5): { lat: number; lon: number }[] {
  const out: { lat: number; lon: number }[] = [];
  for (let i = 0; i < geometry.length - 1; i++) {
    const [aLat, aLon] = geometry[i]!;
    const [bLat, bLon] = geometry[i + 1]!;
    const seg = distanceKm({ lat: aLat, lon: aLon }, { lat: bLat, lon: bLon });
    const n = Math.max(1, Math.ceil(seg / stepKm));
    for (let k = 0; k < n; k++) {
      out.push({ lat: aLat + ((bLat - aLat) * k) / n, lon: aLon + ((bLon - aLon) * k) / n });
    }
  }
  const last = geometry[geometry.length - 1];
  if (last) out.push({ lat: last[0], lon: last[1] });
  return out;
}

/** CityFlow-tracked corridors within `radiusKm` of the route, in travel order. */
export function corridorsAlongRoute(
  geometry: [number, number][],
  radiusKm = 2,
): BengaluruLocation[] {
  const pts = samplePoints(geometry);
  return bengaluruLocations
    .map((loc) => {
      let best = Infinity;
      let index = 0;
      pts.forEach((p, i) => {
        const d = distanceKm(p, loc);
        if (d < best) {
          best = d;
          index = i;
        }
      });
      return { loc, best, index };
    })
    .filter((c) => c.best <= radiusKm)
    .sort((a, b) => a.index - b.index)
    .map((c) => c.loc);
}

export type WeatherImpact = { level: "Low" | "Moderate" | "High"; pct: number; note: string };

export function weatherImpact(weather: WeatherReading | undefined): WeatherImpact {
  if (!weather) return { level: "Low", pct: 0, note: "Weather data unavailable" };
  const c = weather.condition.toLowerCase();
  if (/thunder|heavy rain|storm/.test(c))
    return {
      level: "High",
      pct: 18,
      note: `${weather.condition} — expect slow, waterlogged stretches`,
    };
  if (/rain|drizzle|shower/.test(c))
    return { level: "Moderate", pct: 10, note: `${weather.condition} — wet roads slow traffic` };
  if (weather.chanceOfRain >= 50)
    return {
      level: "Moderate",
      pct: 6,
      note: `${weather.chanceOfRain}% chance of rain later today`,
    };
  if (/fog|mist|haze/.test(c))
    return { level: "Moderate", pct: 5, note: `${weather.condition} — reduced visibility` };
  return {
    level: "Low",
    pct: 0,
    note: `${weather.condition}, ${weather.tempC}°C — no weather slowdown expected`,
  };
}

/** Day-of-week-adjusted share of peak congestion for an hour (≈0.2 overnight, ≈1 at evening peak). */
export function congestionIntensity(offset: number, hour: number, now: Date) {
  const shape = DAY_SHAPE[hour] ?? 0.6;
  // trafficMultiplier = weekdayFactor * (0.7 + shape * 0.75); recover weekdayFactor * shape.
  return (trafficMultiplier(offset, hour, now) * shape) / (0.7 + shape * 0.75);
}

export function tierFromIntensity(intensity: number): TrafficTier {
  if (intensity < 0.45) return "Low";
  if (intensity < 0.68) return "Moderate";
  if (intensity < 0.88) return "High";
  return "Very High";
}

export type HourPoint = { hour: number; label: string; minutes: number; tier: TrafficTier };

export type RouteAnalysis = {
  distanceKm: number;
  baselineMin: number;
  current: { tier: TrafficTier; minutes: number };
  forecast: { tier: TrafficTier; minutes: number; rangeLow: number; rangeHigh: number };
  delayMin: number;
  confidence: number;
  reliability: number;
  roadScore: number;
  weather: WeatherImpact;
  trend: "Rising" | "Easing" | "Steady";
  trendPct: number;
  peakWindow: { start: string; end: string; dayLabel: string } | null;
  hourly: HourPoint[];
  /** Same route at each selectable departure time, for "when should I leave" comparisons. */
  departures: (Departure & { minutes: number; tier: TrafficTier })[];
  corridors: BengaluruLocation[];
  routedLive: boolean;
};

export function analyzeRoute({
  route,
  mode,
  departure,
  weather,
  approximateEndpoints,
  now = new Date(),
}: {
  route: RouteResult;
  mode: PlannerMode;
  departure: Departure;
  weather: WeatherReading | undefined;
  approximateEndpoints: number;
  now?: Date;
}): RouteAnalysis {
  const m = plannerMode(mode);
  // The routing engine's duration is free-flow; congestion is layered on top of it.
  const freeFlowMin =
    urbanFreeFlowMin(route.primary.distanceKm, route.primary.durationMin, m.routing) *
    m.speedFactor;
  const baselineMin = freeFlowMin + m.overheadMin;
  const corridors = corridorsAlongRoute(route.primary.geometry);
  const corridorFactor = corridors.length
    ? corridors.reduce((s, c) => s + TIER_CORRIDOR_FACTOR[c.baseTier], 0) / corridors.length
    : 1;
  const wx = weatherImpact(weather);

  const at = (offset: number, hour: number) => {
    const intensity = congestionIntensity(offset, hour, now) * corridorFactor;
    const weatherMul = 1 + (m.trafficSensitivity > 0 ? wx.pct / 100 : 0);
    // Peak-hour Bengaluru traffic roughly doubles free-flow travel time.
    const minutes =
      freeFlowMin * (1 + m.trafficSensitivity * intensity) * weatherMul + m.overheadMin;
    return { tier: tierFromIntensity(intensity), minutes: Math.max(1, Math.round(minutes)) };
  };

  const current = at(0, now.getHours());
  const forecastAt = at(departure.offset, departure.hour);
  const est = estimateTravelTime(baselineMin, departure.offset, departure.hour, now);
  const spreadPct = (est.rangeHigh - est.rangeLow) / Math.max(1, est.travelTime);
  const spread = Math.max(1, Math.round((forecastAt.minutes * spreadPct) / 2));

  const confidence = clamp(
    est.confidence -
      (route.live ? 0 : 10) -
      approximateEndpoints * 4 -
      (corridors.length ? 0 : 6) -
      (departure.offset > 0 ? 3 : 0),
    45,
    95,
  );

  const avgPenalty = corridors.length
    ? corridors.reduce((s, c) => s + TIER_PENALTY[c.baseTier], 0) / corridors.length
    : 20;
  const roadScore = Math.round(
    clamp(100 - avgPenalty - wx.pct * 0.8 - Math.min(8, route.primary.distanceKm / 4), 20, 98),
  );

  const reliability = Math.round(
    clamp(100 - spreadPct * 45 - TIER_PENALTY[forecastAt.tier] * 0.35 - wx.pct * 0.5, 40, 97),
  );

  const delta = forecastAt.minutes - current.minutes;
  const trendPct = Math.round((delta / Math.max(1, current.minutes)) * 100);
  const trend = trendPct >= 5 ? "Rising" : trendPct <= -5 ? "Easing" : "Steady";

  // Hourly curve for the departure day, used for the trend chart and peak window.
  const hourly: HourPoint[] = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    label: minutesToClockLabel(hour * 60).replace(":00", ""),
    ...at(departure.offset, hour),
  }));

  const peakWindow = findPeakWindow(baselineMin, now, at);

  return {
    distanceKm: route.primary.distanceKm,
    baselineMin: Math.round(baselineMin),
    current,
    forecast: {
      ...forecastAt,
      rangeLow: Math.max(1, forecastAt.minutes - spread),
      rangeHigh: forecastAt.minutes + spread,
    },
    delayMin: forecastAt.minutes - Math.round(baselineMin),
    confidence,
    reliability,
    roadScore,
    weather: wx,
    trend,
    trendPct,
    peakWindow,
    hourly,
    departures: departureOptions(now).map((d) => ({ ...d, ...at(d.offset, d.hour) })),
    corridors,
    routedLive: route.live,
  };
}

/** Next stretch of hours (from now) when travel time is within 6% of the day's busiest remaining hour. */
function findPeakWindow(
  baselineMin: number,
  now: Date,
  at: (offset: number, hour: number) => { minutes: number },
): RouteAnalysis["peakWindow"] {
  const startHour = now.getHours() + 1;
  const offset = startHour <= 20 ? 0 : 1;
  const from = offset === 0 ? startHour : 6;
  const hours = Array.from({ length: 24 - from }, (_, i) => ({
    hour: from + i,
    ...at(offset, from + i),
  }));
  if (!hours.length || baselineMin <= 0) return null;
  const max = Math.max(...hours.map((h) => h.minutes));
  const peakIdx = hours.findIndex((h) => h.minutes === max);
  let lo = peakIdx;
  let hi = peakIdx;
  while (lo > 0 && hours[lo - 1]!.minutes >= max * 0.94) lo--;
  while (hi < hours.length - 1 && hours[hi + 1]!.minutes >= max * 0.94) hi++;
  // Centre the window on the half hour before the peak hour starts, matching how congestion builds.
  const start = hours[lo]!.hour * 60 - 30;
  const end = (hours[hi]!.hour + 1) * 60 - 30;
  return {
    start: minutesToClockLabel(start),
    end: minutesToClockLabel(end),
    dayLabel: offset === 0 ? "today" : "tomorrow",
  };
}
