import assert from "node:assert/strict";
import test from "node:test";
import { reserveChannelWithQuota } from "./channelQuota.js";
import type { ChannelRecord } from "../types.js";

const record: ChannelRecord = {
  id: "chan-1",
  tiles: ["872a1072cffffff"],
  res: 7,
  createdAt: "2026-06-06T00:00:00.000Z",
  ttlSec: 300,
  tenantId: "acme"
};

test("reserveChannelWithQuota returns active and hourly limit results", async () => {
  const active = await reserveChannelWithQuota(
    { eval: async () => ["active", 5] } as never,
    record,
    { nowMs: 1000, maxActive: 5, maxHourly: 10, activeSetTtlSec: 3600, hourlySetTtlSec: 7200 }
  );
  assert.deepEqual(active, { ok: false, limit: "active", current: 5 });

  const hourly = await reserveChannelWithQuota(
    { eval: async () => ["hourly", 10] } as never,
    record,
    { nowMs: 1000, maxActive: 5, maxHourly: 10, activeSetTtlSec: 3600, hourlySetTtlSec: 7200 }
  );
  assert.deepEqual(hourly, { ok: false, limit: "hourly", current: 10 });
});

test("reserveChannelWithQuota sends channel and tenant keys in one atomic script", async () => {
  let args: unknown[] = [];
  const result = await reserveChannelWithQuota(
    {
      eval: async (...input: unknown[]) => {
        args = input;
        return ["ok", 1];
      }
    } as never,
    record,
    { nowMs: 1000, maxActive: 5, maxHourly: 10, activeSetTtlSec: 3600, hourlySetTtlSec: 7200 }
  );

  assert.deepEqual(result, { ok: true });
  assert.equal(args[1], 3);
  assert.deepEqual(args.slice(2, 5), [
    "chan:chan-1",
    "tenant:acme:channels:active",
    "tenant:acme:channels:hourly"
  ]);
});
