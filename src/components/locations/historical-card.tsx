import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { periodStats, weeklyTrend, type TrafficPeriod } from "@/lib/location-forecast";
import type { BengaluruLocation } from "@/lib/locations";
import { buildHourly } from "@/lib/hourly";

const PERIODS: { key: TrafficPeriod; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "7d", label: "7 Days" },
  { key: "30d", label: "30 Days" },
  { key: "3m", label: "3 Months" },
];

export function HistoricalTrafficCard({ location }: { location: BengaluruLocation }) {
  const [period, setPeriod] = useState<TrafficPeriod>("7d");
  const stats = periodStats(location, period);

  const chartData =
    period === "today"
      ? buildHourly(location.basePeakVolume).map((h) => ({
          label: h.hour,
          volume: h.historical ?? h.forecast ?? 0,
        }))
      : weeklyTrend(location).map((d) => ({ label: d.day, volume: d.volume }));

  return (
    <div className="glass-panel rounded-2xl p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold">Historical Traffic</h3>
          <p className="text-xs text-muted-foreground">
            Traffic behavior over the selected period.
          </p>
        </div>
        <span className="text-[11px] font-bold text-muted-foreground">HISTORICAL</span>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {PERIODS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => setPeriod(p.key)}
            className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition ${
              period === p.key
                ? "border-transparent bg-gradient-brand text-primary-foreground"
                : "border-border bg-surface text-muted-foreground hover:border-brand-cyan"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="mt-4 h-40">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ left: -24 }}>
            <defs>
              <linearGradient id="historicalCardFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--brand-blue)" stopOpacity={0.4} />
                <stop offset="95%" stopColor="var(--brand-blue)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis
              dataKey="label"
              stroke="var(--muted-foreground)"
              fontSize={10}
              interval={period === "today" ? 2 : 0}
            />
            <YAxis hide />
            <Tooltip
              contentStyle={{
                background: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                fontSize: 12,
              }}
            />
            <Area
              type="monotone"
              dataKey="volume"
              stroke="var(--brand-blue)"
              fill="url(#historicalCardFill)"
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div>
          <p className="text-xs text-muted-foreground">Average</p>
          <p className="font-bold">{stats.average.toLocaleString()}/hr</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Peak</p>
          <p className="font-bold">{stats.peak.toLocaleString()}/hr</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Lowest</p>
          <p className="font-bold">{stats.lowest.toLocaleString()}/hr</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Peak Period</p>
          <p className="font-bold">{stats.peakPeriod}</p>
        </div>
      </div>
      {stats.isEstimate && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          {period === "7d"
            ? "Estimated — no Kaggle dataset coverage for this location yet."
            : `Estimated from the 7-day pattern — no ${stats.label.toLowerCase()} dataset for this location yet.`}
        </p>
      )}

      <Button variant="outline" size="sm" className="mt-4 w-full" asChild>
        <Link to="/traffic-analysis" search={{ loc: location.slug }}>
          View Traffic Analysis <ArrowRight className="size-4" />
        </Link>
      </Button>
    </div>
  );
}
