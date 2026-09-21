import { useMemo, useState } from "react";
import { MapPin, Search } from "lucide-react";
import { bengaluruLocations } from "@/lib/locations";
import { cn } from "@/lib/utils";

export function LocationSearch({
  selectedSlug,
  onSelect,
}: {
  selectedSlug: string;
  onSelect: (slug: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);

  const matches = useMemo(() => {
    const clean = query.trim().toLowerCase();
    if (!clean) return [];
    return bengaluruLocations.filter((item) => item.name.toLowerCase().includes(clean)).slice(0, 8);
  }, [query]);

  return (
    <div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-brand-cyan" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 120)}
          placeholder="Search MG Road, Marathahalli, HSR Layout..."
          aria-label="Search Bengaluru location"
          className="glass-panel h-14 w-full rounded-xl pl-12 pr-4 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
        />
        {focused && matches.length > 0 && (
          <div className="glass-panel absolute inset-x-0 top-[calc(100%+8px)] z-30 max-h-72 overflow-y-auto rounded-xl p-2">
            {matches.map((item) => (
              <button
                key={item.slug}
                type="button"
                onMouseDown={() => {
                  onSelect(item.slug);
                  setQuery("");
                }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-accent"
              >
                <MapPin size={14} className="text-brand-cyan" /> {item.name}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {bengaluruLocations.map((item) => (
          <button
            key={item.slug}
            type="button"
            onClick={() => onSelect(item.slug)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition",
              item.slug === selectedSlug
                ? "border-transparent bg-gradient-brand text-primary-foreground shadow-brand"
                : "border-border bg-surface text-foreground hover:border-brand-cyan",
            )}
          >
            <MapPin size={12} /> {item.name}
          </button>
        ))}
      </div>
    </div>
  );
}
