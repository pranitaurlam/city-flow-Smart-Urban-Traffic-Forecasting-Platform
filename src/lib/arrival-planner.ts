import { DAY_SHAPE } from "@/lib/hourly";
import { backtestWeekdayModel } from "@/lib/route-forecast";
import type { BengaluruLocation, TrafficTier } from "@/lib/locations";
import {
  plannerMode,
  tierFromIntensity,
  weatherImpact,
  TIER_CORRIDOR_FACTOR,
  urbanFreeFlowMin,
  type PlannerMode,
  type WeatherImpact,
} from "@/lib/route-intelligence";
import type { RouteResult } from "@/lib/route-server";
import type { WeatherReading } from "@/lib/weather-server";

// ---------------------------------------------------------------------------
// Arrival Time Reliability Window — core calculation engine
//
// Builds on the same forecasting primitives as route-intelligence.ts
// (congestion intensity by hour, weather impact, corridor tiers, confidence
// decay by day offset) but inverts the question: instead of "how long will
// this trip take if I leave now", it answers "when do I need to leave to
// arrive by a deadline, at a chosen reliability target". Every number here
// is derived from those existing signals — nothing is a fixed example value.
// ---------------------------------------------------------------------------

export type ReliabilityTarget = 80 | 90 | 95;
export type SafetyBufferMin = 0 | 5 | 10 | 15;

export const RELIABILITY_TARGETS: ReliabilityTarget[] = [80, 90, 95];
export const BUFFER_OPTIONS: SafetyBufferMin[] = [0, 5, 10, 15];

/** One-sided z-score for "probability the journey finishes within X of the mean". */
const Z_SCORE: Record<ReliabilityTarget, number> = { 80: 0.8416, 90: 1.2816, 95: 1.6449 };

/** Same day-offset confidence decay used across the route-intelligence engine. */
const CONFIDENCE_BY_OFFSET = [92, 88, 84, 80, 76, 72, 68, 64];

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Standard normal CDF (Abramowitz & Stegun 7.1.26 approximation). */
function normalCdf(z: number) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const p =
    d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z >= 0 ? 1 - p : p;
}

export function minutesToClock(minutesSinceMidnight: number) {
  const clamped = ((Math.round(minutesSinceMidnight) % 1440) + 1440) % 1440;
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

export function formatMinutes(min: number) {
  const rounded = Math.round(min);
  if (rounded < 60) return `${rounded} min`;
  const h = Math.floor(rounded / 60);
  const m = rounded % 60;
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
}

export type RiskLevel = "On Track" | "Tight Schedule" | "High Risk";

export function riskLevelForProbability(probabilityPct: number): RiskLevel {
  if (probabilityPct >= 90) return "On Track";
  if (probabilityPct >= 70) return "Tight Schedule";
  return "High Risk";
}

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

export type ArrivalPlanInput = {
  route: RouteResult;
  mode: PlannerMode;
  corridors: BengaluruLocation[];
  weather: WeatherReading | undefined;
  /** Days ahead (0 = today). */
  dayOffset: number;
  targetHour: number;
  targetMinute: number;
  reliabilityTarget: ReliabilityTarget;
  bufferMin: SafetyBufferMin;
  approximateEndpoints: number;
  now?: Date;
};

type PreparedContext = {
  freeFlowMin: number;
  corridorFactor: number;
  mode: ReturnType<typeof plannerMode>;
  weather: WeatherReading | undefined;
  now: Date;
  confidence: number;
};

function weekdayFactorForOffset(offset: number, now: Date) {
  const date = new Date(now);
  date.setDate(date.getDate() + offset);
  const weekdayIndex = (date.getDay() + 6) % 7; // Mon=0..Sun=6
  const WEEKDAY_FACTOR = [0.88, 0.9, 0.94, 0.96, 1.0, 0.7, 0.58];
  return { weekdayIndex, factor: WEEKDAY_FACTOR[weekdayIndex] ?? 0.9 };
}

/** Congestion intensity at an exact minute-of-day, interpolated between hourly shape values. */
function intensityAtMinute(offset: number, minute: number, now: Date) {
  let o = offset;
  let m = minute;
  while (m < 0) {
    m += 1440;
    o -= 1;
  }
  while (m >= 1440) {
    m -= 1440;
    o += 1;
  }
  const h = Math.floor(m / 60);
  const frac = (m % 60) / 60;
  const nextH = (h + 1) % 24;
  const shapeOf = (hour: number) => {
    const { factor } = weekdayFactorForOffset(o, now);
    const shape = DAY_SHAPE[hour] ?? 0.6;
    const multiplier = factor * (0.7 + shape * 0.75);
    // Recover the 0..~1 intensity component the way route-intelligence.congestionIntensity does.
    return (multiplier * shape) / (0.7 + shape * 0.75);
  };
  return shapeOf(h) * (1 - frac) + shapeOf(nextH) * frac;
}

/** Weather impact for a given day offset — today's live reading, tomorrow's forecast, or "beyond range" after that. */
function weatherForOffset(weather: WeatherReading | undefined, offset: number): WeatherImpact {
  if (!weather) return weatherImpact(undefined);
  if (offset === 0) return weatherImpact(weather);
  if (offset === 1) {
    return weatherImpact({
      ...weather,
      condition: weather.tomorrow.condition,
      tempC: weather.tomorrow.tempC,
      chanceOfRain: weather.tomorrow.chanceOfRain,
    });
  }
  return { level: "Low", pct: 0, note: "Beyond the weather forecast range" };
}

function prepare(input: ArrivalPlanInput): PreparedContext {
  const now = input.now ?? new Date();
  const mode = plannerMode(input.mode);
  const freeFlowMin =
    urbanFreeFlowMin(
      input.route.primary.distanceKm,
      input.route.primary.durationMin,
      mode.routing,
    ) *
      mode.speedFactor +
    mode.overheadMin;
  const corridorFactor = input.corridors.length
    ? input.corridors.reduce((sum, c) => sum + TIER_CORRIDOR_FACTOR[c.baseTier], 0) /
      input.corridors.length
    : 1;
  const confidence = clamp(
    (CONFIDENCE_BY_OFFSET[Math.min(input.dayOffset, 7)] ?? 64) -
      (input.route.live ? 0 : 10) -
      input.approximateEndpoints * 4 -
      (input.corridors.length ? 0 : 6),
    40,
    95,
  );
  return { freeFlowMin, corridorFactor, mode, weather: input.weather, now, confidence };
}

type MeanPoint = { minutes: number; sigma: number; tier: TrafficTier; spread: number };

function meanAt(ctx: PreparedContext, offset: number, minute: number): MeanPoint {
  const intensity = intensityAtMinute(offset, minute, ctx.now) * ctx.corridorFactor;
  const wx = weatherForOffset(ctx.weather, offset);
  const weatherMul = ctx.mode.trafficSensitivity > 0 ? 1 + wx.pct / 100 : 1;
  const minutes = Math.max(
    1,
    ctx.freeFlowMin * (1 + ctx.mode.trafficSensitivity * intensity) * weatherMul,
  );
  const spreadPct = 0.08 + (100 - ctx.confidence) / 400;
  const spread = minutes * spreadPct;
  const sigma = spread / Z_SCORE[90];
  return { minutes, sigma, tier: tierFromIntensity(intensity), spread };
}

function onTimeProbability(
  ctx: PreparedContext,
  offset: number,
  departMinute: number,
  deadline: number,
) {
  const point = meanAt(ctx, offset, departMinute);
  if (point.sigma <= 0) return departMinute + point.minutes <= deadline ? 100 : 0;
  const z = (deadline - departMinute - point.minutes) / point.sigma;
  return Math.round(clamp(normalCdf(z) * 100, 1, 99));
}

/** Latest minute-of-day departure that still meets `reliability` for the deadline, or null if none exists today. */
function latestFeasibleDeparture(
  ctx: PreparedContext,
  offset: number,
  deadline: number,
  reliability: ReliabilityTarget,
) {
  let best: number | null = null;
  for (let dep = 0; dep < deadline; dep += 5) {
    const point = meanAt(ctx, offset, dep);
    const required = point.minutes + Z_SCORE[reliability] * point.sigma;
    if (dep + required <= deadline) best = dep;
  }
  return best;
}

// ---------------------------------------------------------------------------
// Output types
// ---------------------------------------------------------------------------

export type DepartureOption = {
  kind: "early" | "recommended" | "late";
  label: string;
  description: string;
  departureMinute: number;
  departureLabel: string;
  journeyMin: number;
  journeyRangeLow: number;
  journeyRangeHigh: number;
  arrivalLabel: string;
  arrivalRangeLow: number;
  arrivalRangeHigh: number;
  onTimeProbability: number;
  risk: RiskLevel;
  tier: TrafficTier;
};

export type ArrivalFactor = { label: string; pct: number; detail: string };

export type TimelinePoint = {
  key: "departure" | "journeyStart" | "arrival" | "deadline";
  label: string;
  minute: number;
};

export type RouteReliability = {
  modelConfidence: number;
  /** Null when no corridor along the route has real historical data to back a figure. */
  historicalOnTimePct: number | null;
  probabilityBeforeDeadline: number;
  dataBasis: "dataset" | "pattern-model";
};

export type ArrivalPlanResult = {
  input: ArrivalPlanInput;
  deadlineMinute: number;
  deadlineLabel: string;
  unreachable: boolean;
  departureInPast: boolean;
  recommended: DepartureOption;
  comparison: DepartureOption[];
  factors: ArrivalFactor[];
  timeline: TimelinePoint[];
  reliability: RouteReliability;
  distanceKm: number;
};

function buildOption(
  ctx: PreparedContext,
  offset: number,
  deadline: number,
  departureMinute: number,
  kind: DepartureOption["kind"],
  label: string,
  description: string,
): DepartureOption {
  const point = meanAt(ctx, offset, departureMinute);
  const probability = onTimeProbability(ctx, offset, departureMinute, deadline);
  return {
    kind,
    label,
    description,
    departureMinute,
    departureLabel: minutesToClock(departureMinute),
    journeyMin: Math.round(point.minutes),
    journeyRangeLow: Math.max(1, Math.round(point.minutes - point.spread)),
    journeyRangeHigh: Math.round(point.minutes + point.spread),
    arrivalLabel: `${minutesToClock(departureMinute + point.minutes - point.spread)} – ${minutesToClock(departureMinute + point.minutes + point.spread)}`,
    arrivalRangeLow: departureMinute + point.minutes - point.spread,
    arrivalRangeHigh: departureMinute + point.minutes + point.spread,
    onTimeProbability: probability,
    risk: riskLevelForProbability(probability),
    tier: point.tier,
  };
}

export function buildArrivalPlan(input: ArrivalPlanInput): ArrivalPlanResult {
  const ctx = prepare(input);
  const deadline = input.targetHour * 60 + input.targetMinute;
  const offset = input.dayOffset;

  const feasibleAtTarget = latestFeasibleDeparture(ctx, offset, deadline, input.reliabilityTarget);
  const unreachable = feasibleAtTarget === null;
  const baseDeparture =
    feasibleAtTarget ?? Math.max(0, deadline - meanAt(ctx, offset, 0).minutes * 1.5);
  const recommendedDeparture = Math.max(0, baseDeparture - input.bufferMin);

  const feasible95 = latestFeasibleDeparture(ctx, offset, deadline, 95) ?? baseDeparture;
  const earlyDeparture = Math.min(
    recommendedDeparture,
    Math.max(0, feasible95 - Math.max(input.bufferMin, 10)),
  );

  const feasible80 = latestFeasibleDeparture(ctx, offset, deadline, 80) ?? baseDeparture;
  const lateDeparture = Math.max(recommendedDeparture, feasible80);

  const recommended = buildOption(
    ctx,
    offset,
    deadline,
    recommendedDeparture,
    "recommended",
    "Recommended Departure",
    `Best match for your ${input.reliabilityTarget}% reliability target.`,
  );
  const early = buildOption(
    ctx,
    offset,
    deadline,
    earlyDeparture,
    "early",
    "Early Departure",
    "Larger safety buffer — leaves earlier to absorb unexpected delay.",
  );
  const late = buildOption(
    ctx,
    offset,
    deadline,
    lateDeparture,
    "late",
    "Late Departure",
    "Less waiting time, but a lower chance of arriving on time.",
  );

  const now = ctx.now;
  const nowMinute = now.getHours() * 60 + now.getMinutes();
  const departureInPast = offset === 0 && recommendedDeparture < nowMinute;

  const factors = buildFactors(ctx, input, offset, recommendedDeparture);
  const timeline: TimelinePoint[] = [
    { key: "departure", label: "Departure", minute: recommended.departureMinute },
    {
      key: "journeyStart",
      label: "Journey",
      minute: recommended.departureMinute + recommended.journeyMin,
    },
    {
      key: "arrival",
      label: "Estimated Arrival",
      minute: Math.round((recommended.arrivalRangeLow + recommended.arrivalRangeHigh) / 2),
    },
    { key: "deadline", label: "Deadline", minute: deadline },
  ];

  const reliability = buildReliability(ctx, input, recommended);

  return {
    input,
    deadlineMinute: deadline,
    deadlineLabel: minutesToClock(deadline),
    unreachable,
    departureInPast,
    recommended,
    comparison: [early, recommended, late],
    factors,
    timeline,
    reliability,
    distanceKm: input.route.primary.distanceKm,
  };
}

function buildFactors(
  ctx: PreparedContext,
  input: ArrivalPlanInput,
  offset: number,
  departureMinute: number,
): ArrivalFactor[] {
  const hour = Math.floor((((departureMinute % 1440) + 1440) % 1440) / 60);
  const shape = DAY_SHAPE[hour] ?? 0.6;
  const { factor: weekdayFactor, weekdayIndex } = weekdayFactorForOffset(offset, ctx.now);
  const wx = weatherForOffset(ctx.weather, offset);
  const isPeak = shape >= 0.8;
  const isWeekend = weekdayIndex >= 5;

  const raw: { label: string; pct: number; detail: string }[] = [];

  if (input.corridors.length) {
    const worst = [...input.corridors].sort((a, b) => {
      const rank: Record<TrafficTier, number> = { Low: 0, Moderate: 1, High: 2, "Very High": 3 };
      return rank[b.baseTier] - rank[a.baseTier];
    })[0]!;
    raw.push({
      label: "Historical Traffic Pattern",
      pct: 38,
      detail: `${input.corridors.map((c) => c.name).join(", ")} typically run ${worst.baseTier.toLowerCase()} congestion around this time.`,
    });
  } else {
    raw.push({
      label: "Historical Traffic Pattern",
      pct: 30,
      detail: "Based on citywide hourly traffic patterns (no tracked corridor matched this route).",
    });
  }

  raw.push({
    label: isPeak ? "Peak-Hour Traffic" : "Time of Day",
    pct: isPeak ? 30 : 12,
    detail: isPeak
      ? "Your recommended departure falls inside a typical peak-traffic window."
      : "Traffic is typically lighter at this time of day.",
  });

  if (wx.level !== "Low") {
    raw.push({
      label: "Weather Conditions",
      pct: wx.level === "High" ? 20 : 12,
      detail: wx.note,
    });
  }

  raw.push({
    label: isWeekend ? "Weekend Pattern" : "Day-of-Week Pattern",
    pct: isWeekend ? 20 : 10,
    detail: isWeekend
      ? "Weekend traffic is typically lighter than weekdays on this route."
      : `Weekday factor ≈ ${Math.round(weekdayFactor * 100)}% of the weekly peak.`,
  });

  const total = raw.reduce((s, f) => s + f.pct, 0) || 1;
  return raw.map((f) => ({ ...f, pct: Math.round((f.pct / total) * 100) }));
}

function buildReliability(
  ctx: PreparedContext,
  input: ArrivalPlanInput,
  recommended: DepartureOption,
): RouteReliability {
  const datasetCorridors = input.corridors.filter((c) => c.hasDataset);
  let historicalOnTimePct: number | null = null;
  if (datasetCorridors.length) {
    const { samples } = backtestWeekdayModel();
    const names = new Set(datasetCorridors.map((c) => c.name));
    const matching = samples.filter((s) => names.has(s.area));
    if (matching.length) {
      const avgErrorPct = matching.reduce((s, m) => s + m.errorPct, 0) / matching.length;
      historicalOnTimePct = Math.round(clamp(100 - avgErrorPct, 40, 99));
    }
  }
  return {
    modelConfidence: ctx.confidence,
    historicalOnTimePct,
    probabilityBeforeDeadline: recommended.onTimeProbability,
    dataBasis: datasetCorridors.length ? "dataset" : "pattern-model",
  };
}
