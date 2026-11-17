import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { DashboardSidebar } from "@/components/dashboard/sidebar";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/hooks/use-theme";
import { NotificationCenter } from "@/components/route/notification-center";
import { useArrivalPlanMonitor } from "@/hooks/use-arrival-plan-monitor";
import { ArrivalPlannerForm, type ArrivalFormState } from "@/components/route/arrival-planner-form";
import { ArrivalPredictionDashboard } from "@/components/route/arrival-prediction-dashboard";
import { DepartureComparison } from "@/components/route/departure-comparison";
import { WhyThisDeparture } from "@/components/route/why-this-departure";
import { ArrivalTimeline } from "@/components/route/arrival-timeline";
import { RouteReliabilityCard } from "@/components/route/route-reliability";
import { SavedArrivalPlans, type ArrivalPlanDraft } from "@/components/route/saved-arrival-plans";
import { EventImpactCard } from "@/components/route/event-impact-card";
import { JourneyModeSwitch } from "@/components/route/journey-mode-switch";
import { getRoute } from "@/lib/route-server";
import { getLiveWeather } from "@/lib/weather-server";
import { corridorsAlongRoute, plannerMode } from "@/lib/route-intelligence";
import { buildArrivalPlan, type ArrivalPlanResult } from "@/lib/arrival-planner";
import type { ArrivalPlan } from "@/lib/arrival-plans-store";
import { cityflowApi } from "@/lib/cityflow-api";
import { dateAtMinute, downsample, eventDelayForTrip } from "@/lib/event-traffic";

export const Route = createFileRoute("/arrival-planner")({
  ssr: false,
  head: () => ({ meta: [{ title: "Plan Journey | CityFlow" }] }),
  component: ArrivalPlannerPage,
});

/** Today's date in the user's local time zone (toISOString would give the UTC date). */
function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dayOffsetFromDate(dateStr: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const picked = new Date(`${dateStr}T00:00:00`);
  const diff = Math.round((picked.getTime() - today.getTime()) / 86_400_000);
  return Math.min(7, Math.max(0, diff));
}

const DEFAULT_FORM: ArrivalFormState = {
  originText: "",
  origin: null,
  destinationText: "",
  destination: null,
  date: todayIso(),
  arrivalHour: 9,
  arrivalMinute: 0,
  mode: "driving",
  reliabilityTarget: 90,
  bufferMin: 0,
};

function ArrivalPlannerPage() {
  const { dark, toggleDark } = useTheme();
  const monitor = useArrivalPlanMonitor();
  const [form, setForm] = useState<ArrivalFormState>(DEFAULT_FORM);
  const [submitted, setSubmitted] = useState<ArrivalFormState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const update = (patch: Partial<ArrivalFormState>) => setForm((f) => ({ ...f, ...patch }));

  const routingMode = submitted ? plannerMode(submitted.mode).routing : "car";
  const routeQuery = useQuery({
    queryKey: [
      "arrival-route",
      submitted?.origin?.lat,
      submitted?.origin?.lon,
      submitted?.destination?.lat,
      submitted?.destination?.lon,
      routingMode,
    ],
    enabled: !!submitted?.origin && !!submitted?.destination,
    queryFn: () =>
      getRoute({
        data: {
          fromLat: submitted!.origin!.lat,
          fromLon: submitted!.origin!.lon,
          toLat: submitted!.destination!.lat,
          toLon: submitted!.destination!.lon,
          mode: routingMode,
        },
      }),
    staleTime: 5 * 60_000,
  });

  const weatherQuery = useQuery({
    queryKey: ["live-weather", submitted?.destination?.lat, submitted?.destination?.lon],
    enabled: !!submitted?.destination,
    queryFn: () =>
      getLiveWeather({
        data: {
          lat: submitted!.destination!.lat,
          lon: submitted!.destination!.lon,
          slug: "arrival-planner-destination",
        },
      }),
    staleTime: 5 * 60_000,
  });

  const corridors = useMemo(
    () => (routeQuery.data ? corridorsAlongRoute(routeQuery.data.primary.geometry) : []),
    [routeQuery.data],
  );

  // Scheduled events along the route in the hours before the deadline. The
  // planner adds their estimated delay to any departure that overlaps them.
  const deadlineMinute = submitted ? submitted.arrivalHour * 60 + submitted.arrivalMinute : 0;
  const eventsQuery = useQuery({
    queryKey: [
      "arrival-events",
      submitted?.date,
      deadlineMinute,
      routeQuery.data?.primary.distanceKm,
      routeQuery.data?.primary.geometry.length,
    ],
    enabled: !!submitted && !!routeQuery.data,
    queryFn: () =>
      cityflowApi.routeImpact(
        [{ id: "primary", geometry: downsample(routeQuery.data!.primary.geometry) }],
        dateAtMinute(submitted!.date, deadlineMinute - 8 * 60),
        dateAtMinute(submitted!.date, deadlineMinute),
      ),
    retry: false,
    staleTime: 60_000,
  });
  const routeEvents = eventsQuery.data?.routes[0]?.events;
  const eventDelayAt = useMemo(() => {
    if (!routeEvents?.length || !submitted) return undefined;
    return (_offset: number, departMinute: number, journeyMin: number) =>
      eventDelayForTrip(
        routeEvents,
        dateAtMinute(submitted.date, departMinute),
        dateAtMinute(submitted.date, departMinute + journeyMin),
      );
  }, [routeEvents, submitted]);

  const plan: ArrivalPlanResult | null = useMemo(() => {
    // Wait for the event check (success or failure) so the plan doesn't jump once it lands.
    if (!submitted || !routeQuery.data || !eventsQuery.isFetched) return null;
    return buildArrivalPlan({
      route: routeQuery.data,
      mode: submitted.mode,
      corridors,
      weather: weatherQuery.data,
      dayOffset: dayOffsetFromDate(submitted.date),
      targetHour: submitted.arrivalHour,
      targetMinute: submitted.arrivalMinute,
      reliabilityTarget: submitted.reliabilityTarget,
      bufferMin: submitted.bufferMin,
      approximateEndpoints:
        Number(submitted.origin?.approximate) + Number(submitted.destination?.approximate),
      eventDelayAt,
    });
  }, [
    submitted,
    routeQuery.data,
    weatherQuery.data,
    corridors,
    eventsQuery.isFetched,
    eventDelayAt,
  ]);

  const draft: ArrivalPlanDraft | null = useMemo(() => {
    if (!submitted?.origin || !submitted?.destination || !routeQuery.data) return null;
    return {
      origin: {
        text: submitted.originText,
        label: submitted.origin.label,
        lat: submitted.origin.lat,
        lon: submitted.origin.lon,
        approximate: submitted.origin.approximate,
      },
      destination: {
        text: submitted.destinationText,
        label: submitted.destination.label,
        lat: submitted.destination.lat,
        lon: submitted.destination.lon,
        approximate: submitted.destination.approximate,
      },
      mode: submitted.mode,
      reliabilityTarget: submitted.reliabilityTarget,
      bufferMin: submitted.bufferMin,
      arrivalTime: `${String(submitted.arrivalHour).padStart(2, "0")}:${String(submitted.arrivalMinute).padStart(2, "0")}`,
      primary: {
        distanceKm: routeQuery.data.primary.distanceKm,
        durationMin: routeQuery.data.primary.durationMin,
        corridorSlugs: corridors.map((c) => c.slug),
        live: routeQuery.data.live,
      },
      alternative: null,
    };
  }, [submitted, routeQuery.data, corridors]);

  const handleSubmit = () => {
    if (!form.origin || !form.destination) {
      setError("Resolve both a starting point and a destination first.");
      return;
    }
    setError(null);
    setSubmitted(form);
  };

  const loadSavedPlan = (saved: ArrivalPlan) => {
    const [h, m] = saved.arrivalTime.split(":").map(Number);
    const next: ArrivalFormState = {
      originText: saved.origin.text,
      origin: saved.origin,
      destinationText: saved.destination.text,
      destination: saved.destination,
      date: todayIso(),
      arrivalHour: h ?? 9,
      arrivalMinute: m ?? 0,
      mode: saved.mode,
      reliabilityTarget: saved.reliabilityTarget,
      bufferMin: saved.bufferMin,
    };
    setForm(next);
    setSubmitted(next);
  };

  const loading =
    routeQuery.isFetching ||
    (!!submitted && weatherQuery.isFetching && !weatherQuery.data) ||
    (eventsQuery.isFetching && !eventsQuery.isFetched);
  const routeError = routeQuery.isError
    ? "Couldn't reach the routing service. Please try again in a moment."
    : null;

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <DashboardSidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="cf-flowline sticky top-0 z-20 border-b border-border bg-surface-strong px-5 py-4 backdrop-blur-xl sm:px-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-extrabold tracking-normal">Plan Your Journey</h1>
              <p className="text-sm text-muted-foreground">
                Know when to leave, and how reliable that departure really is.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => toggleDark()}
                aria-label="Toggle theme"
              >
                {dark ? <Sun /> : <Moon />}
              </Button>
              <NotificationCenter />
            </div>
          </div>
        </header>

        <main className="cf-stagger mx-auto w-full max-w-[1400px] flex-1 space-y-6 px-5 py-6 sm:px-8">
          <JourneyModeSwitch active="arrive" />

          <ArrivalPlannerForm
            form={form}
            onChange={update}
            onSubmit={handleSubmit}
            loading={loading}
            error={error ?? routeError}
          />

          {!plan && submitted && loading && (
            <section className="glass-panel rounded-2xl p-6 text-center text-sm text-muted-foreground">
              Calculating your departure window…
            </section>
          )}

          {plan && (
            <>
              <ArrivalPredictionDashboard
                plan={plan}
                originText={submitted!.originText}
                destinationText={submitted!.destinationText}
                mode={submitted!.mode}
              />
              <EventImpactCard
                origin={submitted!.origin!}
                destination={submitted!.destination!}
                mode={submitted!.mode}
                route={routeQuery.data!}
                tripStart={dateAtMinute(submitted!.date, plan.recommended.departureMinute)}
                tripDurationMin={plan.recommended.journeyMin}
              />
              <DepartureComparison plan={plan} />
              <div className="grid gap-4 lg:grid-cols-2">
                <WhyThisDeparture plan={plan} />
                <RouteReliabilityCard plan={plan} />
              </div>
              <ArrivalTimeline plan={plan} />
            </>
          )}

          <SavedArrivalPlans draft={draft} monitor={monitor} onSelect={loadSavedPlan} />
        </main>
      </div>
    </div>
  );
}
