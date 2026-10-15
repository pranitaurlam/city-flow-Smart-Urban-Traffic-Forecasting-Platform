import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { z } from "zod";
import { DashboardSidebar } from "@/components/dashboard/sidebar";
import { useTheme } from "@/hooks/use-theme";
import { Button } from "@/components/ui/button";
import { Bell, Database, Moon, Sun, User } from "lucide-react";
import {
  ForecastPreviewCard,
  LiveTrafficPanel,
  NearbyLocationsSection,
  WeatherPanel,
} from "@/components/locations/panels";
import { LiveTrafficGrid } from "@/components/locations/live-traffic-grid";
import { WhyForecastCard } from "@/components/locations/why-forecast";
import { HistoricalTrafficCard } from "@/components/locations/historical-card";
import { CompareLocationsSection } from "@/components/locations/compare-locations";
import { RoutePlanner, type RoutePlanResult } from "@/components/locations/route-planner";
import {
  DepartureForecastCard,
  ReliabilityCard,
  RoadConditionCard,
  RouteIntelligencePanel,
  TrafficTrendCard,
} from "@/components/locations/route-intelligence";
import { bengaluruLocations, distanceKm, findLocation, nearestLocations } from "@/lib/locations";
import { getLiveTraffic } from "@/lib/traffic-server";
import { getLiveWeather } from "@/lib/weather-server";

const searchSchema = z.object({ loc: z.string().optional() });

export const Route = createFileRoute("/locations")({
  ssr: false,
  validateSearch: searchSchema,
  head: () => ({ meta: [{ title: "Explore Bengaluru Traffic | CityFlow" }] }),
  component: LocationsPage,
});

function LocationsPage() {
  const { loc } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { dark, toggleDark } = useTheme();
  const [compareB, setCompareB] = useState<string | null>(null);
  const [routePlan, setRoutePlan] = useState<RoutePlanResult | null>(null);

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

  const handleRoutePlan = (result: RoutePlanResult) => {
    setRoutePlan(result);
    // Point the traffic panels below at the tracked corridor closest to the destination.
    const nearestToDestination = [...bengaluruLocations].sort(
      (a, b) => distanceKm(a, result.destination) - distanceKm(b, result.destination),
    )[0];
    if (nearestToDestination && distanceKm(nearestToDestination, result.destination) < 15) {
      selectLocation(nearestToDestination.slug);
    }
    requestAnimationFrame(() =>
      document
        .getElementById("route-analysis")
        ?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
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
          <RoutePlanner onResult={handleRoutePlan} />

          {routePlan && (
            <div id="route-analysis" className="scroll-mt-24 space-y-6">
              <RouteIntelligencePanel result={routePlan} />
              <section className="grid gap-4 lg:grid-cols-2">
                <RoadConditionCard result={routePlan} />
                <TrafficTrendCard result={routePlan} />
              </section>
              <section className="grid gap-4 lg:grid-cols-2">
                <DepartureForecastCard result={routePlan} />
                <ReliabilityCard result={routePlan} />
              </section>
            </div>
          )}

          <NearbyLocationsSection
            locations={nearby}
            onSelect={selectLocation}
            onCompareClick={() =>
              document.getElementById("compare")?.scrollIntoView({ behavior: "smooth" })
            }
          />

          <LiveTrafficGrid onSelect={selectLocation} />

          <section className="grid gap-4 lg:grid-cols-3">
            <LiveTrafficPanel traffic={traffic} />
            <WeatherPanel weather={weather} />
            <ForecastPreviewCard location={location} />
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <WhyForecastCard location={location} weatherCondition={weather?.condition} />
            <HistoricalTrafficCard location={location} />
          </section>

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
