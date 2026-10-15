import { createServerFn } from "@tanstack/react-start";
import { bengaluruLocations } from "@/lib/locations";

export type GeocodeResult = {
  query: string;
  lat: number;
  lon: number;
  /** Short human-readable name of what the query resolved to. */
  label: string;
  /** True when we resolved to a surrounding area rather than the exact place. */
  approximate: boolean;
  source: "openstreetmap" | "cityflow";
};

/**
 * Places that OpenStreetMap doesn't index yet, mapped to an area-level query that it does.
 * Results resolved this way are flagged `approximate` so the UI can say so.
 */
const AREA_ALIASES: { match: RegExp; areaQuery: string }[] = [
  // A3, DivyaSree Technopark, EPIP Zone, Brookefield, Bengaluru 560066
  { match: /polaris school of technology/i, areaQuery: "Brookefield, Bengaluru" },
];

// Bengaluru metro bounding box (lon1, lat1, lon2, lat2) used to bias, not restrict, results.
const BENGALURU_VIEWBOX = "77.35,13.25,77.95,12.75";

async function nominatim(
  query: string,
): Promise<{ lat: number; lon: number; label: string } | null> {
  const params = new URLSearchParams({
    q: query,
    format: "jsonv2",
    limit: "5",
    countrycodes: "in",
    viewbox: BENGALURU_VIEWBOX,
    "accept-language": "en",
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
      signal: controller.signal,
      headers: { "User-Agent": "CityFlow-Traffic-Intelligence/1.0" },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      lat: string;
      lon: string;
      name?: string;
      display_name: string;
      importance?: number;
    }[];
    // Nominatim's first hit is often a building that merely contains the name; prefer the most notable match.
    const hit = [...json].sort((a, b) => (b.importance ?? 0) - (a.importance ?? 0))[0];
    if (!hit) return null;
    const parts = hit.display_name.split(",").map((p) => p.trim());
    const label = [hit.name || parts[0], parts.find((p) => /^(bengaluru|bangalore)$/i.test(p))]
      .filter(Boolean)
      .filter((p, i, arr) => arr.indexOf(p) === i)
      .join(", ");
    return {
      lat: Number(hit.lat),
      lon: Number(hit.lon),
      label: label || parts.slice(0, 2).join(", "),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export const geocodePlace = createServerFn({ method: "GET" })
  .validator((data: { query: string }) => ({ query: data.query.trim().slice(0, 200) }))
  .handler(async ({ data }): Promise<GeocodeResult | null> => {
    const { query } = data;
    if (!query) return null;

    const direct = await nominatim(query);
    if (direct) return { query, ...direct, approximate: false, source: "openstreetmap" };

    if (!/bengaluru|bangalore/i.test(query)) {
      const scoped = await nominatim(`${query}, Bengaluru`);
      if (scoped) return { query, ...scoped, approximate: false, source: "openstreetmap" };
    }

    const alias = AREA_ALIASES.find((a) => a.match.test(query));
    if (alias) {
      const area = await nominatim(alias.areaQuery);
      if (area) return { query, ...area, approximate: true, source: "openstreetmap" };
    }

    // Last resort: a CityFlow-tracked corridor whose name appears in the query.
    const tracked = bengaluruLocations.find((l) =>
      query.toLowerCase().includes(l.name.toLowerCase()),
    );
    if (tracked) {
      return {
        query,
        lat: tracked.lat,
        lon: tracked.lon,
        label: `${tracked.name}, Bengaluru`,
        approximate: true,
        source: "cityflow",
      };
    }
    return null;
  });
