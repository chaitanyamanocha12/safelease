"use client";
import { useEffect, useMemo } from "react";
import { MapContainer, TileLayer, Marker, Circle, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";
import { formatCents } from "@/lib/money";

export interface MapListing {
  id: string;
  title: string;
  lat: number;
  lng: number;
  rentCents: number | null;
  isDemo: boolean;
}

function FitTo({ points, center }: { points: Array<[number, number]>; center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length > 1) map.fitBounds(L.latLngBounds(points).pad(0.15), { animate: false });
    else map.setView(points[0] ?? center, 13, { animate: false });
  }, [map, points, center]);
  return null;
}

export default function RentalMap({ listings, selectedId, onSelect, anchor, radiusKm, tileUrl, attribution, height = 420 }: { listings: MapListing[]; selectedId?: string | null; onSelect?: (id: string) => void; anchor?: { lat: number; lng: number; label: string } | null; radiusKm?: number | null; tileUrl: string; attribution: string; height?: number }) {
  const points = useMemo(() => listings.map((l) => [l.lat, l.lng] as [number, number]), [listings]);
  const center: [number, number] = anchor ? [anchor.lat, anchor.lng] : [44.6488, -63.5752];
  return (
    <div style={{ height }} className="overflow-hidden rounded-lg border border-border">
      <MapContainer center={center} zoom={12} scrollWheelZoom={false} style={{ height: "100%", width: "100%" }} aria-label="Map of rental results">
        <TileLayer url={tileUrl} attribution={attribution} />
        <FitTo points={points.length ? points : [center]} center={center} />
        {anchor ? (
          <>
            <Marker position={[anchor.lat, anchor.lng]} icon={L.divIcon({ className: "", html: `<div class="price-pin" style="background:var(--navy);color:#fff;border-color:var(--navy)">★ ${anchor.label.replace(/</g, "")}</div>`, iconAnchor: [10, 10] })} keyboard={false} />
            {radiusKm ? <Circle center={[anchor.lat, anchor.lng]} radius={radiusKm * 1000} pathOptions={{ color: "#14B8A6", weight: 1.5, fillOpacity: 0.06 }} /> : null}
          </>
        ) : null}
        {listings.map((l) => (
          <Marker
            key={l.id}
            position={[l.lat, l.lng]}
            eventHandlers={{ click: () => onSelect?.(l.id) }}
            icon={L.divIcon({ className: "", html: `<div class="price-pin ${l.id === selectedId ? "selected" : ""} ${l.isDemo ? "demo" : ""}">${l.rentCents ? formatCents(l.rentCents) : "?"}</div>`, iconAnchor: [24, 12] })}
            title={`${l.title}${l.rentCents ? `, ${formatCents(l.rentCents)}` : ""}${l.isDemo ? " (DEMO)" : ""}`}
          >
            <Tooltip direction="top" offset={[0, -10]}>{l.title}{l.isDemo ? " · DEMO (fictional, approximate area)" : ""}</Tooltip>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
