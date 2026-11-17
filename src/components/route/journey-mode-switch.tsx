import { Link } from "@tanstack/react-router";
import { CalendarClock, Milestone } from "lucide-react";
import { cn } from "@/lib/utils";

const MODES = [
  { key: "depart", label: "Leave at", icon: Milestone, to: "/route-forecast" },
  { key: "arrive", label: "Arrive by", icon: CalendarClock, to: "/arrival-planner" },
] as const;

/** Switches Plan Journey between "leave at a time" and "arrive by a time". */
export function JourneyModeSwitch({ active }: { active: "depart" | "arrive" }) {
  return (
    <div
      className="inline-flex rounded-xl border border-border bg-surface p-1 text-sm font-semibold"
      role="tablist"
      aria-label="Journey planning mode"
    >
      {MODES.map(({ key, label, icon: Icon, to }) => (
        <Link
          key={key}
          to={to}
          role="tab"
          aria-selected={active === key}
          className={cn(
            "flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 transition",
            active === key
              ? "bg-gradient-brand text-primary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Icon size={15} />
          {label}
        </Link>
      ))}
    </div>
  );
}
