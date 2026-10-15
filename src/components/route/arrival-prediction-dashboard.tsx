import { ExternalLink, ShieldAlert, ShieldCheck, ShieldHalf } from "lucide-react";
import { Button } from "@/components/ui/button";
import { openInGoogleMaps, type PlannerMode } from "@/lib/route-intelligence";
import { formatMinutes, type ArrivalPlanResult, type RiskLevel } from "@/lib/arrival-planner";

const RISK_STYLE: Record<RiskLevel, { icon: typeof ShieldCheck; tone: string; bg: string }> = {
  "On Track": { icon: ShieldCheck, tone: "text-success", bg: "var(--success)" },
  "Tight Schedule": { icon: ShieldHalf, tone: "", bg: "oklch(0.7 0.19 45)" },
  "High Risk": { icon: ShieldAlert, tone: "text-destructive", bg: "var(--destructive)" },
};

export function ArrivalPredictionDashboard({
  plan,
  originText,
  destinationText,
  mode,
}: {
  plan: ArrivalPlanResult;
  originText: string;
  destinationText: string;
  mode: PlannerMode;
}) {
  const { recommended } = plan;
  const risk = RISK_STYLE[recommended.risk];
  const RiskIcon = risk.icon;

  return (
    <section className="glass-panel relative overflow-hidden rounded-3xl p-5 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-cyan">
            Arrival Prediction
          </p>
          <h2 className="mt-1 text-2xl font-extrabold sm:text-[28px]">
            {plan.unreachable
              ? "This deadline may not be reachable"
              : `Leave by ${recommended.departureLabel}`}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {originText} → {destinationText} · to arrive by {plan.deadlineLabel}
          </p>
        </div>
        <div
          className="flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold"
          style={{
            color: risk.bg,
            background: `color-mix(in oklab, ${risk.bg} 14%, transparent)`,
          }}
        >
          <RiskIcon size={16} />
          {recommended.risk}
        </div>
      </div>

      {plan.unreachable && (
        <p className="mt-4 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm font-semibold text-destructive">
          Even leaving right away, CityFlow can&apos;t forecast a departure that reaches your
          reliability target by this deadline. Consider an earlier arrival deadline or a faster
          mode.
        </p>
      )}
      {plan.departureInPast && !plan.unreachable && (
        <p className="mt-4 rounded-xl border border-border bg-surface-strong p-3 text-sm font-semibold text-muted-foreground">
          The recommended departure window for today has already passed.
        </p>
      )}

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-7">
        <Stat label="Target Arrival" value={plan.deadlineLabel} />
        <Stat label="Recommended Departure" value={recommended.departureLabel} />
        <Stat label="Estimated Arrival" value={recommended.arrivalLabel} />
        <Stat
          label="Journey Duration"
          value={`${formatMinutes(recommended.journeyRangeLow)} – ${formatMinutes(recommended.journeyRangeHigh)}`}
        />
        <Stat
          label="Safety Buffer"
          value={plan.input.bufferMin > 0 ? `${plan.input.bufferMin} min` : "None"}
        />
        <Stat label="On-Time Probability" value={`${recommended.onTimeProbability}%`} />
        <Stat label="Distance" value={`${plan.distanceKm.toFixed(1)} km`} />
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <Button
          variant="cityflow"
          className="rounded-xl"
          onClick={() => openInGoogleMaps(originText, destinationText, mode)}
        >
          <ExternalLink className="size-4" /> Open Route in Google Maps
        </Button>
        <p className="text-xs text-muted-foreground">
          Google Maps handles turn-by-turn navigation — CityFlow handles the forecasting and timing.
        </p>
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-extrabold sm:text-base">{value}</p>
    </div>
  );
}
