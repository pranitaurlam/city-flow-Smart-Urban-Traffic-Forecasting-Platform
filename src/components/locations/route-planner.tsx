import { useMemo, useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  ArrowUpDown,
  Bus,
  Car,
  Clock,
  ExternalLink,
  Footprints,
  LoaderCircle,
  MapPin,
  Motorbike,
  Navigation,
  Search,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { geocodePlace, type GeocodeResult } from "@/lib/geocode-server";
import { getRoute } from "@/lib/route-server";
import { getLiveWeather } from "@/lib/weather-server";
import {
  analyzeRoute,
  departureOptions,
  openInGoogleMaps,
  PLANNER_MODES,
  plannerMode,
  type Departure,
  type PlannerMode,
  type RouteAnalysis,
} from "@/lib/route-intelligence";

export type RoutePlanResult = {
  originText: string;
  destinationText: string;
  origin: GeocodeResult;
  destination: GeocodeResult;
  mode: PlannerMode;
  departure: Departure;
  analysis: RouteAnalysis;
};

const MODE_ICON: Record<PlannerMode, typeof Car> = {
  driving: Car,
  "two-wheeler": Motorbike,
  walking: Footprints,
  transit: Bus,
};

const EXAMPLE = { origin: "Polaris School of Technology", destination: "Marathahalli, Bengaluru" };

export function RoutePlanner({ onResult }: { onResult: (result: RoutePlanResult) => void }) {
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [mode, setMode] = useState<PlannerMode>("driving");
  const departures = useMemo(() => departureOptions(), []);
  const [departureIndex, setDepartureIndex] = useState(0);
  const [errors, setErrors] = useState<{
    origin?: string | undefined;
    destination?: string | undefined;
    form?: string | undefined;
  }>({});

  const canSubmit = origin.trim().length > 1 && destination.trim().length > 1;

  const analyze = useMutation({
    mutationFn: async (): Promise<RoutePlanResult | null> => {
      const originText = origin.trim();
      const destinationText = destination.trim();
      const [from, to] = await Promise.all([
        geocodePlace({ data: { query: originText } }),
        geocodePlace({ data: { query: destinationText } }),
      ]);
      const notFound = (q: string) =>
        `Couldn't locate "${q}" for analysis. Try adding an area or city, e.g. "${q}, Bengaluru".`;
      if (!from || !to) {
        setErrors({
          origin: from ? undefined : notFound(originText),
          destination: to ? undefined : notFound(destinationText),
        });
        return null;
      }

      const departure = departures[departureIndex] ?? departures[0]!;
      const [route, weather] = await Promise.all([
        getRoute({
          data: {
            fromLat: from.lat,
            fromLon: from.lon,
            toLat: to.lat,
            toLon: to.lon,
            mode: plannerMode(mode).routing,
          },
        }),
        getLiveWeather({ data: { lat: to.lat, lon: to.lon, slug: `route-${to.label}` } }).catch(
          () => undefined,
        ),
      ]);

      const analysis = analyzeRoute({
        route,
        mode,
        departure,
        weather,
        approximateEndpoints: Number(from.approximate) + Number(to.approximate),
      });
      return {
        originText,
        destinationText,
        origin: from,
        destination: to,
        mode,
        departure,
        analysis,
      };
    },
    onMutate: () => setErrors({}),
    onSuccess: (result) => result && onResult(result),
    onError: () =>
      setErrors({ form: "Route analysis is temporarily unavailable. Please try again shortly." }),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (canSubmit && !analyze.isPending) analyze.mutate();
  };

  return (
    <section
      aria-labelledby="route-planner-title"
      className="glass-panel relative overflow-hidden rounded-3xl"
    >
      <WaveBackdrop />

      <div className="relative grid gap-8 p-5 sm:p-8 xl:grid-cols-[minmax(0,1fr)_340px]">
        <form onSubmit={submit} className="min-w-0 space-y-6" noValidate>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-cyan">
                Route Planner
              </p>
              <h2 id="route-planner-title" className="mt-1 text-2xl font-extrabold sm:text-[28px]">
                Know the traffic before you leave
              </h2>
              <p className="mt-1 max-w-xl text-sm text-muted-foreground">
                Enter any two places. CityFlow forecasts congestion, delay and reliability for the
                trip — then hand off to Google Maps for turn-by-turn directions.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setOrigin(EXAMPLE.origin);
                setDestination(EXAMPLE.destination);
                setErrors({});
              }}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-strong px-3 py-1.5 text-xs font-semibold text-muted-foreground transition hover:border-brand-cyan hover:text-foreground"
            >
              <Sparkles size={12} className="text-brand-violet" /> Try an example
            </button>
          </div>

          {/* Origin / destination */}
          <div className="relative rounded-2xl border border-border bg-surface-strong p-2 shadow-sm">
            <PlaceField
              id="route-origin"
              label="Starting point"
              placeholder="Enter starting point"
              value={origin}
              onChange={(v) => setOrigin(v)}
              marker={
                <span className="size-3 rounded-full border-[3px] border-brand-cyan bg-surface-strong" />
              }
              error={errors.origin}
            />
            <div className="relative ml-[22px] h-px bg-border">
              <span
                aria-hidden
                className="absolute -top-3 left-[-1px] h-6 border-l-2 border-dotted border-muted-foreground/40"
              />
              <button
                type="button"
                aria-label="Swap starting point and destination"
                onClick={() => {
                  setOrigin(destination);
                  setDestination(origin);
                  setErrors({});
                }}
                className="absolute right-2 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-full border border-border bg-surface-strong text-muted-foreground shadow-sm transition hover:border-brand-cyan hover:text-brand-cyan"
              >
                <ArrowUpDown size={14} />
              </button>
            </div>
            <PlaceField
              id="route-destination"
              label="Destination"
              placeholder="Enter destination"
              value={destination}
              onChange={(v) => setDestination(v)}
              marker={
                <MapPin
                  size={16}
                  className="text-brand-violet"
                  fill="currentColor"
                  fillOpacity={0.15}
                />
              }
              error={errors.destination}
            />
          </div>

          {/* Mode + departure */}
          <div className="flex flex-col gap-4 2xl:flex-row 2xl:items-end">
            <fieldset className="min-w-0 flex-1">
              <legend className="mb-2 text-xs font-bold text-muted-foreground">Travel mode</legend>
              <div className="grid grid-cols-2 gap-1 rounded-xl border border-border bg-secondary/60 p-1 sm:grid-cols-4">
                {PLANNER_MODES.map((m) => {
                  const Icon = MODE_ICON[m.key];
                  const active = m.key === mode;
                  return (
                    <label
                      key={m.key}
                      className={`flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-lg px-3 py-2.5 text-sm font-semibold transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring ${
                        active
                          ? "bg-surface-strong text-foreground shadow-sm ring-1 ring-border"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <input
                        type="radio"
                        name="travel-mode"
                        value={m.key}
                        checked={active}
                        onChange={() => setMode(m.key)}
                        className="sr-only"
                      />
                      <Icon size={16} className={active ? "text-brand-blue" : undefined} />
                      {m.label}
                    </label>
                  );
                })}
              </div>
            </fieldset>

            <label className="block 2xl:w-60">
              <span className="mb-2 flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
                <Clock size={12} /> Departure
              </span>
              <select
                value={departureIndex}
                onChange={(e) => setDepartureIndex(Number(e.target.value))}
                className="h-11 w-full rounded-xl border border-border bg-surface-strong px-3 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {departures.map((d, i) => (
                  <option key={d.label} value={i}>
                    {d.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button
              type="submit"
              size="lg"
              disabled={!canSubmit || analyze.isPending}
              className="h-12 rounded-xl bg-gradient-brand px-6 text-base font-bold text-white shadow-brand hover:opacity-95"
            >
              {analyze.isPending ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <Navigation className="size-4" />
              )}
              {analyze.isPending ? "Analyzing route…" : "Analyze Route"}
            </Button>
            <Button
              type="button"
              size="lg"
              variant="outline"
              disabled={!canSubmit}
              onClick={() => openInGoogleMaps(origin, destination, mode)}
              className="h-12 rounded-xl border-border bg-surface-strong px-6 text-base font-bold"
            >
              Open in Google Maps <ExternalLink className="size-4" />
            </Button>
            <p className="text-xs text-muted-foreground sm:ml-auto sm:max-w-[200px] sm:text-right">
              Opens in a new tab with the same route and travel mode.
            </p>
          </div>
          {errors.form && (
            <p role="alert" className="text-sm font-semibold text-destructive">
              {errors.form}
            </p>
          )}
        </form>

        <RoleCard />
      </div>
    </section>
  );
}

function PlaceField({
  id,
  label,
  placeholder,
  value,
  onChange,
  marker,
  error,
}: {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  marker: React.ReactNode;
  error?: string | undefined;
}) {
  return (
    <div className="px-2 py-1.5">
      <div className="flex items-center gap-3">
        <span className="grid w-6 shrink-0 place-items-center">{marker}</span>
        <div className="min-w-0 flex-1 pr-10">
          <label
            htmlFor={id}
            className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground"
          >
            {label}
          </label>
          <div className="flex items-center gap-2">
            <input
              id={id}
              type="text"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder={placeholder}
              autoComplete="off"
              aria-invalid={!!error}
              aria-describedby={error ? `${id}-error` : undefined}
              className="h-8 w-full min-w-0 bg-transparent text-[15px] font-semibold outline-none placeholder:font-medium placeholder:text-muted-foreground/70"
            />
            <Search size={15} className="shrink-0 text-muted-foreground/60" aria-hidden />
          </div>
        </div>
      </div>
      {error && (
        <p
          id={`${id}-error`}
          role="alert"
          className="ml-9 mt-1 text-xs font-semibold text-destructive"
        >
          {error}
        </p>
      )}
    </div>
  );
}

const CITYFLOW_ROLES = [
  "Predicts traffic",
  "Analyzes road conditions",
  "Forecasts future congestion",
  "Calculates route reliability",
  "Provides arrival-time intelligence",
  "Detects traffic trends",
];
const GOOGLE_ROLES = [
  "Provides actual directions",
  "Provides navigation",
  "Provides route visualization",
  "Handles turn-by-turn guidance",
];

function RoleCard() {
  return (
    <aside className="flex flex-col gap-5 self-start rounded-2xl bg-[oklch(0.2_0.055_262)] p-5 text-white shadow-[0_20px_50px_-20px_oklch(0.2_0.06_262/60%)] ring-1 ring-white/10">
      <div>
        <p className="flex items-center gap-2 text-sm font-bold">
          <span className="grid size-6 place-items-center rounded-md bg-gradient-brand">
            <Sparkles size={13} />
          </span>
          Powered by CityFlow Traffic Intelligence
        </p>
        <p className="mt-1 text-xs text-white/60">
          Google Maps provides navigation and directions.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 text-xs">
        <RoleColumn title="CityFlow" accent="var(--brand-cyan)" items={CITYFLOW_ROLES} />
        <RoleColumn title="Google Maps" accent="oklch(0.8 0.02 260)" items={GOOGLE_ROLES} />
      </div>
    </aside>
  );
}

function RoleColumn({ title, accent, items }: { title: string; accent: string; items: string[] }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
      <p
        className="mb-2 text-[10px] font-extrabold uppercase tracking-[0.16em]"
        style={{ color: accent }}
      >
        {title}
      </p>
      <ul className="space-y-1.5 text-white/80">
        {items.map((item) => (
          <li key={item} className="flex gap-1.5 leading-snug">
            <i className="mt-[6px] size-1 shrink-0 rounded-full" style={{ background: accent }} />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Faint wavelength lines behind the planner — decorative only. */
export function WaveBackdrop({ tone = "var(--brand-blue)" }: { tone?: string }) {
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute inset-x-0 top-0 h-48 w-full opacity-[0.12]"
      viewBox="0 0 1200 200"
      preserveAspectRatio="none"
    >
      {[0, 1, 2, 3].map((i) => (
        <path
          key={i}
          d={`M0 ${70 + i * 18} C 200 ${20 + i * 18}, 400 ${130 + i * 18}, 600 ${70 + i * 18} S 1000 ${10 + i * 18}, 1200 ${70 + i * 18}`}
          fill="none"
          stroke={tone}
          strokeWidth={1.2}
          opacity={1 - i * 0.2}
        />
      ))}
    </svg>
  );
}
