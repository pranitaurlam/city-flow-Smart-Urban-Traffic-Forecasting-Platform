import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Bell,
  BellOff,
  CheckCheck,
  CircleCheck,
  Clock,
  Settings2,
  Ticket,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { AlertType, RouteAlert } from "@/lib/personal-routes";
import { routeAlertActions, useRouteAlertStore } from "@/lib/personal-routes-store";
import { trendAlertActions, useTrendAlertStore } from "@/lib/trend-alert-store";
import { TONE_COLOR } from "./route-alert-ui";

const TYPE_ICON: Record<AlertType, typeof Bell> = {
  delay: Clock,
  trafficIncrease: TrendingUp,
  futureTraffic: Clock,
  event: Ticket,
  roadCondition: TriangleAlert,
  reliability: TrendingDown,
  improving: CircleCheck,
  arrivalReminder: Clock,
  arrivalRisk: TriangleAlert,
};

function timeLabel(iso: string) {
  const d = new Date(iso);
  const sameDay = d.toDateString() === new Date().toDateString();
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return sameDay
    ? time
    : `${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}, ${time}`;
}

export function NotificationCenter() {
  const store = useRouteAlertStore();
  const [open, setOpen] = useState(false);
  const unread = store.alerts.filter((a) => !a.read).length;

  const viewRoute = (a: RouteAlert) => {
    routeAlertActions.markRead(a.id);
    routeAlertActions.openAnalysis(a.routeId, false, !!a.test);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        >
          <Bell />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 grid min-w-4 place-items-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-4 text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={10}
        className="w-[min(400px,calc(100vw-24px))] rounded-2xl p-0"
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <p className="font-bold">Notifications</p>
            <p className="text-xs text-muted-foreground">
              {unread ? `${unread} unread` : "You're all caught up"}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs"
            disabled={!unread}
            onClick={() => routeAlertActions.markAllRead()}
          >
            <CheckCheck className="size-3.5" /> Mark all read
          </Button>
        </div>

        <ul className="max-h-[420px] divide-y divide-border overflow-y-auto">
          {store.alerts.length === 0 && (
            <li className="px-4 py-10 text-center text-sm text-muted-foreground">
              No alerts yet. CityFlow will notify you here when a saved route&apos;s forecast
              changes meaningfully.
            </li>
          )}
          {store.alerts.map((a) => {
            const Icon = TYPE_ICON[a.type];
            const route = store.routes.find((r) => r.id === a.routeId);
            return (
              <li
                key={a.id}
                className={`px-4 py-3 ${a.read ? "" : "bg-[color-mix(in_oklab,var(--brand-blue)_5%,transparent)]"}`}
              >
                <div className="flex gap-3">
                  <span
                    className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg"
                    style={{
                      color: TONE_COLOR[a.severity],
                      background: `color-mix(in oklab, ${TONE_COLOR[a.severity]} 14%, transparent)`,
                    }}
                  >
                    <Icon size={15} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-x-2 text-[11px] font-semibold text-muted-foreground">
                      <span>{timeLabel(a.createdAt)}</span>
                      <span aria-hidden>·</span>
                      <span className="truncate">{a.routeName}</span>
                      {a.test && (
                        <span className="rounded bg-secondary px-1.5 text-[10px]">Test</span>
                      )}
                      {!a.read && (
                        <i
                          className="ml-auto size-2 rounded-full bg-brand-blue"
                          aria-label="Unread"
                        />
                      )}
                    </p>
                    <p className="mt-0.5 text-sm font-bold">{a.title}</p>
                    <p className="text-xs text-muted-foreground">{a.message}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {route && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 rounded-md px-2.5 text-xs"
                          onClick={() => viewRoute(a)}
                        >
                          {a.type === "futureTraffic" ? "View Forecast" : "View Route"}
                        </Button>
                      )}
                      {!route && (a.type === "arrivalReminder" || a.type === "arrivalRisk") && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 rounded-md px-2.5 text-xs"
                          onClick={() => {
                            routeAlertActions.markRead(a.id);
                            setOpen(false);
                          }}
                          asChild
                        >
                          <Link to="/arrival-planner">Open Arrival Planner</Link>
                        </Button>
                      )}
                      {!a.read && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs"
                          onClick={() => routeAlertActions.markRead(a.id)}
                        >
                          Mark as read
                        </Button>
                      )}
                      {route?.alertsOn && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs text-muted-foreground"
                          onClick={() => routeAlertActions.setRouteAlerts(route.id, false)}
                        >
                          <BellOff className="size-3" /> Disable alerts
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>

        <div className="flex items-center justify-between border-t border-border px-4 py-2.5">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs"
            onClick={() => {
              setOpen(false);
              document
                .getElementById("alert-preferences")
                ?.scrollIntoView({ behavior: "smooth", block: "center" });
            }}
          >
            <Settings2 className="size-3.5" /> Manage notification preferences
          </Button>
          {store.alerts.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs text-muted-foreground"
              onClick={() => routeAlertActions.clearAlerts()}
            >
              Clear all
            </Button>
          )}
        </div>

        <TrendAlertToggle />
      </PopoverContent>
    </Popover>
  );
}

function TrendAlertToggle() {
  const trendStore = useTrendAlertStore();
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 border-t border-border px-4 py-2.5 text-xs">
      <span>
        <span className="font-semibold">Traffic trend pop-up alerts</span>
        <span className="block text-[11px] text-muted-foreground">
          Native browser alert() boxes for sudden congestion changes.
        </span>
      </span>
      <input
        type="checkbox"
        checked={trendStore.enabled}
        onChange={(e) => trendAlertActions.setEnabled(e.target.checked)}
        className="size-4 accent-[var(--brand-blue)]"
        aria-label="Enable traffic trend pop-up alerts"
      />
    </label>
  );
}
