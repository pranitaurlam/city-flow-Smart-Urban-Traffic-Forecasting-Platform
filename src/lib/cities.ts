import type { TrafficTier } from "@/lib/locations";

export type City = {
  slug: string;
  name: string;
  country: string;
  lat: number;
  lon: number;
  traffic: "Low Traffic" | "Moderate Traffic" | "High Traffic";
  tone: string;
  baseTier: TrafficTier;
  basePeakVolume: number;
};

export const cities: City[] = [
  {
    slug: "bengaluru",
    name: "Bengaluru",
    country: "India",
    lat: 12.9716,
    lon: 77.5946,
    traffic: "High Traffic",
    tone: "bg-destructive",
    baseTier: "High",
    basePeakVolume: 4592,
  },
  {
    slug: "new-york",
    name: "New York",
    country: "USA",
    lat: 40.7128,
    lon: -74.006,
    traffic: "High Traffic",
    tone: "bg-destructive",
    baseTier: "Very High",
    basePeakVolume: 3150,
  },
  {
    slug: "london",
    name: "London",
    country: "UK",
    lat: 51.5074,
    lon: -0.1278,
    traffic: "Low Traffic",
    tone: "bg-success",
    baseTier: "Low",
    basePeakVolume: 1150,
  },
  {
    slug: "tokyo",
    name: "Tokyo",
    country: "Japan",
    lat: 35.6762,
    lon: 139.6503,
    traffic: "High Traffic",
    tone: "bg-destructive",
    baseTier: "High",
    basePeakVolume: 2600,
  },
];

export function slugify(name: string) {
  return name.toLowerCase().replace(/\s+/g, "-");
}
