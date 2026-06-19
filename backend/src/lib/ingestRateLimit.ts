import type Redis from "ioredis";

const INGEST_RATE_LIMIT_SCRIPT = `
local current = tonumber(redis.call("GET", KEYS[1]) or "0")
local requested = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
if current + requested > limit then
  return {0, current}
end
local next = redis.call("INCRBY", KEYS[1], requested)
redis.call("EXPIRE", KEYS[1], 2)
return {1, next}
`;

export async function checkIngestRateLimit(
  redis: Pick<Redis, "eval">,
  tenantId: string,
  requestedEvents: number,
  nowMs: number,
  limitPerSec: number
) {
  if (limitPerSec <= 0) return { allowed: true as const, current: 0 };
  const bucket = Math.floor(nowMs / 1000);
  const result = (await redis.eval(
    INGEST_RATE_LIMIT_SCRIPT,
    1,
    `rate:ingest:${tenantId}:${bucket}`,
    requestedEvents,
    limitPerSec
  )) as unknown;
  if (!Array.isArray(result) || result.length < 2) {
    throw new Error("Ingest rate limit returned an invalid Redis response.");
  }
  return {
    allowed: Number(result[0]) === 1,
    current: Number(result[1] ?? 0)
  };
}
