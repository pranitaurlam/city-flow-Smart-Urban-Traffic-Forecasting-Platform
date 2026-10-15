import { useMemo, useState } from "react";
import { MapPin, LoaderCircle } from "lucide-react";
import { bengaluruLocations } from "@/lib/locations";
import { geocodePlace } from "@/lib/geocode-server";
import { cn } from "@/lib/utils";

export type ResolvedPlace = {
  text: string;
  label: string;
  lat: number;
  lon: number;
  approximate: boolean;
};

/**
 * Starting-point / destination input with autocomplete. Suggestions from
 * CityFlow's tracked Bengaluru locations appear instantly while typing; any
 * other address is resolved through OpenStreetMap geocoding (same source
 * used elsewhere in the app) once the field is confirmed.
 */
export function LocationAutocomplete({
  label,
  placeholder,
  value,
  onChangeText,
  onResolved,
  icon,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChangeText: (text: string) => void;
  onResolved: (place: ResolvedPlace | null) => void;
  icon?: React.ReactNode;
}) {
  const [focused, setFocused] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const matches = useMemo(() => {
    const clean = value.trim().toLowerCase();
    if (!clean) return [];
    return bengaluruLocations.filter((l) => l.name.toLowerCase().includes(clean)).slice(0, 6);
  }, [value]);

  const choose = (name: string, lat: number, lon: number, approximate: boolean) => {
    onChangeText(name);
    onResolved({ text: name, label: `${name}, Bengaluru`, lat, lon, approximate });
    setError(null);
  };

  const resolveFreeText = async () => {
    const text = value.trim();
    if (!text) {
      onResolved(null);
      return;
    }
    const known = bengaluruLocations.find((l) => l.name.toLowerCase() === text.toLowerCase());
    if (known) {
      choose(known.name, known.lat, known.lon, false);
      return;
    }
    setResolving(true);
    try {
      const result = await geocodePlace({ data: { query: text } });
      if (!result) {
        setError(`Couldn't locate "${text}". Try adding an area, e.g. "${text}, Bengaluru".`);
        onResolved(null);
        return;
      }
      onResolved({
        text,
        label: result.label,
        lat: result.lat,
        lon: result.lon,
        approximate: result.approximate,
      });
      setError(null);
    } finally {
      setResolving(false);
    }
  };

  return (
    <div>
      <span className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
        {icon}
        {label}
      </span>
      <div className="relative">
        <input
          value={value}
          onChange={(e) => {
            onChangeText(e.target.value);
            onResolved(null);
            setError(null);
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setTimeout(() => setFocused(false), 120);
            void resolveFreeText();
          }}
          placeholder={placeholder}
          className={cn(
            "h-11 w-full rounded-xl border border-border bg-surface-strong px-3.5 pr-9 text-sm font-semibold outline-none placeholder:font-medium placeholder:text-muted-foreground/70 focus-visible:ring-2 focus-visible:ring-ring",
          )}
        />
        {resolving && (
          <LoaderCircle className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
        {focused && matches.length > 0 && (
          <div className="glass-panel absolute inset-x-0 top-[calc(100%+6px)] z-30 max-h-60 overflow-y-auto rounded-xl p-1.5">
            {matches.map((l) => (
              <button
                key={l.slug}
                type="button"
                onMouseDown={() => choose(l.name, l.lat, l.lon, false)}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-accent"
              >
                <MapPin size={13} className="text-brand-cyan" /> {l.name}
              </button>
            ))}
          </div>
        )}
      </div>
      {error && <p className="mt-1 text-xs font-semibold text-destructive">{error}</p>}
    </div>
  );
}
