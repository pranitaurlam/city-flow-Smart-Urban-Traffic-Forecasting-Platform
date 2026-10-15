import {
  Area,
  ComposedChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowRight,
  ExternalLink,
  Info,
  Lightbulb,
  Minus,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { trafficTierColor, type TrafficTier } from "@/lib/locations";
import { openInGoogleMaps, rangeLabel } from "@/lib/route-intelligence";
import { clock, evaluateRoute, formatDays, parseTime, TEST_SCENARIO } from "@/lib/personal-routes";
import { routeAlertActions, useRouteAlertStore } from "@/lib/personal-routes-store";
import { modeOption, routeIcon, type RouteMonitor } from "./route-alert-ui";

export function RouteAlertAnalysisDialog({ monitor }: { monitor: RouteMonitor }) {
  const store = useRouteAlertStore();
  const open = store.analysis;
  const route = open ? store.routes.find((r) => r.id === open.routeId) : undefined;

  return (
    <Dialog open={!!route} onOpenChange={(o) => !o && routeAlertActions.closeAnalysis()}>
      <DialogContent className="max-h-[94vh] max-w-5xl gap-0 overflow-y-auto rounded-2xl border-0 bg-background p-0 sm:rounded-2xl">
        {route && open && (
          <Analysis
            routeId={route.id}
            alternative={open.alternative}
            test={open.test}
            monitor={monitor}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function Analysis({
  routeId,
  alternative,
  test,
  monitor,
}: {
  routeId: string;
  alternative: boolean;
  test: boolean;
  monitor: RouteMonitor;
}) {
  const store = useRouteAlertStore();
  const route = store.routes.find((r) => r.id === routeId)!;
  const s = evaluateRoute(
    route,
    test ? { ...monitor.ctx, scenario: TEST_SCENARIO } : monitor.ctx,
    alternative,
  );
  const Icon = routeIcon(route.name);
  const mode = modeOption(route.mode);
  const depLabel = clock(s.departureMinute);
  const TrendIcon =
    s.trend === "Increasing" ? TrendingUp : s.trend === "Decreasing" ? TrendingDown : Minus;
  const eventsWatched = route.rules.includes("event");

  return (
    <div>
      {/* Header — dark navy */}
      <div className="relative overflow-hidden bg-[oklch(0.19_0.05_262)] p-6 pr-14 text-white sm:p-8 sm:pr-16">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-20 -top-28 size-72 rounded-full bg-[radial-gradient(circle,oklch(0.62_0.24_300/35%),transparent_70%)]"
        />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[oklch(0.8_0.13_220)]">
              Route Analysis{s.usingAlternative && " · Alternative route"}
              {test && " · Test scenario (simulated congestion + rain)"}
            </p>
            <DialogTitle className="mt-1 flex items-center gap-2.5 text-2xl font-extrabold sm:text-3xl">
              <Icon className="size-6 shrink-0 text-white/60" /> {route.name}
            </DialogTitle>
            <DialogDescription className="mt-1.5 flex flex-wrap items-center gap-x-2 text-sm text-white/65">
              <span>{route.origin.text}</span>
              <ArrowRight className="size-3.5" />
              <span>{route.destination.text}</span>
            </DialogDescription>
            <p className="mt-2 text-xs text-white/50">
              {mode.label} · {clock(parseTime(route.departure))} · {formatDays(route.days)} ·{" "}
              {s.distanceKm.toFixed(1)} km
              {s.next && ` · Next trip ${s.next.label}`}
            </p>
          </div>
          <Button
            onClick={() => openInGoogleMaps(route.origin.text, route.destination.text, route.mode)}
            className="h-11 rounded-xl bg-white px-5 font-bold text-[oklch(0.19_0.05_262)] hover:bg-white/90"
          >
            Open Route in Google Maps <ExternalLink className="size-4" />
          </Button>
        </div>

        <dl className="relative mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-white/10 ring-1 ring-white/10 md:grid-cols-5">
          <DarkStat
            label="Normal travel time"
            value={`${s.normalMin} min`}
            sub={`Usual for ${depLabel}`}
          />
          <DarkStat label="Current" value={`${s.currentMin} min`} sub="If you left now" />
          <DarkStat
            label={`Forecast at ${depLabel}`}
            value={rangeLabel(s.rangeLow, s.rangeHigh)}
            sub={s.next ? s.next.label : undefined}
          />
          <DarkStat
            label="Expected delay"
            value={s.delayHigh > 0 ? `+${Math.max(0, s.delayLow)}–${s.delayHigh} min` : "None"}
            sub={`Alert threshold +${route.thresholdMin} min`}
            warn={s.delayMin >= route.thresholdMin}
          />
          <DarkStat
            label="Reliability"
            value={`${s.reliability}%`}
            sub={`Usually ${s.normalReliability}%`}
          />
        </dl>
      </div>

      <div className="space-y-5 p-5 sm:p-8">
        {/* Signals */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Signal
            label="Road condition"
            value={`${s.roadScore}/100`}
            note={`Usually ${s.normalRoadScore}/100`}
          />
          <Signal
            label="Traffic trend"
            value={
              <span className="flex items-center gap-1.5">
                <TrendIcon className="size-4" /> {s.trend}
              </span>
            }
            note={`Around ${depLabel}`}
          />
          <Signal
            label="Traffic at departure"
            value={<Tier tier={s.tier} />}
            note={`Usually ${s.normalTier}`}
          />
          <Signal
            label="Weather"
            value={s.weather.level === "Low" ? "Minimal impact" : `${s.weather.level} impact`}
            note={s.weather.note}
          />
          <Signal
            label="Event impact"
            value="Not tracked"
            note={
              eventsWatched
                ? "Event alerts are on, but no event feed is connected yet"
                : "Event alerts are off for this route"
            }
          />
          <Signal
            label="Forecast confidence"
            value={`${s.confidence}%`}
            note="Lower for later days and approximate places"
          />
        </div>

        {/* Timeline + chart */}
        <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <section className="glass-panel rounded-2xl p-5">
            <h3 className="font-bold">Traffic timeline</h3>
            <p className="text-xs text-muted-foreground">
              Forecast congestion around your departure
            </p>
            <ol className="relative mt-8 grid grid-cols-4">
              <span
                aria-hidden
                className="absolute left-[12.5%] right-[12.5%] top-[7px] h-0.5 bg-border"
              />
              {s.timeline.map((p) => (
                <li key={p.label} className="relative flex flex-col items-center gap-2 text-center">
                  <span
                    className="size-4 rounded-full ring-4 ring-background"
                    style={{ background: trafficTierColor[p.tier] }}
                    title={p.tier}
                  />
                  <span className="text-sm font-bold">{p.label}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {p.tier}
                    <br />
                    {p.minutes} min
                  </span>
                </li>
              ))}
            </ol>
          </section>

          <section className="glass-panel rounded-2xl p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <h3 className="font-bold">Forecast vs normal</h3>
                <p className="text-xs text-muted-foreground">Travel time by departure time</p>
              </div>
              <div className="flex gap-3 text-[11px] font-semibold text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <i className="h-0.5 w-4 bg-brand-blue" /> Forecast
                </span>
                <span className="flex items-center gap-1.5">
                  <i className="h-0 w-4 border-t-2 border-dashed border-muted-foreground" /> Normal
                </span>
              </div>
            </div>
            <div className="mt-3 h-52">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={s.curve} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                  <defs>
                    <linearGradient id="pra-fill" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor="var(--brand-blue)" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="var(--brand-blue)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke="var(--border)" />
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    fontSize={11}
                    interval={1}
                    stroke="var(--muted-foreground)"
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    fontSize={11}
                    width={44}
                    unit="m"
                    stroke="var(--muted-foreground)"
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--popover)",
                      border: "1px solid var(--border)",
                      borderRadius: 10,
                      fontSize: 12,
                    }}
                    formatter={(v: number, name: string) => [
                      `${v} min`,
                      name === "forecast" ? "Forecast" : "Normal",
                    ]}
                  />
                  <Area
                    type="monotone"
                    dataKey="forecast"
                    stroke="var(--brand-blue)"
                    strokeWidth={2}
                    fill="url(#pra-fill)"
                  />
                  <Line
                    type="monotone"
                    dataKey="normal"
                    stroke="var(--muted-foreground)"
                    strokeDasharray="4 4"
                    dot={false}
                    strokeWidth={1.5}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </section>
        </div>

        {/* Recommendation */}
        <section className="relative overflow-hidden rounded-2xl bg-[oklch(0.19_0.05_262)] p-5 text-white ring-1 ring-white/10 sm:p-6">
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-[oklch(0.8_0.13_220)]">
            <Lightbulb size={14} /> CityFlow Recommendation
          </p>
          {s.recommendation.changed ? (
            <>
              <p className="mt-2 text-sm text-white/65">Instead of leaving at {depLabel}:</p>
              <div className="mt-3 grid gap-4 sm:grid-cols-3">
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-white/45">
                    Recommended departure
                  </p>
                  <p className="mt-0.5 text-2xl font-extrabold">
                    {s.recommendation.windowStart}–{s.recommendation.windowEnd}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-white/45">
                    Expected arrival
                  </p>
                  <p className="mt-0.5 text-2xl font-extrabold">
                    {s.recommendation.arrivalStart}–{s.recommendation.arrivalEnd}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-white/45">Time saved</p>
                  <p className="mt-0.5 text-2xl font-extrabold">~{s.recommendation.savesMin} min</p>
                </div>
              </div>
            </>
          ) : (
            <p className="mt-2 text-lg font-bold">
              Leaving at {depLabel} is already close to the best option for this trip.
            </p>
          )}
          <p className="mt-4 text-sm text-white/75">
            <span className="font-semibold text-white">Reason: </span>
            {s.recommendation.reason}
          </p>

          {s.alternative && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-4">
              <p className="text-sm text-white/80">{s.alternative.message}</p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => routeAlertActions.openAnalysis(route.id, !alternative, test)}
                className="rounded-lg border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white"
              >
                {alternative ? "Back to Usual Route" : "Analyze Alternative Route"}
              </Button>
            </div>
          )}
        </section>

        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <Info size={13} className="mt-0.5 shrink-0" />
          Forecasts are CityFlow model estimates from historical traffic patterns, time of day and
          weather{monitor.trafficLive ? ", adjusted with live congestion" : ""}. CityFlow
          doesn&apos;t provide navigation — Google Maps handles directions and may choose a
          different route.
        </p>
      </div>
    </div>
  );
}

function DarkStat({
  label,
  value,
  sub,
  warn,
}: {
  label: string;
  value: string;
  sub?: string | undefined;
  warn?: boolean;
}) {
  return (
    <div className="bg-[oklch(0.21_0.05_262)] p-4">
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-white/50">{label}</dt>
      <dd
        className={`mt-1 text-xl font-extrabold tabular-nums ${warn ? "text-[oklch(0.82_0.15_70)]" : ""}`}
      >
        {value}
      </dd>
      {sub && <p className="mt-0.5 text-xs text-white/45">{sub}</p>}
    </div>
  );
}

function Signal({ label, value, note }: { label: string; value: React.ReactNode; note: string }) {
  return (
    <div className="glass-panel rounded-xl p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <div className="mt-1 text-lg font-extrabold">{value}</div>
      <p className="mt-0.5 text-xs text-muted-foreground">{note}</p>
    </div>
  );
}

function Tier({ tier }: { tier: TrafficTier }) {
  return (
    <span className="flex items-center gap-2">
      <i className="size-2.5 rounded-full" style={{ background: trafficTierColor[tier] }} />
      {tier}
    </span>
  );
}
