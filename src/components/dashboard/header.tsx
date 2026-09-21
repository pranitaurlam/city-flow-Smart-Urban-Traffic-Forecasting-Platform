import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { Bell, CloudSun, MapPin, Moon, Search, Sun, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/hooks/use-theme";
import { dashboardTargets, type DashboardTarget } from "@/lib/dashboard-targets";
import { getLiveWeather } from "@/lib/weather-server";

export function DashboardHeader({ target }: { target: DashboardTarget }) {
  const { dark, toggleDark } = useTheme();
  const navigate = useNavigate();
  const [now, setNow] = useState<Date | null>(null);
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const weatherQuery = useQuery({
    queryKey: ["live-weather", target.slug],
    queryFn: () =>
      getLiveWeather({ data: { lat: target.lat, lon: target.lon, slug: target.slug } }),
    staleTime: 5 * 60_000,
    refetchInterval: 10 * 60_000,
  });
  const weather = weatherQuery.data;

  const matches = useMemo(() => {
    const clean = query.trim().toLowerCase();
    if (!clean) return [];
    return dashboardTargets
      .filter((item) => `${item.name} ${item.country}`.toLowerCase().includes(clean))
      .slice(0, 8);
  }, [query]);

  const goTo = (slug: string) => {
    navigate({ to: "/dashboard/$city", params: { city: slug } });
    setQuery("");
    setFocused(false);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && matches.length > 0) {
      event.preventDefault();
      goTo(matches[0]!.slug);
    } else if (event.key === "Escape") {
      setQuery("");
      event.currentTarget.blur();
    }
  };

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-surface-strong px-5 py-4 backdrop-blur-xl sm:px-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-normal">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Understand today&apos;s traffic and what&apos;s expected next.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-brand-cyan" />
            <input
              value={query || `${target.name}, ${target.country}`}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={(event) => {
                setFocused(true);
                event.target.select();
              }}
              onBlur={() => setTimeout(() => setFocused(false), 120)}
              aria-label="Search a location"
              placeholder="Type a location, e.g. Koramangala"
              className="h-9 w-64 rounded-md border border-input bg-background pl-9 pr-3 text-sm font-medium shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            {focused && query.trim() && (
              <div className="glass-panel absolute inset-x-0 top-[calc(100%+6px)] z-30 max-h-72 overflow-y-auto rounded-lg p-1.5">
                {matches.length > 0 ? (
                  matches.map((item) => (
                    <button
                      key={item.slug}
                      type="button"
                      onMouseDown={() => goTo(item.slug)}
                      className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-accent"
                    >
                      <MapPin size={13} className="text-brand-cyan" />
                      {item.name}, {item.country}
                    </button>
                  ))
                ) : (
                  <p className="px-2.5 py-1.5 text-sm text-muted-foreground">
                    No matching location. Press Enter on a suggestion, or try MG Road, Koramangala,
                    Whitefield…
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="hidden items-center gap-2 rounded-md border border-border bg-surface px-3 py-1.5 text-sm sm:flex">
            <CloudSun className="size-4 text-brand-cyan" />
            <span className="font-medium">
              {weather ? `${weather.condition}, ${weather.tempC}°C` : "Loading…"}
            </span>
            {weather && (
              <span className="text-[10px] font-bold text-muted-foreground">
                {weather.live ? "LIVE" : "EST."}
              </span>
            )}
          </div>

          <div className="hidden min-w-24 items-center rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium sm:flex">
            {now
              ? now.toLocaleString(undefined, {
                  weekday: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "—"}
          </div>

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
  );
}
