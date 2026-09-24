import { useState } from "react";
import { applyWhatIf, WHAT_IF_FACTORS, type WhatIfKey } from "@/lib/route-forecast";

function formatMin(min: number) {
  if (min < 60) return `${Math.round(min)} min`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return `${h} hr ${m} min`;
}

export function WhatIfSimulator({ baselineMin }: { baselineMin: number }) {
  const [active, setActive] = useState<Set<WhatIfKey>>(new Set());

  const toggle = (key: WhatIfKey) => {
    setActive((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const { scenarioMin, diffMin } = applyWhatIf(baselineMin, active);

  return (
    <div className="glass-panel rounded-2xl p-5 sm:p-6">
      <p className="text-xs font-bold uppercase tracking-wide text-brand-violet">
        What-If Scenario
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        Toggle conditions to see how the estimate would change.
      </p>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {WHAT_IF_FACTORS.map((f) => (
          <label
            key={f.key}
            className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition ${
              active.has(f.key)
                ? "border-brand-cyan bg-secondary"
                : "border-border bg-surface text-muted-foreground hover:border-brand-cyan"
            }`}
          >
            <input
              type="checkbox"
              checked={active.has(f.key)}
              onChange={() => toggle(f.key)}
              className="size-3.5 accent-[var(--brand-cyan)]"
            />
            {f.label}
          </label>
        ))}
      </div>

      <div className="mt-5 grid grid-cols-2 gap-4 border-t border-border pt-4 sm:grid-cols-3">
        <div>
          <p className="text-xs text-muted-foreground">Baseline</p>
          <p className="text-lg font-extrabold">{formatMin(baselineMin)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Scenario Travel Time</p>
          <p className="text-lg font-extrabold text-brand-cyan">{formatMin(scenarioMin)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Difference</p>
          <p
            className={`text-lg font-extrabold ${diffMin > 0 ? "text-destructive" : diffMin < 0 ? "text-success" : ""}`}
          >
            {diffMin > 0 ? "+" : ""}
            {diffMin} min
          </p>
        </div>
      </div>
      <p className="mt-3 text-[11px] text-muted-foreground">
        Scenario impacts are illustrative adjustments to the forecast, only using the condition
        toggles above — not a live re-run of the full model.
      </p>
    </div>
  );
}
