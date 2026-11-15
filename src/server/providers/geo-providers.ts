/**
 * Geocoding (Nominatim) and routing (openrouteservice).
 * Nominatim usage policy: identifying User-Agent, ≤1 request/second, no bulk.
 * Routing returns driving/walking only; transit is reported as unavailable.
 */
import { env } from "../env";
import { fetchJson, safeErrorMessage } from "./http";
import type { Provider, ProviderInfo, ProviderResult } from "./types";

export interface GeocodeResult {
  matched: boolean;
  displayName: string | null;
  lat: number | null;
  lng: number | null;
  matchType: string | null;
}

let lastNominatimCall = 0;
async function nominatimThrottle() {
  const wait = lastNominatimCall + 1100 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastNominatimCall = Date.now();
}

export class NominatimGeocoder implements Provider {
  info(): ProviderInfo {
    const e = env();
    const enabled = e.GEOCODER_PROVIDER === "nominatim";
    const ua = Boolean(e.NOMINATIM_USER_AGENT);
    return {
      id: "nominatim",
      category: "geocoding",
      name: "OpenStreetMap Nominatim",
      description: "Checks whether an address string matches a known address in OpenStreetMap. A match does not establish who may rent the unit.",
      capabilities: ["forward_geocode"],
      status: enabled && ua ? "LIVE" : "NOT_CONFIGURED",
      statusMessage: !enabled
        ? "Set GEOCODER_PROVIDER=nominatim and NOMINATIM_USER_AGENT to enable."
        : ua
          ? "Enabled; throttled to 1 request/second per the usage policy."
          : "NOMINATIM_USER_AGENT is required by the Nominatim usage policy.",
      requiredEnv: ["GEOCODER_PROVIDER=nominatim", "NOMINATIM_USER_AGENT"],
      attribution: "© OpenStreetMap contributors (ODbL)",
      docsUrl: "https://operations.osmfoundation.org/policies/nominatim/",
      rateLimit: "1 request/second, no bulk geocoding",
      timeoutMs: 8000,
      retries: 1,
    };
  }

  async geocode(address: string, city = "Halifax", province = "Nova Scotia"): Promise<ProviderResult<GeocodeResult>> {
    if (this.info().status !== "LIVE") return { ok: false, status: "NOT_CONFIGURED", providerId: "nominatim", message: "No geocoding provider is configured." };
    const e = env();
    try {
      await nominatimThrottle();
      const q = new URLSearchParams({ q: `${address}, ${city}, ${province}, Canada`, format: "jsonv2", limit: "1", countrycodes: "ca", addressdetails: "0" });
      const rows = await fetchJson<Array<{ display_name: string; lat: string; lon: string; addresstype?: string; type?: string }>>(`${e.NOMINATIM_BASE_URL}/search?${q}`, {
        timeoutMs: 8000,
        retries: 1,
        headers: { "User-Agent": e.NOMINATIM_USER_AGENT!, Accept: "application/json" },
      });
      const r = rows[0];
      return {
        ok: true,
        mode: "LIVE",
        providerId: "nominatim",
        retrievedAt: new Date(),
        data: r
          ? { matched: true, displayName: r.display_name, lat: Number(r.lat), lng: Number(r.lon), matchType: r.addresstype ?? r.type ?? null }
          : { matched: false, displayName: null, lat: null, lng: null, matchType: null },
      };
    } catch (err) {
      return { ok: false, status: "UNAVAILABLE", providerId: "nominatim", message: safeErrorMessage(err) };
    }
  }
}

export interface RouteEstimate {
  mode: "driving" | "walking" | "transit";
  status: "LIVE" | "UNAVAILABLE" | "NOT_CONFIGURED";
  minutes: number | null;
  km: number | null;
  message?: string;
}

export class OpenRouteService implements Provider {
  info(): ProviderInfo {
    const ok = env().ROUTING_PROVIDER === "openrouteservice" && Boolean(env().OPENROUTESERVICE_API_KEY);
    return {
      id: "openrouteservice",
      category: "routing",
      name: "openrouteservice",
      description: "Driving and walking travel-time estimates. Transit routing is not provided by this integration.",
      capabilities: ["driving", "walking"],
      status: ok ? "LIVE" : "NOT_CONFIGURED",
      statusMessage: ok ? "Configured. Transit times remain unavailable." : "Set ROUTING_PROVIDER=openrouteservice and OPENROUTESERVICE_API_KEY.",
      requiredEnv: ["ROUTING_PROVIDER=openrouteservice", "OPENROUTESERVICE_API_KEY"],
      attribution: "© openrouteservice.org by HeiGIT | Map data © OpenStreetMap contributors",
      docsUrl: "https://openrouteservice.org/dev/#/api-docs",
      timeoutMs: 10000,
      retries: 1,
    };
  }

  async route(from: { lat: number; lng: number }, to: { lat: number; lng: number }): Promise<RouteEstimate[]> {
    const transit: RouteEstimate = { mode: "transit", status: "UNAVAILABLE", minutes: null, km: null, message: "No transit data provider is integrated." };
    if (this.info().status !== "LIVE") {
      return [
        { mode: "driving", status: "NOT_CONFIGURED", minutes: null, km: null },
        { mode: "walking", status: "NOT_CONFIGURED", minutes: null, km: null },
        transit,
      ];
    }
    const profiles: Array<["driving" | "walking", string]> = [
      ["driving", "driving-car"],
      ["walking", "foot-walking"],
    ];
    const out: RouteEstimate[] = [];
    for (const [mode, profile] of profiles) {
      try {
        const data = await fetchJson<{ routes?: Array<{ summary?: { duration?: number; distance?: number } }> }>(
          `https://api.openrouteservice.org/v2/directions/${profile}`,
          {
            method: "POST",
            timeoutMs: 10000,
            retries: 1,
            headers: { Authorization: env().OPENROUTESERVICE_API_KEY!, "Content-Type": "application/json" },
            body: JSON.stringify({ coordinates: [[from.lng, from.lat], [to.lng, to.lat]] }),
          },
        );
        const s = data.routes?.[0]?.summary;
        out.push({ mode, status: "LIVE", minutes: s?.duration ? Math.round(s.duration / 60) : null, km: s?.distance ? Math.round(s.distance / 100) / 10 : null });
      } catch (err) {
        out.push({ mode, status: "UNAVAILABLE", minutes: null, km: null, message: safeErrorMessage(err) });
      }
    }
    return [...out, transit];
  }
}

export class MapTilesInfo implements Provider {
  info(): ProviderInfo {
    const e = env();
    const isOsm = e.MAP_TILE_URL.includes("tile.openstreetmap.org");
    return {
      id: "map_tiles",
      category: "maps",
      name: isOsm ? "OpenStreetMap standard tiles" : "Custom tile server",
      description: "Base map tiles rendered by Leaflet in the browser.",
      capabilities: ["tiles"],
      status: "LIVE",
      statusMessage: isOsm
        ? "Uses the OSM Foundation tile service — acceptable for light/demo use only under its tile usage policy. Configure a commercial tile provider for production traffic."
        : "Custom tile URL configured.",
      requiredEnv: ["MAP_TILE_URL", "MAP_TILE_ATTRIBUTION"],
      attribution: "© OpenStreetMap contributors",
      docsUrl: "https://operations.osmfoundation.org/policies/tiles/",
    };
  }
}
