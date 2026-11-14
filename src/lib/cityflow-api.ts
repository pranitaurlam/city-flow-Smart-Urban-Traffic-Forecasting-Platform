/**
 * Client for the CityFlow backend (backend/ — FastAPI + PostgreSQL/SQLite).
 *
 * The backend serves the historical dataset and the ML model's pre-computed
 * forecasts from the database. It's an optional service: every caller must
 * handle a rejected promise (backend not running) and fall back gracefully.
 */

export const CITYFLOW_API_URL = (
  (import.meta.env["VITE_CITYFLOW_API_URL"] as string | undefined) ?? "http://localhost:8000"
).replace(/\/$/, "");

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

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${CITYFLOW_API_URL}${path}`, { signal: AbortSignal.timeout(6000) });
  if (!res.ok) throw new ApiError(res.status, `CityFlow API ${res.status} on ${path}`);
  return (await res.json()) as T;
}

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
  trendReportUrl: (slug?: string, days = 30) =>
    `${CITYFLOW_API_URL}/api/reports/trend.csv?${new URLSearchParams({
      ...(slug ? { area: slug } : {}),
      days: String(days),
    })}`,
};
