import { config } from "../config/env";

export interface Coords {
  lat: number;
  lon: number;
}

/**
 * Geocode a free-text address using TomTom Search API.
 * Returns null if geocoding fails or no API key is set.
 */
export async function geocodeAddress(address: string): Promise<Coords | null> {
  if (!config.tomtom.apiKey) {
    console.warn("[geocode] TOMTOM_API_KEY not set — skipping geocoding");
    return null;
  }

  const encoded = encodeURIComponent(address);
  const url = `${config.tomtom.baseUrl}/search/2/geocode/${encoded}.json?key=${config.tomtom.apiKey}`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`[geocode] TomTom returned ${res.status} for "${address}"`);
      return null;
    }
    const data = (await res.json()) as { results?: { position: { lat: number; lon: number } }[] };
    const first = data.results?.[0];
    if (!first) {
      console.warn(`[geocode] No results for "${address}"`);
      return null;
    }
    return { lat: first.position.lat, lon: first.position.lon };
  } catch (err) {
    console.error("[geocode] fetch error:", err);
    return null;
  }
}

/**
 * Haversine great-circle distance in kilometres.
 */
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
