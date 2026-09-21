import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { DashboardSidebar } from "@/components/dashboard/sidebar";
import { useTheme } from "@/hooks/use-theme";
import { Button } from "@/components/ui/button";
import { ArrowRight, LineChart, Moon, Sun } from "lucide-react";
import { LocationSearch } from "@/components/locations/location-search";
import { BengaluruMap } from "@/components/locations/bengaluru-map";
import {
  ForecastPreviewCard,
  LiveTrafficPanel,
  LocationInfoCard,
  NearbyLocationsSection,
  WeatherPanel,
} from "@/components/locations/panels";
import {
  bengaluruLocations,
  findLocation,
  nearestLocations,
  trafficTierColor,
} from "@/lib/locations";
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
  const { dark, toggleDark } = useTheme();

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
  const nearby = nearestLocations(location.slug, 4).map((item) => item.location);

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <DashboardSidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 border-b border-border bg-surface-strong px-5 py-4 backdrop-blur-xl sm:px-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-extrabold tracking-normal">Explore Bengaluru Traffic</h1>
              <p className="text-sm text-muted-foreground">
                Select a location to view live traffic, weather, patterns, and forecasts.
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

          <section className="glass-panel relative overflow-hidden rounded-2xl">
            <div className="relative h-[460px] w-full sm:h-[560px]">
              <BengaluruMap
                selectedSlug={selectedSlug}
                selectedTier={traffic?.tier ?? location.baseTier}
                onSelect={selectLocation}
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
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-3">
            <LiveTrafficPanel traffic={traffic} />
            <WeatherPanel weather={weather} />
            <ForecastPreviewCard location={location} />
          </section>

          <Link
            to="/traffic-analysis"
            search={{ loc: selectedSlug }}
            className="glass-panel group flex items-center justify-between rounded-2xl p-5 transition hover:border-brand-cyan"
          >
            <span className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-lg bg-secondary text-brand-cyan">
                <LineChart size={18} />
              </span>
              <span>
                <span className="block text-sm font-bold">View Traffic Analysis</span>
                <span className="block text-xs text-muted-foreground">
                  Recent traffic pattern and deeper trends for {location.name}
                </span>
              </span>
            </span>
            <ArrowRight className="size-4 text-brand-cyan transition group-hover:translate-x-1" />
          </Link>

          <NearbyLocationsSection locations={nearby} onSelect={selectLocation} />
        </main>
      </div>
    </div>
  );
}
