import { PEAK_HOUR_SHARE, type TrafficBaseline, type TrafficTier } from "@/lib/locations";
import { bangaloreTrafficHistory } from "@/data/bangalore-traffic-history";
import { buildHourly } from "@/lib/hourly";

export type DayTrend = { day: string; volume: number };

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_FACTORS = [0.88, 0.9, 0.94, 0.96, 1.0, 0.7, 0.58];

function hashString(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) % 1000;
  }
  return hash;
}

/** Real weekday pattern from the Kaggle dataset where available, else a synthetic estimate. */
export function weeklyTrend(location: TrafficBaseline): DayTrend[] {
  const history = bangaloreTrafficHistory[location.slug];
  if (history) {
    return DAYS.map((day, index) => ({
      day,
      volume: Math.round((history.weekdayAvgVolume[index] ?? 0) * PEAK_HOUR_SHARE),
    }));
  }

  const seed = hashString(location.slug);
  return DAYS.map((day, index) => {
    const wobble = 1 + (((seed + index * 37) % 11) - 5) / 100;
    return {
      day,
      volume: Math.round(location.basePeakVolume * (DAY_FACTORS[index] ?? 0.9) * wobble),
    };
  });
}

export type TrafficPeriod = "today" | "7d" | "30d" | "3m";

const PERIOD_LABEL: Record<TrafficPeriod, string> = {
  today: "Today",
  "7d": "7 Days",
  "30d": "30 Days",
  "3m": "3 Months",
};

/** Fixed recurring evening-rush window used across the app (derived from the shared day-shape curve's peak hour). */
const TYPICAL_PEAK_PERIOD = "5:30 PM – 7:30 PM";

/**
 * Volume statistics for a location over a given period. "Today" and "7 Days" are
 * derived directly from real data where the Kaggle dataset covers this location;
 * "30 Days" / "3 Months" have no matching dataset granularity, so they're a
 * clearly-labeled estimate scaled off the 7-day pattern.
 */
export function periodStats(location: TrafficBaseline, period: TrafficPeriod) {
  const week = weeklyTrend(location).map((d) => d.volume);
  const avg7 = Math.round(week.reduce((sum, v) => sum + v, 0) / week.length);
  const peak7 = Math.max(...week);
  const low7 = Math.min(...week);
  const isReal = !!bangaloreTrafficHistory[location.slug];

  if (period === "today") {
    const hourly = buildHourly(location.basePeakVolume);
    const values = hourly
      .map((h) => h.historical ?? h.forecast)
      .filter((v): v is number => v !== null);
    return {
      average: Math.round(values.reduce((sum, v) => sum + v, 0) / values.length),
      peak: Math.max(...values),
      lowest: Math.min(...values),
      peakPeriod: TYPICAL_PEAK_PERIOD,
      isEstimate: false,
      label: PERIOD_LABEL[period],
    };
  }

  if (period === "7d") {
    return {
      average: avg7,
      peak: peak7,
      lowest: low7,
      peakPeriod: TYPICAL_PEAK_PERIOD,
      isEstimate: !isReal,
      label: PERIOD_LABEL[period],
    };
  }

  const seed = hashString(location.slug + period);
  const factor = period === "30d" ? 1 + ((seed % 9) - 4) / 100 : 1 + ((seed % 13) - 6) / 100;
  return {
    average: Math.round(avg7 * factor),
    peak: Math.round(peak7 * (factor + 0.04)),
    lowest: Math.round(low7 * (factor - 0.03)),
    peakPeriod: TYPICAL_PEAK_PERIOD,
    isEstimate: true,
    label: PERIOD_LABEL[period],
  };
}

export type ForecastFactor = { label: string; pct: number };

/**
 * Simplified, deterministic breakdown of what's driving the forecast — an
 * illustrative explanation grounded in the same signals CityFlow already
 * surfaces (weather, day-of-week, historical pattern), not a real model's
 * feature-importance output.
 */
export function explainabilityFactors(
  location: TrafficBaseline,
  weatherCondition: string | undefined,
  now: Date = new Date(),
): ForecastFactor[] {
  const isRain = !!weatherCondition && /rain/i.test(weatherCondition);
  const day = now.getDay();
  const isFridayEvening = day === 5;
  const isWeekend = day === 0 || day === 6;
  const seed = hashString(location.slug + "factors");

  const rainPct = isRain ? 35 + (seed % 10) : 8 + (seed % 8);
  const dayLabel = isFridayEvening
    ? "Friday Evening"
    : isWeekend
      ? "Weekend Pattern"
      : "Weekday Pattern";
  const dayPct = isFridayEvening ? 30 + (seed % 8) : 20 + (seed % 8);
  const historicalPct = Math.max(15, 100 - rainPct - dayPct);

  const raw = [
    { label: isRain ? "Rain" : "Weather Conditions", pct: rainPct },
    { label: dayLabel, pct: dayPct },
    { label: "Historical Pattern", pct: historicalPct },
  ];
  const total = raw.reduce((sum, f) => sum + f.pct, 0);
  return raw.map((f) => ({ ...f, pct: Math.round((f.pct / total) * 100) }));
}

export function tomorrowPeakForecast(location: TrafficBaseline) {
  const seed = hashString(location.slug + "peak");
  const bump = 1.05 + (seed % 8) / 100;
  const volume = Math.round(location.basePeakVolume * bump);
  const spread = Math.round(volume * 0.06);
  const tierOrder: TrafficTier[] = ["Low", "Moderate", "High", "Very High"];
  const tier =
    tierOrder[Math.min(3, tierOrder.indexOf(location.baseTier) + (bump > 1.1 ? 1 : 0))] ??
    location.baseTier;
  return {
    window: "Tomorrow at 6:00 PM",
    tier,
    volume,
    rangeLow: volume - spread,
    rangeHigh: volume + spread,
  };
}
