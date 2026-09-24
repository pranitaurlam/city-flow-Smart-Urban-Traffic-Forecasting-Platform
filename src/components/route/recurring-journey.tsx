import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Repeat } from "lucide-react";
import { recurringWeekForecast } from "@/lib/route-forecast";
import { trafficTierColor } from "@/lib/locations";

const HOURS = [6, 7, 8, 9, 10, 17, 18, 19];

export function RecurringJourney({
  baseDurationMin,
  sourceName,
  destName,
}: {
  baseDurationMin: number;
  sourceName: string;
  destName: string;
}) {
  const [enabled, setEnabled] = useState(false);
  const [hour, setHour] = useState(8);

  const week = enabled && baseDurationMin ? recurringWeekForecast(baseDurationMin, hour) : [];

  return (
    <div className="glass-panel rounded-2xl p-5 sm:p-6">
      <label className="flex items-center gap-2 text-sm font-bold">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="size-4 accent-[var(--brand-cyan)]"
        />
        <Repeat size={15} className="text-brand-cyan" /> I travel this route regularly
      </label>

      {enabled && (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span>
              Route:{" "}
              <span className="font-semibold text-foreground">
                {sourceName} → {destName}
              </span>
            </span>
            <span>
              Days: <span className="font-semibold text-foreground">Monday–Friday</span>
            </span>
            <span className="flex items-center gap-1.5">
              Departure:
              <select
                value={hour}
                onChange={(e) => setHour(Number(e.target.value))}
                className="h-7 rounded-md border border-input bg-background px-2 text-xs font-semibold outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {HOURS.map((h) => (
                  <option key={h} value={h}>
                    {h % 12 === 0 ? 12 : h % 12}:00 {h < 12 ? "AM" : "PM"}
                  </option>
                ))}
              </select>
            </span>
          </div>

          <div className="mt-4 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={week}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="label" stroke="var(--muted-foreground)" fontSize={11} />
                <YAxis stroke="var(--muted-foreground)" fontSize={11} width={44} unit=" min" />
                <Tooltip
                  contentStyle={{
                    background: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="travelTime" radius={[4, 4, 0, 0]}>
                  {week.map((d) => (
                    <Cell key={d.label} fill={trafficTierColor[d.tier]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  );
}
