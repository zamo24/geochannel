import type Redis from "ioredis";
import { randomUUID } from "node:crypto";
import { env } from "../config.js";

const ACQUIRE_SCRIPT = `
redis.call("ZREMRANGEBYSCORE", KEYS[1], 0, ARGV[1])
redis.call("ZREMRANGEBYSCORE", KEYS[2], 0, ARGV[1])
local tenantCount = redis.call("ZCARD", KEYS[1])
if tonumber(ARGV[3]) > 0 and tenantCount >= tonumber(ARGV[3]) then
  return {"tenant", tenantCount}
end
local channelCount = redis.call("ZCARD", KEYS[2])
if tonumber(ARGV[4]) > 0 and channelCount >= tonumber(ARGV[4]) then
  return {"channel", channelCount}
end
redis.call("ZADD", KEYS[1], ARGV[2], ARGV[5])
redis.call("ZADD", KEYS[2], ARGV[2], ARGV[5])
redis.call("EXPIRE", KEYS[1], ARGV[6])
redis.call("EXPIRE", KEYS[2], ARGV[6])
return {"ok", 1}
`;

export type SubscriberLease = {
  id: string;
  tenantKey: string;
  channelKey: string;
};

export async function acquireSubscriberLease(
  redis: Pick<Redis, "eval">,
  input: {
    id: string;
    tenantId: string;
    channelId: string;
    nowMs: number;
    leaseSec: number;
    maxTenant: number;
    maxChannel: number;
  }
) {
  const tenantKey = `subscribers:tenant:${input.tenantId}`;
  const channelKey = `subscribers:channel:${input.channelId}`;
  const expiresAt = input.nowMs + input.leaseSec * 1000;
  const result = (await redis.eval(
    ACQUIRE_SCRIPT,
    2,
    tenantKey,
    channelKey,
    input.nowMs,
    expiresAt,
    input.maxTenant,
    input.maxChannel,
    input.id,
    Math.max(input.leaseSec * 2, 1)
  )) as unknown;
  if (!Array.isArray(result) || typeof result[0] !== "string") {
    throw new Error("Subscriber quota returned an invalid Redis response.");
  }
  if (result[0] === "ok") {
    return { ok: true as const, lease: { id: input.id, tenantKey, channelKey } };
  }
  if (result[0] === "tenant" || result[0] === "channel") {
    return { ok: false as const, limit: result[0], current: Number(result[1] ?? 0) };
  }
  throw new Error(`Subscriber quota returned unknown result "${result[0]}".`);
}

export function acquireConfiguredSubscriberLease(redis: Pick<Redis, "eval">, tenantId: string, channelId: string) {
  return acquireSubscriberLease(redis, {
    id: randomUUID(),
    tenantId,
    channelId,
    nowMs: Date.now(),
    leaseSec: env.STREAM_SUBSCRIBER_LEASE_SEC,
    maxTenant: env.MAX_STREAM_SUBSCRIBERS_PER_TENANT,
    maxChannel: env.MAX_STREAM_SUBSCRIBERS_PER_CHANNEL
  });
}

export async function refreshSubscriberLease(
  redis: Pick<Redis, "zadd" | "expire">,
  lease: SubscriberLease,
  expiresAtMs: number,
  setTtlSec: number
) {
  await Promise.all([
    redis.zadd(lease.tenantKey, expiresAtMs, lease.id),
    redis.zadd(lease.channelKey, expiresAtMs, lease.id),
    redis.expire(lease.tenantKey, setTtlSec),
    redis.expire(lease.channelKey, setTtlSec)
  ]);
}

export async function releaseSubscriberLease(redis: Pick<Redis, "zrem">, lease: SubscriberLease) {
  await Promise.all([
    redis.zrem(lease.tenantKey, lease.id),
    redis.zrem(lease.channelKey, lease.id)
  ]);
}
