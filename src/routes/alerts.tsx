import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, ArrowRight, Moon, Sun } from "lucide-react";
import { DashboardSidebar } from "@/components/dashboard/sidebar";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/hooks/use-theme";
import { TierBadge } from "@/components/locations/panels";
import { bengaluruLocations } from "@/lib/locations";
import { bangaloreTrafficHistory } from "@/data/bangalore-traffic-history";
import { tomorrowPeakForecast } from "@/lib/location-forecast";

export const Route = createFileRoute("/alerts")({
  ssr: false,
  head: () => ({ meta: [{ title: "Alerts | CityFlow" }] }),
  component: AlertsPage,
});

const alerts = bengaluruLocations
  .filter((location) => location.baseTier === "High" || location.baseTier === "Very High")
  .map((location) => {
    const history = bangaloreTrafficHistory[location.slug];
    const forecast = tomorrowPeakForecast(location);
    return {
      location,
      road: history?.busiestRoad ?? `${location.name} Main Road`,
      forecast,
    };
  })
  .sort(
    (a, b) =>
      (b.location.baseTier === "Very High" ? 1 : 0) - (a.location.baseTier === "Very High" ? 1 : 0),
  );

function AlertsPage() {
  const { dark, toggleDark } = useTheme();
  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <DashboardSidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 border-b border-border bg-surface-strong px-5 py-4 backdrop-blur-xl sm:px-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-extrabold tracking-normal">Alerts</h1>
              <p className="text-sm text-muted-foreground">
                Locations currently experiencing high or very high congestion.
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

        <main className="mx-auto w-full max-w-[1400px] flex-1 space-y-4 px-5 py-6 sm:px-8">
          <p className="text-sm text-muted-foreground">
            {alerts.length} of {bengaluruLocations.length} locations flagged
          </p>

          {alerts.map(({ location, road, forecast }) => (
            <section
              key={location.slug}
              className="glass-panel flex flex-wrap items-center justify-between gap-4 rounded-2xl border-l-4 border-l-destructive p-5"
            >
              <div className="flex items-start gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-destructive/15 text-destructive">
                  <AlertTriangle size={20} />
                </span>
                <div>
                  <p className="flex items-center gap-2 text-sm font-bold">
                    {location.baseTier} traffic — {location.name}
                    <TierBadge tier={location.baseTier} />
                  </p>
                  <p className="text-xs text-muted-foreground">{road} · 5:30 PM – 7:30 PM</p>
                  <p className="text-xs text-muted-foreground">
                    Forecast: {forecast.volume.toLocaleString()} vehicles/hour
                  </p>
                </div>
              </div>
              <Button variant="outline" size="sm" asChild>
                <Link to="/locations" search={{ loc: location.slug }}>
                  View on Map <ArrowRight className="size-4" />
                </Link>
              </Button>
            </section>
          ))}
        </main>
      </div>
    </div>
  );
}
