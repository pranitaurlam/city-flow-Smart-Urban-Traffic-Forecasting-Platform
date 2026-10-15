import type { ArrivalPlanResult } from "@/lib/arrival-planner";

export function WhyThisDeparture({ plan }: { plan: ArrivalPlanResult }) {
  return (
    <section className="glass-panel rounded-2xl p-5 sm:p-6">
      <h3 className="text-sm font-bold">Why this departure time?</h3>
      <p className="text-xs text-muted-foreground">
        Factors associated with the recommended departure window. Only factors backed by available
        data are shown.
      </p>
      <div className="mt-4 space-y-3.5">
        {plan.factors.map((f) => (
          <div key={f.label}>
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold">{f.label}</span>
              <span className="font-bold text-brand-cyan">{f.pct}%</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-gradient-brand"
                style={{ width: `${f.pct}%` }}
              />
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">{f.detail}</p>
          </div>
        ))}
      </div>
      <p className="mt-4 text-[11px] text-muted-foreground">
        No live event or road-closure feed is connected yet, so those factors aren&apos;t shown —
        CityFlow won&apos;t invent a cause it can&apos;t back with data.
      </p>
    </section>
  );
}
