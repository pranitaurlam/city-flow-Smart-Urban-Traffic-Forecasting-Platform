import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { Moon, Sun } from "lucide-react";
import { DashboardSidebar } from "@/components/dashboard/sidebar";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/hooks/use-theme";
import { bengaluruLocations, trafficTierColor, type TrafficTier } from "@/lib/locations";
import { bangaloreTrafficHistory } from "@/data/bangalore-traffic-history";

export const Route = createFileRoute("/cluster-analysis")({
  ssr: false,
  head: () => ({ meta: [{ title: "Cluster Analysis | CityFlow" }] }),
  component: ClusterAnalysisPage,
});

const FALLBACK_SPEED: Record<TrafficTier, number> = {
  Low: 38,
  Moderate: 33,
  High: 27,
  "Very High": 20,
};

const TIERS: TrafficTier[] = ["Low", "Moderate", "High", "Very High"];

function ClusterAnalysisPage() {
  const navigate = useNavigate();
  const { dark, toggleDark } = useTheme();

  const points = bengaluruLocations.map((location) => {
    const history = bangaloreTrafficHistory[location.slug];
    return {
      slug: location.slug,
      name: location.name,
      tier: location.baseTier,
      speed: history?.avgSpeedKph ?? FALLBACK_SPEED[location.baseTier],
      volume: location.basePeakVolume,
    };
  });

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <DashboardSidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 border-b border-border bg-surface-strong px-5 py-4 backdrop-blur-xl sm:px-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-extrabold tracking-normal">Cluster Analysis</h1>
              <p className="text-sm text-muted-foreground">
                Bengaluru locations grouped by traffic characteristics.
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
          <section className="glass-panel rounded-2xl p-5 sm:p-6">
            <h3 className="text-sm font-bold">Speed vs. Volume Clusters</h3>
            <p className="text-xs text-muted-foreground">
              Each point is a location, plotted by average speed and peak volume. Click a point to
              open it on the map.
            </p>
            <div className="mt-4 h-[440px]">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 10, right: 20, bottom: 20, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis
                    type="number"
                    dataKey="speed"
                    name="Avg. Speed"
                    unit=" km/h"
                    stroke="var(--muted-foreground)"
                    fontSize={11}
                    label={{
                      value: "Average Speed (km/h)",
                      position: "insideBottom",
                      offset: -10,
                      fontSize: 11,
                      fill: "var(--muted-foreground)",
                    }}
                  />
                  <YAxis
                    type="number"
                    dataKey="volume"
                    name="Peak Volume"
                    stroke="var(--muted-foreground)"
                    fontSize={11}
                    width={70}
                    label={{
                      value: "Peak Volume (veh/hr)",
                      angle: -90,
                      position: "insideLeft",
                      fontSize: 11,
                      fill: "var(--muted-foreground)",
                    }}
                  />
                  <ZAxis range={[80, 80]} />
                  <Tooltip
                    cursor={{ strokeDasharray: "3 3" }}
                    contentStyle={{
                      background: "var(--card)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    formatter={(value: number, key: string) => [value, key]}
                    labelFormatter={() => ""}
                  />
                  <Legend />
                  {TIERS.map((tier) => (
                    <Scatter
                      key={tier}
                      name={tier}
                      data={points.filter((p) => p.tier === tier)}
                      fill={trafficTierColor[tier]}
                      onClick={(point: { slug?: string }) => {
                        if (point?.slug) {
                          navigate({ to: "/locations", search: { loc: point.slug } });
                        }
                      }}
                      cursor="pointer"
                    />
                  ))}
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {TIERS.map((tier) => {
              const group = points.filter((p) => p.tier === tier);
              return (
                <div key={tier} className="glass-panel rounded-xl p-4">
                  <div className="flex items-center gap-2">
                    <i
                      className="size-2.5 rounded-full"
                      style={{ background: trafficTierColor[tier] }}
                    />
                    <p className="text-sm font-bold">{tier} cluster</p>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {group.length} location{group.length === 1 ? "" : "s"}
                  </p>
                  <p className="mt-2 truncate text-xs text-muted-foreground">
                    {group.map((p) => p.name).join(", ")}
                  </p>
                </div>
              );
            })}
          </section>
        </main>
      </div>
    </div>
  );
}
