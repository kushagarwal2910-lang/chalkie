import Redis from "ioredis";

declare global {
  var chalkieRedis: Redis | null | undefined;
}

export function getRedis(): Redis | null {
  if (globalThis.chalkieRedis !== undefined) return globalThis.chalkieRedis;
  const url = process.env.REDIS_URL;
  globalThis.chalkieRedis = url
    ? new Redis(url, { maxRetriesPerRequest: 2, enableReadyCheck: true, lazyConnect: true })
    : null;
  return globalThis.chalkieRedis;
}
