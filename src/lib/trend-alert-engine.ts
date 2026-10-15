import type { TrafficReading } from "@/lib/traffic-server";
import type { PersonalRoute, RouteStatus } from "@/lib/personal-routes";

// ---------------------------------------------------------------------------
// Traffic Trend Change Detection — pure detection logic.
//
// No React, no window.alert() here — this module only decides WHETHER a
// change is significant enough to mention, and builds the message text.
// The hook that drives this (use-traffic-trend-alerts.ts) owns timing,
// deduplication, and actually calling alert().
// ---------------------------------------------------------------------------

/** Configurable thresholds — tune here, not scattered through the detection code. */
export const TREND_THRESHOLDS = {
  /** Congestion-% jump since the last poll that counts as a significant spike. */
  spikePctPoints: 15,
  /** Congestion-% drop since the last poll that counts as significant improvement. */
  improvePctPoints: 15,
  /** How far above the historical average congestion counts as "unexpected". */
  unexpectedAbovePctPoints: 20,
  /** Minimum speed drop (km/h) required alongside a congestion spike, to filter noise. */
  minSpeedDropKph: 4,
  /** Forecast travel-time swing (%) on a saved route that counts as a "major forecast change". */
  forecastSwingPct: 30,
  /** ...and the minimum absolute minutes for that swing to matter at all. */
  forecastSwingMinMin: 8,
  /** Cooldown before the same location/route + alert kind can fire again. */
  cooldownMs: 15 * 60_000,
  /** Minimum time between polls used to label "in the last N minutes" in messages. */
} as const;

export type TrendAlertKind =
  "congestionSpike" | "congestionImproving" | "unexpectedSpike" | "routeDelay" | "forecastChange";

export type TrendAlert = {
  /** Stable per-subject-and-kind key, used for cooldown/dedupe — never a single global flag. */
  key: string;
  kind: TrendAlertKind;
  message: string;
};

function demoDataNote(live: boolean) {
  return live ? "" : "\n\n(Demo data — no live traffic feed configured.)";
}

// ---------------------------------------------------------------------------
// Location-level detection (tracked corridors)
// ---------------------------------------------------------------------------

export function detectLocationTrend(params: {
  slug: string;
  name: string;
  current: TrafficReading;
  previous: TrafficReading | undefined;
  historicalAvgCongestionPct: number | undefined;
  minutesSincePrevious: number | null;
}): TrendAlert | null {
  const { slug, name, current, previous, historicalAvgCongestionPct, minutesSincePrevious } =
    params;

  if (
    !Number.isFinite(current.congestionPct) ||
    !Number.isFinite(current.speedKph) ||
    current.congestionPct < 0
  ) {
    return null; // invalid reading — never alert on bad data
  }

  if (previous && Number.isFinite(previous.congestionPct)) {
    const deltaPct = current.congestionPct - previous.congestionPct;
    const speedDrop = previous.speedKph - current.speedKph;

    if (
      deltaPct >= TREND_THRESHOLDS.spikePctPoints &&
      speedDrop >= TREND_THRESHOLDS.minSpeedDropKph
    ) {
      const minutes = minutesSincePrevious ?? "a few";
      return {
        key: `location:${slug}:congestionSpike`,
        kind: "congestionSpike",
        message:
          "TRAFFIC ALERT!\n\n" +
          `Location: ${name}\n` +
          `Congestion has increased by ${Math.round(deltaPct)}% in the last ${minutes} minute${minutes === 1 ? "" : "s"}.\n` +
          `Average speed: ${Math.round(previous.speedKph)} → ${Math.round(current.speedKph)} km/h.\n\n` +
          "Please check your route before travelling." +
          demoDataNote(current.live),
      };
    }

    if (deltaPct <= -TREND_THRESHOLDS.improvePctPoints) {
      return {
        key: `location:${slug}:congestionImproving`,
        kind: "congestionImproving",
        message:
          "TRAFFIC UPDATE!\n\n" +
          `Location: ${name}\n` +
          "Traffic conditions are improving.\n" +
          `Congestion has decreased by ${Math.round(Math.abs(deltaPct))}%.` +
          demoDataNote(current.live),
      };
    }
  }

  if (
    !previous &&
    historicalAvgCongestionPct !== undefined &&
    Number.isFinite(historicalAvgCongestionPct)
  ) {
    const aboveHistorical = current.congestionPct - historicalAvgCongestionPct;
    if (aboveHistorical >= TREND_THRESHOLDS.unexpectedAbovePctPoints) {
      return {
        key: `location:${slug}:unexpectedSpike`,
        kind: "unexpectedSpike",
        message:
          "TRAFFIC ALERT!\n\n" +
          `Location: ${name}\n` +
          `Congestion is unusually high for this time of day — ${Math.round(current.congestionPct)}% vs a typical ${Math.round(historicalAvgCongestionPct)}%.\n` +
          `Average speed: ${Math.round(current.speedKph)} km/h.\n\n` +
          "Please check your route before travelling." +
          demoDataNote(current.live),
      };
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Saved personal route detection
// ---------------------------------------------------------------------------

export function detectRouteTrend(
  route: PersonalRoute,
  status: RouteStatus,
  previousForecastMin: number | undefined,
): TrendAlert | null {
  if (!Number.isFinite(status.forecastMin) || !Number.isFinite(status.normalMin)) return null;

  if (status.delayMin >= route.thresholdMin) {
    return {
      key: `route:${route.id}:routeDelay`,
      kind: "routeDelay",
      message:
        "YOUR ROUTE ALERT!\n\n" +
        `Route: ${route.name}\n` +
        `Normal travel time: ${status.normalMin} minutes\n` +
        `Forecast travel time: ${status.forecastMin} minutes\n` +
        `Expected delay: ${status.delayMin} minutes.\n\n` +
        "Consider leaving earlier." +
        demoDataNote(status.congestion?.live ?? false),
    };
  }

  if (previousForecastMin !== undefined && Number.isFinite(previousForecastMin)) {
    const diff = status.forecastMin - previousForecastMin;
    const swingPct = (Math.abs(diff) / Math.max(1, previousForecastMin)) * 100;
    if (
      swingPct >= TREND_THRESHOLDS.forecastSwingPct &&
      Math.abs(diff) >= TREND_THRESHOLDS.forecastSwingMinMin
    ) {
      return {
        key: `route:${route.id}:forecastChange`,
        kind: "forecastChange",
        message:
          "FORECAST UPDATE!\n\n" +
          `Route: ${route.name}\n` +
          `Forecast travel time changed from ${previousForecastMin} to ${status.forecastMin} minutes.\n` +
          `Traffic: ${status.tier}.` +
          demoDataNote(status.congestion?.live ?? false),
      };
    }
  }

  return null;
}
