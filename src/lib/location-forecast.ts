import { PEAK_HOUR_SHARE, type TrafficBaseline, type TrafficTier } from "@/lib/locations";
import { bangaloreTrafficHistory } from "@/data/bangalore-traffic-history";

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
