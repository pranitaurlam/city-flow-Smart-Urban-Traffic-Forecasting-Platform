import { DAY_SHAPE } from "@/lib/hourly";
import type { TrafficTier } from "@/lib/locations";

const WEEKDAY_FACTOR = [0.88, 0.9, 0.94, 0.96, 1.0, 0.7, 0.58]; // Mon..Sun
const CONFIDENCE_BY_DAY = [95, 90, 85, 80, 76, 72, 68, 64]; // Today..+7 Days

export function dayLabel(offset: number, base: Date = new Date()) {
  const date = new Date(base);
  date.setDate(date.getDate() + offset);
  const weekday = date.toLocaleDateString(undefined, { weekday: "short" }).toUpperCase();
  const monthDay = date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const relative =
    offset === 0
      ? "Today"
      : offset === 1
        ? "Tomorrow"
        : offset === 2
          ? "Day After Tomorrow"
          : `+${offset} Days`;
  return { date, weekday, monthDay, relative };
}

/** Relative traffic intensity multiplier for a given day offset + hour (0..23). */
export function trafficMultiplier(offset: number, hour: number, base: Date = new Date()) {
  const { date } = dayLabel(offset, base);
  const weekdayIndex = (date.getDay() + 6) % 7; // Mon=0..Sun=6
  const weekdayFactor = WEEKDAY_FACTOR[weekdayIndex] ?? 0.9;
  const hourFactor = DAY_SHAPE[hour] ?? 0.6;
  return weekdayFactor * (0.7 + hourFactor * 0.75);
}

export function tierFromMultiplier(multiplier: number): TrafficTier {
  if (multiplier < 0.75) return "Low";
  if (multiplier < 0.95) return "Moderate";
  if (multiplier < 1.15) return "High";
  return "Very High";
}

export type TravelTimeEstimate = {
  offset: number;
  hour: number;
  travelTime: number;
  delay: number;
  rangeLow: number;
  rangeHigh: number;
  confidence: number;
  tier: TrafficTier;
};

/**
 * Estimated travel time for a route at a given future day/hour. `baseDurationMin`
 * is the routing engine's typical (non-live) duration for the route — used as the
 * "historical baseline" the multiplier is applied to.
 */
export function estimateTravelTime(
  baseDurationMin: number,
  offset: number,
  hour: number,
  base: Date = new Date(),
): TravelTimeEstimate {
  const multiplier = trafficMultiplier(offset, hour, base);
  const travelTime = Math.round(baseDurationMin * multiplier);
  const confidence = CONFIDENCE_BY_DAY[Math.min(offset, CONFIDENCE_BY_DAY.length - 1)] ?? 60;
  const spread = Math.round(travelTime * (0.08 + (100 - confidence) / 400));
  return {
    offset,
    hour,
    travelTime,
    delay: travelTime - Math.round(baseDurationMin),
    rangeLow: Math.max(1, travelTime - spread),
    rangeHigh: travelTime + spread,
    confidence,
    tier: tierFromMultiplier(multiplier),
  };
}

export function build7DayForecast(baseDurationMin: number, hour: number, base: Date = new Date()) {
  return Array.from({ length: 8 }, (_, offset) => ({
    ...dayLabel(offset, base),
    ...estimateTravelTime(baseDurationMin, offset, hour, base),
  }));
}

export function buildHourlyForDay(
  baseDurationMin: number,
  offset: number,
  base: Date = new Date(),
) {
  return Array.from({ length: 24 }, (_, hour) =>
    estimateTravelTime(baseDurationMin, offset, hour, base),
  );
}

export type RouteFactor = { label: string; pct: number };

/** Illustrative breakdown of what's associated with the predicted route conditions. */
export function routeExplainability(
  offset: number,
  hour: number,
  weatherCondition: string | undefined,
): RouteFactor[] {
  const isRain = !!weatherCondition && /rain/i.test(weatherCondition);
  const isEveningPeak = hour >= 17 && hour <= 20;
  const { date } = dayLabel(offset);
  const weekdayIndex = (date.getDay() + 6) % 7;
  const isWeekday = weekdayIndex < 5;

  const historicalPct = 42;
  const peakPct = isEveningPeak ? 31 : 14;
  const rainPct = isRain ? 17 : 6;
  const dayOfWeekPct = isWeekday ? 10 : 22;

  const raw = [
    { label: "Historical Traffic Pattern", pct: historicalPct },
    { label: isEveningPeak ? "Evening Peak" : "Time of Day", pct: peakPct },
    { label: "Rain Forecast", pct: rainPct },
    { label: "Day-of-Week Pattern", pct: dayOfWeekPct },
  ];
  const total = raw.reduce((sum, f) => sum + f.pct, 0);
  return raw.map((f) => ({ ...f, pct: Math.round((f.pct / total) * 100) }));
}
