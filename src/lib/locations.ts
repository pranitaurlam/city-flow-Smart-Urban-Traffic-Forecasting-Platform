import { bangaloreTrafficHistory } from "@/data/bangalore-traffic-history";

export type TrafficTier = "Low" | "Moderate" | "High" | "Very High";

export type BengaluruLocation = {
  slug: string;
  name: string;
  lat: number;
  lon: number;
  /** Deterministic fallback tier used when the live traffic API is unavailable. */
  baseTier: TrafficTier;
  /** Deterministic fallback peak volume (vehicles/hour) used to derive mock stats. */
  basePeakVolume: number;
  /** True when baseTier/basePeakVolume are derived from the Kaggle traffic dataset, not estimated. */
  hasDataset?: boolean;
};

export const bengaluruCenter = { lat: 12.9716, lon: 77.5946 };

/** Minimal shape needed to derive a weekly trend / forecast / mock traffic reading. */
export type TrafficBaseline = {
  slug: string;
  baseTier: TrafficTier;
  basePeakVolume: number;
};

/** Share of a day's traffic volume assumed to occur in the single busiest hour. */
export const PEAK_HOUR_SHARE = 0.09;

export function tierFromCongestionPct(pct: number): TrafficTier {
  if (pct < 60) return "Low";
  if (pct < 75) return "Moderate";
  if (pct < 88) return "High";
  return "Very High";
}

const rawBengaluruLocations: BengaluruLocation[] = [
  {
    slug: "mg-road",
    name: "MG Road",
    lat: 12.9757,
    lon: 77.6068,
    baseTier: "High",
    basePeakVolume: 2600,
  },
  {
    slug: "marathahalli",
    name: "Marathahalli",
    lat: 12.9569,
    lon: 77.7011,
    baseTier: "High",
    basePeakVolume: 2340,
  },
  {
    slug: "hsr-layout",
    name: "HSR Layout",
    lat: 12.9116,
    lon: 77.6389,
    baseTier: "Moderate",
    basePeakVolume: 1980,
  },
  {
    slug: "koramangala",
    name: "Koramangala",
    lat: 12.9352,
    lon: 77.6245,
    baseTier: "High",
    basePeakVolume: 2420,
  },
  {
    slug: "whitefield",
    name: "Whitefield",
    lat: 12.9698,
    lon: 77.75,
    baseTier: "Very High",
    basePeakVolume: 2780,
  },
  {
    slug: "indiranagar",
    name: "Indiranagar",
    lat: 12.9719,
    lon: 77.6412,
    baseTier: "High",
    basePeakVolume: 2350,
  },
  {
    slug: "electronic-city",
    name: "Electronic City",
    lat: 12.8452,
    lon: 77.6602,
    baseTier: "Very High",
    basePeakVolume: 2900,
  },
  {
    slug: "silk-board",
    name: "Silk Board",
    lat: 12.9172,
    lon: 77.6228,
    baseTier: "Very High",
    basePeakVolume: 3100,
  },
  {
    slug: "hebbal",
    name: "Hebbal",
    lat: 13.0358,
    lon: 77.597,
    baseTier: "High",
    basePeakVolume: 2500,
  },
  {
    slug: "yeshwanthpur",
    name: "Yeshwanthpur",
    lat: 13.0284,
    lon: 77.5546,
    baseTier: "Moderate",
    basePeakVolume: 1900,
  },
  {
    slug: "kr-puram",
    name: "KR Puram",
    lat: 13.0088,
    lon: 77.6958,
    baseTier: "High",
    basePeakVolume: 2450,
  },
  {
    slug: "bellandur",
    name: "Bellandur",
    lat: 12.9257,
    lon: 77.6773,
    baseTier: "Very High",
    basePeakVolume: 2850,
  },
  {
    slug: "sarjapur-road",
    name: "Sarjapur Road",
    lat: 12.9008,
    lon: 77.687,
    baseTier: "High",
    basePeakVolume: 2380,
  },
  {
    slug: "outer-ring-road",
    name: "Outer Ring Road",
    lat: 12.935,
    lon: 77.69,
    baseTier: "Very High",
    basePeakVolume: 2950,
  },
  {
    slug: "bannerghatta-road",
    name: "Bannerghatta Road",
    lat: 12.89,
    lon: 77.597,
    baseTier: "Moderate",
    basePeakVolume: 2050,
  },
  {
    slug: "hosur-road",
    name: "Hosur Road",
    lat: 12.899,
    lon: 77.635,
    baseTier: "High",
    basePeakVolume: 2400,
  },
  {
    // "Old Airport Road" near HAL/Indiranagar — not the actual airport (see kempegowda-airport below).
    slug: "airport-road",
    name: "Old Airport Road",
    lat: 13.01,
    lon: 77.648,
    baseTier: "Moderate",
    basePeakVolume: 2000,
  },
  {
    slug: "kempegowda-airport",
    name: "Kempegowda International Airport",
    lat: 13.1986,
    lon: 77.7066,
    // ~35 km NH44 highway drive from the city centre; usually moderate but often
    // High/Very High near the airport approach and during peak hours.
    baseTier: "High",
    basePeakVolume: 2600,
  },
  {
    slug: "jayanagar",
    name: "Jayanagar",
    lat: 12.925,
    lon: 77.5938,
    baseTier: "Moderate",
    basePeakVolume: 1850,
  },
  {
    slug: "malleshwaram",
    name: "Malleshwaram",
    lat: 13.0035,
    lon: 77.5709,
    baseTier: "Low",
    basePeakVolume: 1500,
  },
  {
    slug: "richmond-road",
    name: "Richmond Road",
    lat: 12.9635,
    lon: 77.6033,
    baseTier: "Moderate",
    basePeakVolume: 1750,
  },
];

export const bengaluruLocations: BengaluruLocation[] = rawBengaluruLocations.map((location) => {
  const history = bangaloreTrafficHistory[location.slug];
  if (!history) return location;
  return {
    ...location,
    baseTier: tierFromCongestionPct(history.avgCongestionPct),
    basePeakVolume: Math.round(history.maxVolume * PEAK_HOUR_SHARE),
    hasDataset: true,
  };
});

export function findLocation(slug: string) {
  return bengaluruLocations.find((item) => item.slug === slug);
}

/** Great-circle distance in km, used to rank nearby locations. */
export function distanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function nearestLocations(slug: string, count: number) {
  const origin = findLocation(slug);
  if (!origin) return [];
  return bengaluruLocations
    .filter((item) => item.slug !== slug)
    .map((item) => ({ location: item, km: distanceKm(origin, item) }))
    .sort((a, b) => a.km - b.km)
    .slice(0, count);
}

export const trafficTierColor: Record<TrafficTier, string> = {
  Low: "var(--success)",
  Moderate: "var(--warning)",
  High: "oklch(0.7 0.19 45)",
  "Very High": "var(--destructive)",
};
