import Redis from "ioredis";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

function createRedisClient(name) {
  const client = new Redis(REDIS_URL, {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: false,
  });

  client.on("connect", () => console.log(`[Redis:${name}] Connected`));
  client.on("error", (err) => console.error(`[Redis:${name}] Error`, err));
  client.on("close", () => console.warn(`[Redis:${name}] Connection closed`));

  return client;
}

// Separate clients required: subscriber cannot run regular commands while subscribed
export const publisher = createRedisClient("pub");
export const subscriber = createRedisClient("sub");

// Generic client for regular commands (SET, GET, etc.)
export const redis = createRedisClient("main");

export async function closeRedis() {
  await Promise.all([
    publisher.quit(),
    subscriber.quit(),
    redis.quit(),
  ]);
}
