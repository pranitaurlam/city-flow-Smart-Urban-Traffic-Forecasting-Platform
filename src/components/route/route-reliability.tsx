import { BadgeCheck, BrainCircuit, History } from "lucide-react";
import type { ArrivalPlanResult } from "@/lib/arrival-planner";

export function RouteReliabilityCard({ plan }: { plan: ArrivalPlanResult }) {
  const { reliability } = plan;
  return (
    <section className="glass-panel rounded-2xl p-5 sm:p-6">
      <h3 className="text-sm font-bold">Route Reliability</h3>
      <p className="text-xs text-muted-foreground">
        Model confidence and actual on-time probability are distinct — a confident model can still
        forecast a risky arrival, and vice versa.
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <ReliabilityStat
          icon={BrainCircuit}
          label="Model Confidence"
          value={`${reliability.modelConfidence}%`}
          note="How much the forecast inputs (route data, day-offset, corridor coverage) support this estimate."
        />
        <ReliabilityStat
          icon={History}
          label="Historical On-Time Performance"
          value={
            reliability.historicalOnTimePct !== null
              ? `${reliability.historicalOnTimePct}%`
              : "Insufficient data"
          }
          note={
            reliability.historicalOnTimePct !== null
              ? "Derived from backtesting CityFlow's model against real historical traffic data for corridors on this route."
              : "No tracked corridor on this route has real historical traffic data to back a figure."
          }
          muted={reliability.historicalOnTimePct === null}
        />
        <ReliabilityStat
          icon={BadgeCheck}
          label="Probability Before Deadline"
          value={`${reliability.probabilityBeforeDeadline}%`}
          note="Chance of arriving at or before your deadline if you leave at the recommended time."
        />
      </div>

      {reliability.dataBasis === "pattern-model" && (
        <p className="mt-4 rounded-lg border border-border bg-surface p-3 text-xs text-muted-foreground">
          This route doesn&apos;t pass through a CityFlow-tracked corridor with real historical
          data, so travel-time uncertainty is estimated from citywide traffic patterns rather than
          this specific road.
        </p>
      )}
    </section>
  );
}

function ReliabilityStat({
  icon: Icon,
  label,
  value,
  note,
  muted,
}: {
  icon: typeof BadgeCheck;
  label: string;
  value: string;
  note: string;
  muted?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface-strong p-4">
      <div className="flex items-center gap-2 text-brand-cyan">
        <Icon size={16} />
        <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
      </div>
      <p className={`mt-2 text-2xl font-extrabold ${muted ? "text-muted-foreground" : ""}`}>
        {value}
      </p>
      <p className="mt-1 text-[11px] text-muted-foreground">{note}</p>
    </div>
  );
}
