import { CalendarClock, Gauge, Hourglass } from "lucide-react";
import { TierBadge } from "@/components/locations/panels";
import { formatMinutes, type ArrivalPlanResult, type DepartureOption } from "@/lib/arrival-planner";
import { cn } from "@/lib/utils";

const RISK_TONE: Record<DepartureOption["risk"], string> = {
  "On Track": "text-success",
  "Tight Schedule": "oklch(0.7 0.19 45)",
  "High Risk": "text-destructive",
};

const ICON = { early: CalendarClock, recommended: Gauge, late: Hourglass } as const;

export function DepartureComparison({ plan }: { plan: ArrivalPlanResult }) {
  return (
    <section>
      <h3 className="text-sm font-bold">Departure Comparison</h3>
      <p className="text-xs text-muted-foreground">
        Three departure options for the same deadline — a larger buffer costs waiting time but
        raises your odds of arriving on time.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        {plan.comparison.map((option) => {
          const Icon = ICON[option.kind];
          const tone = RISK_TONE[option.risk];
          return (
            <div
              key={option.kind}
              className={cn(
                "glass-panel rounded-2xl p-4 sm:p-5",
                option.kind === "recommended" && "border-brand-cyan ring-1 ring-brand-cyan",
              )}
            >
              <div className="flex items-center gap-2">
                <span className="grid size-8 place-items-center rounded-lg bg-[color-mix(in_oklab,var(--brand-cyan)_14%,transparent)] text-brand-cyan">
                  <Icon size={16} />
                </span>
                <p className="text-sm font-extrabold">{option.label}</p>
              </div>
              <p className="mt-2 text-2xl font-extrabold">{option.departureLabel}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{option.description}</p>

              <dl className="mt-3 space-y-1.5 border-t border-border pt-3 text-xs">
                <Row label="Estimated arrival" value={option.arrivalLabel} />
                <Row
                  label="Journey duration"
                  value={`${formatMinutes(option.journeyRangeLow)} – ${formatMinutes(option.journeyRangeHigh)}`}
                />
                <Row label="Traffic" value={<TierBadge tier={option.tier} />} />
              </dl>

              <div className="mt-3 flex items-center justify-between rounded-lg border border-border bg-surface-strong px-3 py-2">
                <span className="text-xs font-semibold text-muted-foreground">
                  On-time probability
                </span>
                <span className="text-sm font-extrabold" style={{ color: tone }}>
                  {option.onTimeProbability}%
                </span>
              </div>
              <p className="mt-1.5 text-center text-[11px] font-bold" style={{ color: tone }}>
                {option.risk}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-semibold">{value}</dd>
    </div>
  );
}
