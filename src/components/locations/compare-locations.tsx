import { useQuery } from "@tanstack/react-query";
import { Scale } from "lucide-react";
import { bengaluruLocations, findLocation, PEAK_HOUR_SHARE } from "@/lib/locations";
import { getLiveTraffic } from "@/lib/traffic-server";
import { tomorrowPeakForecast } from "@/lib/location-forecast";
import { bangaloreTrafficHistory } from "@/data/bangalore-traffic-history";
import { TierBadge } from "@/components/locations/panels";

function useCompareTraffic(slug: string) {
  const location = findLocation(slug)!;
  return useQuery({
    queryKey: ["live-traffic", slug],
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
  });
}

function LocationColumn({
  slug,
  traffic,
}: {
  slug: string;
  traffic: ReturnType<typeof useCompareTraffic>["data"];
}) {
  const location = findLocation(slug)!;
  const forecast = tomorrowPeakForecast(location);
  const history = bangaloreTrafficHistory[location.slug];
  const historicalAverage = history
    ? Math.round(history.avgVolume * PEAK_HOUR_SHARE)
    : Math.round(location.basePeakVolume * 0.75);

  return (
    <div className="min-w-0">
      <p className="truncate text-sm font-bold">{location.name}</p>
      <div className="mt-3 space-y-3 text-sm">
        <Row
          label="Traffic Volume"
          value={traffic ? `${traffic.volume.toLocaleString()}/hr` : "—"}
        />
        <Row label="Average Speed" value={traffic ? `${traffic.speedKph} km/h` : "—"} />
        <Row label="Congestion" value={traffic ? `${traffic.congestionPct}%` : "—"} />
        <Row label="Peak Hour" value="5:30 PM – 7:30 PM" />
        <Row label="Historical Average" value={`${historicalAverage.toLocaleString()}/hr`} />
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Forecast</span>
          <TierBadge tier={forecast.tier} />
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-border pb-2 last:border-0 last:pb-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="font-bold">{value}</span>
    </div>
  );
}

export function CompareLocationsSection({
  slugA,
  slugB,
  onChangeA,
  onChangeB,
}: {
  slugA: string;
  slugB: string;
  onChangeA: (slug: string) => void;
  onChangeB: (slug: string) => void;
}) {
  const trafficA = useCompareTraffic(slugA);
  const trafficB = useCompareTraffic(slugB);

  return (
    <section id="compare" className="glass-panel scroll-mt-24 rounded-2xl p-5">
      <div className="flex items-center gap-2">
        <span className="grid size-9 place-items-center rounded-lg bg-secondary text-brand-cyan">
          <Scale size={16} />
        </span>
        <div>
          <h3 className="text-sm font-bold">Compare Locations</h3>
          <p className="text-xs text-muted-foreground">
            {findLocation(slugA)?.name} vs {findLocation(slugB)?.name}
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <LocationSelect label="Location A" value={slugA} onChange={onChangeA} />
        <LocationSelect label="Location B" value={slugB} onChange={onChangeB} />
      </div>

      <div className="mt-5 grid gap-6 border-t border-border pt-5 sm:grid-cols-2">
        <LocationColumn slug={slugA} traffic={trafficA.data} />
        <LocationColumn slug={slugB} traffic={trafficB.data} />
      </div>
    </section>
  );
}

function LocationSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (slug: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm font-medium shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        {bengaluruLocations.map((item) => (
          <option key={item.slug} value={item.slug}>
            {item.name}
          </option>
        ))}
      </select>
    </label>
  );
}
