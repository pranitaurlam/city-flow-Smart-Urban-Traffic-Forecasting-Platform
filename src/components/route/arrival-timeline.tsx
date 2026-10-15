import { formatMinutes, minutesToClock, type ArrivalPlanResult } from "@/lib/arrival-planner";

export function ArrivalTimeline({ plan }: { plan: ArrivalPlanResult }) {
  const { recommended, deadlineMinute } = plan;
  const start = recommended.departureMinute;
  const end = Math.max(deadlineMinute, recommended.arrivalRangeHigh);
  const span = Math.max(1, end - start);
  const pct = (minute: number) => Math.min(100, Math.max(0, ((minute - start) / span) * 100));

  const arrivalMeanMinute = start + recommended.journeyMin;
  const bufferRemaining = deadlineMinute - arrivalMeanMinute;

  return (
    <div className="glass-panel rounded-2xl p-5 sm:p-6">
      <p className="text-xs font-bold uppercase tracking-wide text-brand-cyan">Arrival Timeline</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Departure, journey, estimated arrival range, and your deadline — to scale.
      </p>

      <div className="relative mt-8 h-2 rounded-full bg-secondary">
        <div
          className="absolute inset-y-0 rounded-full bg-[color-mix(in_oklab,var(--brand-cyan)_55%,transparent)]"
          style={{
            left: `${pct(recommended.arrivalRangeLow)}%`,
            right: `${100 - pct(recommended.arrivalRangeHigh)}%`,
          }}
        />
        <Marker pct={pct(start)} tone="start" />
        <Marker pct={pct(arrivalMeanMinute)} tone="mid" />
        <Marker pct={pct(deadlineMinute)} tone="end" />
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

function Marker({ pct, tone }: { pct: number; tone: "start" | "mid" | "end" }) {
  const color =
    tone === "start"
      ? "var(--brand-blue)"
      : tone === "mid"
        ? "var(--brand-cyan)"
        : "var(--destructive)";
  return (
    <span
      className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-background"
      style={{ left: `${pct}%`, background: color }}
    />
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
