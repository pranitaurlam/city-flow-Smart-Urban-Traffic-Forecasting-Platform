import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { Moon, Sun } from "lucide-react";
import { DashboardSidebar } from "@/components/dashboard/sidebar";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/hooks/use-theme";
import { LocationSearch } from "@/components/locations/location-search";
import { HistoricalPreviewChart } from "@/components/locations/panels";
import { bengaluruLocations, findLocation } from "@/lib/locations";

const searchSchema = z.object({ loc: z.string().optional() });

export const Route = createFileRoute("/traffic-analysis")({
  ssr: false,
  validateSearch: searchSchema,
  head: () => ({ meta: [{ title: "Traffic Analysis | CityFlow" }] }),
  component: TrafficAnalysisPage,
});

function TrafficAnalysisPage() {
  const { loc } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { dark, toggleDark } = useTheme();

  const selectedSlug = loc && findLocation(loc) ? loc : "marathahalli";
  const location = findLocation(selectedSlug) ?? bengaluruLocations[0]!;

  const selectLocation = (slug: string) => {
    navigate({ search: { loc: slug } });
  };

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <DashboardSidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 border-b border-border bg-surface-strong px-5 py-4 backdrop-blur-xl sm:px-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-extrabold tracking-normal">Traffic Analysis</h1>
              <p className="text-sm text-muted-foreground">
                Recent traffic patterns for any Bengaluru location.
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

          <div>
            <h2 className="text-lg font-extrabold tracking-normal">{location.name}, Bengaluru</h2>
            <p className="text-sm text-muted-foreground">
              Weekly traffic volume trend for this location.
            </p>
          </div>

          <div className="max-w-2xl">
            <HistoricalPreviewChart location={location} />
          </div>
        </main>
      </div>
    </div>
  );
}
