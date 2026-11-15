/** Geographic helpers (pure). */
export interface LatLng {
  lat: number;
  lng: number;
}

const R_KM = 6371.0088;

export function haversineKm(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R_KM * Math.asin(Math.min(1, Math.sqrt(s)));
}

export function isValidLatLng(p: Partial<LatLng> | null | undefined): p is LatLng {
  return Boolean(p && typeof p.lat === "number" && typeof p.lng === "number" && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180);
}

/**
 * Reference points used as search anchors. Coordinates are approximate public
 * landmarks/neighbourhood centres (OpenStreetMap), used only to centre the map
 * and compute straight-line distance — never as listing locations.
 */
export const ANCHORS: Array<{ key: string; label: string; lat: number; lng: number }> = [
  { key: "dalhousie", label: "Dalhousie University (Studley campus)", lat: 44.6366, lng: -63.5917 },
  { key: "smu", label: "Saint Mary's University", lat: 44.6312, lng: -63.5798 },
  { key: "msvu", label: "Mount Saint Vincent University", lat: 44.6704, lng: -63.6466 },
  { key: "nscc_ivany", label: "NSCC Ivany Campus (Dartmouth)", lat: 44.6703, lng: -63.5616 },
  { key: "downtown_halifax", label: "Downtown Halifax", lat: 44.6488, lng: -63.5752 },
  { key: "downtown_dartmouth", label: "Downtown Dartmouth", lat: 44.6663, lng: -63.5676 },
  { key: "bedford", label: "Bedford", lat: 44.7314, lng: -63.6559 },
];

export const HALIFAX_CENTER: LatLng = { lat: 44.6488, lng: -63.5752 };
