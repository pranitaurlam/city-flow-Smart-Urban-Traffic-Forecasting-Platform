import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { cityflowApi } from "@/lib/cityflow-api";
import { fromApiIncident, type Incident } from "@/lib/incidents";

const QUERY_KEY = ["incidents"];
const NONE: Incident[] = [];

/** Active incident reports shared by all users, re-fetched every minute. */
export function useIncidents() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: QUERY_KEY,
    queryFn: cityflowApi.incidents,
    refetchInterval: 60_000,
    retry: false,
  });
  const incidents = useMemo(() => query.data?.map(fromApiIncident) ?? NONE, [query.data]);
  return {
    incidents,
    /** False when the CityFlow backend can't be reached, so reporting is off. */
    available: !query.isError,
    refresh: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  };
}
