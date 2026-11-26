import { Link } from "@tanstack/react-router";
import { ArrowRight, MapPin } from "lucide-react";
import { TierBadge } from "@/components/locations/panels";
import { bengaluruLocations, type BengaluruLocation } from "@/lib/locations";
import { cn } from "@/lib/utils";

/** Where a card leads: the location's own forecast page, or its dashboard. */
type Destination = "forecast" | "dashboard";

export function LocationGrid({
  locations = bengaluruLocations,
  destination = "forecast",
  activeSlug,
  className,
}: {
  locations?: BengaluruLocation[];
  destination?: Destination;
  /** Rendered with a highlighted border, for the location already being viewed. */
  activeSlug?: string;
  className?: string;
}) {
  return (
    <div className={cn("grid gap-3 sm:grid-cols-2 xl:grid-cols-4", className)}>
      {locations.map((location) => (
        <LocationCard
          key={location.slug}
          location={location}
          destination={destination}
          active={location.slug === activeSlug}
        />
      ))}
    </div>
  );
}

function LocationCard({
  location,
  destination,
  active,
}: {
  location: BengaluruLocation;
  destination: Destination;
  active: boolean;
}) {
  const className = cn(
    "cf-reveal group flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-4 shadow-sm transition hover:-translate-y-1 hover:border-brand-cyan hover:shadow-brand",
    active && "border-brand-cyan shadow-brand",
  );
  const content = (
    <>
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 text-sm font-bold">
          <MapPin size={14} className="shrink-0 text-brand-cyan" />
          <span className="truncate">{location.name}</span>
        </span>
        <span className="mt-2 block">
          <TierBadge tier={location.baseTier} />
        </span>
      </span>
      <ArrowRight className="size-4 shrink-0 text-brand-cyan transition group-hover:translate-x-1" />
    </>
  );

  if (destination === "dashboard") {
    return (
      <Link
        to="/dashboard/$city"
        params={{ city: location.slug }}
        className={className}
        aria-current={active ? "page" : undefined}
      >
        {content}
      </Link>
    );
  }

  return (
    <Link to="/forecast" search={{ loc: location.slug }} className={className}>
      {content}
    </Link>
  );
}
