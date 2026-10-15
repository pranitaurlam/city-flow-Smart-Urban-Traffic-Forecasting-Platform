import { useEffect, useMemo, useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { bengaluruCenter, findLocation } from "@/lib/locations";
import { getLiveTraffic, type TrafficReading } from "@/lib/traffic-server";
import { getLiveWeather } from "@/lib/weather-server";
import {
  detectAlerts,
  evaluateRoute,
  type RouteStatus,
  type TrafficContext,
} from "@/lib/personal-routes";
import { routeAlertActions, useRouteAlertStore } from "@/lib/personal-routes-store";

const TICK_MS = 60_000;

/** Watches every saved route, re-forecasting each minute and raising alerts on meaningful changes. */
export function useRouteMonitor() {
  const store = useRouteAlertStore();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), TICK_MS);
    return () => clearInterval(id);
  }, []);

  const weatherQuery = useQuery({
    queryKey: ["live-weather", "bengaluru"],
    queryFn: () =>
      getLiveWeather({
        data: { lat: bengaluruCenter.lat, lon: bengaluruCenter.lon, slug: "bengaluru" },
      }),
    staleTime: 10 * 60_000,
    refetchInterval: 10 * 60_000,
  });

  const slugs = useMemo(
    () =>
      [
        ...new Set(
          store.routes.flatMap((r) => [
            ...r.primary.corridorSlugs,
            ...(r.alternative?.corridorSlugs ?? []),
          ]),
        ),
      ].sort(),
    [store.routes],
  );

  const trafficQueries = useQueries({
    queries: slugs.map((slug) => {
      const loc = findLocation(slug)!;
      return {
        queryKey: ["live-traffic", slug],
        queryFn: () =>
          getLiveTraffic({
            data: {
              lat: loc.lat,
              lon: loc.lon,
              basePeakVolume: loc.basePeakVolume,
              baseTier: loc.baseTier,
              slug,
            },
          }),
        enabled: !!loc,
        staleTime: 60_000,
        refetchInterval: 5 * 60_000,
      };
    }),
  });

  const trafficKey = trafficQueries.map((q) => q.dataUpdatedAt).join();
  const traffic = useMemo(() => {
    const map: Record<string, TrafficReading | undefined> = {};
    slugs.forEach((slug, i) => (map[slug] = trafficQueries[i]?.data));
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slugs, trafficKey]);

  const ctx: TrafficContext = useMemo(
    () => ({ now, traffic, weather: weatherQuery.data }),
    [now, traffic, weatherQuery.data],
  );

  const statuses = useMemo(() => {
    const map: Record<string, RouteStatus> = {};
    for (const r of store.routes) map[r.id] = evaluateRoute(r, ctx);
    return map;
  }, [store.routes, ctx]);

  const ready = !weatherQuery.isLoading && trafficQueries.every((q) => !q.isLoading);

  useEffect(() => {
    if (!ready) return;
    const drafts = store.routes.flatMap((r) => {
      const status = statuses[r.id];
      if (!status) return [];
      return detectAlerts(r, status, {
        frequency: store.prefs.frequency,
        previous: store.alerts,
        now: ctx.now,
      });
    });
    const added = routeAlertActions.pushAlerts(drafts);
    if (added.length)
      notifyDesktop(
        added.map((a) => ({ title: `${a.title} · ${a.routeName}`, body: a.message })),
        store.prefs.desktop,
      );
    // store.alerts is read for dedupe only; re-running on its change would be redundant.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, statuses, store.prefs.frequency]);

  return {
    statuses,
    ctx,
    weather: weatherQuery.data,
    trafficLive: Object.values(traffic).some((t) => t?.live),
  };
}

export function notifyDesktop(items: { title: string; body: string }[], enabled: boolean) {
  if (!enabled || typeof Notification === "undefined" || Notification.permission !== "granted")
    return;
  for (const item of items.slice(0, 3)) {
    try {
      new Notification(item.title, { body: item.body, tag: item.title });
    } catch {
      // Some browsers only allow notifications from a service worker; in-app alerts still work.
    }
  }
}
