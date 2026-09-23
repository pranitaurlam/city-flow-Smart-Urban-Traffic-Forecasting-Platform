import "leaflet/dist/leaflet.css";
import { useEffect } from "react";
import { Circle, MapContainer, Marker, TileLayer, useMap } from "react-leaflet";
import { divIcon } from "leaflet";
import {
  bengaluruCenter,
  bengaluruLocations,
  trafficTierColor,
  type TrafficTier,
} from "@/lib/locations";

function dotIcon(color: string, selected: boolean) {
  const html = selected
    ? `<span class="relative flex size-6 items-center justify-center">
         <span class="absolute inline-flex size-full animate-ping rounded-full opacity-60" style="background:${color}"></span>
         <span class="relative inline-flex size-4 rounded-full ring-[3px] ring-white shadow-lg" style="background:${color}"></span>
       </span>`
    : `<span class="block size-3 rounded-full ring-2 ring-white/90 shadow-sm" style="background:${color}"></span>`;
  const size = selected ? 24 : 12;
  return divIcon({ html, className: "", iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
}

function FlyToSelected({ lat, lon }: { lat: number; lon: number }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo([lat, lon], 14, { duration: 0.8 });
  }, [lat, lon, map]);
  return null;
}

export function BengaluruMap({
  selectedSlug,
  selectedTier,
  onSelect,
  showTraffic = true,
}: {
  selectedSlug: string;
  selectedTier: TrafficTier;
  onSelect: (slug: string) => void;
  /** When false, markers render in a neutral color instead of traffic-tier colors. */
  showTraffic?: boolean;
}) {
  const selected = bengaluruLocations.find((item) => item.slug === selectedSlug);

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
      <Circle
        center={[bengaluruCenter.lat, bengaluruCenter.lon]}
        radius={13000}
        pathOptions={{
          color: "var(--brand-violet)",
          weight: 1.5,
          fillOpacity: 0.03,
          dashArray: "6 6",
        }}
      />
      {bengaluruLocations.map((location) => {
        const isSelected = location.slug === selectedSlug;
        const color = showTraffic
          ? trafficTierColor[isSelected ? selectedTier : location.baseTier]
          : "var(--brand-cyan)";
        return (
          <Marker
            key={location.slug}
            position={[location.lat, location.lon]}
            icon={dotIcon(color, isSelected)}
            eventHandlers={{ click: () => onSelect(location.slug) }}
          />
        );
      })}
      {selected && <FlyToSelected lat={selected.lat} lon={selected.lon} />}
    </MapContainer>
  );
}
