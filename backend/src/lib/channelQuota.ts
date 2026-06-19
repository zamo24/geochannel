import type Redis from "ioredis";
import type { ChannelRecord } from "../types.js";

const RESERVE_CHANNEL_SCRIPT = `
redis.call("ZREMRANGEBYSCORE", KEYS[2], 0, ARGV[1])
redis.call("ZREMRANGEBYSCORE", KEYS[3], 0, ARGV[2])

local activeCount = redis.call("ZCARD", KEYS[2])
if tonumber(ARGV[3]) > 0 and activeCount >= tonumber(ARGV[3]) then
  return {"active", activeCount}
end

local hourlyCount = redis.call("ZCARD", KEYS[3])
if tonumber(ARGV[4]) > 0 and hourlyCount >= tonumber(ARGV[4]) then
  return {"hourly", hourlyCount}
end

redis.call("SET", KEYS[1], ARGV[8], "EX", ARGV[7])
redis.call("ZADD", KEYS[2], ARGV[5], ARGV[6])
redis.call("EXPIRE", KEYS[2], ARGV[9])
if tonumber(ARGV[4]) > 0 then
  redis.call("ZADD", KEYS[3], ARGV[1], ARGV[6])
  redis.call("EXPIRE", KEYS[3], ARGV[10])
end
return {"ok", 1}
`;

export type ChannelReservationResult =
  | { ok: true }
  | { ok: false; limit: "active" | "hourly"; current: number };

export async function reserveChannelWithQuota(
  redis: Pick<Redis, "eval">,
  record: ChannelRecord,
  options: {
    nowMs: number;
    maxActive: number;
    maxHourly: number;
    activeSetTtlSec: number;
    hourlySetTtlSec: number;
  }
): Promise<ChannelReservationResult> {
  const channelKey = `chan:${record.id}`;
  const activeKey = `tenant:${record.tenantId}:channels:active`;
  const hourlyKey = `tenant:${record.tenantId}:channels:hourly`;
  const expiresAtMs = options.nowMs + record.ttlSec * 1000;
  const result = (await redis.eval(
    RESERVE_CHANNEL_SCRIPT,
    3,
    channelKey,
    activeKey,
    hourlyKey,
    options.nowMs,
    options.nowMs - 60 * 60 * 1000,
    options.maxActive,
    options.maxHourly,
    expiresAtMs,
    record.id,
    record.ttlSec,
    JSON.stringify(record),
    options.activeSetTtlSec,
    options.hourlySetTtlSec
  )) as unknown;

  if (!Array.isArray(result) || typeof result[0] !== "string") {
    throw new Error("Channel quota reservation returned an invalid Redis response.");
  }
  if (result[0] === "ok") return { ok: true };
  if (result[0] === "active" || result[0] === "hourly") {
    return {
      ok: false,
      limit: result[0],
      current: Number(result[1] ?? 0)
    };
  }
  throw new Error(`Channel quota reservation returned unknown result "${result[0]}".`);
}
