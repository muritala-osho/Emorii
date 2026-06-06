import * as Location from "expo-location";

type GeocodeResult = { city?: string; country?: string; address?: string };

const cache = new Map<string, GeocodeResult>();

export async function reverseGeocode(
  lat: number,
  lng: number,
  opts: { timeoutMs?: number } = {}
): Promise<GeocodeResult> {
  const key = `${lat.toFixed(2)},${lng.toFixed(2)}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const timeoutMs = opts.timeoutMs ?? 4000;
  try {
    const result = await Promise.race<GeocodeResult>([
      (async () => {
        const [place] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
        return {
          city: place?.city || place?.district || place?.subregion || undefined,
          country: place?.country || undefined,
          address: [place?.street, place?.city, place?.country].filter(Boolean).join(", ") || undefined,
        };
      })(),
      new Promise<GeocodeResult>((_, reject) => setTimeout(() => reject(new Error("geocode_timeout")), timeoutMs)),
    ]);
    cache.set(key, result);
    return result;
  } catch {
    return {};
  }
}
