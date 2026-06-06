import AsyncStorage from "@react-native-async-storage/async-storage";
import { Message } from "@/types/chat";

const MAX_CACHED = 100;

function cacheKey(matchId: string): string {
  return `chat:messages:${matchId}`;
}

export async function loadCachedMessages(matchId: string): Promise<Message[]> {
  try {
    const raw = await AsyncStorage.getItem(cacheKey(matchId));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function saveCachedMessages(
  matchId: string,
  messages: Message[],
): Promise<void> {
  try {
    const toCache = messages
      .filter((m) => m.status !== "sending")
      .slice(-MAX_CACHED);
    await AsyncStorage.setItem(cacheKey(matchId), JSON.stringify(toCache));
  } catch {}
}

export function mergeMessages(
  cached: Message[],
  fetched: Message[],
): Message[] {
  const map = new Map<string, Message>();

  for (const m of cached) {
    map.set(m._id, m);
  }

  for (const server of fetched) {
    const localId = (server as any).localId as string | undefined;

    if (localId) {
      const localMatch = [...map.values()].find(
        (c) => (c as any).localId === localId,
      );
      if (localMatch) {
        map.delete(localMatch._id);
        map.set(server._id, { ...server, status: "sent" } as Message);
        continue;
      }
    }

    if (map.has(server._id)) {
      const existing = map.get(server._id)!;
      const existingStatus = (existing as any).status;
      const isPendingLocal =
        existingStatus === "pending" || existingStatus === "failed";
      map.set(server._id, isPendingLocal ? existing : { ...existing, ...server });
    } else {
      map.set(server._id, server);
    }
  }

  return Array.from(map.values()).sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
}

export async function clearCachedMessages(matchId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(cacheKey(matchId));
  } catch {}
}
