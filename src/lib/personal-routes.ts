import { bangaloreTrafficHistory } from "@/data/bangalore-traffic-history";
import { findLocation, type TrafficTier } from "@/lib/locations";
import { minutesToClockLabel } from "@/lib/route-forecast";
import {
  congestionIntensity,
  plannerMode,
  rangeLabel,
  tierFromIntensity,
  urbanFreeFlowMin,
  TIER_CORRIDOR_FACTOR,
  TIER_PENALTY,
  weatherImpact,
  type PlannerMode,
  type WeatherImpact,
} from "@/lib/route-intelligence";
import type { TrafficReading } from "@/lib/traffic-server";
import type { WeatherReading } from "@/lib/weather-server";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AlertRule = "worseThanNormal" | "delay" | "lowReliability" | "event" | "roadCondition";

export const ALERT_RULES: { key: AlertRule; label: string; note?: string }[] = [
  { key: "worseThanNormal", label: "Traffic is significantly worse than normal" },
  { key: "delay", label: "Expected delay exceeds my threshold" },
  { key: "lowReliability", label: "Route reliability becomes low" },
  {
    key: "event",
    label: "A major event affects my route",
    note: "No event feed is connected yet, so event alerts can't fire until one is added.",
  },
  { key: "roadCondition", label: "Road condition becomes poor" },
];

export const THRESHOLDS = [5, 10, 15, 20] as const;

export type Frequency = "smart" | "always" | "severe";

export const FREQUENCIES: { key: Frequency; label: string; description: string }[] = [
  { key: "smart", label: "Smart", description: "Only when something meaningfully changes" },
  { key: "always", label: "Always", description: "Every qualifying check, at most hourly" },
  { key: "severe", label: "Only severe", description: "Only major delays and congestion spikes" },
];

export type SavedPlace = {
  text: string;
  label: string;
  lat: number;
  lon: number;
  approximate: boolean;
};

export type RouteSummary = {
  distanceKm: number;
  /** Free-flow duration from the routing engine, before congestion. */
  durationMin: number;
  corridorSlugs: string[];
  live: boolean;
};

export type PersonalRoute = {
  id: string;
  name: string;
  origin: SavedPlace;
  destination: SavedPlace;
  mode: PlannerMode;
  /** "HH:MM", 24-hour. */
  departure: string;
  /** 0 = Monday … 6 = Sunday. */
  days: number[];
  rules: AlertRule[];
  thresholdMin: number;
  alertsOn: boolean;
  primary: RouteSummary;
  alternative: RouteSummary | null;
  createdAt: string;
};

export type AlertType =
  | "delay"
  | "trafficIncrease"
  | "futureTraffic"
  | "event"
  | "roadCondition"
  | "reliability"
  | "improving"
  | "arrivalReminder"
  | "arrivalRisk";

export type AlertSeverity = "critical" | "warning" | "positive";

export type RouteAlert = {
  id: string;
  /** Dedupe key — the same key is never delivered twice. */
  key: string;
  routeId: string;
  routeName: string;
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  message: string;
  createdAt: string;
  read: boolean;
  test?: boolean | undefined;
};

export type AlertPrefs = { frequency: Frequency; desktop: boolean };

// ---------------------------------------------------------------------------
// Time helpers
// ---------------------------------------------------------------------------

export const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export function formatDays(days: number[]) {
  const s = [...days].sort((a, b) => a - b);
  if (s.length === 0) return "No days";
  if (s.length === 7) return "Every day";
  if (s.join() === "5,6") return "Weekends";
  const contiguous = s.every((d, i) => i === 0 || d === s[i - 1]! + 1);
  if (contiguous && s.length > 2) return `${DAY_SHORT[s[0]!]}–${DAY_SHORT[s[s.length - 1]!]}`;
  return s.map((d) => DAY_SHORT[d]).join(", ");
}

export function parseTime(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

export const clock = (minuteOfDay: number) => minutesToClockLabel(Math.round(minuteOfDay));

const weekdayIndex = (d: Date) => (d.getDay() + 6) % 7;

export type NextDeparture = { offset: number; minute: number; dayWord: string; label: string };

/** The next scheduled departure (today included, if it hasn't passed yet). */
export function nextDeparture(route: PersonalRoute, now: Date): NextDeparture | null {
  const minute = parseTime(route.departure);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  for (let offset = 0; offset <= 7; offset++) {
    const d = new Date(now);
    d.setDate(d.getDate() + offset);
    if (!route.days.includes(weekdayIndex(d))) continue;
    if (offset === 0 && minute < nowMin) continue;
    const dayWord =
      offset === 0 ? "today" : offset === 1 ? "tomorrow" : `on ${DAY_SHORT[weekdayIndex(d)]}`;
    const prefix = offset === 0 ? "Today" : offset === 1 ? "Tomorrow" : DAY_SHORT[weekdayIndex(d)];
    return { offset, minute, dayWord, label: `${prefix}, ${clock(minute)}` };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Forecast engine
// ---------------------------------------------------------------------------

const HISTORICAL_CONGESTION: Record<TrafficTier, number> = {
  Low: 25,
  Moderate: 48,
  High: 70,
  "Very High": 88,
};
const CONFIDENCE_BY_OFFSET = [92, 88, 84, 80, 76, 72, 68, 64];
const TIER_RANK: Record<TrafficTier, number> = { Low: 0, Moderate: 1, High: 2, "Very High": 3 };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Congestion intensity at any minute (interpolated between hourly values; handles day wrap). */
function intensityAt(offset: number, minute: number, now: Date) {
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
  const f = (m % 60) / 60;
  const nextH = (h + 1) % 24;
  const nextO = h === 23 ? o + 1 : o;
  return congestionIntensity(o, h, now) * (1 - f) + congestionIntensity(nextO, nextH, now) * f;
}

export type TrafficContext = {
  now: Date;
  traffic: Record<string, TrafficReading | undefined>;
  weather: WeatherReading | undefined;
  /** For test alerts: pretend congestion is this many points above normal, with rain. */
  scenario?: { congestionBoost: number; rain: boolean };
};

/** Simulated conditions used by "Send test alert": heavy congestion plus rain. */
export const TEST_SCENARIO = { congestionBoost: 30, rain: true };

export type CurvePoint = { label: string; forecast: number; normal: number };
export type TimelinePoint = { label: string; tier: TrafficTier; minutes: number };

export type RouteStatus = {
  usingAlternative: boolean;
  next: NextDeparture | null;
  departureMinute: number;
  offset: number;
  distanceKm: number;
  normalMin: number;
  currentMin: number;
  forecastMin: number;
  rangeLow: number;
  rangeHigh: number;
  delayMin: number;
  delayLow: number;
  delayHigh: number;
  tier: TrafficTier;
  normalTier: TrafficTier;
  reliability: number;
  normalReliability: number;
  roadScore: number;
  normalRoadScore: number;
  confidence: number;
  weather: WeatherImpact;
  congestion: { current: number; normal: number; live: boolean } | null;
  trend: "Increasing" | "Decreasing" | "Steady";
  timeline: TimelinePoint[];
  curve: CurvePoint[];
  recommendation: {
    changed: boolean;
    windowStart: string;
    windowEnd: string;
    arrivalStart: string;
    arrivalEnd: string;
    savesMin: number;
    reason: string;
  };
  alternative: {
    forecastMin: number;
    reliability: number;
    distanceKm: number;
    diffMin: number;
    message: string;
  } | null;
  corridorNames: string[];
  headline: { tone: "critical" | "warning" | "ok"; text: string };
};

function weatherForOffset(ctx: TrafficContext, offset: number): WeatherImpact {
  if (ctx.scenario?.rain) return { level: "Moderate", pct: 10, note: "Light rain (test scenario)" };
  const w = ctx.weather;
  if (!w) return weatherImpact(undefined);
  if (offset === 0) return weatherImpact(w);
  if (offset === 1) {
    return weatherImpact({
      ...w,
      condition: w.tomorrow.condition,
      tempC: w.tomorrow.tempC,
      chanceOfRain: w.tomorrow.chanceOfRain,
    });
  }
  return { level: "Low", pct: 0, note: "Beyond the weather forecast range" };
}

function computeStatus(
  route: PersonalRoute,
  summary: RouteSummary,
  ctx: TrafficContext,
  usingAlternative: boolean,
): Omit<RouteStatus, "alternative"> {
  const { now } = ctx;
  const m = plannerMode(route.mode);
  const freeFlow =
    urbanFreeFlowMin(summary.distanceKm, summary.durationMin, m.routing) * m.speedFactor;
  const s = m.trafficSensitivity;
  const nowMin = now.getHours() * 60 + now.getMinutes();

  const next = nextDeparture(route, now);
  const offset = next?.offset ?? 0;
  const dep = next?.minute ?? parseTime(route.departure);

  const corridors = summary.corridorSlugs
    .map((slug) => findLocation(slug))
    .filter((l): l is NonNullable<typeof l> => !!l);
  const cf = corridors.length
    ? corridors.reduce((sum, c) => sum + TIER_CORRIDOR_FACTOR[c.baseTier], 0) / corridors.length
    : 1;

  // Congestion right now vs the corridors' historical average (live readings only).
  let congestion: RouteStatus["congestion"] = null;
  if (corridors.length) {
    const rows = corridors
      .map((c) => {
        const hist =
          bangaloreTrafficHistory[c.slug]?.avgCongestionPct ?? HISTORICAL_CONGESTION[c.baseTier];
        const reading = ctx.traffic[c.slug];
        if (ctx.scenario)
          return { hist, cur: Math.min(100, hist + ctx.scenario.congestionBoost), live: true };
        if (reading?.live) return { hist, cur: reading.congestionPct, live: true };
        return { hist, cur: hist, live: false };
      })
      .filter(Boolean);
    const avg = (k: "hist" | "cur") => rows.reduce((sum, r) => sum + r[k], 0) / rows.length;
    congestion = {
      current: Math.round(avg("cur")),
      normal: Math.round(avg("hist")),
      live: rows.some((r) => r.live),
    };
  }
  const anomalyRatio = congestion?.live ? congestion.current / Math.max(1, congestion.normal) : 1;

  // A live congestion spike matters now and fades over ~3 hours.
  const anomalyAt = (o: number, minute: number) => {
    if (anomalyRatio === 1) return 1;
    if (ctx.scenario) return anomalyRatio;
    if (o !== 0) return 1;
    const decay = clamp(1 - (minute - nowMin) / 180, 0, 1);
    return 1 + (anomalyRatio - 1) * decay;
  };

  const normalIntensity = (minute: number) => {
    const days = route.days.length ? route.days : [0, 1, 2, 3, 4];
    const values = days.map((d) => {
      const o = (d - weekdayIndex(now) + 7) % 7;
      return intensityAt(o, minute, now);
    });
    return values.reduce((a, b) => a + b, 0) / values.length;
  };

  const wx = weatherForOffset(ctx, offset);
  const travel = (o: number, minute: number, normal = false) => {
    const intensity = normal
      ? normalIntensity(minute)
      : intensityAt(o, minute, now) * anomalyAt(o, minute);
    const weatherMul = normal || s === 0 ? 1 : 1 + weatherForOffset(ctx, o).pct / 100;
    const minutes = freeFlow * (1 + s * intensity * cf) * weatherMul + m.overheadMin;
    return { minutes: Math.max(1, Math.round(minutes)), tier: tierFromIntensity(intensity * cf) };
  };

  const forecast = travel(offset, dep);
  const normal = travel(offset, dep, true);
  const current = travel(0, nowMin);

  const approx = Number(route.origin.approximate) + Number(route.destination.approximate);
  const confidence = clamp(
    (CONFIDENCE_BY_OFFSET[Math.min(offset, 7)] ?? 64) -
      (summary.live ? 0 : 10) -
      approx * 4 -
      (corridors.length ? 0 : 6) +
      (congestion?.live && offset === 0 ? 3 : 0),
    45,
    95,
  );
  const spreadPct = 0.06 + (100 - confidence) / 400;
  const rangeLow = Math.max(1, Math.round(forecast.minutes * (1 - spreadPct)));
  const rangeHigh = Math.round(forecast.minutes * (1 + spreadPct));

  const reliabilityFor = (tier: TrafficTier, wxPct: number, anomaly: number, spread: number) =>
    Math.round(
      clamp(
        100 -
          spread * 120 -
          TIER_PENALTY[tier] * 0.35 -
          wxPct * 0.5 -
          Math.max(0, anomaly - 1) * 60,
        40,
        97,
      ),
    );
  const reliability = reliabilityFor(forecast.tier, wx.pct, anomalyAt(offset, dep), spreadPct);
  const normalReliability = reliabilityFor(normal.tier, 0, 1, 0.06 + (100 - 90) / 400);

  const avgPenalty = corridors.length
    ? corridors.reduce((sum, c) => sum + TIER_PENALTY[c.baseTier], 0) / corridors.length
    : 20;
  const lengthPenalty = Math.min(8, summary.distanceKm / 4);
  const normalRoadScore = Math.round(clamp(100 - avgPenalty - lengthPenalty, 20, 98));
  const roadScore = Math.round(
    clamp(normalRoadScore - wx.pct * 0.8 - Math.max(0, anomalyAt(offset, dep) - 1) * 40, 20, 98),
  );

  const before = travel(offset, dep - 30).minutes;
  const after = travel(offset, dep + 30).minutes;
  const trend =
    after > before * 1.05 ? "Increasing" : after < before * 0.95 ? "Decreasing" : "Steady";

  const depHour = Math.floor(dep / 60) * 60;
  const timeline = [-120, -60, 0, 60].map((d) => {
    const p = travel(offset, depHour + d);
    return { label: clock(depHour + d).replace(":00", ""), tier: p.tier, minutes: p.minutes };
  });
  const curve = Array.from({ length: 13 }, (_, i) => {
    const minute = dep - 180 + i * 30;
    return {
      label: clock(minute).replace(":00", ""),
      forecast: travel(offset, minute).minutes,
      normal: travel(offset, minute, true).minutes,
    };
  });

  // Recommendation: best departure within an hour before / 30 min after the usual time.
  let best = { minute: dep, minutes: forecast.minutes };
  for (let c = dep - 60; c <= dep + 30; c += 5) {
    const t = travel(offset, c).minutes;
    if (
      t < best.minutes ||
      (t === best.minutes && Math.abs(c - dep) < Math.abs(best.minute - dep))
    ) {
      best = { minute: c, minutes: t };
    }
  }
  const savesMin = forecast.minutes - best.minutes;
  const changed = savesMin >= 3;
  const winStart = changed ? best.minute - 5 : dep;
  const winEnd = changed ? best.minute + 5 : dep;
  const bestLow = Math.round(best.minutes * (1 - spreadPct));
  const bestHigh = Math.round(best.minutes * (1 + spreadPct));

  let rampStart = dep;
  let rampEnd = dep;
  let rampDiff = 0;
  for (let i = dep - 120; i <= dep + 45; i += 15) {
    const diff = travel(offset, i + 45).minutes - travel(offset, i).minutes;
    if (diff > rampDiff) {
      rampDiff = diff;
      rampStart = i;
      rampEnd = i + 45;
    }
  }
  const reason =
    rampDiff >= Math.max(2, forecast.minutes * 0.08)
      ? `Traffic is expected to increase sharply between ${clock(rampStart)} and ${clock(rampEnd)}.`
      : "Traffic is fairly flat around your usual departure time.";

  const delayMin = forecast.minutes - normal.minutes;
  const headline: RouteStatus["headline"] =
    delayMin >= route.thresholdMin
      ? { tone: "critical", text: "Slower than usual — delay above your threshold" }
      : trend === "Increasing" && TIER_RANK[forecast.tier] >= 2
        ? { tone: "warning", text: "Traffic expected to increase" }
        : delayMin <= 2
          ? { tone: "ok", text: "Close to normal" }
          : { tone: "ok", text: "Slightly busier than normal" };

  return {
    usingAlternative,
    next,
    departureMinute: dep,
    offset,
    distanceKm: summary.distanceKm,
    normalMin: normal.minutes,
    currentMin: current.minutes,
    forecastMin: forecast.minutes,
    rangeLow,
    rangeHigh,
    delayMin,
    delayLow: rangeLow - normal.minutes,
    delayHigh: rangeHigh - normal.minutes,
    tier: forecast.tier,
    normalTier: normal.tier,
    reliability,
    normalReliability,
    roadScore,
    normalRoadScore,
    confidence,
    weather: wx,
    congestion,
    trend,
    timeline,
    curve,
    recommendation: {
      changed,
      windowStart: clock(winStart),
      windowEnd: clock(winEnd),
      arrivalStart: clock(winStart + bestLow),
      arrivalEnd: clock(winEnd + bestHigh),
      savesMin: Math.max(0, savesMin),
      reason,
    },
    corridorNames: corridors.map((c) => c.name),
    headline,
  };
}

export function evaluateRoute(
  route: PersonalRoute,
  ctx: TrafficContext,
  useAlternative = false,
): RouteStatus {
  const main = route.primary;
  const alt = route.alternative;
  const primarySummary = useAlternative && alt ? alt : main;
  const status = computeStatus(route, primarySummary, ctx, useAlternative && !!alt);

  let alternative: RouteStatus["alternative"] = null;
  const other = useAlternative ? main : alt;
  if (other) {
    const o = computeStatus(route, other, ctx, !useAlternative);
    const diffMin = o.forecastMin - status.forecastMin;
    const label = useAlternative ? "Your usual route" : "Alternative route";
    if (o.reliability >= status.reliability + 5 && diffMin >= 0) {
      alternative = {
        forecastMin: o.forecastMin,
        reliability: o.reliability,
        distanceKm: o.distanceKm,
        diffMin,
        message: `${label} is ${diffMin} minute${diffMin === 1 ? "" : "s"} slower on average but has a higher reliability of ${o.reliability}%.`,
      };
    } else if (diffMin <= -3) {
      alternative = {
        forecastMin: o.forecastMin,
        reliability: o.reliability,
        distanceKm: o.distanceKm,
        diffMin,
        message: `${label} is about ${-diffMin} minutes faster at your departure time (${o.reliability}% reliability).`,
      };
    }
  }
  return { ...status, alternative };
}

// ---------------------------------------------------------------------------
// Alert detection — only meaningful changes, deduplicated by key
// ---------------------------------------------------------------------------

export type AlertDraft = Omit<RouteAlert, "id" | "createdAt" | "read">;

const ALERT_WINDOW_MIN = 18 * 60; // only alert about departures in the next 18 hours

export function detectAlerts(
  route: PersonalRoute,
  status: RouteStatus,
  opts: { frequency: Frequency; previous: RouteAlert[]; now: Date; test?: boolean },
): AlertDraft[] {
  const { now, frequency, previous, test } = opts;
  if (!route.alertsOn && !test) return [];
  const next = status.next;
  if (!next) return [];
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const minutesAway = next.offset * 1440 + next.minute - nowMin;
  if (!test && minutesAway > ALERT_WINDOW_MIN) return [];

  const depDate = new Date(now);
  depDate.setDate(depDate.getDate() + next.offset);
  const depKey = `${depDate.toISOString().slice(0, 10)}@${route.departure}`;
  const rule = (r: AlertRule) => route.rules.includes(r);
  const at = clock(next.minute);
  const drafts: AlertDraft[] = [];
  const add = (type: AlertType, severity: AlertSeverity, title: string, message: string) =>
    drafts.push({
      key: "",
      routeId: route.id,
      routeName: route.name,
      type,
      severity,
      title,
      message,
    });

  // 1. Delay vs the route's normal for this slot.
  if (rule("delay") && status.delayMin >= route.thresholdMin) {
    add(
      "delay",
      status.delayMin >= route.thresholdMin * 2 ? "critical" : "warning",
      "Slower than usual",
      `Your ${route.name} route is expected to be slower than usual ${next.dayWord}. Forecast ${rangeLabel(status.rangeLow, status.rangeHigh)} vs ${status.normalMin} min normally (+${Math.max(0, status.delayLow)}–${status.delayHigh} min).`,
    );
  }

  // 2. Live congestion well above the historical norm (e.g. 55 → 82, not 55 → 57).
  const c = status.congestion;
  if (rule("worseThanNormal") && c?.live && next.offset === 0) {
    const points = c.current - c.normal;
    const pct = Math.round((points / Math.max(1, c.normal)) * 100);
    if (points >= 15 && pct >= 20) {
      add(
        "trafficIncrease",
        points >= 30 ? "critical" : "warning",
        "Traffic getting worse",
        `Your ${route.name} route is currently ${pct}% more congested than normal.`,
      );
    }
  }

  // 3. Heavy traffic expected at departure — only when it's heavier than this slot usually is.
  if (rule("worseThanNormal")) {
    const heavy = TIER_RANK[status.tier] >= 2;
    const worse = TIER_RANK[status.tier] > TIER_RANK[status.normalTier];
    if ((frequency === "always" && status.tier === "Very High") || (heavy && worse)) {
      add(
        "futureTraffic",
        "warning",
        "Traffic expected later",
        `Heavy traffic is expected on your usual route around ${at}.`,
      );
    }
  }

  // 4. Road condition dropped meaningfully.
  if (
    rule("roadCondition") &&
    status.roadScore < 50 &&
    status.normalRoadScore - status.roadScore >= 10
  ) {
    add(
      "roadCondition",
      "warning",
      "Road condition changed",
      `Road conditions on your ${route.name} route have deteriorated (${status.roadScore}/100 vs ${status.normalRoadScore} usually).`,
    );
  }

  // 5. Reliability dropped meaningfully.
  if (
    rule("lowReliability") &&
    status.reliability < 65 &&
    status.normalReliability - status.reliability >= 8
  ) {
    add(
      "reliability",
      "warning",
      "Reliability decreased",
      `Your usual route has become less reliable than normal (${status.reliability}% vs ${status.normalReliability}% usually).`,
    );
  }

  // 6. Recovery — only after we previously warned about this departure.
  const warnedBefore = previous.some(
    (a) =>
      a.routeId === route.id &&
      !a.test &&
      a.key.includes(depKey) &&
      (a.type === "delay" || a.type === "trafficIncrease"),
  );
  if (warnedBefore && status.delayMin <= 3 && !drafts.some((d) => d.type === "delay")) {
    add(
      "improving",
      "positive",
      "Traffic improving",
      `Traffic on your ${route.name} route has improved. Current forecast is close to normal (${status.forecastMin} min).`,
    );
  }

  // Event alerts need an event feed; none is connected, so none are generated.

  const hourKey = `${now.toISOString().slice(0, 13)}`;
  return drafts
    .filter((d) => (frequency === "severe" && !test ? d.severity !== "warning" : true))
    .map((d) => ({
      ...d,
      test,
      key: test
        ? `test:${route.id}:${d.type}:${now.getTime()}`
        : frequency === "always"
          ? `${route.id}:${d.type}:${depKey}:${hourKey}`
          : `${route.id}:${d.type}:${depKey}:${d.severity}`,
    }))
    .filter((d) => {
      if (test) return true;
      if (previous.some((p) => p.key === d.key)) return false;
      // Smart: don't repeat a warning once a critical alert of the same kind went out.
      if (frequency !== "always" && d.severity === "warning") {
        return !previous.some((p) => p.key === `${route.id}:${d.type}:${depKey}:critical`);
      }
      return true;
    });
}
