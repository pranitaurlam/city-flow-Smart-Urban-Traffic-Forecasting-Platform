import { useQuery } from "@tanstack/react-query";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cityflowApi } from "@/lib/cityflow-api";
import type { BengaluruLocation } from "@/lib/locations";

const HISTORY_DAYS = 14;

function shiftDate(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function shortDate(iso: string) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

/** 7-day congestion forecast from the trained XGBoost model, served by the backend. */
export function ModelForecastCard({ location }: { location: BengaluruLocation }) {
  const enabled = Boolean(location.hasDataset);

  const forecastQuery = useQuery({
    queryKey: ["api-forecast", location.slug],
    queryFn: () => cityflowApi.areaForecast(location.slug),
    enabled,
    retry: false,
    staleTime: 10 * 60_000,
  });

  const asOf = forecastQuery.data?.as_of_date;
  const historyQuery = useQuery({
    queryKey: ["api-history", location.slug, asOf],
    queryFn: () =>
      cityflowApi.areaHistory(location.slug, {
        start: shiftDate(asOf!, -(HISTORY_DAYS - 1)),
        end: asOf!,
      }),
    enabled: enabled && Boolean(asOf),
    retry: false,
    staleTime: 10 * 60_000,
  });

  return (
    <section className="glass-panel rounded-2xl p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-brand-violet">
            Model Forecast · From Database
          </p>
          <h3 className="mt-1 text-lg font-extrabold">7-day congestion forecast</h3>
        </div>
        {forecastQuery.data && (
          <Button variant="outline" size="sm" asChild>
            <a href={cityflowApi.trendReportUrl(location.slug)}>
              Export CSV <Download className="size-4" />
            </a>
          </Button>
        )}
      </div>

      {!enabled ? (
        <p className="mt-3 text-sm text-muted-foreground">
          The trained model covers the 8 areas in the Kaggle traffic dataset. {location.name} isn't
          one of them, so only the estimate above is available.
        </p>
      ) : forecastQuery.isPending || (forecastQuery.isSuccess && historyQuery.isPending) ? (
        <div className="mt-4 h-64 animate-pulse rounded-xl bg-secondary" />
      ) : forecastQuery.isError ? (
        <p className="mt-3 text-sm text-muted-foreground">
          The CityFlow backend isn't reachable, so model forecasts can't be shown. Start it with{" "}
          <code className="rounded bg-secondary px-1">uvicorn app.main:app</code> in{" "}
          <code className="rounded bg-secondary px-1">backend/</code>.
        </p>
      ) : (
        <ForecastChart forecast={forecastQuery.data} history={historyQuery.data ?? []} />
      )}
    </section>
  );
}

function ForecastChart({
  forecast,
  history,
}: {
  forecast: NonNullable<Awaited<ReturnType<typeof cityflowApi.areaForecast>>>;
  history: Awaited<ReturnType<typeof cityflowApi.areaHistory>>;
}) {
  const last = history.at(-1);
  const data = [
    ...history.map((h) => ({
      date: h.date,
      historical: h.congestion_pct,
      // Anchor the forecast line to the last observed day so the two connect.
      predicted: h === last ? h.congestion_pct : undefined,
      actual: undefined as number | undefined,
    })),
    ...forecast.points.map((p) => ({
      date: p.target_date,
      historical: undefined,
      predicted: p.congestion_pct?.predicted,
      actual: p.congestion_pct?.actual ?? undefined,
    })),
  ].map((row) => ({ ...row, label: shortDate(row.date) }));

  return (
    <>
      <p className="mt-1 text-sm text-muted-foreground">
        {forecast.area} · forecast made on {shortDate(forecast.as_of_date)} using the{" "}
        {forecast.model} model
        {forecast.backtest_mae_congestion != null &&
          ` · off by ${forecast.backtest_mae_congestion} points on average vs what actually happened`}
      </p>
      <div className="mt-4 h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ left: -12 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="label" stroke="var(--muted-foreground)" fontSize={11} />
            <YAxis
              domain={[0, 110]}
              ticks={[0, 25, 50, 75, 100]}
              stroke="var(--muted-foreground)"
              fontSize={11}
              width={48}
              unit="%"
            />
            <Tooltip
              formatter={(v: number) => `${v.toFixed(1)}%`}
              contentStyle={{
                background: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                fontSize: 12,
              }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line
              type="monotone"
              dataKey="historical"
              name="Historical"
              stroke="var(--brand-blue)"
              strokeWidth={2.5}
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="predicted"
              name="Forecast"
              stroke="var(--brand-cyan)"
              strokeDasharray="6 4"
              strokeWidth={2.5}
              dot={{ r: 3 }}
              connectNulls
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="actual"
              name="Actual"
              stroke="var(--brand-violet)"
              strokeWidth={1.5}
              dot={{ r: 3 }}
              connectNulls
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-3 text-xs leading-5 text-muted-foreground">
        The dataset ends on 9 Aug 2024, so this is a backtest: the model forecasts the last week it
        has real readings for, and "Actual" shows what happened. Congestion is 0–100%.
      </p>
    </>
  );
}
