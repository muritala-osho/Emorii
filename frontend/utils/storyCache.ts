import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY_PREFIX = "story_cache_v1:";
const TTL_MS = 5 * 60 * 1000;

type CachedEntry<T> = { data: T; ts: number };

export async function getCachedStories<T = any>(userId: string): Promise<T | null> {
  if (!userId) return null;
  try {
    const raw = await AsyncStorage.getItem(`${KEY_PREFIX}${userId}`);
    if (!raw) return null;
    const parsed: CachedEntry<T> = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    if (Date.now() - parsed.ts > TTL_MS) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

export async function setCachedStories<T = any>(userId: string, data: T): Promise<void> {
  if (!userId) return;
  try {
    const entry: CachedEntry<T> = { data, ts: Date.now() };
    await AsyncStorage.setItem(`${KEY_PREFIX}${userId}`, JSON.stringify(entry));
  } catch {
    // ignore
  }
}
