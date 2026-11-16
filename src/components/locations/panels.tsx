import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { trafficTierColor, type BengaluruLocation, type TrafficTier } from "@/lib/locations";
import { weeklyTrend } from "@/lib/location-forecast";

export function TierBadge({ tier }: { tier: TrafficTier }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold"
      style={{
        background: `color-mix(in oklab, ${trafficTierColor[tier]} 18%, transparent)`,
        color: trafficTierColor[tier],
      }}
    >
      <span className="relative flex size-1.5">
        {tier === "Very High" && (
          <span
            className="cf-ping absolute inset-0 rounded-full"
            style={{ background: trafficTierColor[tier] }}
          />
        )}
        <i
          className="relative size-1.5 rounded-full"
          style={{ background: trafficTierColor[tier] }}
        />
      </span>
      {tier.toUpperCase()}
    </span>
  );
}

export function HistoricalPreviewChart({ location }: { location: BengaluruLocation }) {
  const trend = weeklyTrend(location);
  return (
    <div className="glass-panel rounded-2xl p-5">
      <h3 className="text-sm font-bold">Recent Traffic Pattern</h3>
      <p className="text-xs text-muted-foreground">
        Monday → Sunday{location.hasDataset ? " · Source: Kaggle traffic dataset" : ""}
      </p>
      <div className="mt-3 h-40">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={trend} margin={{ left: -24 }}>
            <defs>
              <linearGradient id="weeklyFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--brand-blue)" stopOpacity={0.4} />
                <stop offset="95%" stopColor="var(--brand-blue)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="day" stroke="var(--muted-foreground)" fontSize={11} />
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
              fill="url(#weeklyFill)"
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
