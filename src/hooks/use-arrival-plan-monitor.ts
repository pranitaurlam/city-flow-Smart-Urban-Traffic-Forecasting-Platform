import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { bengaluruCenter, findLocation } from "@/lib/locations";
import { getLiveWeather } from "@/lib/weather-server";
import { buildArrivalPlan, type ArrivalPlanResult } from "@/lib/arrival-planner";
import { parseTime, DAY_SHORT, type AlertDraft } from "@/lib/personal-routes";
import {
  arrivalPlanActions,
  useArrivalPlansStore,
  type ArrivalPlan,
} from "@/lib/arrival-plans-store";
import { routeAlertActions, useRouteAlertStore } from "@/lib/personal-routes-store";
import { notifyDesktop } from "@/hooks/use-route-monitor";
import type { RouteResult } from "@/lib/route-server";

const TICK_MS = 60_000;
const WORSENING_DROP_PCT = 15;

const weekdayIndex = (d: Date) => (d.getDay() + 6) % 7;

function nextArrivalOccurrence(plan: ArrivalPlan, now: Date) {
  const minute = parseTime(plan.arrivalTime);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  for (let offset = 0; offset <= 7; offset++) {
    const d = new Date(now);
    d.setDate(d.getDate() + offset);
    if (!plan.days.includes(weekdayIndex(d))) continue;
    if (offset === 0 && minute < nowMin) continue;
    const dateKey = d.toISOString().slice(0, 10);
    return { offset, minute, dateKey };
  }
  return null;
}

/** Evaluates every saved arrival plan's next occurrence; raises reminders and worsening alerts. */
export function useArrivalPlanMonitor() {
  const plans = useArrivalPlansStore().plans;
  const alertStore = useRouteAlertStore();
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

  const results = useMemo(() => {
    type Occurrence = NonNullable<ReturnType<typeof nextArrivalOccurrence>>;
    const map: Record<string, { occurrence: Occurrence; plan: ArrivalPlanResult }> = {};
    for (const plan of plans) {
      if (!plan.active) continue;
      const occurrence = nextArrivalOccurrence(plan, now);
      if (!occurrence) continue;
      const corridors = plan.primary.corridorSlugs
        .map((slug) => findLocation(slug))
        .filter((l): l is NonNullable<typeof l> => !!l);
      const route: RouteResult = {
        mode: "car",
        primary: {
          distanceKm: plan.primary.distanceKm,
          durationMin: plan.primary.durationMin,
          geometry: [],
        },
        alternatives: [],
        live: plan.primary.live,
      };
      const result = buildArrivalPlan({
        route,
        mode: plan.mode,
        corridors,
        weather: weatherQuery.data,
        dayOffset: occurrence.offset,
        targetHour: Math.floor(occurrence.minute / 60),
        targetMinute: occurrence.minute % 60,
        reliabilityTarget: plan.reliabilityTarget,
        bufferMin: plan.bufferMin,
        approximateEndpoints:
          Number(plan.origin.approximate) + Number(plan.destination.approximate),
        now,
      });
      map[plan.id] = { occurrence, plan: result };
    }
    return map;
  }, [plans, now, weatherQuery.data]);

  const ready = !weatherQuery.isLoading;

  useEffect(() => {
    if (!ready) return;
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const drafts: AlertDraft[] = [];

    for (const plan of plans) {
      if (!plan.active) continue;
      const entry = results[plan.id];
      if (!entry) continue;
      const { occurrence, plan: result } = entry;
      const dayWord =
        occurrence.offset === 0
          ? "today"
          : occurrence.offset === 1
            ? "tomorrow"
            : `on ${DAY_SHORT[weekdayIndex(new Date(now.getFullYear(), now.getMonth(), now.getDate() + occurrence.offset))]}`;

      if (plan.departureReminder && occurrence.offset === 0) {
        const dep = result.recommended.departureMinute;
        const reminderKey = `reminder:${plan.id}:${occurrence.dateKey}`;
        if (
          nowMin >= dep - plan.reminderMinutesBefore &&
          nowMin <= dep &&
          plan.lastRemindedKey !== reminderKey
        ) {
          drafts.push({
            key: reminderKey,
            routeId: plan.id,
            routeName: plan.name,
            type: "arrivalReminder",
            severity: "warning",
            title: "Time to leave soon",
            message: `Leave by ${result.recommended.departureLabel} to arrive by ${result.deadlineLabel} (${result.recommended.onTimeProbability}% on-time probability).`,
          });
          arrivalPlanActions.patchTracking(plan.id, {
            lastKnownProbability: result.recommended.onTimeProbability,
            lastRemindedKey: reminderKey,
          });
        }
      }

      if (plan.notifyOnWorsening && plan.lastKnownProbability !== undefined) {
        const drop = plan.lastKnownProbability - result.recommended.onTimeProbability;
        const riskKey = `risk:${plan.id}:${occurrence.dateKey}`;
        if (drop >= WORSENING_DROP_PCT && plan.lastRemindedKey !== riskKey) {
          drafts.push({
            key: riskKey,
            routeId: plan.id,
            routeName: plan.name,
            type: "arrivalRisk",
            severity: result.recommended.risk === "High Risk" ? "critical" : "warning",
            title: "Arrival forecast has worsened",
            message: `Your ${plan.name} plan ${dayWord} now shows ${result.recommended.onTimeProbability}% on-time probability (was ${plan.lastKnownProbability}%). Recommended departure moved to ${result.recommended.departureLabel}.`,
          });
          arrivalPlanActions.patchTracking(plan.id, {
            lastKnownProbability: result.recommended.onTimeProbability,
            lastRemindedKey: riskKey,
          });
        } else if (drop !== 0) {
          arrivalPlanActions.patchTracking(plan.id, {
            lastKnownProbability: result.recommended.onTimeProbability,
            lastRemindedKey: plan.lastRemindedKey ?? "",
          });
        }
      } else if (plan.notifyOnWorsening && plan.lastKnownProbability === undefined) {
        arrivalPlanActions.patchTracking(plan.id, {
          lastKnownProbability: result.recommended.onTimeProbability,
          lastRemindedKey: plan.lastRemindedKey ?? "",
        });
      }
    }

    const added = routeAlertActions.pushAlerts(drafts);
    if (added.length) {
      notifyDesktop(
        added.map((a) => ({ title: `${a.title} · ${a.routeName}`, body: a.message })),
        alertStore.prefs.desktop,
      );
    }
    // alertStore.alerts is read for dedupe only inside pushAlerts; re-running on its own change is redundant.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, results, plans]);

  return { results, weather: weatherQuery.data };
}
