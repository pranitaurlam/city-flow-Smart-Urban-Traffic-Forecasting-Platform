import { cities } from "@/lib/cities";
import { bengaluruLocations, type TrafficBaseline, type TrafficTier } from "@/lib/locations";
import { bangaloreTrafficHistory } from "@/data/bangalore-traffic-history";

export type DashboardTarget = TrafficBaseline & {
  name: string;
  country: string;
  lat: number;
  lon: number;
  hasDataset?: boolean;
  /** Shown in the alert card; the specific road/junction driving the alert. */
  alertRoad: string;
};

const cityTargets: DashboardTarget[] = cities
  .filter((city) => city.slug !== "bengaluru")
  .map((city) => ({
    slug: city.slug,
    name: city.name,
    country: city.country,
    lat: city.lat,
    lon: city.lon,
    baseTier: city.baseTier,
    basePeakVolume: city.basePeakVolume,
    alertRoad: `${city.name} Downtown`,
  }));

const bengaluruAggregate = bangaloreTrafficHistory["bengaluru"];

const bengaluruTarget: DashboardTarget = {
  slug: "bengaluru",
  name: "Bengaluru",
  country: "India",
  lat: 12.9716,
  lon: 77.5946,
  baseTier: cities.find((c) => c.slug === "bengaluru")?.baseTier ?? ("High" as TrafficTier),
  basePeakVolume: cities.find((c) => c.slug === "bengaluru")?.basePeakVolume ?? 4592,
  hasDataset: !!bengaluruAggregate,
  alertRoad: bengaluruAggregate?.busiestRoad ?? "Main Road",
};

const bengaluruAreaTargets: DashboardTarget[] = bengaluruLocations.map((location) => {
  const history = bangaloreTrafficHistory[location.slug];
  const target: DashboardTarget = {
    slug: location.slug,
    name: location.name,
    country: "India",
    lat: location.lat,
    lon: location.lon,
    baseTier: location.baseTier,
    basePeakVolume: location.basePeakVolume,
    alertRoad: history ? `${history.busiestRoad}, ${location.name}` : `${location.name} Main Road`,
  };
  if (location.hasDataset) target.hasDataset = true;
  return target;
});

export const dashboardTargets: DashboardTarget[] = [
  bengaluruTarget,
  ...bengaluruAreaTargets,
  ...cityTargets,
];

export function findDashboardTarget(slug: string) {
  return dashboardTargets.find((target) => target.slug === slug);
}
