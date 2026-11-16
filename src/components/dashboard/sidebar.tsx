import { Link, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import {
  AlertTriangle,
  CalendarClock,
  FileBarChart,
  HelpCircle,
  LayoutDashboard,
  Lightbulb,
  Milestone,
  Ticket,
  Settings,
  TrendingUp,
  Timer,
  Activity,
  Route as RouteIcon,
  User,
  MoreHorizontal,
  Home,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

const navItems = [
  {
    label: "Dashboard",
    icon: LayoutDashboard,
    to: "/dashboard/$city" as const,
    params: { city: "bengaluru" },
  },
  { label: "Traffic Analysis", icon: Activity, to: "/traffic-analysis" as const, params: {} },
  { label: "Forecast", icon: TrendingUp, to: "/forecast" as const, params: {} },
  { label: "Route Forecast", icon: Milestone, to: "/route-forecast" as const, params: {} },
  {
    label: "Arrival Planner",
    icon: CalendarClock,
    to: "/arrival-planner" as const,
    params: {},
  },
  { label: "Events", icon: Ticket, to: "/events" as const, params: {} },
  { label: "Peak Hours", icon: Timer, to: "/peak-hours" as const, params: {} },
  { label: "Reports", icon: FileBarChart, to: "/reports" as const, params: {} },
  { label: "Insights", icon: Lightbulb, to: "/insights" as const, params: {} },
  { label: "Alerts", icon: AlertTriangle, to: "/alerts" as const, params: {} },
];

const bottomItems = [
  { label: "Settings", icon: Settings },
  { label: "Help & Support", icon: HelpCircle },
];

const isActive = (pathname: string, to: string) => pathname.startsWith(to.split("$")[0] ?? to);

// Bottom tab bar on phones: Home plus the three most-used pages; the rest
// sit under "More".
const TAB_LABELS = new Set(["Dashboard", "Forecast", "Route Forecast"]);
const SHORT_LABEL: Record<string, string> = {
  "Route Forecast": "Route",
  "Arrival Planner": "Arrive",
};

function MobileNav({ pathname }: { pathname: string }) {
  const [open, setOpen] = useState(false);
  const tabs = navItems.filter((item) => TAB_LABELS.has(item.label));
  const more = navItems.filter((item) => !TAB_LABELS.has(item.label));
  const moreActive = more.some((item) => isActive(pathname, item.to));
  const tabClass = (active: boolean) =>
    cn(
      "flex flex-1 flex-col items-center gap-0.5 rounded-xl py-1.5 text-[10px] font-semibold transition-colors",
      active ? "text-brand-cyan" : "text-muted-foreground",
    );

  return (
    <nav
      className="cf-mobile-nav fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface-strong px-2 pt-1.5 backdrop-blur-xl lg:hidden"
      style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
      aria-label="Mobile navigation"
    >
      <div className="mx-auto flex max-w-md items-stretch gap-1">
        <Link to="/" className={tabClass(pathname === "/")}>
          <Home size={20} />
          Home
        </Link>
        {tabs.map(({ label, icon: Icon, to, params }) => {
          const active = isActive(pathname, to);
          return (
            <Link key={label} to={to} params={params} className={tabClass(active)}>
              <Icon size={20} className={active ? "drop-shadow-[0_0_6px_var(--brand-cyan)]" : ""} />
              {SHORT_LABEL[label] ?? label}
            </Link>
          );
        })}
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger className={tabClass(moreActive)}>
            <MoreHorizontal size={20} />
            More
          </SheetTrigger>
          <SheetContent
            side="bottom"
            className="rounded-t-3xl pb-[max(1.5rem,env(safe-area-inset-bottom))]"
          >
            <SheetTitle className="text-base font-extrabold">More</SheetTitle>
            <div className="mt-4 grid grid-cols-3 gap-2">
              {more.map(({ label, icon: Icon, to, params }) => (
                <Link
                  key={label}
                  to={to}
                  params={params}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "flex flex-col items-center gap-1.5 rounded-2xl border border-border p-3 text-center text-xs font-semibold",
                    isActive(pathname, to)
                      ? "border-brand-cyan bg-[color-mix(in_oklab,var(--brand-cyan)_12%,transparent)] text-brand-cyan"
                      : "bg-surface",
                  )}
                >
                  <Icon size={20} />
                  {label}
                </Link>
              ))}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </nav>
  );
}

export function DashboardSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <>
      <MobileNav pathname={pathname} />
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:flex">
        <Link to="/" className="flex items-center gap-2 px-6 py-6" aria-label="CityFlow home">
          <span className="grid size-9 place-items-center rounded-full bg-gradient-brand text-primary-foreground">
            <RouteIcon size={20} />
          </span>
          <span className="text-lg font-extrabold tracking-normal">CityFlow</span>
        </Link>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3" aria-label="Dashboard navigation">
          {navItems.map(({ label, icon: Icon, to, params }) => {
            const active = isActive(pathname, to);
            const itemClass = cn(
              "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
              active
                ? "cf-sheen bg-gradient-brand text-primary-foreground shadow-brand"
                : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            );

            return (
              <Link key={label} to={to} params={params} className={itemClass}>
                <Icon
                  size={18}
                  className="transition-transform duration-200 group-hover:translate-x-0.5 group-hover:scale-110"
                />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="space-y-1 px-3 pb-4">
          {bottomItems.map(({ label, icon: Icon }) => (
            <a
              key={label}
              href="#"
              onClick={(event) => event.preventDefault()}
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            >
              <Icon size={18} />
              {label}
            </a>
          ))}
        </div>

        <div className="flex items-center gap-3 border-t border-sidebar-border px-4 py-4">
          <span className="grid size-9 place-items-center rounded-full bg-secondary text-secondary-foreground">
            <User size={16} />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">Admin User</p>
            <p className="truncate text-xs text-sidebar-foreground/60">admin@cityflow.io</p>
          </div>
        </div>
      </aside>
    </>
  );
}
