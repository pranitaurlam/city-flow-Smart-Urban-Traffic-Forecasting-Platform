import { useQuery } from "@tanstack/react-query";
import { CloudSun } from "lucide-react";
import { getLiveWeather } from "@/lib/weather-server";
import type { BengaluruLocation } from "@/lib/locations";

function Stop({ label, location }: { label: string; location: BengaluruLocation }) {
  const weatherQuery = useQuery({
    queryKey: ["live-weather", location.slug],
    queryFn: () =>
      getLiveWeather({ data: { lat: location.lat, lon: location.lon, slug: location.slug } }),
    staleTime: 5 * 60_000,
  });
  const weather = weatherQuery.data;

  return (
    <div className="flex-1 rounded-xl border border-border bg-surface p-4 text-center">
      <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-xs text-muted-foreground">{location.name}</p>
      <CloudSun className="mx-auto mt-2 size-6 text-brand-cyan" />
      {weather ? (
        <>
          <p className="mt-1 text-xl font-extrabold">{weather.tempC}°C</p>
          <p className="text-xs text-muted-foreground">{weather.condition}</p>
        </>
      ) : (
        <p className="mt-1 text-xs text-muted-foreground">Loading…</p>
      )}
    </div>
  );
}

export function WeatherAlongRoute({
  source,
  midpoint,
  destination,
}: {
  source: BengaluruLocation;
  midpoint: BengaluruLocation;
  destination: BengaluruLocation;
}) {
  return (
    <div className="glass-panel rounded-2xl p-5 sm:p-6">
      <h3 className="text-sm font-bold">Weather Along Route</h3>
      <p className="text-xs text-muted-foreground">
        Current conditions at the start, midpoint, and destination.
      </p>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <Stop label="Start" location={source} />
        <Stop label="Midpoint" location={midpoint} />
        <Stop label="Destination" location={destination} />
      </div>
    </div>
  );
}
