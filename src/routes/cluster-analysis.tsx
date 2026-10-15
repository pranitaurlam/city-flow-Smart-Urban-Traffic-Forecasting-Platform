import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
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
import { MapPin, Moon, Sun, X } from "lucide-react";
import { DashboardSidebar } from "@/components/dashboard/sidebar";
import { Button } from "@/components/ui/button";
import { TierBadge } from "@/components/locations/panels";
import { useTheme } from "@/hooks/use-theme";
import { bengaluruLocations, trafficTierColor, type TrafficTier } from "@/lib/locations";
import { bangaloreTrafficHistory } from "@/data/bangalore-traffic-history";
import { z } from "zod";

export const Route = createFileRoute("/cluster-analysis")({
  ssr: false,
  head: () => ({ meta: [{ title: "Cluster Analysis | CityFlow" }] }),
  validateSearch: z.object({ loc: z.string().optional() }),
  component: ClusterAnalysisPage,
});

const FALLBACK_SPEED: Record<TrafficTier, number> = {
  Low: 38,
  Moderate: 33,
  High: 27,
  "Very High": 20,
};

const TIERS: TrafficTier[] = ["Low", "Moderate", "High", "Very High"];

type ClusterPoint = {
  slug: string;
  name: string;
  tier: TrafficTier;
  speed: number;
  volume: number;
};

function ClusterAnalysisPage() {
  const navigate = useNavigate();
  const { dark, toggleDark } = useTheme();
  const { loc } = Route.useSearch();
  const [selectedSlug, setSelectedSlug] = useState(loc ?? "");

  const points: ClusterPoint[] = useMemo(
    () =>
      bengaluruLocations.map((location) => {
        const history = bangaloreTrafficHistory[location.slug];
        return {
          slug: location.slug,
          name: location.name,
          tier: location.baseTier,
          speed: history?.avgSpeedKph ?? FALLBACK_SPEED[location.baseTier],
          volume: location.basePeakVolume,
        };
      }),
    [],
  );

  const sortedForSelect = useMemo(
    () => [...points].sort((a, b) => a.name.localeCompare(b.name)),
    [points],
  );

  const selected = points.find((p) => p.slug === selectedSlug) ?? null;
  const clusterMates = selected ? points.filter((p) => p.tier === selected.tier) : [];

  const selectLocation = (slug: string) => {
    setSelectedSlug(slug);
    navigate({ to: "/cluster-analysis", search: slug ? { loc: slug } : {} });
  };

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
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h3 className="text-sm font-bold">Speed vs. Volume Clusters</h3>
                <p className="text-xs text-muted-foreground">
                  Each point is a location, plotted by average speed and peak volume. Click a point
                  to open it on the map.
                </p>
              </div>
              <label className="block">
                <span className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                  <MapPin size={12} className="text-brand-cyan" /> Highlight a location
                </span>
                <select
                  value={selectedSlug}
                  onChange={(e) => selectLocation(e.target.value)}
                  className="h-10 w-56 rounded-lg border border-input bg-background px-3 text-sm font-semibold shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="">All locations</option>
                  {sortedForSelect.map((p) => (
                    <option key={p.slug} value={p.slug}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {selected && (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand-cyan/40 bg-[color-mix(in_oklab,var(--brand-cyan)_8%,transparent)] px-4 py-3">
                <div className="flex items-center gap-3">
                  <TierBadge tier={selected.tier} />
                  <div>
                    <p className="text-sm font-bold">{selected.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {selected.speed.toFixed(1)} km/h avg · {selected.volume.toLocaleString()}{" "}
                      veh/hr peak · in the {selected.tier} cluster with{" "}
                      {clusterMates.length - 1 > 0
                        ? `${clusterMates.length - 1} other location${clusterMates.length - 1 === 1 ? "" : "s"}`
                        : "no other locations"}
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Clear highlighted location"
                  onClick={() => selectLocation("")}
                >
                  <X className="size-4" />
                </Button>
              </div>
            )}

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
                      fillOpacity={!selected || selected.tier === tier ? 1 : 0.25}
                      onClick={(point: { slug?: string }) => {
                        if (point?.slug) {
                          navigate({ to: "/locations", search: { loc: point.slug } });
                        }
                      }}
                      cursor="pointer"
                    />
                  ))}
                  {selected && (
                    <Scatter
                      name="Selected"
                      data={[selected]}
                      legendType="none"
                      fill={trafficTierColor[selected.tier]}
                      shape={(props: { cx?: number; cy?: number }) => (
                        <g>
                          <circle
                            cx={props.cx}
                            cy={props.cy}
                            r={13}
                            fill="none"
                            stroke={trafficTierColor[selected.tier]}
                            strokeWidth={2}
                          />
                          <circle
                            cx={props.cx}
                            cy={props.cy}
                            r={6}
                            fill={trafficTierColor[selected.tier]}
                            stroke="var(--card)"
                            strokeWidth={2}
                          />
                        </g>
                      )}
                    />
                  )}
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {TIERS.map((tier) => {
              const group = points.filter((p) => p.tier === tier);
              const isSelectedCluster = selected?.tier === tier;
              return (
                <div
                  key={tier}
                  className={`glass-panel rounded-xl p-4 transition ${
                    isSelectedCluster ? "border-brand-cyan ring-1 ring-brand-cyan" : ""
                  }`}
                >
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
                  <p className="mt-2 text-xs text-muted-foreground">
                    {group.map((p) => (
                      <button
                        key={p.slug}
                        type="button"
                        onClick={() => selectLocation(p.slug)}
                        className={`mr-1 inline-block rounded px-0.5 underline-offset-2 hover:text-foreground hover:underline ${
                          p.slug === selectedSlug ? "font-bold text-brand-cyan" : ""
                        }`}
                      >
                        {p.name}
                        {p.slug !== group[group.length - 1]?.slug ? "," : ""}
                      </button>
                    ))}
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
