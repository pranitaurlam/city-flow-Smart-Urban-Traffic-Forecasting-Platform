/**
 * Client for the CityFlow backend (backend/ — FastAPI + PostgreSQL/SQLite).
 *
 * The backend serves the historical dataset and the ML model's pre-computed
 * forecasts from the database. It's an optional service: every caller must
 * handle a rejected promise (backend not running) and fall back gracefully.
 */

const CONFIGURED_API_URL = (
  (import.meta.env["VITE_CITYFLOW_API_URL"] as string | undefined) ?? ""
).trim();

/**
 * A deployed site must be built with VITE_CITYFLOW_API_URL. Without it, falling
 * back to localhost would make every visitor's browser call a backend on their
 * own device, which fails in confusing ways; instead every call fails with
 * this message.
 */
export const API_NOT_CONFIGURED_MESSAGE =
  "This site isn't connected to its backend: VITE_CITYFLOW_API_URL wasn't set when it was built.";
const apiConfigured = Boolean(CONFIGURED_API_URL) || !import.meta.env.PROD;

if (!apiConfigured && typeof window !== "undefined") {
  console.error(`[CityFlow] ${API_NOT_CONFIGURED_MESSAGE}`);
}

/**
 * Backend base URL. Local development defaults to http://localhost:8000. When
 * that points at localhost but the page was opened from another device on the
 * network (e.g. a phone at http://192.168.1.20:8080), "localhost" would mean
 * the phone itself, so the page's own host is used.
 */
function resolveApiUrl() {
  const configured = (CONFIGURED_API_URL || "http://localhost:8000").replace(/\/$/, "");
  if (typeof window === "undefined") return configured;
  const url = new URL(configured);
  const local = (host: string) => host === "localhost" || host === "127.0.0.1";
  if (local(url.hostname) && !local(window.location.hostname)) {
    url.hostname = window.location.hostname;
  }
  return url.toString().replace(/\/$/, "");
}

export const CITYFLOW_API_URL = apiConfigured ? resolveApiUrl() : "";

export type PredictedValue = { predicted: number; actual: number | null };

export type ApiForecastPoint = {
  target_date: string;
  horizon_days: number;
  congestion_pct: PredictedValue | null;
  avg_speed_kph: PredictedValue | null;
};

export type ApiAreaForecast = {
  area: string;
  slug: string;
  as_of_date: string;
  model: string;
  backtest_mae_congestion: number | null;
  points: ApiForecastPoint[];
};

export type ApiAreaSummary = {
  slug: string;
  name: string;
  roads: string[];
  records: number;
  first_date: string;
  last_date: string;
  avg_volume: number;
  max_volume: number;
  avg_speed_kph: number;
  avg_congestion_pct: number;
  busiest_road: string;
};

export type ApiHistoryPoint = {
  date: string;
  traffic_volume: number;
  avg_speed_kph: number;
  congestion_pct: number;
  weather: string;
  incident_reports: number;
  roads_reporting: number;
};

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Turns FastAPI's `detail` (a string, a list of strings, or validation objects) into a message. */
function errorMessage(detail: unknown, fallback: string): string {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((d) => (typeof d === "string" ? d : ((d as { msg?: string }).msg ?? JSON.stringify(d))))
      .join("\n");
  }
  return fallback;
}

async function request<T>(path: string, init: RequestInit = {}, timeoutMs = 8000): Promise<T> {
  if (!apiConfigured) throw new ApiError(0, API_NOT_CONFIGURED_MESSAGE);
  const res = await fetch(`${CITYFLOW_API_URL}${path}`, {
    ...init,
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { detail?: unknown } | null;
    throw new ApiError(
      res.status,
      errorMessage(body?.detail, `CityFlow API ${res.status} on ${path}`),
    );
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

const getJson = <T>(path: string) => request<T>(path);

const sendJson = <T>(
  path: string,
  method: "POST" | "PUT",
  body: unknown,
  headers: Record<string, string> = {},
) =>
  request<T>(path, {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

const ADMIN_KEY_STORAGE = "cityflow-admin-key";

/** Admin key for changing events, kept only in this browser. */
export function getAdminKey(): string {
  try {
    return localStorage.getItem(ADMIN_KEY_STORAGE) ?? "";
  } catch {
    return "";
  }
}

export function setAdminKey(key: string) {
  try {
    if (key) localStorage.setItem(ADMIN_KEY_STORAGE, key);
    else localStorage.removeItem(ADMIN_KEY_STORAGE);
  } catch {
    // Storage blocked (private mode): the key just isn't remembered.
  }
}

const adminHeaders = (): Record<string, string> => {
  const key = getAdminKey();
  return key ? { "x-admin-token": key } : {};
};

export type ApiVenue = {
  slug: string;
  name: string;
  lat: number;
  lon: number;
  capacity: number;
  impact_radius_km: number;
};

export type EventCategory = "concert" | "sports" | "expo" | "festival" | "comedy" | "other";

export type ApiEvent = {
  id: number;
  venue: ApiVenue;
  title: string;
  category: EventCategory;
  /** ISO timestamps with timezone. */
  starts_at: string;
  ends_at: string;
  expected_attendance: number;
  url: string | null;
  peak_delay_min: number;
};

export type EventInput = {
  venue: string;
  title: string;
  category: EventCategory;
  /** ISO timestamp; without an offset it's read as Bengaluru time. */
  starts_at: string;
  ends_at: string;
  expected_attendance: number | null;
  url: string | null;
};

export type ImpactWindow = {
  start: string;
  end: string;
  delay_min: number;
  phase: "arrival" | "during" | "dispersal";
};

export type EventOnRoute = {
  event: ApiEvent;
  distance_km: number;
  windows: ImpactWindow[];
  delay_min: number;
};

export type RouteImpact = { id: string; events: EventOnRoute[]; delay_min: number };

export type IncidentType = "accident" | "closure" | "construction" | "congestion" | "other";

export type ApiIncident = {
  id: number;
  lat: number;
  lon: number;
  road_hint: string;
  type: IncidentType;
  note: string | null;
  /** "unverified" means no photo check was available when it was submitted. */
  status: "verified" | "unverified";
  severity: string | null;
  photo_summary: string | null;
  /** ISO timestamps with timezone. */
  reported_at: string;
  expires_at: string;
};

export type IncidentInput = {
  lat: number;
  lon: number;
  road_hint: string;
  type: IncidentType;
  note: string | null;
  /** Base64 JPEG, no data: prefix. */
  image_base64: string;
};

export const cityflowApi = {
  areas: () => getJson<ApiAreaSummary[]>("/api/areas"),
  areaForecast: (slug: string) =>
    getJson<ApiAreaForecast>(`/api/areas/${encodeURIComponent(slug)}/forecast`),
  areaHistory: (slug: string, params: { start?: string; end?: string } = {}) => {
    const qs = new URLSearchParams(
      Object.entries(params).filter((e): e is [string, string] => Boolean(e[1])),
    );
    return getJson<ApiHistoryPoint[]>(
      `/api/areas/${encodeURIComponent(slug)}/history${qs.size ? `?${qs}` : ""}`,
    );
  },
  venues: () => getJson<ApiVenue[]>("/api/venues"),
  events: (params: { start?: string; end?: string } = {}) => {
    const qs = new URLSearchParams(
      Object.entries(params).filter((e): e is [string, string] => Boolean(e[1])),
    );
    return getJson<ApiEvent[]>(`/api/events${qs.size ? `?${qs}` : ""}`);
  },
  createEvent: (input: EventInput) =>
    sendJson<ApiEvent>("/api/events", "POST", input, adminHeaders()),
  updateEvent: (id: number, input: EventInput) =>
    sendJson<ApiEvent>(`/api/events/${id}`, "PUT", input, adminHeaders()),
  deleteEvent: (id: number) =>
    request<void>(`/api/events/${id}`, { method: "DELETE", headers: adminHeaders() }),
  importEvents: (csvText: string) =>
    request<{ created: number }>("/api/events/import", {
      method: "POST",
      headers: { "content-type": "text/csv", ...adminHeaders() },
      body: csvText,
    }),
  routeImpact: (
    routes: { id: string; geometry: [number, number][] }[],
    windowStart: Date,
    windowEnd: Date,
  ) =>
    sendJson<{ estimate: boolean; routes: RouteImpact[] }>("/api/events/route-impact", "POST", {
      routes,
      window_start: windowStart.toISOString(),
      window_end: windowEnd.toISOString(),
    }),
  incidents: () => getJson<ApiIncident[]>("/api/incidents"),
  /** The photo is checked before the report is stored, so this can take a while. */
  reportIncident: (input: IncidentInput) =>
    request<ApiIncident>(
      "/api/incidents",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...input, image_media_type: "image/jpeg" }),
      },
      90_000,
    ),
  trendReportUrl: (slug?: string, days = 30) =>
    `${CITYFLOW_API_URL}/api/reports/trend.csv?${new URLSearchParams({
      ...(slug ? { area: slug } : {}),
      days: String(days),
    })}`,
};
