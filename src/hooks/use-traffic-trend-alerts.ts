import { useEffect, useRef } from "react";
import { useQueries } from "@tanstack/react-query";
import { findLocation } from "@/lib/locations";
import { getLiveTraffic, type TrafficReading } from "@/lib/traffic-server";
import { bangaloreTrafficHistory } from "@/data/bangalore-traffic-history";
import { detectLocationTrend, detectRouteTrend, TREND_THRESHOLDS } from "@/lib/trend-alert-engine";
import { trendAlertActions } from "@/lib/trend-alert-store";
import { useRouteAlertStore } from "@/lib/personal-routes-store";
import { useRouteMonitor } from "@/hooks/use-route-monitor";

/**
 * A handful of well-known corridors tracked citywide for trend detection —
 * mirrors the "featured corridors" list already used on the Locations page,
 * kept small so this doesn't add a heavy polling load site-wide.
 */
const TRACKED_SLUGS = ["mg-road", "marathahalli", "hsr-layout", "whitefield", "silk-board"];

/**
 * Mounted once, globally (see __root.tsx). Polls a small set of tracked
 * corridors plus the user's saved personal routes, and raises a native
 * `window.alert()` when a meaningful, non-duplicate traffic change is
 * detected — never on first load, never more than once per cooldown per
 * independent location/route + alert-kind combination.
 */
export function useTrafficTrendAlerts() {
  const routeAlertStore = useRouteAlertStore();
  const monitor = useRouteMonitor();

  const previousReading = useRef<Record<string, TrafficReading>>({});
  const previousForecastMin = useRef<Record<string, number>>({});
  // First observation per key is always a baseline, never an alert — satisfies
  // "no alerts on initial load" even for checks that don't need a prior reading.
  const seenLocationKeys = useRef<Set<string>>(new Set());
  const seenRouteKeys = useRef<Set<string>>(new Set());

  const trafficQueries = useQueries({
    queries: TRACKED_SLUGS.map((slug) => {
      const loc = findLocation(slug);
      return {
        queryKey: ["live-traffic", slug],
        queryFn: () =>
          getLiveTraffic({
            data: {
              lat: loc!.lat,
              lon: loc!.lon,
              basePeakVolume: loc!.basePeakVolume,
              baseTier: loc!.baseTier,
              slug,
            },
          }),
        enabled: !!loc,
        staleTime: 20_000,
        refetchInterval: 45_000,
      };
    }),
  });

  const trafficUpdateKey = trafficQueries.map((q) => q.dataUpdatedAt).join(",");

  // Location trend detection — runs only when a tracked corridor's reading actually updates.
  useEffect(() => {
    const now = Date.now();
    TRACKED_SLUGS.forEach((slug, i) => {
      const query = trafficQueries[i];
      const current = query?.data;
      if (!current) return;

      const loc = findLocation(slug);
      const prev = previousReading.current[slug];
      const isFirstObservation = !seenLocationKeys.current.has(slug);
      seenLocationKeys.current.add(slug);

      const alert = isFirstObservation
        ? null
        : detectLocationTrend({
            slug,
            name: loc?.name ?? slug,
            current,
            previous: prev,
            historicalAvgCongestionPct: bangaloreTrafficHistory[slug]?.avgCongestionPct,
            minutesSincePrevious: prev
              ? Math.max(
                  1,
                  Math.round((Date.parse(current.updatedAt) - Date.parse(prev.updatedAt)) / 60_000),
                )
              : null,
          });

      // Always record the latest reading as the new baseline for next time.
      previousReading.current[slug] = current;

      if (alert) {
        if (trendAlertActions.canFire(alert.key, now)) {
          window.alert(alert.message);
          trendAlertActions.markFired(alert.key, now);
        }
        return;
      }

      // Stable reading (no significant delta) — reset any cooldown for this
      // location so a future genuinely new spike isn't silently suppressed.
      if (prev) {
        const settledPct = Math.abs(current.congestionPct - prev.congestionPct);
        if (settledPct < TREND_THRESHOLDS.spikePctPoints / 2) {
          trendAlertActions.clearKey(`location:${slug}:congestionSpike`);
          trendAlertActions.clearKey(`location:${slug}:congestionImproving`);
          trendAlertActions.clearKey(`location:${slug}:unexpectedSpike`);
        }
      }
    });
    // Only re-run when the underlying data actually changes, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trafficUpdateKey]);

  // Saved personal route detection — reuses useRouteMonitor's own forecasting.
  useEffect(() => {
    const now = Date.now();
    for (const route of routeAlertStore.routes) {
      if (!route.alertsOn) continue;
      const status = monitor.statuses[route.id];
      if (!status) continue;

      const isFirstObservation = !seenRouteKeys.current.has(route.id);
      seenRouteKeys.current.add(route.id);

      const alert = isFirstObservation
        ? null
        : detectRouteTrend(route, status, previousForecastMin.current[route.id]);
      previousForecastMin.current[route.id] = status.forecastMin;

      if (alert) {
        if (trendAlertActions.canFire(alert.key, now)) {
          window.alert(alert.message);
          trendAlertActions.markFired(alert.key, now);
        }
        continue;
      }

      if (status.delayMin < route.thresholdMin / 2) {
        trendAlertActions.clearKey(`route:${route.id}:routeDelay`);
        trendAlertActions.clearKey(`route:${route.id}:forecastChange`);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monitor.statuses]);
}
