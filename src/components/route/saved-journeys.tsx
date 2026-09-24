import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bookmark, Plus, X } from "lucide-react";
import { TierBadge } from "@/components/locations/panels";
import { bengaluruLocations } from "@/lib/locations";
import { getLiveTraffic } from "@/lib/traffic-server";

type SavedJourney = { id: string; label: string; sourceSlug: string; destSlug: string };

const STORAGE_KEY = "cityflow-saved-journeys";

const DEFAULT_JOURNEYS: SavedJourney[] = [
  { id: "d1", label: "Home → College", sourceSlug: "jayanagar", destSlug: "koramangala" },
  { id: "d2", label: "College → Home", sourceSlug: "koramangala", destSlug: "jayanagar" },
  { id: "d3", label: "Home → Office", sourceSlug: "jayanagar", destSlug: "mg-road" },
  {
    id: "d4",
    label: "Airport → Hotel",
    sourceSlug: "kempegowda-airport",
    destSlug: "indiranagar",
  },
];

function loadJourneys(): SavedJourney[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_JOURNEYS;
    const parsed = JSON.parse(raw) as SavedJourney[];
    return Array.isArray(parsed) && parsed.length ? parsed : DEFAULT_JOURNEYS;
  } catch {
    return DEFAULT_JOURNEYS;
  }
}

function saveJourneys(journeys: SavedJourney[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(journeys));
  } catch {
    // localStorage unavailable (private mode, etc.) — silently skip persistence
  }
}

function JourneyCard({
  journey,
  onSelect,
  onRemove,
}: {
  journey: SavedJourney;
  onSelect: (sourceSlug: string, destSlug: string) => void;
  onRemove: (id: string) => void;
}) {
  const source = bengaluruLocations.find((l) => l.slug === journey.sourceSlug);
  const destination = bengaluruLocations.find((l) => l.slug === journey.destSlug);

  const trafficQuery = useQuery({
    queryKey: ["live-traffic", journey.destSlug],
    enabled: !!destination,
    queryFn: () =>
      getLiveTraffic({
        data: {
          lat: destination!.lat,
          lon: destination!.lon,
          basePeakVolume: destination!.basePeakVolume,
          baseTier: destination!.baseTier,
          slug: destination!.slug,
        },
      }),
    staleTime: 20_000,
  });
  const traffic = trafficQuery.data;

  if (!source || !destination) return null;

  return (
    <div className="glass-panel rounded-xl p-4">
      <div className="flex items-start justify-between gap-2">
        <button
          type="button"
          onClick={() => onSelect(journey.sourceSlug, journey.destSlug)}
          className="min-w-0 text-left"
        >
          <p className="truncate text-sm font-bold hover:text-brand-cyan">{journey.label}</p>
          <p className="truncate text-xs text-muted-foreground">
            {source.name} → {destination.name}
          </p>
        </button>
        <button
          type="button"
          onClick={() => onRemove(journey.id)}
          aria-label={`Remove ${journey.label}`}
          className="text-muted-foreground hover:text-destructive"
        >
          <X size={14} />
        </button>
      </div>
      <div className="mt-3 flex items-center justify-between text-xs">
        {traffic ? (
          <TierBadge tier={traffic.tier} />
        ) : (
          <span className="text-muted-foreground">Loading…</span>
        )}
        {traffic && (
          <span className="font-semibold text-muted-foreground">{traffic.speedKph} km/h</span>
        )}
      </div>
    </div>
  );
}

export function SavedJourneys({
  onSelect,
  currentSourceSlug,
  currentDestSlug,
}: {
  onSelect: (sourceSlug: string, destSlug: string) => void;
  currentSourceSlug: string;
  currentDestSlug: string;
}) {
  const [journeys, setJourneys] = useState<SavedJourney[]>(DEFAULT_JOURNEYS);
  const [ready, setReady] = useState(false);
  const [label, setLabel] = useState("");

  useEffect(() => {
    setJourneys(loadJourneys());
    setReady(true);
  }, []);

  const addCurrent = () => {
    const source = bengaluruLocations.find((l) => l.slug === currentSourceSlug);
    const destination = bengaluruLocations.find((l) => l.slug === currentDestSlug);
    if (!source || !destination) return;
    const next: SavedJourney = {
      id: `${Date.now()}`,
      label: label.trim() || `${source.name} → ${destination.name}`,
      sourceSlug: currentSourceSlug,
      destSlug: currentDestSlug,
    };
    const updated = [...journeys, next];
    setJourneys(updated);
    saveJourneys(updated);
    setLabel("");
  };

  const remove = (id: string) => {
    const updated = journeys.filter((j) => j.id !== id);
    setJourneys(updated);
    saveJourneys(updated);
  };

  if (!ready) return null;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="flex items-center gap-1.5 text-sm font-bold">
          <Bookmark size={15} className="text-brand-cyan" /> My Journeys
        </h3>
        <div className="flex items-center gap-2">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Name this journey…"
            className="h-8 rounded-md border border-input bg-background px-2.5 text-xs outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          <button
            type="button"
            onClick={addCurrent}
            className="flex items-center gap-1 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs font-semibold hover:border-brand-cyan"
          >
            <Plus size={13} /> Save current
          </button>
        </div>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {journeys.map((j) => (
          <JourneyCard key={j.id} journey={j} onSelect={onSelect} onRemove={remove} />
        ))}
        {journeys.length === 0 && (
          <p className="text-xs text-muted-foreground">No saved journeys yet.</p>
        )}
      </div>
    </div>
  );
}

export type { SavedJourney };
