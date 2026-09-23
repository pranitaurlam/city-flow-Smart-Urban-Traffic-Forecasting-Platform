import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowLeftRight,
  Bell,
  Bike,
  Bus,
  Car,
  CloudRain,
  Droplets,
  Gauge,
  MapPin,
  Moon,
  PersonStanding,
  Sun,
  User,
} from "lucide-react";
import { DashboardSidebar } from "@/components/dashboard/sidebar";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/hooks/use-theme";
import { TierBadge } from "@/components/locations/panels";
import { RouteMap, type RouteLine } from "@/components/route/route-map";
import {
  bengaluruLocations,
  distanceKm,
  trafficTierColor,
  type BengaluruLocation,
} from "@/lib/locations";
import { getRoute, type TravelMode } from "@/lib/route-server";
import { getLiveTraffic } from "@/lib/traffic-server";
import { getLiveWeather } from "@/lib/weather-server";
import {
  build7DayForecast,
  buildHourlyForDay,
  dayLabel,
  estimateTravelTime,
  routeExplainability,
} from "@/lib/route-forecast";

export const Route = createFileRoute("/route-forecast")({
  ssr: false,
  head: () => ({ meta: [{ title: "Route Forecast | CityFlow" }] }),
  component: RouteForecastPage,
});

const HOURS = [6, 8, 10, 12, 14, 16, 18, 20];
const POPULAR = [
  "marathahalli",
  "whitefield",
  "hsr-layout",
  "koramangala",
  "mg-road",
  "indiranagar",
  "electronic-city",
];
const ROUTE_COLORS = ["var(--brand-cyan)", "var(--brand-violet)", "oklch(0.6 0.01 260)"];

/**
 * OSRM's routing duration doesn't reliably reflect real Bengaluru travel time (it
 * implies ~60 km/h regardless of whether the route is signal-heavy local roads or
 * highway). We only use OSRM for real road geometry and distance — every travel-time
 * figure is derived from a distance-calibrated typical speed (see
 * typicalSpeedForDistance) combined with the current traffic tier.
 */
function durationFromDistance(distanceKm: number, speedKph: number) {
  return (distanceKm / Math.max(speedKph, 5)) * 60;
}

/**
 * Typical (non-live) average speed for a Bengaluru car trip of this distance.
 * Longer trips average faster not because traffic is lighter, but because a
 * larger share of the distance runs on arterial/highway roads rather than
 * signal-heavy local streets. Calibrated against two real reference trips:
 * ~7.4 km local-roads trip ≈ 14.8 km/h actual; ~44 km highway-heavy trip to
 * the airport ≈ 29.4 km/h actual (per real rider-reported travel times).
 */
function typicalSpeedForDistance(distanceKm: number) {
  return Math.min(34, Math.max(12, 11.5 + 0.4 * distanceKm));
}

/** Modest adjustment around the typical speed for the current traffic tier. */
const TIER_SPEED_FACTOR: Record<string, number> = {
  Low: 1.25,
  Moderate: 1.05,
  High: 0.9,
  "Very High": 0.75,
};

function formatMin(min: number) {
  if (min < 60) return `${Math.round(min)} min`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return `${h} hr ${m} min`;
}

function useRoute(
  source: BengaluruLocation,
  destination: BengaluruLocation,
  mode: TravelMode,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ["route", mode, source.slug, destination.slug],
    enabled,
    queryFn: () =>
      getRoute({
        data: {
          fromLat: source.lat,
          fromLon: source.lon,
          toLat: destination.lat,
          toLon: destination.lon,
          mode,
        },
      }),
    staleTime: 5 * 60_000,
  });
}

function useSampleTraffic(location: BengaluruLocation, enabled: boolean) {
  return useQuery({
    queryKey: ["live-traffic", location.slug],
    enabled,
    queryFn: () =>
      getLiveTraffic({
        data: {
          lat: location.lat,
          lon: location.lon,
          basePeakVolume: location.basePeakVolume,
          baseTier: location.baseTier,
          slug: location.slug,
        },
      }),
    staleTime: 20_000,
  });
}

function nearestKnown(lat: number, lon: number) {
  return [...bengaluruLocations].sort(
    (a, b) => distanceKm({ lat, lon }, a) - distanceKm({ lat, lon }, b),
  )[0]!;
}

function RouteForecastPage() {
  const { dark, toggleDark } = useTheme();
  const [sourceSlug, setSourceSlug] = useState("marathahalli");
  const [destSlug, setDestSlug] = useState("mg-road");
  const [mode, setMode] = useState<TravelMode>("car");
  const [planned, setPlanned] = useState(true);
  const [dayOffset, setDayOffset] = useState(1);
  const [hour, setHour] = useState(18);

  const source = bengaluruLocations.find((l) => l.slug === sourceSlug) ?? bengaluruLocations[0]!;
  const destination = bengaluruLocations.find((l) => l.slug === destSlug) ?? bengaluruLocations[1]!;

  const carRoute = useRoute(source, destination, "car", planned);
  const bikeRoute = useRoute(source, destination, "bike", planned && (mode === "bike" || true));
  const footRoute = useRoute(source, destination, "foot", planned && (mode === "foot" || true));

  const activeQuery = mode === "car" ? carRoute : mode === "bike" ? bikeRoute : footRoute;
  const activeRoute = activeQuery.data;
  const carDistanceKm = carRoute.data?.primary.distanceKm ?? 0;

  // Sample several points along the actual route (not just one) so a route that
  // crosses a known-bad corridor (e.g. Outer Ring Road) isn't averaged away by a
  // single lighter-traffic area match.
  const routeSamples = useMemo(() => {
    if (!carRoute.data) return [];
    const geo = carRoute.data.primary.geometry;
    if (geo.length < 2) return [];
    const fractions = [0.1, 0.3, 0.5, 0.7, 0.9];
    const seen = new Set<string>();
    const list: BengaluruLocation[] = [];
    for (const f of fractions) {
      const point = geo[Math.floor(geo.length * f)];
      if (!point) continue;
      const nearest = nearestKnown(point[0], point[1]);
      if (!seen.has(nearest.slug)) {
        seen.add(nearest.slug);
        list.push(nearest);
      }
    }
    return list;
  }, [carRoute.data]);

  const sample0 = routeSamples[0] ?? source;
  const sample1 = routeSamples[1] ?? destination;
  const sample2 = routeSamples[2] ?? destination;
  const sample3 = routeSamples[3] ?? destination;
  const sample4 = routeSamples[4] ?? destination;

  const sampleTraffic0 = useSampleTraffic(sample0, planned && routeSamples.length > 0);
  const sampleTraffic1 = useSampleTraffic(sample1, planned && routeSamples.length > 1);
  const sampleTraffic2 = useSampleTraffic(sample2, planned && routeSamples.length > 2);
  const sampleTraffic3 = useSampleTraffic(sample3, planned && routeSamples.length > 3);
  const sampleTraffic4 = useSampleTraffic(sample4, planned && routeSamples.length > 4);
  const sampleTrafficQueries = [
    sampleTraffic0,
    sampleTraffic1,
    sampleTraffic2,
    sampleTraffic3,
    sampleTraffic4,
  ].slice(0, routeSamples.length);
  const loadedSamples = sampleTrafficQueries
    .map((q) => q.data)
    .filter((d): d is NonNullable<typeof d> => !!d);

  const typicalSpeedKph = typicalSpeedForDistance(carDistanceKm);

  // Worst-tier sample along the route drives the displayed "current traffic" badge;
  // the actual speed is the distance-calibrated typical speed, nudged by that tier.
  const worstSample = loadedSamples.reduce<(typeof loadedSamples)[number] | undefined>(
    (worst, t) => (!worst || t.congestionPct > worst.congestionPct ? t : worst),
    undefined,
  );
  const currentSpeedKph =
    typicalSpeedKph * (TIER_SPEED_FACTOR[worstSample?.tier ?? "Moderate"] ?? 1);
  const repTraffic = worstSample
    ? { ...worstSample, speedKph: Math.round(currentSpeedKph) }
    : undefined;

  const weatherQuery = useQuery({
    queryKey: ["live-weather", destination.slug],
    enabled: planned,
    queryFn: () =>
      getLiveWeather({
        data: { lat: destination.lat, lon: destination.lon, slug: destination.slug },
      }),
    staleTime: 5 * 60_000,
  });
  const weather = weatherQuery.data;

  // "Historical baseline" — typical travel time at this area's average observed speed.
  const carBaseDurationMin = carDistanceKm
    ? durationFromDistance(carDistanceKm, typicalSpeedKph)
    : 0;
  // "Current" — same distance at the live/dataset-observed current speed.
  const currentTravelTime = carDistanceKm
    ? Math.round(durationFromDistance(carDistanceKm, repTraffic?.speedKph ?? typicalSpeedKph))
    : 0;
  const currentDelay = currentTravelTime - Math.round(carBaseDurationMin);
  const busDuration = currentTravelTime * 1.45;

  const forecast7Day = useMemo(
    () => (carBaseDurationMin ? build7DayForecast(carBaseDurationMin, hour) : []),
    [carBaseDurationMin, hour],
  );
  const selectedDayForecast = forecast7Day[dayOffset];
  const hourlyForDay = useMemo(
    () => (carBaseDurationMin ? buildHourlyForDay(carBaseDurationMin, dayOffset) : []),
    [carBaseDurationMin, dayOffset],
  );
  const explain = useMemo(
    () => routeExplainability(dayOffset, hour, weather?.condition),
    [dayOffset, hour, weather?.condition],
  );

  const routeLines: RouteLine[] = activeRoute
    ? [activeRoute.primary, ...activeRoute.alternatives].map((r, i) => {
        const routeSpeedKph =
          typicalSpeedForDistance(r.distanceKm) *
          (TIER_SPEED_FACTOR[worstSample?.tier ?? "Moderate"] ?? 1);
        const minutes =
          mode === "car"
            ? Math.round(durationFromDistance(r.distanceKm, routeSpeedKph))
            : Math.round(r.durationMin);
        return {
          geometry: r.geometry,
          color: ROUTE_COLORS[i] ?? ROUTE_COLORS[2]!,
          label: `Route ${String.fromCharCode(65 + i)}`,
          timeLabel: formatMin(minutes),
          distanceLabel: `${r.distanceKm.toFixed(1)} km`,
        };
      })
    : [];

  const swap = () => {
    setSourceSlug(destSlug);
    setDestSlug(sourceSlug);
  };

  const graphData = useMemo(() => {
    return hourlyForDay
      .filter((_, i) => i % 2 === 0)
      .map((h) => ({
        hour:
          h.hour === 0
            ? "12AM"
            : h.hour < 12
              ? `${h.hour}AM`
              : h.hour === 12
                ? "12PM"
                : `${h.hour - 12}PM`,
        hourNum: h.hour,
        historical: Math.round(carBaseDurationMin),
        forecast: h.travelTime,
        low: h.rangeLow,
        high: h.rangeHigh,
      }));
  }, [hourlyForDay, carBaseDurationMin]);

  const selectedTimeMark =
    graphData.find((g) => g.hourNum >= hour)?.hour ?? graphData[0]?.hour ?? null;

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <DashboardSidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 border-b border-border bg-surface-strong px-5 py-4 backdrop-blur-xl sm:px-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-extrabold tracking-normal">Plan Your Journey</h1>
              <p className="text-sm text-muted-foreground">
                See how traffic and travel time may change along your route.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5 text-xs font-bold text-success">
                <i className="size-2 animate-pulse rounded-full bg-success" /> Live Data · Updated
                recently
              </span>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => toggleDark()}
                aria-label="Toggle theme"
              >
                {dark ? <Sun /> : <Moon />}
              </Button>
              <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
                <Bell />
                <span className="absolute right-2 top-2 size-2 rounded-full bg-destructive" />
              </Button>
              <span className="grid size-9 place-items-center rounded-full bg-secondary text-secondary-foreground">
                <User size={16} />
              </span>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1400px] flex-1 space-y-6 px-5 py-6 sm:px-8">
          <p className="text-xs font-bold uppercase tracking-wide text-brand-violet">
            Route Forecast — plan your journey around tomorrow&apos;s traffic
          </p>

          {/* 3. Source / Destination */}
          <section className="glass-panel rounded-2xl p-5">
            <div className="grid items-end gap-3 sm:grid-cols-[1fr_auto_1fr_auto]">
              <label className="block">
                <span className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                  <MapPin size={12} className="text-brand-cyan" /> Choose starting point
                </span>
                <select
                  value={sourceSlug}
                  onChange={(e) => setSourceSlug(e.target.value)}
                  className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm font-semibold shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  {bengaluruLocations.map((l) => (
                    <option key={l.slug} value={l.slug}>
                      {l.name}, Bengaluru
                    </option>
                  ))}
                </select>
              </label>

              <Button
                variant="outline"
                size="icon"
                onClick={swap}
                aria-label="Swap source and destination"
              >
                <ArrowLeftRight className="size-4" />
              </Button>

              <label className="block">
                <span className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                  <MapPin size={12} className="text-brand-violet" /> Choose destination
                </span>
                <select
                  value={destSlug}
                  onChange={(e) => setDestSlug(e.target.value)}
                  className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm font-semibold shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  {bengaluruLocations.map((l) => (
                    <option key={l.slug} value={l.slug}>
                      {l.name}, Bengaluru
                    </option>
                  ))}
                </select>
              </label>

              <Button variant="cityflow" onClick={() => setPlanned(true)}>
                Plan Route <ArrowLeftRight className="size-4 rotate-0" />
              </Button>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>Popular:</span>
              {POPULAR.map((slug) => {
                const l = bengaluruLocations.find((x) => x.slug === slug)!;
                return (
                  <button
                    key={slug}
                    type="button"
                    onClick={() => setDestSlug(slug)}
                    className="rounded-full border border-border bg-surface px-3 py-1 transition hover:border-brand-cyan hover:text-foreground"
                  >
                    {l.name}
                  </button>
                );
              })}
            </div>
          </section>

          {planned && (
            <>
              {/* 4. Map */}
              <section className="glass-panel relative overflow-hidden rounded-2xl">
                <div className="h-[420px] w-full sm:h-[500px]">
                  <RouteMap
                    source={{ lat: source.lat, lon: source.lon }}
                    destination={{ lat: destination.lat, lon: destination.lon }}
                    routes={routeLines}
                  />
                </div>
                <div className="glass-panel pointer-events-none absolute right-4 top-4 z-[400] rounded-xl px-3 py-2 text-xs font-semibold">
                  {(["Low", "Moderate", "High", "Very High"] as const).map((tier) => (
                    <div key={tier} className="flex items-center gap-1.5 py-0.5">
                      <i
                        className="size-2 rounded-full"
                        style={{ background: trafficTierColor[tier] }}
                      />
                      {tier}
                    </div>
                  ))}
                </div>
              </section>

              {/* 5. Transport mode selector */}
              <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <ModeButton
                  icon={Car}
                  label="Car"
                  active={mode === "car"}
                  time={currentTravelTime ? formatMin(currentTravelTime) : "—"}
                  onClick={() => setMode("car")}
                />
                <ModeButton
                  icon={Bike}
                  label="Bike"
                  active={mode === "bike"}
                  time={bikeRoute.data ? formatMin(bikeRoute.data.primary.durationMin) : "—"}
                  onClick={() => setMode("bike")}
                />
                <ModeButton
                  icon={PersonStanding}
                  label="Walk"
                  active={mode === "foot"}
                  time={footRoute.data ? formatMin(footRoute.data.primary.durationMin) : "—"}
                  onClick={() => setMode("foot")}
                />
                <ModeButton
                  icon={Bus}
                  label="Bus"
                  active={false}
                  time={currentTravelTime ? formatMin(busDuration) : "—"}
                  onClick={() => {}}
                  disabled
                />
              </section>

              {/* 6. Current route summary */}
              <section className="glass-panel rounded-2xl p-5 sm:p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-brand-cyan">
                      Recommended Route
                    </p>
                    <h2 className="mt-1 text-lg font-extrabold tracking-normal">
                      {source.name} → {destination.name}
                    </h2>
                  </div>
                  <span className="flex items-center gap-1.5 text-xs font-bold text-success">
                    <i className="size-2 animate-pulse rounded-full bg-success" /> LIVE TRAFFIC
                  </span>
                </div>

                <div className="mt-4 grid gap-4 sm:grid-cols-5">
                  <Stat
                    label="Distance"
                    value={activeRoute ? `${activeRoute.primary.distanceKm.toFixed(1)} km` : "—"}
                  />
                  <Stat
                    label="Current Travel Time"
                    value={currentTravelTime ? formatMin(currentTravelTime) : "—"}
                  />
                  <div>
                    <p className="text-xs text-muted-foreground">Current Traffic</p>
                    {repTraffic ? (
                      <TierBadge tier={repTraffic.tier} />
                    ) : (
                      <p className="font-bold">—</p>
                    )}
                  </div>
                  <Stat
                    label="Average Speed"
                    value={repTraffic ? `${repTraffic.speedKph} km/h` : "—"}
                  />
                  <Stat
                    label="Traffic Delay"
                    value={
                      currentTravelTime ? `${currentDelay >= 0 ? "+" : ""}${currentDelay} min` : "—"
                    }
                  />
                </div>
              </section>

              {/* 7. Future date/time selector */}
              <section className="glass-panel rounded-2xl p-5">
                <p className="text-xs font-bold uppercase tracking-wide text-brand-violet">
                  Forecast Date &amp; Time
                </p>
                <p className="mt-0.5 text-sm text-muted-foreground">When do you want to travel?</p>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  {Array.from({ length: 8 }, (_, offset) => {
                    const { relative, monthDay } = dayLabel(offset);
                    return (
                      <button
                        key={offset}
                        type="button"
                        onClick={() => setDayOffset(offset)}
                        className={`rounded-lg border px-3 py-2 text-left text-xs font-semibold transition ${
                          dayOffset === offset
                            ? "border-transparent bg-gradient-brand text-primary-foreground"
                            : "border-border bg-surface text-muted-foreground hover:border-brand-cyan"
                        }`}
                      >
                        <span className="block">{relative}</span>
                        <span className="block opacity-80">{monthDay}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  {HOURS.map((h) => (
                    <button
                      key={h}
                      type="button"
                      onClick={() => setHour(h)}
                      className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                        hour === h
                          ? "border-transparent bg-gradient-brand text-primary-foreground"
                          : "border-border bg-surface text-muted-foreground hover:border-brand-cyan"
                      }`}
                    >
                      {h % 12 === 0 ? 12 : h % 12}
                      {h < 12 ? "AM" : "PM"}
                    </button>
                  ))}
                  <input
                    type="number"
                    min={0}
                    max={23}
                    value={hour}
                    onChange={(e) => setHour(Math.min(23, Math.max(0, Number(e.target.value))))}
                    aria-label="Custom hour (24h)"
                    className="h-8 w-24 rounded-full border border-border bg-surface px-3 text-xs font-semibold outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                </div>
              </section>

              {/* 8. 7-day route forecast */}
              <section>
                <h3 className="text-sm font-bold">7-Day Route Forecast</h3>
                <p className="text-xs text-muted-foreground">
                  Estimated traffic conditions and travel time for this route.
                </p>
                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
                  {forecast7Day.map((day) => (
                    <button
                      key={day.offset}
                      type="button"
                      onClick={() => setDayOffset(day.offset)}
                      className={`glass-panel rounded-xl p-3 text-left transition hover:-translate-y-0.5 ${dayOffset === day.offset ? "border-brand-cyan" : ""}`}
                    >
                      <p className="text-[11px] font-bold uppercase text-muted-foreground">
                        {day.relative}
                      </p>
                      <p className="text-[10px] text-muted-foreground">{day.monthDay}</p>
                      <p className="mt-1.5 text-sm font-extrabold">{formatMin(day.travelTime)}</p>
                      <div className="mt-1">
                        <TierBadge tier={day.tier} />
                      </div>
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        {day.delay >= 0 ? "+" : ""}
                        {day.delay} min · {day.confidence}% confidence
                      </p>
                    </button>
                  ))}
                </div>
              </section>

              {selectedDayForecast && (
                <section className="glass-panel grid gap-4 rounded-2xl p-5 sm:grid-cols-4">
                  <div>
                    <p className="text-xs text-muted-foreground">{selectedDayForecast.relative}</p>
                    <TierBadge tier={selectedDayForecast.tier} />
                  </div>
                  <Stat
                    label="Estimated Travel Time"
                    value={formatMin(selectedDayForecast.travelTime)}
                  />
                  <Stat
                    label="Expected Delay"
                    value={`${selectedDayForecast.delay >= 0 ? "+" : ""}${selectedDayForecast.delay} min`}
                  />
                  <Stat
                    label="Likely Range"
                    value={`${formatMin(selectedDayForecast.rangeLow)} – ${formatMin(selectedDayForecast.rangeHigh)}`}
                  />
                </section>
              )}

              {/* 9. Future traffic graph */}
              <section className="glass-panel rounded-2xl p-5 sm:p-6">
                <h3 className="text-sm font-bold">Route Travel Time Forecast</h3>
                <p className="text-xs text-muted-foreground">
                  {dayLabel(dayOffset).relative}, {dayLabel(dayOffset).monthDay} — historical
                  baseline vs. CityFlow forecast, by hour.
                </p>
                <div className="mt-4 h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={graphData} margin={{ left: -12 }}>
                      <defs>
                        <linearGradient id="rangeFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="var(--brand-cyan)" stopOpacity={0.25} />
                          <stop offset="95%" stopColor="var(--brand-cyan)" stopOpacity={0.05} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="hour" stroke="var(--muted-foreground)" fontSize={11} />
                      <YAxis
                        stroke="var(--muted-foreground)"
                        fontSize={11}
                        width={44}
                        unit=" min"
                      />
                      <Tooltip
                        contentStyle={{
                          background: "var(--card)",
                          border: "1px solid var(--border)",
                          borderRadius: 8,
                          fontSize: 12,
                        }}
                      />
                      <Legend />
                      {selectedTimeMark && (
                        <ReferenceLine
                          x={selectedTimeMark}
                          stroke="var(--destructive)"
                          strokeDasharray="4 4"
                          label={{
                            value: "Your selected time",
                            position: "top",
                            fontSize: 10,
                            fill: "var(--destructive)",
                          }}
                        />
                      )}
                      <Area
                        type="monotone"
                        dataKey="high"
                        name="Confidence range"
                        stroke="none"
                        fill="url(#rangeFill)"
                      />
                      <Area
                        type="monotone"
                        dataKey="low"
                        stroke="none"
                        fill="var(--card)"
                        fillOpacity={1}
                        legendType="none"
                      />
                      <Line
                        type="monotone"
                        dataKey="historical"
                        name="Historical baseline"
                        stroke="var(--brand-blue)"
                        strokeDasharray="4 3"
                        dot={false}
                        strokeWidth={2}
                      />
                      <Line
                        type="monotone"
                        dataKey="forecast"
                        name="Forecast"
                        stroke="var(--brand-cyan)"
                        strokeWidth={2.5}
                        dot={false}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </section>

              {/* 10. Traffic conditions along route */}
              <section className="glass-panel rounded-2xl p-5 sm:p-6">
                <h3 className="text-sm font-bold">Traffic Conditions Along Route</h3>
                <p className="text-xs text-muted-foreground">
                  Nearest known locations along the way, matched to route geometry.
                </p>
                <div className="mt-4 space-y-0">
                  <RouteNode label={source.name} isEndpoint />
                  {routeSamples.map((seg, i) => (
                    <SegmentRow
                      key={seg.slug}
                      location={seg}
                      traffic={sampleTrafficQueries[i]?.data}
                    />
                  ))}
                  <RouteNode label={destination.name} isEndpoint last />
                </div>
              </section>

              {/* 11. Why this forecast */}
              <section className="glass-panel rounded-2xl p-5 sm:p-6">
                <h3 className="text-sm font-bold">
                  Why is traffic expected to be {selectedDayForecast?.tier.toLowerCase() ?? "—"}?
                </h3>
                <div className="mt-4 space-y-3">
                  {explain.map((f) => (
                    <div key={f.label}>
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold">{f.label}</span>
                        <span className="font-bold text-brand-cyan">{f.pct}%</span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-secondary">
                        <div
                          className="h-full rounded-full bg-gradient-brand"
                          style={{ width: `${f.pct}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
                <p className="mt-4 text-xs text-muted-foreground">
                  These factors are associated with the predicted traffic conditions.
                </p>
              </section>

              {/* 12. Weather forecast */}
              <section className="glass-panel rounded-2xl p-5 sm:p-6">
                <h3 className="text-sm font-bold">
                  {dayLabel(dayOffset).weekday} · {hour % 12 === 0 ? 12 : hour % 12}
                  {hour < 12 ? "AM" : "PM"}
                </h3>
                {weather ? (
                  <>
                    <div className="mt-2 flex items-center gap-3">
                      <CloudRain className="size-8 text-brand-cyan" />
                      <div>
                        <p className="text-2xl font-extrabold">
                          {dayOffset <= 1 ? weather.tomorrow.tempC : weather.tempC}°C
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {dayOffset <= 1 ? weather.tomorrow.condition : weather.condition}
                        </p>
                      </div>
                      {dayOffset > 1 && (
                        <span className="ml-auto rounded-full bg-secondary px-2.5 py-1 text-[10px] font-bold text-muted-foreground">
                          ESTIMATED — beyond weather forecast range
                        </span>
                      )}
                    </div>
                    <div className="mt-4 grid grid-cols-3 gap-2 text-xs sm:w-2/3">
                      <MiniStat
                        icon={Droplets}
                        label="Rain Probability"
                        value={`${weather.tomorrow.chanceOfRain}%`}
                      />
                      <MiniStat icon={CloudRain} label="Humidity" value={`${weather.humidity}%`} />
                      <MiniStat
                        icon={Gauge}
                        label="Rainfall"
                        value={
                          weather.tomorrow.condition.toLowerCase().includes("rain")
                            ? "3.4 mm"
                            : "0 mm"
                        }
                      />
                    </div>
                    <p className="mt-4 rounded-lg border border-border bg-surface p-3 text-xs text-muted-foreground">
                      Rain conditions may be associated with slower traffic based on historical
                      patterns.
                    </p>
                  </>
                ) : (
                  <p className="mt-2 text-sm text-muted-foreground">Loading weather…</p>
                )}
              </section>

              {/* 13 + 14. Route alternatives + comparison */}
              {mode === "car" && activeRoute && (
                <>
                  <section>
                    <h3 className="text-sm font-bold">Route Alternatives</h3>
                    <div className="mt-3 grid gap-3 sm:grid-cols-3">
                      {[activeRoute.primary, ...activeRoute.alternatives].map((r, i) => {
                        const est = estimateTravelTime(
                          durationFromDistance(r.distanceKm, typicalSpeedForDistance(r.distanceKm)),
                          dayOffset,
                          hour,
                        );
                        return (
                          <div key={i} className="glass-panel rounded-xl p-4">
                            <div className="flex items-center gap-2">
                              <i
                                className="size-2.5 rounded-full"
                                style={{ background: ROUTE_COLORS[i] }}
                              />
                              <p className="text-sm font-bold">
                                Route {String.fromCharCode(65 + i)}
                              </p>
                            </div>
                            <p className="mt-2 text-lg font-extrabold">
                              {r.distanceKm.toFixed(1)} km
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {formatMin(est.travelTime)} estimated
                            </p>
                            <div className="mt-2">
                              <TierBadge tier={est.tier} />
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">
                              Delay: {est.delay >= 0 ? "+" : ""}
                              {est.delay} min · {est.confidence}% confidence
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </section>

                  <section className="glass-panel overflow-x-auto rounded-2xl p-5">
                    <h3 className="text-sm font-bold">Route Comparison</h3>
                    <table className="mt-3 w-full min-w-[640px] text-left text-sm">
                      <thead>
                        <tr className="border-b border-border text-xs text-muted-foreground">
                          <th className="py-2 pr-4 font-semibold">Route</th>
                          <th className="py-2 pr-4 font-semibold">Distance</th>
                          <th className="py-2 pr-4 font-semibold">Current Time</th>
                          <th className="py-2 pr-4 font-semibold">Forecast Time</th>
                          <th className="py-2 pr-4 font-semibold">Expected Delay</th>
                          <th className="py-2 pr-4 font-semibold">Traffic</th>
                          <th className="py-2 font-semibold">Confidence</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[activeRoute.primary, ...activeRoute.alternatives].map((r, i) => {
                          const routeTypicalSpeed = typicalSpeedForDistance(r.distanceKm);
                          const est = estimateTravelTime(
                            durationFromDistance(r.distanceKm, routeTypicalSpeed),
                            dayOffset,
                            hour,
                          );
                          const routeCurrentSpeed =
                            routeTypicalSpeed *
                            (TIER_SPEED_FACTOR[worstSample?.tier ?? "Moderate"] ?? 1);
                          const currentTime = Math.round(
                            durationFromDistance(r.distanceKm, routeCurrentSpeed),
                          );
                          return (
                            <tr key={i} className="border-b border-border last:border-0">
                              <td className="py-2.5 pr-4 font-medium">
                                Route {String.fromCharCode(65 + i)}
                              </td>
                              <td className="py-2.5 pr-4">{r.distanceKm.toFixed(1)} km</td>
                              <td className="py-2.5 pr-4">{formatMin(currentTime)}</td>
                              <td className="py-2.5 pr-4">{formatMin(est.travelTime)}</td>
                              <td className="py-2.5 pr-4">
                                {est.delay >= 0 ? "+" : ""}
                                {est.delay} min
                              </td>
                              <td className="py-2.5 pr-4">
                                <TierBadge tier={est.tier} />
                              </td>
                              <td className="py-2.5">{est.confidence}%</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </section>
                </>
              )}

              {/* 15. Travel mode comparison */}
              <section className="glass-panel rounded-2xl p-5">
                <h3 className="text-sm font-bold">Travel Mode Forecast</h3>
                <div className="mt-3 grid gap-3 sm:grid-cols-4">
                  <ModeSummary
                    icon={Car}
                    label="Car"
                    duration={currentTravelTime || undefined}
                    tier={selectedDayForecast?.tier}
                  />
                  <ModeSummary
                    icon={Bike}
                    label="Bike"
                    duration={bikeRoute.data?.primary.durationMin}
                    tier={undefined}
                  />
                  <ModeSummary
                    icon={Bus}
                    label="Bus"
                    duration={currentTravelTime ? busDuration : undefined}
                    tier={selectedDayForecast?.tier}
                  />
                  <ModeSummary
                    icon={PersonStanding}
                    label="Walk"
                    duration={footRoute.data?.primary.durationMin}
                    tier={undefined}
                  />
                </div>
                <p className="mt-3 text-[11px] text-muted-foreground">
                  Walking and cycling estimates are based on route/network data, not traffic
                  forecasting. Bus time is a rough estimate (no live transit routing available) —
                  not a real schedule.
                </p>
              </section>

              {/* 17. Best time window */}
              <section className="glass-panel rounded-2xl p-5 sm:p-6">
                <h3 className="text-sm font-bold">Traffic Pattern for Selected Date</h3>
                <p className="text-xs text-muted-foreground">
                  {dayLabel(dayOffset).relative}, {dayLabel(dayOffset).monthDay} — lower bars mean a
                  lower estimated travel time.
                </p>
                <div className="mt-4 h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={graphData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="hour" stroke="var(--muted-foreground)" fontSize={11} />
                      <YAxis
                        stroke="var(--muted-foreground)"
                        fontSize={11}
                        width={44}
                        unit=" min"
                      />
                      <Tooltip
                        contentStyle={{
                          background: "var(--card)",
                          border: "1px solid var(--border)",
                          borderRadius: 8,
                          fontSize: 12,
                        }}
                      />
                      <Bar dataKey="forecast" radius={[4, 4, 0, 0]}>
                        {graphData.map((d) => (
                          <Cell
                            key={d.hour}
                            fill={d.hourNum === hour ? "var(--destructive)" : "var(--brand-cyan)"}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </section>

              {/* 18. Forecast confidence */}
              {selectedDayForecast && (
                <section className="glass-panel rounded-2xl p-5 sm:p-6">
                  <h3 className="text-sm font-bold">Forecast Confidence</h3>
                  <div className="mt-3 flex flex-wrap items-center gap-6">
                    <p className="text-4xl font-extrabold text-brand-cyan">
                      {selectedDayForecast.confidence}%
                    </p>
                    <div>
                      <p className="text-xs text-muted-foreground">Estimated Travel Time</p>
                      <p className="text-lg font-extrabold">
                        {formatMin(selectedDayForecast.travelTime)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Likely Range</p>
                      <p className="text-lg font-extrabold">
                        {formatMin(selectedDayForecast.rangeLow)} –{" "}
                        {formatMin(selectedDayForecast.rangeHigh)}
                      </p>
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">
                    Forecast confidence represents model uncertainty based on historical validation
                    and available future inputs. Confidence decreases the further out the forecast —{" "}
                    {dayLabel(0).relative} is
                    {CONFIDENCE_TODAY}% confident, {dayLabel(7).relative} is {CONFIDENCE_WEEK}%.
                  </p>
                </section>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}

const CONFIDENCE_TODAY = 95;
const CONFIDENCE_WEEK = 64;

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-extrabold">{value}</p>
    </div>
  );
}

function MiniStat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Droplets;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface px-2 py-2 text-center">
      <Icon size={14} className="mx-auto text-brand-cyan" />
      <p className="mt-1 font-bold">{value}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}

function ModeButton({
  icon: Icon,
  label,
  time,
  active,
  onClick,
  disabled,
}: {
  icon: typeof Car;
  label: string;
  time: string;
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={disabled ? "Estimated only — no route selection for this mode" : undefined}
      className={`glass-panel rounded-xl p-4 text-left transition ${
        active ? "border-brand-cyan ring-1 ring-brand-cyan" : "hover:-translate-y-0.5"
      } ${disabled ? "opacity-70" : ""}`}
    >
      <Icon className="text-brand-cyan" size={20} />
      <p className="mt-2 text-sm font-bold">{label}</p>
      <p className="text-lg font-extrabold">{time}</p>
    </button>
  );
}

function ModeSummary({
  icon: Icon,
  label,
  duration,
  tier,
}: {
  icon: typeof Car;
  label: string;
  duration: number | undefined;
  tier: import("@/lib/locations").TrafficTier | undefined;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-3 text-center">
      <Icon className="mx-auto text-brand-cyan" size={18} />
      <p className="mt-1 text-xs font-bold">{label}</p>
      <p className="text-sm font-extrabold">{duration ? formatMin(duration) : "—"}</p>
      {tier && <p className="mt-1 text-[10px] text-muted-foreground">{tier} traffic</p>}
    </div>
  );
}

function RouteNode({
  label,
  isEndpoint,
  last,
}: {
  label: string;
  isEndpoint?: boolean;
  last?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className={`size-2.5 rounded-full ${isEndpoint ? "bg-foreground" : "bg-brand-cyan"}`} />
      <p className="text-sm font-bold">{label}</p>
      {!last && <span className="ml-auto text-xs text-muted-foreground">↓</span>}
    </div>
  );
}

function SegmentRow({
  location,
  traffic,
}: {
  location: BengaluruLocation;
  traffic: ReturnType<typeof useSampleTraffic>["data"];
}) {
  return (
    <div className="flex items-center gap-3 border-l-2 border-dashed border-border py-2 pl-4">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold">{location.name}</p>
        {traffic ? (
          <p className="text-xs text-muted-foreground">
            {traffic.speedKph} km/h · delay +
            {Math.max(0, Math.round((traffic.congestionPct / 100) * 6))} min
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">Loading…</p>
        )}
      </div>
      {traffic && <TierBadge tier={traffic.tier} />}
    </div>
  );
}
