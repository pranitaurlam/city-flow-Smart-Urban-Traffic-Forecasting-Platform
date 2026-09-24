import { DAY_SHAPE } from "@/lib/hourly";
import type { TrafficTier } from "@/lib/locations";
import { bangaloreTrafficHistory } from "@/data/bangalore-traffic-history";

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

/** Average estimated travel time across the whole day — a "typical <weekday>" baseline distinct from any one hour's forecast. */
export function typicalDayAverageMinutes(
  baseDurationMin: number,
  offset: number,
  base: Date = new Date(),
) {
  const hours = buildHourlyForDay(baseDurationMin, offset, base);
  return Math.round(hours.reduce((sum, h) => sum + h.travelTime, 0) / hours.length);
}

// ---------------------------------------------------------------------------
// What-If Simulator
// ---------------------------------------------------------------------------

export type WhatIfKey = "rain" | "holiday" | "heavyTraffic" | "incident" | "weekend" | "peakHour";

export const WHAT_IF_FACTORS: { key: WhatIfKey; label: string; deltaPct: number }[] = [
  { key: "rain", label: "Rain", deltaPct: 15 },
  { key: "holiday", label: "Holiday", deltaPct: -20 },
  { key: "heavyTraffic", label: "Heavy Traffic", deltaPct: 25 },
  { key: "incident", label: "Road Incident", deltaPct: 30 },
  { key: "weekend", label: "Weekend", deltaPct: -15 },
  { key: "peakHour", label: "Peak Hour", deltaPct: 20 },
];

/** Applies the selected what-if toggles (each an additive % change) to a baseline travel time. */
export function applyWhatIf(baselineMin: number, activeKeys: Set<WhatIfKey>) {
  const totalPct = WHAT_IF_FACTORS.filter((f) => activeKeys.has(f.key)).reduce(
    (sum, f) => sum + f.deltaPct,
    0,
  );
  const multiplier = Math.max(0.4, 1 + totalPct / 100);
  const scenarioMin = Math.round(baselineMin * multiplier);
  return { scenarioMin, diffMin: scenarioMin - Math.round(baselineMin), totalPct };
}

// ---------------------------------------------------------------------------
// Arrival Time Planner
// ---------------------------------------------------------------------------

export function minutesToClockLabel(minutesSinceMidnight: number) {
  const clamped = ((minutesSinceMidnight % 1440) + 1440) % 1440;
  const h = Math.floor(clamped / 60);
  const m = Math.round(clamped % 60);
  const label = `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
  return label;
}

/** Recommends a departure window so the traveller arrives by the target time, using the selected day's hourly forecast. */
export function recommendDeparture(
  baseDurationMin: number,
  offset: number,
  targetHour: number,
  targetMinute: number,
  base: Date = new Date(),
) {
  const targetTotalMin = targetHour * 60 + targetMinute;
  const hourly = buildHourlyForDay(baseDurationMin, offset, base);

  let best: (typeof hourly)[number] | null = null;
  for (const h of hourly) {
    const departTotal = h.hour * 60;
    const arrivalTotal = departTotal + h.travelTime;
    if (arrivalTotal <= targetTotalMin && (!best || departTotal > best.hour * 60)) {
      best = h;
    }
  }
  const reference = best ?? hourly[Math.max(0, targetHour - 1)] ?? hourly[0]!;

  const latestDepartureMin = targetTotalMin - reference.travelTime;
  const bufferMin = Math.max(5, reference.rangeHigh - reference.travelTime);
  const earliestDepartureMin = latestDepartureMin - bufferMin;

  return {
    windowStart: minutesToClockLabel(earliestDepartureMin),
    windowEnd: minutesToClockLabel(latestDepartureMin),
    journeyRangeLow: reference.rangeLow,
    journeyRangeHigh: reference.rangeHigh,
    confidence: reference.confidence,
    tier: reference.tier,
  };
}

// ---------------------------------------------------------------------------
// Recurring Journey
// ---------------------------------------------------------------------------

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

/** Day offset (0..7) of the next occurrence of a given weekday index (0=Mon..6=Sun), today included. */
function nextOffsetForWeekday(weekdayIndex: number, base: Date = new Date()) {
  const todayIndex = (base.getDay() + 6) % 7;
  const diff = (weekdayIndex - todayIndex + 7) % 7;
  return diff;
}

/** Weekly forecast for a recurring commute at a fixed hour, Monday through Friday. */
export function recurringWeekForecast(
  baseDurationMin: number,
  hour: number,
  base: Date = new Date(),
) {
  return WEEKDAY_LABELS.slice(0, 5).map((label, weekdayIndex) => {
    const offset = nextOffsetForWeekday(weekdayIndex, base);
    const est = estimateTravelTime(baseDurationMin, offset, hour, base);
    return { label, ...est };
  });
}

// ---------------------------------------------------------------------------
// Forecast Accuracy — a real backtest of the weekday-shape model against the
// Kaggle dataset's actual per-weekday volumes for the 8 areas it covers.
// ---------------------------------------------------------------------------

export type AccuracySample = {
  area: string;
  day: string;
  predicted: number;
  actual: number;
  errorPct: number;
};

export function backtestWeekdayModel(): {
  mae: number;
  rmse: number;
  mape: number;
  samples: AccuracySample[];
} {
  const samples: AccuracySample[] = [];

  for (const [, history] of Object.entries(bangaloreTrafficHistory)) {
    if (history.areaName === "Bengaluru") continue; // skip the citywide rollup, keep per-area only
    const actualMean = history.weekdayAvgVolume.reduce((s, v) => s + v, 0) / 7;
    const shapeMean = WEEKDAY_FACTOR.reduce((s, v) => s + v, 0) / 7;
    history.weekdayAvgVolume.forEach((actual, i) => {
      const predicted = Math.round(actualMean * ((WEEKDAY_FACTOR[i] ?? 0.9) / shapeMean));
      const errorPct = Math.round((Math.abs(predicted - actual) / actual) * 1000) / 10;
      samples.push({
        area: history.areaName,
        day: WEEKDAY_LABELS[i] ?? "",
        predicted,
        actual,
        errorPct,
      });
    });
  }

  const n = samples.length || 1;
  const mae = Math.round(samples.reduce((s, x) => s + Math.abs(x.predicted - x.actual), 0) / n);
  const rmse = Math.round(
    Math.sqrt(samples.reduce((s, x) => s + (x.predicted - x.actual) ** 2, 0) / n),
  );
  const mape = Math.round((samples.reduce((s, x) => s + x.errorPct, 0) / n) * 10) / 10;

  return { mae, rmse, mape, samples };
}
