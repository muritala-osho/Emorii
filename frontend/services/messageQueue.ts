import AsyncStorage from "@react-native-async-storage/async-storage";

export interface QueuedMessage {
  localId: string;
  matchId: string;
  content: string;
  type: string;
  replyTo?: any;
  extraData?: Record<string, any>;
  retryCount: number;
  createdAt: string;
}

const QUEUE_KEY = "chat:queue:v1";
export const MAX_RETRIES = 3;

async function readQueue(): Promise<QueuedMessage[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function writeQueue(queue: QueuedMessage[]): Promise<void> {
  try {
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch {}
}

export async function enqueue(
  msg: Omit<QueuedMessage, "retryCount">,
): Promise<void> {
  const queue = await readQueue();
  if (queue.find((q) => q.localId === msg.localId)) return;
  queue.push({ ...msg, retryCount: 0 });
  await writeQueue(queue);
}

export async function dequeue(localId: string): Promise<void> {
  const queue = await readQueue();
  await writeQueue(queue.filter((q) => q.localId !== localId));
}

export async function getPendingQueue(): Promise<QueuedMessage[]> {
  return readQueue();
}

export async function getQueueForMatch(
  matchId: string,
): Promise<QueuedMessage[]> {
  const all = await readQueue();
  return all.filter((q) => q.matchId === matchId);
}

export async function incrementRetry(localId: string): Promise<number> {
  const queue = await readQueue();
  const msg = queue.find((q) => q.localId === localId);
  if (!msg) return MAX_RETRIES;
  msg.retryCount += 1;
  await writeQueue(queue);
  return msg.retryCount;
}

export async function clearQueueForMatch(matchId: string): Promise<void> {
  const queue = await readQueue();
  await writeQueue(queue.filter((q) => q.matchId !== matchId));
}
