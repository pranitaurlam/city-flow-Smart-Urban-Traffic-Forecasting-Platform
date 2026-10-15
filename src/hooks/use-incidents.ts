import { useEffect, useState } from "react";
import { loadIncidents, type Incident } from "@/lib/incidents";

/** Active (non-expired) incident reports, refreshed on an interval and on cross-tab storage changes. */
export function useIncidents() {
  const [incidents, setIncidents] = useState<Incident[]>([]);

  const refresh = () => setIncidents(loadIncidents());

  useEffect(() => {
    refresh();
    const interval = window.setInterval(refresh, 60_000);
    window.addEventListener("storage", refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  return { incidents, refresh };
}
