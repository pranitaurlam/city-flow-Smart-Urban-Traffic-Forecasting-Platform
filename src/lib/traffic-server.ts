import { createServerFn } from "@tanstack/react-start";
import type { TrafficTier } from "@/lib/locations";
import { bangaloreTrafficHistory } from "@/data/bangalore-traffic-history";

export type TrafficReading = {
  tier: TrafficTier;
  speedKph: number;
  freeFlowKph: number;
  congestionPct: number;
  volume: number;
  live: boolean;
  /** True when the simulated reading is grounded in the Kaggle traffic dataset for this area. */
  fromDataset: boolean;
  updatedAt: string;
};

function tierFromJamFactor(jamFactor: number): TrafficTier {
  if (jamFactor < 3) return "Low";
  if (jamFactor < 6) return "Moderate";
  if (jamFactor < 8) return "High";
  return "Very High";
}

async function fetchHereFlow(lat: number, lon: number, apiKey: string) {
  const url = `https://data.traffic.hereapi.com/v7/flow?locationReferencing=shape&in=circle:${lat},${lon};r=350&apiKey=${apiKey}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      results?: { currentFlow?: { speed?: number; freeFlow?: number; jamFactor?: number } }[];
    };
    const flows = (json.results ?? [])
      .map((r) => r.currentFlow)
      .filter(
        (f): f is { speed: number; freeFlow: number; jamFactor: number } =>
          !!f &&
          typeof f.speed === "number" &&
          typeof f.freeFlow === "number" &&
          typeof f.jamFactor === "number",
      );
    if (!flows.length) return null;
    const avg = (key: "speed" | "freeFlow" | "jamFactor") =>
      flows.reduce((sum, f) => sum + f[key], 0) / flows.length;
    return { speed: avg("speed"), freeFlow: avg("freeFlow"), jamFactor: avg("jamFactor") };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export function mockTrafficReading(
  basePeakVolume: number,
  baseTier: TrafficTier,
  slug?: string,
): TrafficReading {
  const history = slug ? bangaloreTrafficHistory[slug] : undefined;
  const tierCongestion: Record<TrafficTier, number> = {
    Low: 25,
    Moderate: 48,
    High: 70,
    "Very High": 88,
  };
  const congestionPct = history ? Math.round(history.avgCongestionPct) : tierCongestion[baseTier];
  const freeFlowKph = history ? Math.round(history.avgSpeedKph * 1.35) : 42;
  const speedKph = history
    ? Math.round(history.avgSpeedKph)
    : Math.round(freeFlowKph * (1 - congestionPct / 130));
  return {
    tier: baseTier,
    speedKph,
    freeFlowKph,
    congestionPct,
    volume: Math.round(basePeakVolume * (0.4 + congestionPct / 100)),
    live: false,
    fromDataset: !!history,
    updatedAt: new Date().toISOString(),
  };
}

export const getLiveTraffic = createServerFn({ method: "GET" })
  .validator(
    (data: {
      lat: number;
      lon: number;
      basePeakVolume: number;
      baseTier: TrafficTier;
      slug: string;
    }) => data,
  )
  .handler(async ({ data }): Promise<TrafficReading> => {
    const apiKey = process.env["HERE_API_KEY"];
    if (!apiKey) return mockTrafficReading(data.basePeakVolume, data.baseTier, data.slug);

    const flow = await fetchHereFlow(data.lat, data.lon, apiKey);
    if (!flow) return mockTrafficReading(data.basePeakVolume, data.baseTier, data.slug);

    const speedKph = Math.round(flow.speed * 3.6);
    const freeFlowKph = Math.round(flow.freeFlow * 3.6);
    const congestionPct = Math.max(0, Math.min(100, Math.round((flow.jamFactor / 10) * 100)));
    return {
      tier: tierFromJamFactor(flow.jamFactor),
      speedKph,
      freeFlowKph,
      congestionPct,
      volume: Math.round(data.basePeakVolume * (0.4 + (flow.jamFactor / 10) * 0.6)),
      live: true,
      fromDataset: false,
      updatedAt: new Date().toISOString(),
    };
  });
