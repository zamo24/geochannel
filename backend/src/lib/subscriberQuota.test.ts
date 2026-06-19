import assert from "node:assert/strict";
import test from "node:test";
import { acquireSubscriberLease } from "./subscriberQuota.js";

const input = {
  id: "connection-1",
  tenantId: "acme",
  channelId: "chan-1",
  nowMs: 1000,
  leaseSec: 60,
  maxTenant: 10,
  maxChannel: 5
};

test("acquireSubscriberLease returns a lease after admission", async () => {
  const result = await acquireSubscriberLease({ eval: async () => ["ok", 1] } as never, input);
  assert.deepEqual(result, {
    ok: true,
    lease: {
      id: "connection-1",
      tenantKey: "subscribers:tenant:acme",
      channelKey: "subscribers:channel:chan-1"
    }
  });
});

test("acquireSubscriberLease reports tenant and channel limits", async () => {
  const tenant = await acquireSubscriberLease({ eval: async () => ["tenant", 10] } as never, input);
  assert.deepEqual(tenant, { ok: false, limit: "tenant", current: 10 });
  const channel = await acquireSubscriberLease({ eval: async () => ["channel", 5] } as never, input);
  assert.deepEqual(channel, { ok: false, limit: "channel", current: 5 });
});
