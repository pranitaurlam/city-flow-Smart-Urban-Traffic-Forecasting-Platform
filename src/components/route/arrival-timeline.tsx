import { Bike, Bus, Car, Flag, Footprints, Home } from "lucide-react";
import { formatMinutes, minutesToClock, type ArrivalPlanResult } from "@/lib/arrival-planner";
import type { PlannerMode } from "@/lib/route-intelligence";

const MODE_ICON: Record<PlannerMode, typeof Car> = {
  driving: Car,
  "two-wheeler": Bike,
  transit: Bus,
  walking: Footprints,
};

/**
 * The recommended trip drawn to scale as a little animated journey: the
 * vehicle for the chosen travel mode drives from home to its typical arrival
 * time, past the arrival window, with the deadline flagged at the end.
 */
export function ArrivalTimeline({ plan }: { plan: ArrivalPlanResult }) {
  const { recommended, deadlineMinute } = plan;
  const start = recommended.departureMinute;
  const end = Math.max(deadlineMinute, recommended.arrivalRangeHigh);
  const span = Math.max(1, end - start);
  // Keep a little margin at both ends so the home and flag icons fit.
  const pct = (minute: number) => 4 + Math.min(92, Math.max(0, ((minute - start) / span) * 92));

  const arrivalMeanMinute = start + recommended.journeyMin;
  const bufferRemaining = deadlineMinute - arrivalMeanMinute;
  const Vehicle = MODE_ICON[plan.input.mode] ?? Car;
  const fromPct = pct(start);
  const toPct = pct(arrivalMeanMinute);
  const late = bufferRemaining < 0;

  return (
    <div className="glass-panel rounded-2xl p-5 sm:p-6">
      <p className="text-xs font-bold uppercase tracking-wide text-brand-cyan">Arrival Timeline</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Departure, journey, estimated arrival range, and your deadline — to scale.
      </p>

      <div
        className="cf-trip relative mt-6 h-24"
        style={
          {
            "--from": `${fromPct}%`,
            "--to": `${toPct}%`,
            "--trail": `${toPct - fromPct}%`,
          } as React.CSSProperties
        }
        aria-hidden="true"
      >
        {/* road */}
        <div className="cf-trip-road absolute inset-x-0 top-12 h-7 rounded-full" />

        {/* arrival window */}
        <div
          className="absolute top-11 h-9 rounded-xl border border-dashed border-success/60 bg-success/15"
          style={{
            left: `${pct(recommended.arrivalRangeLow)}%`,
            right: `${100 - pct(recommended.arrivalRangeHigh)}%`,
          }}
        >
          <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-bold text-success">
            Arrive
          </span>
        </div>

        {/* trail behind the vehicle */}
        <div
          className="cf-trip-trail absolute top-[3.75rem] h-1.5 rounded-full bg-gradient-brand"
          style={{ left: `${fromPct}%` }}
        />

        {/* home */}
        <div
          className="absolute top-11 grid size-9 -translate-x-1/2 place-items-center rounded-full bg-[var(--brand-blue)] text-white shadow-md ring-2 ring-background"
          style={{ left: `${fromPct}%` }}
        >
          <Home size={16} />
        </div>

        {/* deadline flag */}
        <div
          className="absolute top-3 flex -translate-x-1/2 flex-col items-center"
          style={{ left: `${pct(deadlineMinute)}%` }}
        >
          <span className="cf-flag grid size-8 place-items-center rounded-full bg-destructive text-white shadow-md ring-2 ring-background">
            <Flag size={15} />
          </span>
          <span className="h-5 w-0.5 bg-destructive/70" />
        </div>

        {/* the traveller */}
        <div className="cf-trip-vehicle absolute top-[2.625rem] z-10" style={{ left: `${toPct}%` }}>
          <div className="relative -translate-x-1/2">
            <span className="cf-trip-puff absolute -left-3 top-6 size-2 rounded-full bg-foreground/20" />
            <span
              className="cf-trip-puff absolute -left-5 top-4 size-1.5 rounded-full bg-foreground/15"
              style={{ animationDelay: "0.4s" }}
            />
            <span
              className={`cf-trip-bob grid size-10 place-items-center rounded-2xl text-white shadow-lg ring-2 ring-background ${
                late ? "bg-destructive" : "bg-gradient-brand"
              }`}
            >
              <Vehicle size={20} />
            </span>
          </div>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <TimelineStat label="Departure" value={minutesToClock(start)} />
        <TimelineStat label="Journey Duration" value={formatMinutes(recommended.journeyMin)} />
        <TimelineStat
          label="Estimated Arrival"
          value={`${minutesToClock(recommended.arrivalRangeLow)} – ${minutesToClock(recommended.arrivalRangeHigh)}`}
        />
        <TimelineStat label="Deadline" value={minutesToClock(deadlineMinute)} />
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        {bufferRemaining >= 0
          ? `Roughly ${formatMinutes(bufferRemaining)} of buffer remains between your typical arrival and the deadline.`
          : `Your typical arrival is estimated ${formatMinutes(-bufferRemaining)} after the deadline at this departure time — consider the Early option below.`}
      </p>
    </div>
  );
}

function TimelineStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-extrabold">{value}</p>
    </div>
  );
}
