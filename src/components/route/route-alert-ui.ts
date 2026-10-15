import {
  BedDouble,
  Building2,
  Bus,
  Car,
  Footprints,
  GraduationCap,
  House,
  Motorbike,
  Route as RouteIcon,
} from "lucide-react";
import type { PlannerMode } from "@/lib/route-intelligence";
import type { useRouteMonitor } from "@/hooks/use-route-monitor";

export type RouteMonitor = ReturnType<typeof useRouteMonitor>;

export const MODE_OPTIONS: { key: PlannerMode; label: string; icon: typeof Car }[] = [
  { key: "driving", label: "Car", icon: Car },
  { key: "two-wheeler", label: "Bike", icon: Motorbike },
  { key: "transit", label: "Transit", icon: Bus },
  { key: "walking", label: "Walk", icon: Footprints },
];

export const modeOption = (key: PlannerMode) =>
  MODE_OPTIONS.find((m) => m.key === key) ?? MODE_OPTIONS[0]!;

/** Icon for a route, picked from where it starts ("College → PG" → graduation cap). */
export function routeIcon(name: string) {
  const first = (name.split(/→|->|\bto\b/i)[0] ?? name).toLowerCase();
  if (/college|school|campus|university|class/.test(first)) return GraduationCap;
  if (/\bpg\b|hostel/.test(first)) return BedDouble;
  if (/home|house/.test(first)) return House;
  if (/office|work/.test(first)) return Building2;
  return RouteIcon;
}

export const TONE_COLOR = {
  critical: "var(--destructive)",
  warning: "oklch(0.7 0.19 45)",
  ok: "var(--success)",
  positive: "var(--success)",
} as const;
