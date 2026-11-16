import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  CalendarClock,
  CheckCircle2,
  ExternalLink,
  Route,
  Ticket,
  TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cityflowApi, type EventOnRoute } from "@/lib/cityflow-api";
import {
  detourWaypoints,
  distinctivePoint,
  downsample,
  eventDelayForTrip,
  eventsDuringTrip,
  PHASE_LABEL,
  phaseDuringTrip,
} from "@/lib/event-traffic";
import { distanceKm } from "@/lib/locations";
import { openInGoogleMaps, plannerMode, type PlannerMode } from "@/lib/route-intelligence";
import { getRoute, type RouteOption, type RouteResult } from "@/lib/route-server";

type Place = { lat: number; lon: number; label: string };

/** A route is only worth suggesting if it saves at least this much. */
const MIN_SAVING_MIN = 5;

type Candidate = {
  name: string;
  route: RouteOption;
  events: EventOnRoute[];
  delayMin: number;
  /** Free-flow duration plus estimated event delay. */
  totalMin: number;
  waypoints: [number, number][];
};

const fmtTime = (iso: string | Date) =>
  new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
const fmtDay = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
const fmtMin = (m: number) => `${Math.round(m)} min`;

/**
 * Checks scheduled events (concerts, matches, expos) near a route during a
 * trip. If they slow the route down, suggests an alternative or a detour
 * around the venue.
 */
export function EventImpactCard({
  origin,
  destination,
  mode,
  route,
  tripStart,
  tripDurationMin,
}: {
  origin: Place;
  destination: Place;
  mode: PlannerMode;
  route: RouteResult;
  tripStart: Date;
  tripDurationMin: number;
}) {
  const tripEnd = new Date(tripStart.getTime() + tripDurationMin * 60_000);
  const options = [route.primary, ...route.alternatives];
  const routing = plannerMode(mode).routing;

  const impactQuery = useQuery({
    queryKey: [
      "event-impact",
      origin.lat,
      origin.lon,
      destination.lat,
      destination.lon,
      routing,
      tripStart.getTime(),
      Math.round(tripDurationMin),
    ],
    queryFn: () =>
      cityflowApi.routeImpact(
        options.map((r, i) => ({ id: String(i), geometry: downsample(r.geometry) })),
        tripStart,
        tripEnd,
      ),
    retry: false,
    staleTime: 60_000,
  });

  const candidates: Candidate[] = (impactQuery.data?.routes ?? []).map((impact, i) => {
    const r = options[i]!;
    const events = eventsDuringTrip(impact.events, tripStart, tripEnd);
    const delayMin = eventDelayForTrip(events, tripStart, tripEnd);
    const point = i === 0 ? null : distinctivePoint(r.geometry, route.primary.geometry);
    return {
      name: i === 0 ? "Usual route" : `Alternative ${i}`,
      route: r,
      events,
      delayMin,
      totalMin: r.durationMin + delayMin,
      waypoints: point ? [point] : [],
    };
  });
  const primary = candidates[0];

  // Besides OSRM's alternatives (which often still pass the venue), try a
  // route through a point beside the venue.
  const worstEvent = primary?.events.slice().sort((a, b) => b.delay_min - a.delay_min)[0];
  // When the trip starts or ends inside the venue's impact zone, every route passes it.
  const endpointNearVenue = worstEvent
    ? [
        { place: origin, role: "start" as const },
        { place: destination, role: "destination" as const },
      ].find(
        ({ place }) =>
          distanceKm(place, worstEvent.event.venue) <= worstEvent.event.venue.impact_radius_km,
      )
    : undefined;
  const detourQuery = useQuery({
    queryKey: [
      "event-detour",
      worstEvent?.event.id,
      origin.lat,
      origin.lon,
      destination.lat,
      destination.lon,
      routing,
      tripStart.getTime(),
    ],
    enabled: !!worstEvent && !endpointNearVenue,
    retry: false,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Candidate | null> => {
      const venue = worstEvent!.event.venue;
      const detours = await Promise.all(
        detourWaypoints(venue, route.primary.geometry).map(async (via) => {
          const result = await getRoute({
            data: {
              fromLat: origin.lat,
              fromLon: origin.lon,
              toLat: destination.lat,
              toLon: destination.lon,
              mode: routing,
              via,
            },
          });
          return result.live ? { via, route: result.primary } : null;
        }),
      );
      const found = detours.filter((d) => d !== null);
      if (!found.length) return null;
      const impact = await cityflowApi.routeImpact(
        found.map((d, i) => ({ id: String(i), geometry: downsample(d.route.geometry) })),
        tripStart,
        tripEnd,
      );
      const scored = found.map((d, i) => {
        const events = eventsDuringTrip(impact.routes[i]?.events ?? [], tripStart, tripEnd);
        const delayMin = eventDelayForTrip(events, tripStart, tripEnd);
        return {
          name: `Detour around ${venue.name}`,
          route: d.route,
          events,
          delayMin,
          totalMin: d.route.durationMin + delayMin,
          waypoints: [d.via],
        };
      });
      return scored.sort((a, b) => a.totalMin - b.totalMin)[0] ?? null;
    },
  });
  // Only suggest a route that's meaningfully faster while the event is on.
  const suggestion = primary
    ? [...candidates.slice(1), ...(detourQuery.data ? [detourQuery.data] : [])]
        .filter((c) => primary.totalMin - c.totalMin >= MIN_SAVING_MIN)
        .sort((a, b) => a.totalMin - b.totalMin)[0]
    : undefined;

  return (
    <section className="glass-panel rounded-2xl p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-violet">
            Events on your route
          </p>
          <h3 className="mt-1 text-lg font-extrabold">Concerts, matches &amp; big events</h3>
          <p className="text-xs text-muted-foreground">
            Trip window {fmtTime(tripStart)} – {fmtTime(tripEnd)} ·{" "}
            {tripStart.toLocaleDateString("en-IN", {
              weekday: "short",
              day: "numeric",
              month: "short",
            })}
          </p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link to="/events">
            <Ticket className="size-4" /> Manage events
          </Link>
        </Button>
      </div>

      {impactQuery.isPending ? (
        <div className="mt-4 h-16 animate-pulse rounded-xl bg-secondary" />
      ) : impactQuery.isError ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Event checks need the CityFlow backend, which isn&apos;t reachable right now.
        </p>
      ) : !primary || primary.events.length === 0 ? (
        <p className="mt-4 flex items-center gap-2 rounded-xl border border-border bg-surface-strong p-3 text-sm">
          <CheckCircle2 className="size-4 shrink-0 text-success" />
          No scheduled events near your route during this trip.
        </p>
      ) : (
        <div className="mt-4 space-y-4">
          <div className="rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm">
            <p className="flex items-center gap-2 font-bold">
              <TriangleAlert className="size-4 shrink-0 text-warning" />
              Expect about +{fmtMin(primary.delayMin)} on your usual route
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Estimated from each event&apos;s crowd size, how close the route passes the venue, and
              whether you&apos;d pass while the crowd is arriving or leaving.
            </p>
          </div>

          <ul className="space-y-2">
            {primary.events.map((ev) => {
              const phase = phaseDuringTrip(ev, tripStart, tripEnd);
              return (
                <li
                  key={ev.event.id}
                  className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-border bg-surface-strong p-3"
                >
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 text-sm font-bold">
                      <CalendarClock className="size-4 shrink-0 text-brand-violet" />
                      {ev.event.title}
                      {ev.event.url && (
                        <a
                          href={ev.event.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-muted-foreground hover:text-foreground"
                          aria-label="Event listing"
                        >
                          <ExternalLink className="size-3.5" />
                        </a>
                      )}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {ev.event.venue.name} · {fmtDay(ev.event.starts_at)},{" "}
                      {fmtTime(ev.event.starts_at)} – {fmtTime(ev.event.ends_at)} · ~
                      {ev.event.expected_attendance.toLocaleString("en-IN")} people · route passes{" "}
                      {ev.distance_km < 0.1 ? "right by" : `${ev.distance_km} km from`} the venue
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-extrabold text-warning">
                      +{fmtMin(eventDelayForTrip([ev], tripStart, tripEnd))}
                    </p>
                    {phase && (
                      <p className="text-[11px] text-muted-foreground">{PHASE_LABEL[phase]}</p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>

          {suggestion ? (
            <div className="rounded-xl border border-success/40 bg-success/10 p-4">
              <p className="flex items-center gap-2 text-sm font-bold">
                <Route className="size-4 text-success" /> Suggested: {suggestion.name}
              </p>
              <div className="mt-2 grid gap-2 text-xs sm:grid-cols-3">
                <Compare label="Usual route" c={primary} />
                <Compare label={suggestion.name} c={suggestion} highlight />
                <p className="self-center text-muted-foreground">
                  Saves about {fmtMin(primary.totalMin - suggestion.totalMin)} while the event is on
                  {suggestion.events.length === 0 ? " and avoids it entirely" : ""}.
                </p>
              </div>
              <Button
                size="sm"
                className="mt-3 bg-gradient-brand text-white"
                onClick={() =>
                  openInGoogleMaps(
                    `${origin.lat},${origin.lon}`,
                    `${destination.lat},${destination.lon}`,
                    mode,
                    suggestion.waypoints,
                  )
                }
              >
                Open this route in Google Maps
              </Button>
            </div>
          ) : endpointNearVenue && worstEvent ? (
            <p className="rounded-xl border border-border bg-surface-strong p-3 text-xs text-muted-foreground">
              Your {endpointNearVenue.role} is{" "}
              {distanceKm(endpointNearVenue.place, worstEvent.event.venue).toFixed(1)} km from{" "}
              {worstEvent.event.venue.name}, so every route passes through the crowd. Leaving
              earlier (or travelling after the crowd clears) is the way to avoid it.
            </p>
          ) : detourQuery.isFetching ? (
            <p className="text-xs text-muted-foreground">Looking for a way around the venue…</p>
          ) : (
            <p className="rounded-xl border border-border bg-surface-strong p-3 text-xs text-muted-foreground">
              No faster way around was found — the detours are longer than the expected delay.
              Leaving earlier is the better option.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function Compare({ label, c, highlight }: { label: string; c: Candidate; highlight?: boolean }) {
  return (
    <div className={`rounded-lg border p-2 ${highlight ? "border-success/40" : "border-border"}`}>
      <p className="font-semibold">{label}</p>
      <p className="text-muted-foreground">
        {c.route.distanceKm.toFixed(1)} km · {fmtMin(c.route.durationMin)} drive
        {c.delayMin > 0 ? ` + ${fmtMin(c.delayMin)} event delay` : " · no event delay"}
      </p>
    </div>
  );
}
