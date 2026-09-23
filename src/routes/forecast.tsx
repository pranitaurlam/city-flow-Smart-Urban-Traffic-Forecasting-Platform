import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
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
import { Moon, Sun } from "lucide-react";
import { DashboardSidebar } from "@/components/dashboard/sidebar";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/hooks/use-theme";
import { LocationSearch } from "@/components/locations/location-search";
import { TierBadge } from "@/components/locations/panels";
import { WhyForecastCard } from "@/components/locations/why-forecast";
import { bengaluruLocations, findLocation } from "@/lib/locations";
import { tomorrowPeakForecast } from "@/lib/location-forecast";
import { buildHourly, NOW_HOUR_INDEX } from "@/lib/hourly";
import { getLiveWeather } from "@/lib/weather-server";

const searchSchema = z.object({ loc: z.string().optional() });

export const Route = createFileRoute("/forecast")({
  ssr: false,
  validateSearch: searchSchema,
  head: () => ({ meta: [{ title: "Forecast | CityFlow" }] }),
  component: ForecastPage,
});

function ForecastPage() {
  const { loc } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { dark, toggleDark } = useTheme();

  const selectedSlug = loc && findLocation(loc) ? loc : "marathahalli";
  const location = findLocation(selectedSlug) ?? bengaluruLocations[0]!;
  const selectLocation = (slug: string) => navigate({ search: { loc: slug } });

  const forecast = tomorrowPeakForecast(location);
  const hourly = buildHourly(location.basePeakVolume);
  const nowLabel = hourly[NOW_HOUR_INDEX]?.hour ?? "Now";

  const weatherQuery = useQuery({
    queryKey: ["live-weather", location.slug],
    queryFn: () =>
      getLiveWeather({ data: { lat: location.lat, lon: location.lon, slug: location.slug } }),
    staleTime: 5 * 60_000,
  });

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <DashboardSidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 border-b border-border bg-surface-strong px-5 py-4 backdrop-blur-xl sm:px-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-extrabold tracking-normal">Forecast</h1>
              <p className="text-sm text-muted-foreground">
                See what traffic is expected to look like next.
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => toggleDark()}
              aria-label={`Switch to ${dark ? "light" : "dark"} mode`}
            >
              {dark ? <Sun /> : <Moon />}
            </Button>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1400px] flex-1 space-y-6 px-5 py-6 sm:px-8">
          <LocationSearch selectedSlug={selectedSlug} onSelect={selectLocation} />

          <section className="glass-panel rounded-2xl p-6">
            <p className="text-xs font-bold uppercase tracking-wide text-brand-violet">
              Forecast · Not Live
            </p>
            <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 className="text-2xl font-extrabold tracking-normal">
                  {location.name}, Bengaluru
                </h2>
                <p className="text-sm text-muted-foreground">{forecast.window}</p>
              </div>
              <TierBadge tier={forecast.tier} />
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-3">
              <div className="rounded-xl border border-border bg-surface p-4">
                <p className="text-xs text-muted-foreground">Expected Traffic Level</p>
                <p className="mt-1 text-xl font-extrabold">{forecast.tier.toUpperCase()}</p>
              </div>
              <div className="rounded-xl border border-border bg-surface p-4">
                <p className="text-xs text-muted-foreground">Forecast Volume</p>
                <p className="mt-1 text-xl font-extrabold">
                  {forecast.volume.toLocaleString()}
                  <span className="ml-1 text-xs font-medium text-muted-foreground">veh/hr</span>
                </p>
              </div>
              <div className="rounded-xl border border-border bg-surface p-4">
                <p className="text-xs text-muted-foreground">Confidence Range</p>
                <p className="mt-1 text-xl font-extrabold">
                  {forecast.rangeLow.toLocaleString()}–{forecast.rangeHigh.toLocaleString()}
                </p>
              </div>
            </div>

            <div className="mt-6 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={hourly} margin={{ left: -12 }}>
                  <defs>
                    <linearGradient id="forecastLineFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--brand-cyan)" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="var(--brand-cyan)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="historicalLineFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--brand-blue)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="var(--brand-blue)" stopOpacity={0} />
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
                    fill="url(#historicalLineFill)"
                    strokeWidth={2.5}
                    connectNulls={false}
                  />
                  <Area
                    type="monotone"
                    dataKey="forecast"
                    name="Forecast"
                    stroke="var(--brand-cyan)"
                    strokeDasharray="6 4"
                    fill="url(#forecastLineFill)"
                    strokeWidth={2.5}
                    connectNulls={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </section>

          <WhyForecastCard location={location} weatherCondition={weatherQuery.data?.condition} />
        </main>
      </div>
    </div>
  );
}
