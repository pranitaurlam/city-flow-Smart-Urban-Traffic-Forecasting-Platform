import { useQuery } from "@tanstack/react-query";
import { Gauge, TrendingDown, TrendingUp } from "lucide-react";
import { TierBadge } from "@/components/locations/panels";
import { findLocation } from "@/lib/locations";
import { getLiveTraffic } from "@/lib/traffic-server";

const FEATURED_SLUGS = ["mg-road", "marathahalli", "hsr-layout", "whitefield", "silk-board"];

function FeaturedCard({ slug, onSelect }: { slug: string; onSelect: (slug: string) => void }) {
  const location = findLocation(slug);
  const trafficQuery = useQuery({
    queryKey: ["live-traffic", slug],
    enabled: !!location,
    queryFn: () =>
      getLiveTraffic({
        data: {
          lat: location!.lat,
          lon: location!.lon,
          basePeakVolume: location!.basePeakVolume,
          baseTier: location!.baseTier,
          slug: location!.slug,
        },
      }),
    staleTime: 20_000,
    refetchInterval: 45_000,
  });

  if (!location) return null;
  const traffic = trafficQuery.data;
  const diffPct = traffic
    ? Math.round(
        ((traffic.volume - location.basePeakVolume * 0.65) / (location.basePeakVolume * 0.65)) *
          100,
      )
    : null;

  return (
    <button
      type="button"
      onClick={() => onSelect(slug)}
      className="glass-panel rounded-xl p-4 text-left transition hover:-translate-y-0.5 hover:border-brand-cyan"
    >
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold">{location.name}</p>
        {traffic ? (
          <TierBadge tier={traffic.tier} />
        ) : (
          <Gauge size={14} className="text-muted-foreground" />
        )}
      </div>
      {traffic ? (
        <>
          <p className="mt-2 text-lg font-extrabold tracking-normal">
            {traffic.volume.toLocaleString()}
            <span className="ml-1 text-xs font-medium text-muted-foreground">veh/hr</span>
          </p>
          <p className="text-xs text-muted-foreground">{traffic.speedKph} km/h avg</p>
          {diffPct !== null && (
            <p
              className={`mt-1.5 flex items-center gap-1 text-xs font-semibold ${diffPct >= 0 ? "text-destructive" : "text-success"}`}
            >
              {diffPct >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
              {diffPct >= 0 ? "+" : ""}
              {diffPct}% vs historical average
            </p>
          )}
        </>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">Loading…</p>
      )}
    </button>
  );
}

export function LiveTrafficGrid({ onSelect }: { onSelect: (slug: string) => void }) {
  return (
    <section>
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold">Live Traffic</h3>
          <p className="text-xs text-muted-foreground">
            Current, observed traffic conditions across popular locations.
          </p>
        </div>
        <span className="flex items-center gap-1.5 text-xs font-bold text-success">
          <i className="size-2 animate-pulse rounded-full bg-success" /> LIVE / OBSERVED
        </span>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {FEATURED_SLUGS.map((slug) => (
          <FeaturedCard key={slug} slug={slug} onSelect={onSelect} />
        ))}
      </div>
    </section>
  );
}
