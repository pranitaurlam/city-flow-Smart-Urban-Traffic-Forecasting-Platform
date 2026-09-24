import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CarFront,
  ChevronDown,
  Clock3,
  Compass,
  FlaskConical,
  Lightbulb,
  Route as RouteIcon,
  Search,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DashboardSidebar } from "@/components/dashboard/sidebar";
import { DashboardHeader } from "@/components/dashboard/header";
import { TrafficGauge } from "@/components/dashboard/gauge";
import {
  dashboardTargets,
  findDashboardTarget,
  type DashboardTarget,
} from "@/lib/dashboard-targets";
import { PEAK_HOUR_SHARE, type TrafficTier } from "@/lib/locations";
import { tomorrowPeakForecast } from "@/lib/location-forecast";
import { buildHourly, NOW_HOUR_INDEX } from "@/lib/hourly";
import { getLiveTraffic } from "@/lib/traffic-server";
import { bangaloreTrafficHistory } from "@/data/bangalore-traffic-history";
import cityIllustration from "@/assets/cityflow-globe-transparent.png";

export const Route = createFileRoute("/dashboard/$city")({
  loader: ({ params }) => {
    const target = findDashboardTarget(params.city);
    if (!target) throw notFound();
    return target;
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: loaderData ? `${loaderData.name} | CityFlow Dashboard` : "CityFlow Dashboard" },
    ],
  }),
  component: CityDashboard,
  notFoundComponent: () => (
    <main className="grid min-h-screen place-items-center bg-background px-5 text-center text-foreground">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-cyan">404</p>
        <h1 className="mt-2 text-2xl font-extrabold">Location not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          We don&apos;t have traffic data for this location yet.
        </p>
        <Button asChild className="mt-5">
          <Link to="/">Back to home</Link>
        </Button>
      </div>
    </main>
  ),
});

const whyCityFlow = [
  { icon: Search, title: "Analyze", copy: "Understand historical traffic patterns." },
  { icon: TrendingUp, title: "Forecast", copy: "Estimate future traffic conditions." },
  { icon: Lightbulb, title: "Explain", copy: "Understand why traffic may increase." },
  {
    icon: FlaskConical,
    title: "Simulate",
    copy: "Test different conditions with What-If analysis.",
  },
];

const quickActions = [
  { label: "Explore Location", icon: Compass, to: "/locations" as const },
  { label: "Check Forecast", icon: TrendingUp },
  { label: "Compare Roads", icon: RouteIcon },
  { label: "Generate Report", icon: BarChart3 },
];

function pctVsAverage(value: number, average: number) {
  const diff = Math.round(((value - average) / average) * 100);
  return { diff, label: `${diff > 0 ? "+" : ""}${diff}% vs avg` };
}

function CityDashboard() {
  const target = Route.useLoaderData();
  const navigate = useNavigate();

  const trafficQuery = useQuery({
    queryKey: ["live-traffic", target.slug],
    queryFn: () =>
      getLiveTraffic({
        data: {
          lat: target.lat,
          lon: target.lon,
          basePeakVolume: target.basePeakVolume,
          baseTier: target.baseTier,
          slug: target.slug,
        },
      }),
    staleTime: 20_000,
    refetchInterval: 45_000,
  });
  const traffic = trafficQuery.data;

  const forecast = useMemo(() => tomorrowPeakForecast(target), [target]);
  const hourly = useMemo(() => buildHourly(target.basePeakVolume), [target.basePeakVolume]);
  const history = bangaloreTrafficHistory[target.slug];

  const currentVolume = traffic?.volume ?? Math.round(target.basePeakVolume * 0.6);
  const historicalAverage = history
    ? Math.round(history.avgVolume * PEAK_HOUR_SHARE)
    : Math.round(target.basePeakVolume * 0.75);
  const expectedLevel: TrafficTier = forecast.tier;
  const nextPeak = { window: "5:30 PM – 7:30 PM", label: "Today" };

  const dataLabel = traffic?.live ? "Live" : traffic?.fromDataset ? "Dataset-based" : "Estimated";
  const dataTone = traffic?.live
    ? "text-success"
    : traffic?.fromDataset
      ? "text-success"
      : "text-muted-foreground";

  const currentTrend = pctVsAverage(currentVolume, historicalAverage);
  const forecastTrend = pctVsAverage(forecast.volume, historicalAverage);
  const nowLabel = hourly[NOW_HOUR_INDEX]?.hour ?? "Now";

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <DashboardSidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <DashboardHeader target={target} />

        <main className="mx-auto w-full max-w-[1400px] flex-1 space-y-6 px-5 py-6 sm:px-8">
          {/* 1. Welcome card */}
          <section className="glass-panel relative overflow-hidden rounded-2xl p-6 sm:p-8">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_80%_30%,color-mix(in_oklab,var(--brand-violet)_14%,transparent),transparent_55%)]" />
            <div className="relative z-10 grid items-center gap-6 lg:grid-cols-[1.3fr_0.7fr]">
              <div>
                <h2 className="text-2xl font-extrabold tracking-normal sm:text-3xl">
                  Good morning! Here&apos;s your traffic overview.
                </h2>
                <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
                  CityFlow analyzes historical traffic patterns and forecasts future traffic
                  conditions to help you understand when and where traffic may increase in{" "}
                  {target.name}.
                </p>
              </div>
              <div className="relative hidden h-40 items-center justify-center lg:flex">
                <img
                  src={cityIllustration}
                  alt=""
                  aria-hidden="true"
                  className="w-full max-w-[260px] object-contain opacity-90 dark:opacity-95"
                />
              </div>
            </div>
          </section>

          {/* 2. Key metric cards */}
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <MetricCard
              icon={CarFront}
              label="Current Traffic Volume"
              value={`${currentVolume.toLocaleString()} vehicles/hour`}
              status={dataLabel}
              statusTone={dataTone}
              trend={currentTrend.label}
            />
            <MetricCard
              icon={TrendingUp}
              label="Forecast Traffic Volume"
              value={`${forecast.volume.toLocaleString()} vehicles/hour`}
              status="Forecast"
              statusTone="text-brand-cyan"
              trend={forecastTrend.label}
            />
            <MetricCard
              icon={AlertTriangle}
              label="Expected Traffic Level"
              value={expectedLevel.toUpperCase()}
              status="Congestion Expected"
              statusTone="text-warning"
            />
            <MetricCard
              icon={Clock3}
              label="Next Peak Period"
              value={nextPeak.window}
              status={nextPeak.label}
              statusTone="text-muted-foreground"
            />
            <MetricCard
              icon={BarChart3}
              label="Historical Average"
              value={`${historicalAverage.toLocaleString()} vehicles/hour`}
              status={history ? "Kaggle traffic dataset" : "Estimated average"}
              statusTone="text-muted-foreground"
            />
          </section>

          {target.hasDataset && (
            <p className="text-xs text-muted-foreground">
              Traffic figures for {target.name} are derived from the &ldquo;Bangalore&apos;s Traffic
              Pulse&rdquo; Kaggle dataset. Weather updates live via WeatherAPI.
            </p>
          )}

          {/* 3 + 4. Main chart + gauge */}
          <section className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
            <div className="glass-panel rounded-2xl p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-bold">Today&apos;s Traffic Overview</h3>
                  <p className="text-xs text-muted-foreground">
                    Historical traffic compared with the current forecast
                  </p>
                </div>
                <div className="relative">
                  <select
                    value={target.slug}
                    onChange={(event) =>
                      navigate({ to: "/dashboard/$city", params: { city: event.target.value } })
                    }
                    aria-label="Change location"
                    className="h-8 appearance-none rounded-md border border-input bg-background py-1 pl-2.5 pr-7 text-xs font-medium shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    {dashboardTargets.map((item) => (
                      <option key={item.slug} value={item.slug}>
                        {item.name}, {item.country}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                </div>
              </div>
              <div className="mt-4 h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={hourly} margin={{ left: -12 }}>
                    <defs>
                      <linearGradient id="historicalFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--brand-blue)" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="var(--brand-blue)" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="forecastFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--brand-cyan)" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="var(--brand-cyan)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis
                      dataKey="hour"
                      stroke="var(--muted-foreground)"
                      fontSize={11}
                      interval={2}
                    />
                    <YAxis stroke="var(--muted-foreground)" fontSize={11} width={48} />
                    <Tooltip
                      contentStyle={{
                        background: "var(--card)",
                        border: "1px solid var(--border)",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <ReferenceLine
                      x={nowLabel}
                      stroke="var(--foreground)"
                      strokeDasharray="4 4"
                      strokeOpacity={0.4}
                      label={{
                        value: "Now",
                        position: "top",
                        fontSize: 11,
                        fill: "var(--foreground)",
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="historical"
                      name="Historical"
                      stroke="var(--brand-blue)"
                      fill="url(#historicalFill)"
                      strokeWidth={2.5}
                      connectNulls={false}
                    />
                    <Area
                      type="monotone"
                      dataKey="forecast"
                      name="Forecast"
                      stroke="var(--brand-cyan)"
                      strokeDasharray="6 4"
                      fill="url(#forecastFill)"
                      strokeWidth={2.5}
                      connectNulls={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="glass-panel flex flex-col items-center rounded-2xl p-5 text-center sm:p-6">
              <h3 className="self-start text-base font-bold">Traffic Status</h3>
              <TrafficGauge level={expectedLevel} />
              <p className="-mt-2 text-3xl font-extrabold tracking-normal">
                {expectedLevel.toUpperCase()}
              </p>
              <p className="mt-1 text-sm font-semibold text-muted-foreground">
                {forecast.volume.toLocaleString()} vehicles/hour
              </p>
              <p className="mt-3 text-xs leading-5 text-muted-foreground">
                Expected traffic is above the historical average.
              </p>
            </div>
          </section>

          {/* 5. Alert */}
          <section className="glass-panel flex flex-wrap items-center justify-between gap-4 rounded-2xl border-l-4 border-l-destructive p-5">
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-destructive/15 text-destructive">
                <AlertTriangle size={20} />
              </span>
              <div>
                <p className="text-sm font-bold">{expectedLevel} traffic expected today</p>
                <p className="text-xs text-muted-foreground">
                  {target.alertRoad} · {nextPeak.window.split("–")[0]?.trim()}
                </p>
                <p className="text-xs text-muted-foreground">
                  Forecast: {forecast.volume.toLocaleString()} vehicles/hour
                </p>
              </div>
            </div>
            <Button variant="outline" size="sm">
              View Forecast <ArrowRight className="size-4" />
            </Button>
          </section>

          {/* 6. Why CityFlow */}
          <section>
            <h3 className="text-base font-bold">Why CityFlow?</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {whyCityFlow.map(({ icon: Icon, title, copy }) => (
                <div key={title} className="glass-panel rounded-xl p-4">
                  <span className="grid size-10 place-items-center rounded-lg bg-secondary text-brand-cyan">
                    <Icon size={18} />
                  </span>
                  <p className="mt-3 text-sm font-bold">{title}</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{copy}</p>
                </div>
              ))}
            </div>
          </section>

          {/* 7. Quick actions */}
          <section className="grid gap-3 pb-4 sm:grid-cols-2 xl:grid-cols-4">
            {quickActions.map(({ label, icon: Icon, to }) => {
              const className =
                "group flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3.5 text-sm font-semibold shadow-sm transition hover:-translate-y-0.5 hover:border-brand-cyan";
              const content = (
                <>
                  <span className="flex items-center gap-2">
                    <Icon size={16} className="text-brand-cyan" />
                    {label}
                  </span>
                  <ArrowRight
                    size={16}
                    className="text-brand-cyan transition group-hover:translate-x-1"
                  />
                </>
              );

              if (to) {
                return (
                  <Link key={label} to={to} className={className}>
                    {content}
                  </Link>
                );
              }

              return (
                <button
                  key={label}
                  type="button"
                  onClick={(event) => event.preventDefault()}
                  className={className}
                >
                  {content}
                </button>
              );
            })}
          </section>
        </main>
      </div>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  status,
  statusTone,
  trend,
}: {
  icon: typeof CarFront;
  label: string;
  value: string;
  status: string;
  statusTone: string;
  trend?: string;
}) {
  return (
    <div className="glass-panel rounded-2xl p-4">
      <div className="flex items-center justify-between">
        <span className="grid size-10 place-items-center rounded-lg bg-secondary text-brand-cyan">
          <Icon size={18} />
        </span>
        {trend && <span className="text-[11px] font-bold text-muted-foreground">{trend}</span>}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-extrabold leading-tight tracking-normal">{value}</p>
      <p className={`mt-1 text-xs font-semibold ${statusTone}`}>{status}</p>
    </div>
  );
}
