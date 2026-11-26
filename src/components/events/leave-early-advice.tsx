import { Link } from "@tanstack/react-router";
import { ArrowRight, Clock3, MapPin, Users } from "lucide-react";
import type { ApiEvent } from "@/lib/cityflow-api";
import { adviceForEvent, formatTime, formatWhen, journeySearchFor } from "@/lib/event-advice";

/**
 * The practical read on one event: when the crowd arrives, how much earlier to
 * leave, which areas are affected, and a journey already set up to beat it.
 *
 * Delay figures are the backend's rule-based estimate, not measured traffic.
 */
export function LeaveEarlyAdvice({ event }: { event: ApiEvent }) {
  const advice = adviceForEvent(event);
  const when = formatWhen(advice);
  const areas = advice.affectedAreas.slice(0, 4);

  return (
    <div className="rounded-xl border border-brand-cyan/40 bg-surface p-3">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-bold">
        <Clock3 className="size-3.5 shrink-0 text-brand-cyan" />
        Leave {advice.leaveEarlierMin} min earlier {when}
        <span className="font-normal text-muted-foreground">
          · be past {event.venue.name} by {formatTime(advice.beatTheCrowdBy)}
        </span>
      </p>

      <p className="mt-1.5 text-[11px] leading-4 text-muted-foreground">
        <Users className="mr-1 inline size-3 align-[-1px]" />
        Crowd arriving {formatTime(advice.arrivalFrom)} – {formatTime(new Date(event.starts_at))},
        leaving until {formatTime(advice.dispersalUntil)} · ~
        {event.expected_attendance.toLocaleString()} expected · up to {event.peak_delay_min} min
        extra near the venue (estimate)
      </p>

      {areas.length > 0 && (
        <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
          <MapPin className="mr-1 inline size-3 align-[-1px]" />
          Affects {areas.map((area) => area.name).join(", ")}
          {advice.affectedAreas.length > areas.length
            ? ` +${advice.affectedAreas.length - areas.length} more`
            : ""}
        </p>
      )}

      <Link
        to="/route-forecast"
        search={journeySearchFor(advice)}
        className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-brand-cyan hover:underline"
      >
        Plan a journey around this <ArrowRight className="size-3.5" />
      </Link>
    </div>
  );
}
