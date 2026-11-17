import { Link, useRouterState } from "@tanstack/react-router";
import {
  FileBarChart,
  LayoutDashboard,
  Milestone,
  Ticket,
  TrendingUp,
  Route as RouteIcon,
  Home,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  {
    label: "Dashboard",
    icon: LayoutDashboard,
    to: "/dashboard/$city" as const,
    params: { city: "bengaluru" },
    match: ["/dashboard"],
  },
  {
    label: "Forecast",
    icon: TrendingUp,
    to: "/forecast" as const,
    params: {},
    match: ["/forecast"],
  },
  {
    label: "Plan Journey",
    icon: Milestone,
    to: "/route-forecast" as const,
    params: {},
    // "Arrive by" mode lives on its own route but is part of the same page.
    match: ["/route-forecast", "/arrival-planner"],
  },
  {
    label: "Reports",
    icon: FileBarChart,
    to: "/reports" as const,
    params: {},
    match: ["/reports"],
  },
];

// Managing events is an admin task, so it sits apart from the everyday pages.
const manageItems = [
  { label: "Events", icon: Ticket, to: "/events" as const, params: {}, match: ["/events"] },
];

const isActive = (pathname: string, match: string[]) =>
  match.some((prefix) => pathname.startsWith(prefix));

const SHORT_LABEL: Record<string, string> = { "Plan Journey": "Journey" };

// Bottom tab bar on phones: Home plus every page.
function MobileNav({ pathname }: { pathname: string }) {
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
        {[...navItems, ...manageItems].map(({ label, icon: Icon, to, params, match }) => {
          const active = isActive(pathname, match);
          return (
            <Link key={label} to={to} params={params} className={tabClass(active)}>
              <Icon size={20} className={active ? "drop-shadow-[0_0_6px_var(--brand-cyan)]" : ""} />
              {SHORT_LABEL[label] ?? label}
            </Link>
          );
        })}
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
          {navItems.map((item) => (
            <NavLink key={item.label} item={item} pathname={pathname} />
          ))}
          <p className="px-3 pb-1 pt-5 text-[11px] font-bold uppercase tracking-wide text-sidebar-foreground/50">
            Manage
          </p>
          {manageItems.map((item) => (
            <NavLink key={item.label} item={item} pathname={pathname} />
          ))}
        </nav>
      </aside>
    </>
  );
}

function NavLink({
  item: { label, icon: Icon, to, params, match },
  pathname,
}: {
  item: (typeof navItems)[number] | (typeof manageItems)[number];
  pathname: string;
}) {
  const active = isActive(pathname, match);
  return (
    <Link
      to={to}
      params={params}
      className={cn(
        "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
        active
          ? "cf-sheen bg-gradient-brand text-primary-foreground shadow-brand"
          : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
      )}
    >
      <Icon
        size={18}
        className="transition-transform duration-200 group-hover:translate-x-0.5 group-hover:scale-110"
      />
      {label}
    </Link>
  );
}
