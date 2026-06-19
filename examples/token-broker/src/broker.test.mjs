import assert from "node:assert/strict";
import test from "node:test";
import { createChannelSession } from "./broker.mjs";
import { buildServer } from "./server.mjs";

const config = {
  apiUrl: "https://api.example.test",
  tenantId: "pilot",
  tenantApiKey: "tenant-secret",
  brokerAccessToken: "broker-secret"
};

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

test("createChannelSession keeps the tenant key upstream and returns browser-safe credentials", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), init });
    if (String(url).endsWith("/channels")) {
      return new Response(JSON.stringify({
        channelId: "channel-1",
        tenantId: "pilot",
        tilesCount: 2,
        res: 8
      }), { status: 200 });
    }
    return new Response(JSON.stringify({
      token: "stream-token",
      tokenType: "Bearer",
      ttlSec: 300,
      expiresAt: "2026-06-12T12:00:00.000Z"
    }), { status: 200 });
  };

  const result = await createChannelSession(config, {
    tiles: ["tile-a", "tile-b"],
    res: 8
  }, fetchImpl);

  assert.equal(result.channelId, "channel-1");
  assert.equal(result.token, "stream-token");
  assert.equal(JSON.stringify(result).includes(config.tenantApiKey), false);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].init.headers["x-api-key"], config.tenantApiKey);
  assert.equal(calls[1].init.headers["x-api-key"], config.tenantApiKey);
});

test("reference server requires broker authentication and returns a channel session", async (t) => {
  const fetchImpl = async (url) => {
    if (String(url).endsWith("/channels")) {
      return new Response(JSON.stringify({ channelId: "channel-1", tenantId: "pilot", tilesCount: 1, res: 8 }), {
        status: 200
      });
    }
    return new Response(JSON.stringify({ token: "stream-token", tokenType: "Bearer", ttlSec: 300 }), {
      status: 200
    });
  };
  const server = buildServer(config, fetchImpl);
  t.after(() => server.close());
  const baseUrl = await listen(server);

  const unauthorized = await fetch(`${baseUrl}/channel-session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ tiles: ["tile-a"], res: 8 })
  });
  assert.equal(unauthorized.status, 401);

  const authorized = await fetch(`${baseUrl}/channel-session`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.brokerAccessToken}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({ tiles: ["tile-a"], res: 8 })
  });
  assert.equal(authorized.status, 200);
  assert.deepEqual(await authorized.json(), {
    channelId: "channel-1",
    tenantId: "pilot",
    tilesCount: 1,
    res: 8,
    token: "stream-token",
    tokenType: "Bearer",
    ttlSec: 300
  });
});
