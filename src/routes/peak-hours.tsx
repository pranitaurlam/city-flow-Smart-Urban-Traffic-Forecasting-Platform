import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
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
import { bengaluruLocations, findLocation } from "@/lib/locations";
import { buildHourly } from "@/lib/hourly";

const searchSchema = z.object({ loc: z.string().optional() });

export const Route = createFileRoute("/peak-hours")({
  ssr: false,
  validateSearch: searchSchema,
  head: () => ({ meta: [{ title: "Peak Hours | CityFlow" }] }),
  component: PeakHoursPage,
});

function PeakHoursPage() {
  const { loc } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { dark, toggleDark } = useTheme();

  const selectedSlug = loc && findLocation(loc) ? loc : "marathahalli";
  const location = findLocation(selectedSlug) ?? bengaluruLocations[0]!;
  const selectLocation = (slug: string) => navigate({ search: { loc: slug } });

  const hourly = buildHourly(location.basePeakVolume);
  const data = hourly.map((h) => ({ hour: h.hour, volume: h.historical ?? h.forecast ?? 0 }));
  const peakVolume = Math.max(...data.map((d) => d.volume));
  const peakHour = data.find((d) => d.volume === peakVolume)?.hour ?? "6PM";
  const offPeakVolume = Math.min(...data.map((d) => d.volume));

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <DashboardSidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 border-b border-border bg-surface-strong px-5 py-4 backdrop-blur-xl sm:px-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-extrabold tracking-normal">Peak Hours</h1>
              <p className="text-sm text-muted-foreground">
                Understand when traffic is busiest, hour by hour.
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

          <section className="grid gap-4 sm:grid-cols-3">
            <div className="glass-panel rounded-2xl p-4">
              <p className="text-xs text-muted-foreground">Peak Hour</p>
              <p className="mt-1 text-xl font-extrabold">{peakHour}</p>
            </div>
            <div className="glass-panel rounded-2xl p-4">
              <p className="text-xs text-muted-foreground">Peak Volume</p>
              <p className="mt-1 text-xl font-extrabold">{peakVolume.toLocaleString()} veh/hr</p>
            </div>
            <div className="glass-panel rounded-2xl p-4">
              <p className="text-xs text-muted-foreground">Off-Peak Volume</p>
              <p className="mt-1 text-xl font-extrabold">{offPeakVolume.toLocaleString()} veh/hr</p>
            </div>
          </section>

          <section className="glass-panel rounded-2xl p-5 sm:p-6">
            <h3 className="text-sm font-bold">{location.name}, Bengaluru — Hourly Volume</h3>
            <p className="text-xs text-muted-foreground">
              Today&apos;s traffic volume by hour. The peak hour is highlighted.
            </p>
            <div className="mt-4 h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis
                    dataKey="hour"
                    stroke="var(--muted-foreground)"
                    fontSize={11}
                    interval={1}
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
                  <Bar dataKey="volume" radius={[4, 4, 0, 0]}>
                    {data.map((d) => (
                      <Cell
                        key={d.hour}
                        fill={d.volume === peakVolume ? "var(--destructive)" : "var(--brand-cyan)"}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
