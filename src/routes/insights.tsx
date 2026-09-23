import { createFileRoute, Link } from "@tanstack/react-router";
import {
  CloudRain,
  Gauge,
  Lightbulb,
  MapPin,
  Moon,
  Sun,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { DashboardSidebar } from "@/components/dashboard/sidebar";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/hooks/use-theme";
import { bengaluruLocations } from "@/lib/locations";
import { bangaloreTrafficHistory } from "@/data/bangalore-traffic-history";

export const Route = createFileRoute("/insights")({
  ssr: false,
  head: () => ({ meta: [{ title: "Insights | CityFlow" }] }),
  component: InsightsPage,
});

function InsightsPage() {
  const { dark, toggleDark } = useTheme();

  const withHistory = bengaluruLocations
    .map((l) => ({ location: l, history: bangaloreTrafficHistory[l.slug] }))
    .filter(
      (
        x,
      ): x is {
        location: (typeof bengaluruLocations)[number];
        history: NonNullable<(typeof x)["history"]>;
      } => !!x.history,
    );

  const busiest = [...bengaluruLocations].sort((a, b) => b.basePeakVolume - a.basePeakVolume)[0]!;
  const calmest = [...bengaluruLocations].sort((a, b) => a.basePeakVolume - b.basePeakVolume)[0]!;
  const fastest = [...withHistory].sort((a, b) => b.history.avgSpeedKph - a.history.avgSpeedKph)[0];
  const slowest = [...withHistory].sort((a, b) => a.history.avgSpeedKph - b.history.avgSpeedKph)[0];
  const veryHighCount = bengaluruLocations.filter((l) => l.baseTier === "Very High").length;

  const insights = [
    {
      icon: TrendingUp,
      title: "Busiest location",
      body: `${busiest.name} sees the highest peak traffic volume across monitored Bengaluru locations, around ${busiest.basePeakVolume.toLocaleString()} vehicles/hour.`,
    },
    {
      icon: TrendingDown,
      title: "Calmest location",
      body: `${calmest.name} has the lowest peak traffic volume, around ${calmest.basePeakVolume.toLocaleString()} vehicles/hour — a good choice when traffic elsewhere is high.`,
    },
    fastest && {
      icon: Gauge,
      title: "Fastest average speed",
      body: `${fastest.location.name} moves fastest on average at ${fastest.history.avgSpeedKph} km/h, based on the Kaggle traffic dataset.`,
    },
    slowest && {
      icon: Gauge,
      title: "Slowest average speed",
      body: `${slowest.location.name} sees the most congestion-driven slowdown, averaging ${slowest.history.avgSpeedKph} km/h.`,
    },
    {
      icon: MapPin,
      title: "Very High congestion areas",
      body: `${veryHighCount} of ${bengaluruLocations.length} tracked locations are currently classified as Very High traffic — plan alternate routes around these where possible.`,
    },
    {
      icon: CloudRain,
      title: "Weather sensitivity",
      body: 'Rainy conditions tend to correlate with higher congestion and lower average speeds across Bengaluru — see the Forecast page\'s "Why this forecast?" breakdown for a given location.',
    },
  ].filter((x): x is { icon: typeof Lightbulb; title: string; body: string } => !!x);

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <DashboardSidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 border-b border-border bg-surface-strong px-5 py-4 backdrop-blur-xl sm:px-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-extrabold tracking-normal">Insights</h1>
              <p className="text-sm text-muted-foreground">
                Key takeaways from citywide Bengaluru traffic data.
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
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {insights.map(({ icon: Icon, title, body }) => (
              <div key={title} className="glass-panel rounded-2xl p-5">
                <span className="grid size-10 place-items-center rounded-lg bg-secondary text-brand-cyan">
                  <Icon size={18} />
                </span>
                <p className="mt-3 text-sm font-bold">{title}</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{body}</p>
              </div>
            ))}
          </section>

          <Link
            to="/locations"
            className="glass-panel group flex items-center justify-between rounded-2xl p-5 transition hover:border-brand-cyan"
          >
            <span className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-lg bg-secondary text-brand-cyan">
                <Lightbulb size={18} />
              </span>
              <span>
                <span className="block text-sm font-bold">Explore locations for more detail</span>
                <span className="block text-xs text-muted-foreground">
                  Dive into live traffic, weather, and forecasts per location
                </span>
              </span>
            </span>
          </Link>
        </main>
      </div>
    </div>
  );
}
