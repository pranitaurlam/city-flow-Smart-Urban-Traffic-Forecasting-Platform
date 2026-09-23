import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { z } from "zod";
import { DashboardSidebar } from "@/components/dashboard/sidebar";
import { useTheme } from "@/hooks/use-theme";
import { Button } from "@/components/ui/button";
import { Bell, ChevronDown, CloudSun, Database, Layers, Moon, Sun, User } from "lucide-react";
import { LocationSearch } from "@/components/locations/location-search";
import { BengaluruMap } from "@/components/locations/bengaluru-map";
import {
  ForecastPreviewCard,
  LiveTrafficPanel,
  LocationInfoCard,
  NearbyLocationsSection,
  WeatherPanel,
} from "@/components/locations/panels";
import { LiveTrafficGrid } from "@/components/locations/live-traffic-grid";
import { WhyForecastCard } from "@/components/locations/why-forecast";
import { HistoricalTrafficCard } from "@/components/locations/historical-card";
import { CompareLocationsSection } from "@/components/locations/compare-locations";
import {
  bengaluruLocations,
  findLocation,
  nearestLocations,
  trafficTierColor,
} from "@/lib/locations";
import { cities } from "@/lib/cities";
import { getLiveTraffic } from "@/lib/traffic-server";
import { getLiveWeather } from "@/lib/weather-server";

const searchSchema = z.object({ loc: z.string().optional() });

export const Route = createFileRoute("/locations")({
  ssr: false,
  validateSearch: searchSchema,
  head: () => ({ meta: [{ title: "Explore Bengaluru Traffic | CityFlow" }] }),
  component: LocationsPage,
});

const legend: { tier: keyof typeof trafficTierColor }[] = [
  { tier: "Low" },
  { tier: "Moderate" },
  { tier: "High" },
  { tier: "Very High" },
];

function LocationsPage() {
  const { loc } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const dashboardNavigate = useNavigate();
  const { dark, toggleDark } = useTheme();
  const [showTrafficLayer, setShowTrafficLayer] = useState(true);
  const [showWeatherLayer, setShowWeatherLayer] = useState(true);
  const [compareB, setCompareB] = useState<string | null>(null);

  const selectedSlug = loc && findLocation(loc) ? loc : "marathahalli";
  const location = findLocation(selectedSlug) ?? bengaluruLocations[0]!;

  const selectLocation = (slug: string) => {
    navigate({ search: { loc: slug } });
  };

  const trafficQuery = useQuery({
    queryKey: ["live-traffic", location.slug],
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
    refetchInterval: 45_000,
  });

  const weatherQuery = useQuery({
    queryKey: ["live-weather", location.slug],
    queryFn: () =>
      getLiveWeather({ data: { lat: location.lat, lon: location.lon, slug: location.slug } }),
    staleTime: 5 * 60_000,
    refetchInterval: 10 * 60_000,
  });

  const traffic = trafficQuery.data;
  const weather = weatherQuery.data;
  const nearby = nearestLocations(location.slug, 4);
  const compareBSlug = compareB ?? nearby[0]?.location.slug ?? bengaluruLocations[1]!.slug;

  const selectCity = (slug: string) => {
    if (slug === "bengaluru") return;
    dashboardNavigate({ to: "/dashboard/$city", params: { city: slug } });
  };

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <DashboardSidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 border-b border-border bg-surface-strong px-5 py-4 backdrop-blur-xl sm:px-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-extrabold tracking-normal">Locations</h1>
              <p className="text-sm text-muted-foreground">
                Explore traffic conditions, patterns and forecasts across cities and roads.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <span className="flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5 text-xs font-bold text-success">
                <i className="size-2 animate-pulse rounded-full bg-success" /> Live Data
              </span>

              <Button
                variant="ghost"
                size="icon"
                onClick={() => toggleDark()}
                aria-label={`Switch to ${dark ? "light" : "dark"} mode`}
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
          <LocationSearch selectedSlug={selectedSlug} onSelect={selectLocation} />

          {/* Selected city banner */}
          <section className="glass-panel flex flex-wrap items-center justify-between gap-4 rounded-2xl p-5">
            <div>
              <div className="relative inline-block">
                <select
                  value="bengaluru"
                  onChange={(event) => selectCity(event.target.value)}
                  aria-label="Select city"
                  className="h-8 appearance-none rounded-md border border-input bg-background py-1 pl-2.5 pr-7 text-xl font-extrabold tracking-normal outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="bengaluru">Explore Bengaluru</option>
                  {cities
                    .filter((c) => c.slug !== "bengaluru")
                    .map((c) => (
                      <option key={c.slug} value={c.slug}>
                        {c.name}
                      </option>
                    ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Real-time traffic and historical traffic insights across Bengaluru. Explore traffic
                patterns across cities.
              </p>
            </div>
            <div className="flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-1.5 text-sm">
              <CloudSun className="size-4 text-brand-cyan" />
              <span className="font-medium">
                {weather ? `${weather.tempC}°C, ${weather.condition}` : "Loading…"}
              </span>
              <span className="text-[10px] font-bold text-muted-foreground">
                Updated{" "}
                {traffic
                  ? new Date(traffic.updatedAt).toLocaleTimeString(undefined, {
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "—"}
              </span>
            </div>
          </section>

          <section className="glass-panel relative overflow-hidden rounded-2xl">
            <div className="relative h-[460px] w-full sm:h-[560px]">
              <BengaluruMap
                selectedSlug={selectedSlug}
                selectedTier={traffic?.tier ?? location.baseTier}
                onSelect={selectLocation}
                showTraffic={showTrafficLayer}
              />

              <div className="pointer-events-none absolute inset-0 z-[400] flex items-end p-4 sm:p-6">
                <div className="pointer-events-auto">
                  <LocationInfoCard
                    location={location}
                    traffic={traffic}
                    weather={weather}
                    onViewDetails={() => {}}
                  />
                </div>
              </div>

              <div className="glass-panel pointer-events-none absolute right-4 top-4 z-[400] rounded-xl px-3 py-2 text-xs font-semibold">
                {legend.map(({ tier }) => (
                  <div key={tier} className="flex items-center gap-1.5 py-0.5">
                    <i
                      className="size-2 rounded-full"
                      style={{ background: trafficTierColor[tier] }}
                    />
                    {tier}
                  </div>
                ))}
              </div>

              <div className="glass-panel pointer-events-auto absolute left-4 top-4 z-[400] rounded-xl px-3 py-2.5 text-xs">
                <p className="mb-1.5 flex items-center gap-1.5 font-bold">
                  <Layers size={13} className="text-brand-cyan" /> Map Layers
                </p>
                <LayerToggle
                  label="Traffic"
                  checked={showTrafficLayer}
                  onChange={setShowTrafficLayer}
                />
                <LayerToggle
                  label="Weather"
                  checked={showWeatherLayer}
                  onChange={setShowWeatherLayer}
                />
                <LayerToggle label="Incidents" checked={false} disabled />
                <LayerToggle label="Forecast" checked={false} disabled />
              </div>
            </div>
          </section>

          <LiveTrafficGrid onSelect={selectLocation} />

          <section className="grid gap-4 lg:grid-cols-3">
            <LiveTrafficPanel traffic={traffic} />
            {showWeatherLayer ? (
              <WeatherPanel weather={weather} />
            ) : (
              <div className="glass-panel grid place-items-center rounded-2xl p-5 text-center text-xs text-muted-foreground">
                Weather layer hidden — toggle it on in Map Layers.
              </div>
            )}
            <ForecastPreviewCard location={location} />
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <WhyForecastCard location={location} weatherCondition={weather?.condition} />
            <HistoricalTrafficCard location={location} />
          </section>

          <NearbyLocationsSection
            locations={nearby}
            onSelect={selectLocation}
            onCompareClick={() =>
              document.getElementById("compare")?.scrollIntoView({ behavior: "smooth" })
            }
          />

          <CompareLocationsSection
            slugA={selectedSlug}
            slugB={compareBSlug}
            onChangeA={selectLocation}
            onChangeB={setCompareB}
          />

          {/* Data source indicators */}
          <section className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-border pt-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Database size={12} /> Traffic:{" "}
              {traffic?.live
                ? "Live traffic data"
                : traffic?.fromDataset
                  ? "Kaggle traffic dataset"
                  : "Simulated estimate"}
            </span>
            <span className="flex items-center gap-1.5">
              <Database size={12} /> Weather: Weather API
            </span>
            <span className="flex items-center gap-1.5">
              <Database size={12} /> Historical: Historical traffic dataset
            </span>
            <span className="flex items-center gap-1.5">
              <Database size={12} /> Forecast: CityFlow Forecast Model
            </span>
            <span className="ml-auto">
              Last updated:{" "}
              {traffic
                ? new Date(traffic.updatedAt).toLocaleTimeString(undefined, {
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "—"}
            </span>
          </section>
        </main>
      </div>
    </div>
  );
}

function LayerToggle({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange?: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label
      className={`flex items-center gap-1.5 py-0.5 ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
      title={disabled ? "Coming soon" : undefined}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange?.(event.target.checked)}
        className="size-3.5 accent-[var(--brand-cyan)]"
      />
      {label}
    </label>
  );
}
