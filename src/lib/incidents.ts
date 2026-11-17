import { distanceKm } from "@/lib/locations";
import type { ApiIncident, IncidentType } from "@/lib/cityflow-api";

export type { IncidentType };

export type Incident = {
  id: number;
  lat: number;
  lon: number;
  type: IncidentType;
  note?: string;
  /** Nearest known location name at report time, for display (e.g. "Marathahalli"). */
  roadHint: string;
  reportedAt: number;
  /** "verified": the photo check accepted it. "unverified": no photo check was available. */
  status: "verified" | "unverified";
  /** What the photo check saw. */
  photoSummary?: string;
};

export const INCIDENT_LABEL: Record<IncidentType, string> = {
  accident: "Accident",
  closure: "Road Closure",
  construction: "Construction",
  congestion: "Heavy Congestion",
  other: "Other Blockage",
};

// Rough corridor-width tolerance for matching a report to a route's geometry.
const NEAR_ROUTE_KM = 0.35;

export function fromApiIncident(api: ApiIncident): Incident {
  return {
    id: api.id,
    lat: api.lat,
    lon: api.lon,
    type: api.type,
    roadHint: api.road_hint,
    reportedAt: new Date(api.reported_at).getTime(),
    status: api.status,
    ...(api.note ? { note: api.note } : {}),
    ...(api.photo_summary ? { photoSummary: api.photo_summary } : {}),
  };
}

export function formatReportedAt(reportedAt: number) {
  return new Date(reportedAt).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Closest distance (km) from a point to any vertex of a route's geometry. */
function distanceToRouteKm(point: { lat: number; lon: number }, geometry: [number, number][]) {
  let min = Infinity;
  for (const [lat, lon] of geometry) {
    const d = distanceKm(point, { lat, lon });
    if (d < min) min = d;
  }
  return min;
}

/** Active incidents that fall within this route's corridor. */
export function incidentsOnRoute(incidents: Incident[], geometry: [number, number][]) {
  if (!geometry.length) return [];
  return incidents.filter((incident) => distanceToRouteKm(incident, geometry) <= NEAR_ROUTE_KM);
}

const MAX_PHOTO_EDGE = 1568;

/**
 * Shrinks a photo to at most 1568px on its long edge and re-encodes it as
 * JPEG, so phone photos upload quickly and stay under the API's size limit.
 */
export async function photoToJpegBase64(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_PHOTO_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser can't prepare the photo for upload.");
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.85).split(",")[1] ?? "";
}
