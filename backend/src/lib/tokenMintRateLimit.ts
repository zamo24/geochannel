import type Redis from "ioredis";

const TOKEN_MINT_RATE_LIMIT_SCRIPT = `
local current = tonumber(redis.call("GET", KEYS[1]) or "0")
local limit = tonumber(ARGV[1])
if current >= limit then
  return {0, current}
end
local next = redis.call("INCR", KEYS[1])
redis.call("EXPIRE", KEYS[1], 120)
return {1, next}
`;

export async function checkTokenMintRateLimit(
  redis: Pick<Redis, "eval">,
  tenantId: string,
  nowMs: number,
  limitPerMin: number
) {
  if (limitPerMin <= 0) return { allowed: true as const, current: 0 };
  const bucket = Math.floor(nowMs / 60000);
  const result = (await redis.eval(
    TOKEN_MINT_RATE_LIMIT_SCRIPT,
    1,
    `rate:token:${tenantId}:${bucket}`,
    limitPerMin
  )) as unknown;
  if (!Array.isArray(result) || result.length < 2) {
    throw new Error("Token mint rate limit returned an invalid Redis response.");
  }
  return {
    allowed: Number(result[0]) === 1,
    current: Number(result[1] ?? 0)
  };
}
