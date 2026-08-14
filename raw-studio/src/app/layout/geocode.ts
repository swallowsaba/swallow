/**
 * Reverse geocoding for the GPS coordinates embedded in some RAW files. This
 * is the one feature in the app that calls an external service — Nominatim
 * (OpenStreetMap), free and keyless — so it's opt-in (a button the person
 * clicks), not automatic, keeping the "nothing leaves your device unless you
 * ask" default everywhere else in the app.
 */

export interface NominatimAddress {
  city?: string;
  town?: string;
  village?: string;
  state?: string;
  country?: string;
}
export interface NominatimResponse {
  display_name?: string;
  address?: NominatimAddress;
}

/** Build a short "City, Country"-style label from a Nominatim response. */
export function formatPlace(res: NominatimResponse): string {
  const addr = res.address;
  if (addr) {
    const locality = addr.city ?? addr.town ?? addr.village;
    const parts = [locality, addr.state, addr.country].filter(
      (p): p is string => typeof p === 'string' && p.length > 0,
    );
    if (parts.length > 0) return parts.join(', ');
  }
  return res.display_name ?? 'Unknown location';
}

/** Look up a human-readable place name for GPS coordinates via Nominatim. */
export async function lookupPlace(lat: number, lon: number): Promise<string> {
  const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${String(lat)}&lon=${String(lon)}&zoom=10`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Lookup failed (${String(res.status)}).`);
  const data = (await res.json()) as NominatimResponse;
  return formatPlace(data);
}

/** Google Maps link for a coordinate pair — no network call needed. */
export function mapsUrl(lat: number, lon: number): string {
  return `https://www.google.com/maps?q=${String(lat)},${String(lon)}`;
}
