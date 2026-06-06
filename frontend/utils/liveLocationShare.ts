import * as Location from "expo-location";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApiBaseUrl } from "@/constants/config";
import logger from "@/utils/logger";
import { tokenManager } from "@/utils/tokenManager";

type ActiveShare = {
  messageId: string;
  matchId: string;
  expiresAt: number;
  intervalId: any;
};

const active = new Map<string, ActiveShare>();

const TICK_INTERVAL_MS = 15_000;

async function patchOnce(messageId: string): Promise<boolean> {
  try {
    const token = await tokenManager.getAccessToken();
    if (!token) return false;
    const loc = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    const res = await fetch(
      `${getApiBaseUrl()}/api/chat/messages/${messageId}/live-location`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        }),
      }
    );
    return res.ok;
  } catch (err) {
    logger.warn("[liveLocationShare] tick failed:", err);
    return false;
  }
}

export function startLiveLocationShare(
  messageId: string,
  matchId: string,
  durationMin: number
) {
  if (active.has(messageId)) return;
  const expiresAt = Date.now() + durationMin * 60 * 1000;

  const tick = async () => {
    if (Date.now() >= expiresAt) {
      stopLiveLocationShare(messageId);
      return;
    }
    await patchOnce(messageId);
  };

  // First update almost immediately so the recipient sees movement quickly
  setTimeout(tick, 2000);
  const intervalId = setInterval(tick, TICK_INTERVAL_MS);

  active.set(messageId, { messageId, matchId, expiresAt, intervalId });
}

export function stopLiveLocationShare(messageId: string) {
  const entry = active.get(messageId);
  if (!entry) return;
  clearInterval(entry.intervalId);
  active.delete(messageId);

  // Tell the server to mark expired (best-effort, fire-and-forget)
  tokenManager.getAccessToken().then((token) => {
    if (!token) return;
    fetch(
      `${getApiBaseUrl()}/api/chat/messages/${messageId}/stop-live-location`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      }
    ).catch(() => {});
  });
}

export function isSharingLive(messageId: string): boolean {
  return active.has(messageId);
}

export function stopAllLiveShares() {
  for (const id of Array.from(active.keys())) {
    stopLiveLocationShare(id);
  }
}
