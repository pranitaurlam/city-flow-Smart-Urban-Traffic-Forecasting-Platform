import { useState } from "react";
import { TierBadge } from "@/components/locations/panels";
import { recommendDeparture } from "@/lib/route-forecast";

function formatMin(min: number) {
  if (min < 60) return `${Math.round(min)} min`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return `${h} hr ${m} min`;
}

export function ArrivalPlanner({
  baseDurationMin,
  dayOffset,
}: {
  baseDurationMin: number;
  dayOffset: number;
}) {
  const [targetHour, setTargetHour] = useState(9);
  const [targetMinute, setTargetMinute] = useState(0);

  const plan = baseDurationMin
    ? recommendDeparture(baseDurationMin, dayOffset, targetHour, targetMinute)
    : null;

  return (
    <div className="glass-panel rounded-2xl p-5 sm:p-6">
      <p className="text-xs font-bold uppercase tracking-wide text-brand-cyan">
        Arrival Time Planner
      </p>
      <p className="mt-1 text-sm text-muted-foreground">I need to arrive by:</p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select
          value={targetHour}
          onChange={(e) => setTargetHour(Number(e.target.value))}
          aria-label="Target arrival hour"
          className="h-9 rounded-md border border-input bg-background px-2.5 text-sm font-semibold shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          {Array.from({ length: 24 }, (_, h) => (
            <option key={h} value={h}>
              {h % 12 === 0 ? 12 : h % 12}:00 {h < 12 ? "AM" : "PM"}
            </option>
          ))}
        </select>
        <select
          value={targetMinute}
          onChange={(e) => setTargetMinute(Number(e.target.value))}
          aria-label="Target arrival minute"
          className="h-9 rounded-md border border-input bg-background px-2.5 text-sm font-semibold shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          {[0, 15, 30, 45].map((m) => (
            <option key={m} value={m}>
              :{String(m).padStart(2, "0")}
            </option>
          ))}
        </select>
      </div>

      {plan && (
        <div className="mt-4 grid gap-4 border-t border-border pt-4 sm:grid-cols-3">
          <div>
            <p className="text-xs text-muted-foreground">Recommended Departure Window</p>
            <p className="text-lg font-extrabold">
              {plan.windowStart} – {plan.windowEnd}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Estimated Journey</p>
            <p className="text-lg font-extrabold">
              {formatMin(plan.journeyRangeLow)} – {formatMin(plan.journeyRangeHigh)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Traffic</p>
            <TierBadge tier={plan.tier} />
          </div>
        </div>
      )}
      <p className="mt-3 text-[11px] text-muted-foreground">
        Forecast-based estimate — not a guaranteed departure time. {plan?.confidence}% confidence.
      </p>
    </div>
  );
}
