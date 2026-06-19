import Redis from "ioredis";

export function createRedis(url: string) {
  const client = new Redis(url, {
    maxRetriesPerRequest: null
  });

  client.on("error", (err: unknown) => {
    // eslint-disable-next-line no-console
    console.error("[redis] error", err);
  });

  return client;
}
