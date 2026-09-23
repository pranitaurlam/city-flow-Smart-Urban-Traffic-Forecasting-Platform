import { createServerFn } from "@tanstack/react-start";

export type TravelMode = "car" | "bike" | "foot";

export type RouteOption = {
  distanceKm: number;
  durationMin: number;
  /** [lat, lon] pairs, in travel order. */
  geometry: [number, number][];
};

export type RouteResult = {
  mode: TravelMode;
  primary: RouteOption;
  alternatives: RouteOption[];
  live: boolean;
};

const OSRM_PROFILE: Record<TravelMode, { host: string; profile: string }> = {
  car: { host: "routed-car", profile: "driving" },
  bike: { host: "routed-bike", profile: "bike" },
  foot: { host: "routed-foot", profile: "foot" },
};

function straightLineFallback(
  fromLat: number,
  fromLon: number,
  toLat: number,
  toLon: number,
  mode: TravelMode,
): RouteOption {
  const R = 6371;
  const dLat = ((toLat - fromLat) * Math.PI) / 180;
  const dLon = ((toLon - fromLon) * Math.PI) / 180;
  const lat1 = (fromLat * Math.PI) / 180;
  const lat2 = (toLat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  const straightKm = 2 * R * Math.asin(Math.sqrt(h));
  const distanceKm = straightKm * 1.35; // roads are rarely a straight line
  const speedKph = mode === "car" ? 24 : mode === "bike" ? 14 : 4.5;
  return {
    distanceKm,
    durationMin: (distanceKm / speedKph) * 60,
    geometry: [
      [fromLat, fromLon],
      [toLat, toLon],
    ],
  };
}

async function fetchOsrm(
  fromLat: number,
  fromLon: number,
  toLat: number,
  toLon: number,
  mode: TravelMode,
): Promise<{ primary: RouteOption; alternatives: RouteOption[] } | null> {
  const { host, profile } = OSRM_PROFILE[mode];
  const url = `https://routing.openstreetmap.de/${host}/route/v1/${profile}/${fromLon},${fromLat};${toLon},${toLat}?alternatives=${mode === "car" ? "true" : "false"}&geometries=geojson&overview=full`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      code?: string;
      routes?: {
        distance: number;
        duration: number;
        geometry?: { coordinates: [number, number][] };
      }[];
    };
    if (json.code !== "Ok" || !json.routes?.length) return null;

    const toOption = (r: NonNullable<typeof json.routes>[number]): RouteOption => ({
      distanceKm: r.distance / 1000,
      durationMin: r.duration / 60,
      geometry: (r.geometry?.coordinates ?? []).map(([lon, lat]) => [lat, lon]),
    });

    const [primary, ...rest] = json.routes.map(toOption);
    if (!primary) return null;
    return { primary, alternatives: rest.slice(0, 2) };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export const getRoute = createServerFn({ method: "GET" })
  .validator(
    (data: { fromLat: number; fromLon: number; toLat: number; toLon: number; mode: TravelMode }) =>
      data,
  )
  .handler(async ({ data }): Promise<RouteResult> => {
    const result = await fetchOsrm(data.fromLat, data.fromLon, data.toLat, data.toLon, data.mode);
    if (result) {
      return {
        mode: data.mode,
        primary: result.primary,
        alternatives: result.alternatives,
        live: true,
      };
    }
    return {
      mode: data.mode,
      primary: straightLineFallback(data.fromLat, data.fromLon, data.toLat, data.toLon, data.mode),
      alternatives: [],
      live: false,
    };
  });
