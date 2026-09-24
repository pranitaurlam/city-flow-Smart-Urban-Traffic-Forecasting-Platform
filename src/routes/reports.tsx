import { createFileRoute, Link } from "@tanstack/react-router";
import { Download, Moon, Sun } from "lucide-react";
import { DashboardSidebar } from "@/components/dashboard/sidebar";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/hooks/use-theme";
import { TierBadge } from "@/components/locations/panels";
import { bengaluruLocations } from "@/lib/locations";
import { bangaloreTrafficHistory } from "@/data/bangalore-traffic-history";

export const Route = createFileRoute("/reports")({
  ssr: false,
  head: () => ({ meta: [{ title: "Reports | CityFlow" }] }),
  component: ReportsPage,
});

const rows = bengaluruLocations.map((location) => {
  const history = bangaloreTrafficHistory[location.slug];
  return {
    name: location.name,
    tier: location.baseTier,
    volume: Math.round(location.basePeakVolume * 0.65),
    speed: history?.avgSpeedKph ?? null,
    source: location.hasDataset ? "Kaggle dataset" : "Estimated",
  };
});

function downloadCsv() {
  const header = "Location,Traffic Level,Current Volume (veh/hr),Avg Speed (km/h),Data Source";
  const body = rows
    .map((r) => `${r.name},${r.tier},${r.volume},${r.speed ?? "—"},${r.source}`)
    .join("\n");
  const blob = new Blob([`${header}\n${body}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "cityflow-bengaluru-traffic-report.csv";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function ReportsPage() {
  const { dark, toggleDark } = useTheme();

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <DashboardSidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 border-b border-border bg-surface-strong px-5 py-4 backdrop-blur-xl sm:px-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-extrabold tracking-normal">Reports</h1>
              <p className="text-sm text-muted-foreground">
                Generate and review a citywide traffic report.
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
          <section className="glass-panel flex flex-wrap items-center justify-between gap-4 rounded-2xl p-5">
            <div>
              <h2 className="text-sm font-bold">Bengaluru Traffic Report</h2>
              <p className="text-xs text-muted-foreground">
                {rows.length} locations · {rows.filter((r) => r.source === "Kaggle dataset").length}{" "}
                backed by the Kaggle traffic dataset
              </p>
            </div>
            <Button variant="cityflow" size="sm" onClick={downloadCsv}>
              Generate Report <Download className="size-4" />
            </Button>
          </section>

          <section className="glass-panel overflow-x-auto rounded-2xl p-5">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="py-2 pr-4 font-semibold">Location</th>
                  <th className="py-2 pr-4 font-semibold">Traffic Level</th>
                  <th className="py-2 pr-4 font-semibold">Current Volume</th>
                  <th className="py-2 pr-4 font-semibold">Avg Speed</th>
                  <th className="py-2 font-semibold">Data Source</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.name} className="border-b border-border last:border-0">
                    <td className="py-2.5 pr-4 font-medium">
                      <Link
                        to="/locations"
                        search={{ loc: row.name.toLowerCase().replace(/\s+/g, "-") }}
                        className="hover:text-brand-cyan"
                      >
                        {row.name}
                      </Link>
                    </td>
                    <td className="py-2.5 pr-4">
                      <TierBadge tier={row.tier} />
                    </td>
                    <td className="py-2.5 pr-4">{row.volume.toLocaleString()} veh/hr</td>
                    <td className="py-2.5 pr-4">{row.speed ? `${row.speed} km/h` : "—"}</td>
                    <td className="py-2.5 text-xs text-muted-foreground">{row.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </main>
      </div>
    </div>
  );
}
