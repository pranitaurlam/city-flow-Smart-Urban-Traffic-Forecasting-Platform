import "leaflet/dist/leaflet.css";
import { useEffect } from "react";
import { MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap } from "react-leaflet";
import { divIcon } from "leaflet";
import { bengaluruCenter } from "@/lib/locations";

function labelIcon(label: string, color: string) {
  const html = `<span class="grid size-7 place-items-center rounded-full text-xs font-extrabold text-white shadow-lg ring-2 ring-white" style="background:${color}">${label}</span>`;
  return divIcon({ html, className: "", iconSize: [28, 28], iconAnchor: [14, 14] });
}

function FitToRoute({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length < 2) return;
    map.fitBounds(points, { padding: [48, 48] });
  }, [points, map]);
  return null;
}

export type RouteLine = {
  geometry: [number, number][];
  color: string;
  label: string;
  timeLabel: string;
  distanceLabel: string;
};

export function RouteMap({
  source,
  destination,
  routes,
}: {
  source: { lat: number; lon: number } | null;
  destination: { lat: number; lon: number } | null;
  routes: RouteLine[];
}) {
  const boundsPoints = routes.length
    ? routes.flatMap((r) => r.geometry)
    : source && destination
      ? [
          [source.lat, source.lon] as [number, number],
          [destination.lat, destination.lon] as [number, number],
        ]
      : [];

  return (
    <MapContainer
      center={[bengaluruCenter.lat, bengaluruCenter.lon]}
      zoom={12}
      scrollWheelZoom
      className="size-full"
      style={{ background: "var(--surface)" }}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution="&copy; OpenStreetMap contributors"
      />
      {routes.map((route) => (
        <Polyline
          key={route.label}
          positions={route.geometry}
          pathOptions={{ color: route.color, weight: 5, opacity: 0.85 }}
          eventHandlers={{
            mouseover: (e) => e.target.setStyle({ weight: 8, opacity: 1 }),
            mouseout: (e) => e.target.setStyle({ weight: 5, opacity: 0.85 }),
          }}
        >
          <Tooltip sticky direction="top" opacity={1}>
            <span className="text-xs font-semibold">
              {route.label}: {route.timeLabel} · {route.distanceLabel}
            </span>
          </Tooltip>
        </Polyline>
      ))}
      {source && (
        <Marker position={[source.lat, source.lon]} icon={labelIcon("A", "var(--brand-cyan)")} />
      )}
      {destination && (
        <Marker
          position={[destination.lat, destination.lon]}
          icon={labelIcon("B", "var(--brand-violet)")}
        />
      )}
      {boundsPoints.length > 1 && <FitToRoute points={boundsPoints} />}
    </MapContainer>
  );
}
