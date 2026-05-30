import { config } from "../config/env";

export async function geocode(address: string): Promise<{ lat: number; lon: number }> {
  const url = `${config.tomtom.baseUrl}/search/2/search/${encodeURIComponent(address)}.json?key=${config.tomtom.apiKey}&countrySet=CA&limit=1&typeahead=false`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`TomTom geocoding failed (${res.status}): ${address}`);

  const data = await res.json() as any;
  const result = data.results?.[0];
  //we need to send a message back to users if this edgecase hits to reconfirm their address
  if (!result) throw new Error(`No location found for: "${address}"`);

  return { lat: result.position.lat, lon: result.position.lon };
}

export async function getRoute(
  origin: { lat: number; lon: number },
  destination: { lat: number; lon: number }
) {
  const url =
    `${config.tomtom.baseUrl}/routing/1/calculateRoute/` +
    `${origin.lat},${origin.lon}:${destination.lat},${destination.lon}/json` +
    `?key=${config.tomtom.apiKey}&travelMode=car`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`TomTom routing failed (${res.status})`);

  const data = await res.json() as any;
  const summary = data.routes?.[0]?.summary;
  if (!summary) throw new Error("No route found between the two locations");

  return {
    distanceKm: summary.lengthInMeters / 1000,
    durationMin: Math.ceil(summary.travelTimeInSeconds / 60),
  };
}