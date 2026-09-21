import { Link, useRouterState } from "@tanstack/react-router";
import {
  AlertTriangle,
  FileBarChart,
  HelpCircle,
  LayoutDashboard,
  Lightbulb,
  MapPin,
  ScatterChart,
  Settings,
  TrendingUp,
  Timer,
  Activity,
  Route as RouteIcon,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  {
    label: "Dashboard",
    icon: LayoutDashboard,
    to: "/dashboard/$city" as const,
    params: { city: "bengaluru" },
  },
  { label: "Locations", icon: MapPin, to: "/locations" as const, params: {} },
  { label: "Traffic Analysis", icon: Activity, to: "/traffic-analysis" as const, params: {} },
  { label: "Forecast", icon: TrendingUp, to: undefined, params: {} },
  { label: "Peak Hours", icon: Timer, to: undefined, params: {} },
  { label: "Cluster Analysis", icon: ScatterChart, to: undefined, params: {} },
  { label: "Reports", icon: FileBarChart, to: undefined, params: {} },
  { label: "Insights", icon: Lightbulb, to: undefined, params: {} },
  { label: "Alerts", icon: AlertTriangle, to: undefined, params: {} },
];

const bottomItems = [
  { label: "Settings", icon: Settings },
  { label: "Help & Support", icon: HelpCircle },
];

export function DashboardSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:flex">
      <Link to="/" className="flex items-center gap-2 px-6 py-6" aria-label="CityFlow home">
        <span className="grid size-9 place-items-center rounded-full bg-gradient-brand text-primary-foreground">
          <RouteIcon size={20} />
        </span>
        <span className="text-lg font-extrabold tracking-normal">CityFlow</span>
      </Link>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3" aria-label="Dashboard navigation">
        {navItems.map(({ label, icon: Icon, to, params }) => {
          const active = to ? pathname.startsWith(to.split("$")[0] ?? to) : false;
          const itemClass = cn(
            "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
            active
              ? "bg-gradient-brand text-primary-foreground shadow-brand"
              : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
          );

          if (to) {
            return (
              <Link key={label} to={to} params={params} className={itemClass}>
                <Icon size={18} />
                {label}
              </Link>
            );
          }

          return (
            <a
              key={label}
              href="#"
              onClick={(event) => event.preventDefault()}
              className={itemClass}
            >
              <Icon size={18} />
              {label}
            </a>
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
  );
}
