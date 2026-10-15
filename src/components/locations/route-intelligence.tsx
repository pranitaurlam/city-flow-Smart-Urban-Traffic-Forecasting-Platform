import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowRight,
  CalendarClock,
  CloudRain,
  ExternalLink,
  Gauge,
  Info,
  Route as RouteIcon,
  ShieldCheck,
  Timer,
  TrendingDown,
  TrendingUp,
  Minus,
  Ticket,
  Layers,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { TierBadge } from "@/components/locations/panels";
import { trafficTierColor, type TrafficTier } from "@/lib/locations";
import { openInGoogleMaps, plannerMode } from "@/lib/route-intelligence";
import { WaveBackdrop, type RoutePlanResult } from "./route-planner";

const shortName = (text: string) => text.split(",")[0]!.trim();
const fmtMin = (min: number) => {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} hr ${m} min` : `${h} hr`;
};

// ---------------------------------------------------------------------------
// Route Intelligence Panel (dark navy)
// ---------------------------------------------------------------------------

export function RouteIntelligencePanel({ result }: { result: RoutePlanResult }) {
  const { analysis: a, origin, destination, originText, destinationText, mode, departure } = result;
  const TrendIcon = a.trend === "Rising" ? TrendingUp : a.trend === "Easing" ? TrendingDown : Minus;

  return (
    <section
      aria-labelledby="route-analysis-title"
      className="relative overflow-hidden rounded-3xl bg-[oklch(0.19_0.05_262)] text-white shadow-[0_30px_80px_-30px_oklch(0.2_0.08_262/70%)] ring-1 ring-white/10"
    >
      <WaveBackdrop tone="var(--brand-cyan)" />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-[radial-gradient(circle,oklch(0.62_0.24_300/35%),transparent_70%)]"
      />

      <div className="relative space-y-6 p-5 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[oklch(0.8_0.13_220)]">
              Route Analysis
            </p>
            <h2
              id="route-analysis-title"
              className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-2xl font-extrabold sm:text-3xl"
            >
              <span className="break-words">{shortName(originText)}</span>
              <ArrowRight className="size-6 shrink-0 text-white/40" />
              <span className="break-words">{shortName(destinationText)}</span>
            </h2>
            <div className="mt-2 flex flex-wrap gap-2 text-xs text-white/60">
              <Chip>{plannerMode(mode).label}</Chip>
              <Chip>Departure: {departure.label}</Chip>
              <ResolvedChip label="From" place={origin} />
              <ResolvedChip label="To" place={destination} />
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => openInGoogleMaps(originText, destinationText, mode)}
            className="h-11 rounded-xl border-white/20 bg-white/5 px-5 font-bold text-white hover:bg-white/10 hover:text-white"
          >
            Open in Google Maps <ExternalLink className="size-4" />
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-white/10 ring-1 ring-white/10 md:grid-cols-4">
          <Metric
            label="Distance"
            value={`${a.distanceKm.toFixed(1)} km`}
            sub={a.routedLive ? "Road network distance" : "Estimated from straight line"}
          />
          <Metric
            label="Current traffic"
            value={<TierText tier={a.current.tier} />}
            sub={`${fmtMin(a.current.minutes)} if you left now`}
          />
          <Metric
            label="Forecast traffic"
            value={<TierText tier={a.forecast.tier} />}
            sub={`At departure · ${a.trend.toLowerCase()}`}
          />
          <Metric
            label="Est. travel time"
            value={fmtMin(a.forecast.minutes)}
            sub={`Likely ${a.forecast.rangeLow}–${a.forecast.rangeHigh} min`}
          />
          <Metric
            label="Expected delay"
            value={
              a.delayMin > 0 ? `+${a.delayMin} min` : a.delayMin < 0 ? `${a.delayMin} min` : "None"
            }
            sub={`vs ${fmtMin(a.baselineMin)} on clear roads`}
            tone={a.delayMin >= 10 ? "warn" : undefined}
          />
          <Metric label="Forecast confidence" value={`${a.confidence}%`} bar={a.confidence} />
          <Metric label="Route reliability" value={`${a.reliability}%`} bar={a.reliability} />
          <Metric label="Road condition" value={`${a.roadScore}/100`} bar={a.roadScore} />
        </div>

        <div className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4 sm:flex-row sm:items-center">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[oklch(0.73_0.16_225/18%)] text-[oklch(0.82_0.13_220)]">
            <TrendIcon size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-bold">
              {a.peakWindow
                ? `Traffic is expected to increase around ${a.peakWindow.start}–${a.peakWindow.end}${a.peakWindow.dayLabel === "tomorrow" ? " tomorrow" : ""}.`
                : "Traffic is expected to stay steady for the rest of the day."}
            </p>
            <p className="mt-0.5 text-sm text-white/60">
              Trend at your departure: {a.trend}
              {a.trendPct !== 0 && ` (${a.trendPct > 0 ? "+" : ""}${a.trendPct}% vs now)`}.{" "}
              {a.corridors.length > 0
                ? `Passes CityFlow-tracked corridors: ${a.corridors.map((c) => c.name).join(", ")}.`
                : "No CityFlow-tracked corridors on this route — city-wide patterns used."}
            </p>
          </div>
        </div>

        <p className="flex items-start gap-1.5 text-[11px] text-white/45">
          <Info size={12} className="mt-0.5 shrink-0" />
          Forecasts are model estimates from historical traffic patterns, weather and time of day —
          not live traffic. CityFlow does not provide navigation; use Google Maps for directions.
        </p>
      </div>
    </section>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1">{children}</span>
  );
}

function ResolvedChip({ label, place }: { label: string; place: RoutePlanResult["origin"] }) {
  return (
    <span
      className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1"
      title={
        place.approximate
          ? "Exact place not found on the map; analyzed using the surrounding area"
          : undefined
      }
    >
      {label}: {place.label}
      {place.approximate && (
        <em className="ml-1 not-italic text-[oklch(0.85_0.14_85)]">(approx. area)</em>
      )}
    </span>
  );
}

function TierText({ tier }: { tier: TrafficTier }) {
  return (
    <span className="flex items-center gap-2">
      <i className="size-2.5 rounded-full" style={{ background: trafficTierColor[tier] }} />
      {tier}
    </span>
  );
}

function Metric({
  label,
  value,
  sub,
  bar,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  bar?: number;
  tone?: "warn" | undefined;
}) {
  return (
    <div className="bg-[oklch(0.21_0.05_262)] p-4 sm:p-5">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-white/50">{label}</p>
      <div
        className={`mt-1.5 text-xl font-extrabold tabular-nums sm:text-2xl ${tone === "warn" ? "text-[oklch(0.82_0.15_70)]" : ""}`}
      >
        {value}
      </div>
      {bar !== undefined ? (
        <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-[linear-gradient(90deg,var(--brand-cyan),var(--brand-violet))]"
            style={{ width: `${bar}%` }}
          />
        </div>
      ) : (
        sub && <p className="mt-1 text-xs text-white/50">{sub}</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Road Condition + Traffic Trend
// ---------------------------------------------------------------------------

export function RoadConditionCard({ result }: { result: RoutePlanResult }) {
  const a = result.analysis;
  const scoreLabel = a.roadScore >= 75 ? "Good" : a.roadScore >= 55 ? "Fair" : "Poor";
  const factors: { icon: typeof Gauge; label: string; value: string; note: string }[] = [
    {
      icon: Layers,
      label: "Corridor congestion",
      value: a.corridors.length ? `${a.corridors.length} tracked` : "City-wide",
      note: a.corridors.length
        ? a.corridors.map((c) => `${c.name} (${c.baseTier})`).join(" · ")
        : "No tracked corridor within 2 km of the route",
    },
    {
      icon: CloudRain,
      label: "Weather impact",
      value: a.weather.pct ? `${a.weather.level} · +${a.weather.pct}%` : a.weather.level,
      note: a.weather.note,
    },
    {
      icon: Ticket,
      label: "Event impact",
      value: "Not tracked",
      note: "No event feed is connected yet, so events are not factored in",
    },
  ];

  return (
    <section className="glass-panel rounded-2xl p-5 sm:p-6">
      <CardHeader
        icon={Gauge}
        title="Road Condition"
        sub="Congestion, weather and event index for this route"
      />
      <div className="mt-5 flex items-center gap-5">
        <ScoreRing value={a.roadScore} />
        <div>
          <p className="text-2xl font-extrabold">{scoreLabel}</p>
          <p className="text-sm text-muted-foreground">
            Higher is smoother. Based on corridor congestion history, weather and route length.
          </p>
        </div>
      </div>
      <ul className="mt-5 divide-y divide-border rounded-xl border border-border">
        {factors.map(({ icon: Icon, label, value, note }) => (
          <li key={label} className="flex items-start gap-3 p-3">
            <Icon size={16} className="mt-0.5 shrink-0 text-brand-blue" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-semibold">{label}</span>
                <span className="text-sm font-bold">{value}</span>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">{note}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ScoreRing({ value }: { value: number }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  return (
    <svg
      viewBox="0 0 80 80"
      className="size-24 shrink-0"
      role="img"
      aria-label={`Road condition ${value} of 100`}
    >
      <defs>
        <linearGradient id="score-ring" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="var(--brand-cyan)" />
          <stop offset="100%" stopColor="var(--brand-violet)" />
        </linearGradient>
      </defs>
      <circle cx="40" cy="40" r={r} fill="none" stroke="var(--border)" strokeWidth="7" />
      <circle
        cx="40"
        cy="40"
        r={r}
        fill="none"
        stroke="url(#score-ring)"
        strokeWidth="7"
        strokeLinecap="round"
        strokeDasharray={`${(value / 100) * c} ${c}`}
        transform="rotate(-90 40 40)"
      />
      <text
        x="40"
        y="44"
        textAnchor="middle"
        fontSize="18"
        fontWeight="800"
        fill="var(--foreground)"
      >
        {value}
      </text>
    </svg>
  );
}

export function TrafficTrendCard({ result }: { result: RoutePlanResult }) {
  const a = result.analysis;
  const nowHour = new Date().getHours();
  const departureHour = result.departure.hour;
  const sameDay = result.departure.offset === 0;
  const data = a.hourly.map((h) => ({ ...h, label: h.label.replace(" ", "") }));

  return (
    <section className="glass-panel rounded-2xl p-5 sm:p-6">
      <CardHeader
        icon={TrendingUp}
        title="Traffic Trend"
        sub={`Forecast travel time by departure hour · ${sameDay ? "today" : "tomorrow"}`}
      />
      <div className="mt-3 flex gap-4 text-[11px] font-semibold text-muted-foreground">
        {sameDay && (
          <span className="flex items-center gap-1.5">
            <i className="h-3 border-l border-dashed border-muted-foreground" /> Now
          </span>
        )}
        <span className="flex items-center gap-1.5">
          <i className="h-3 border-l-2 border-brand-violet" /> Departure
        </span>
      </div>
      <div className="mt-2 h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 8, left: -18, bottom: 0 }}>
            <defs>
              <linearGradient id="trend-fill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="var(--brand-blue)" stopOpacity={0.35} />
                <stop offset="100%" stopColor="var(--brand-blue)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              fontSize={11}
              interval={3}
              stroke="var(--muted-foreground)"
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              fontSize={11}
              width={44}
              stroke="var(--muted-foreground)"
              unit="m"
            />
            <Tooltip
              contentStyle={{
                background: "var(--popover)",
                border: "1px solid var(--border)",
                borderRadius: 10,
                fontSize: 12,
              }}
              formatter={(v: number, _n, item) => [
                `${v} min · ${(item.payload as { tier: string }).tier}`,
                "Travel time",
              ]}
            />
            {sameDay && data[nowHour] && (
              <ReferenceLine
                x={data[nowHour].label}
                stroke="var(--muted-foreground)"
                strokeDasharray="3 3"
              />
            )}
            {data[departureHour] && (
              <ReferenceLine x={data[departureHour].label} stroke="var(--brand-violet)" />
            )}
            <Area
              type="monotone"
              dataKey="minutes"
              stroke="var(--brand-blue)"
              strokeWidth={2}
              fill="url(#trend-fill)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Forecast + Reliability
// ---------------------------------------------------------------------------

export function DepartureForecastCard({ result }: { result: RoutePlanResult }) {
  const options = result.analysis.departures;
  const best = Math.min(...options.map((o) => o.minutes));
  const max = Math.max(...options.map((o) => o.minutes));
  const fastestIndex = best < max ? options.findIndex((o) => o.minutes === best) : -1;

  return (
    <section className="glass-panel rounded-2xl p-5 sm:p-6">
      <CardHeader
        icon={CalendarClock}
        title="Forecast"
        sub="Estimated travel time for each departure option"
      />
      <ul className="mt-5 space-y-3">
        {options.map((o, i) => {
          const selected = o.label === result.departure.label;
          return (
            <li
              key={o.label}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5"
            >
              <span className="flex min-w-0 items-center gap-2 text-sm font-semibold">
                <span className="truncate">{o.label}</span>
                {i === fastestIndex && (
                  <span className="shrink-0 rounded-full bg-[color-mix(in_oklab,var(--success)_18%,transparent)] px-2 py-0.5 text-[10px] font-bold text-success">
                    Fastest
                  </span>
                )}
                {selected && (
                  <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
                    Selected
                  </span>
                )}
              </span>
              <span className="text-sm font-extrabold tabular-nums">{fmtMin(o.minutes)}</span>
              <div className="col-span-2 h-2 overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.max(8, (o.minutes / max) * 100)}%`,
                    background: trafficTierColor[o.tier],
                  }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function ReliabilityCard({ result }: { result: RoutePlanResult }) {
  const a = result.analysis;
  const verdict =
    a.reliability >= 80
      ? "Consistent — arrival times rarely vary much on this route."
      : a.reliability >= 65
        ? "Somewhat variable — leave a small buffer."
        : "Unpredictable — allow extra time.";
  const buffer = Math.max(0, a.forecast.rangeHigh - a.forecast.minutes);

  return (
    <section className="glass-panel rounded-2xl p-5 sm:p-6">
      <CardHeader
        icon={ShieldCheck}
        title="Reliability"
        sub="How dependable this forecast and route are"
      />
      <div className="mt-5 grid grid-cols-2 gap-3">
        <BigStat label="Route reliability" value={`${a.reliability}%`} />
        <BigStat label="Forecast confidence" value={`${a.confidence}%`} />
      </div>
      <p className="mt-4 text-sm font-semibold">{verdict}</p>
      <div className="mt-4 space-y-2 rounded-xl border border-border p-3 text-sm">
        <Row
          icon={Timer}
          label="Likely range"
          value={`${a.forecast.rangeLow}–${a.forecast.rangeHigh} min`}
        />
        <Row icon={Timer} label="Suggested buffer" value={buffer ? `+${buffer} min` : "None"} />
        <Row
          icon={RouteIcon}
          label="Forecast traffic"
          value={<TierBadge tier={a.forecast.tier} />}
        />
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Confidence drops for later days, approximate places and routes without tracked corridors.
      </p>
    </section>
  );
}

function BigStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface-strong p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-2xl font-extrabold tabular-nums">{value}</p>
    </div>
  );
}

function Row({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Timer;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-2 text-muted-foreground">
        <Icon size={14} /> {label}
      </span>
      <span className="font-bold">{value}</span>
    </div>
  );
}

function CardHeader({
  icon: Icon,
  title,
  sub,
}: {
  icon: typeof Gauge;
  title: string;
  sub: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[color-mix(in_oklab,var(--brand-blue)_12%,transparent)] text-brand-blue">
        <Icon size={17} />
      </span>
      <div>
        <h3 className="font-bold">{title}</h3>
        <p className="text-xs text-muted-foreground">{sub}</p>
      </div>
    </div>
  );
}
