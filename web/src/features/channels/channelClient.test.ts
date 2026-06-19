import assert from "node:assert/strict";
import test from "node:test";
import { ChannelClientError, createChannel, mintStreamToken, subscribeChannelStream } from "@geochannel/client";

const apiUrl = (path: string) => new URL(path, "https://api.example.test").toString();
const originalFetch = globalThis.fetch;

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("createChannel posts channel body and returns channel metadata", async () => {
  let requestUrl = "";
  let requestBody = "";
  let requestHeaders: HeadersInit | undefined;
  globalThis.fetch = (async (input, init) => {
    requestUrl = String(input);
    requestBody = String(init?.body ?? "");
    requestHeaders = init?.headers;
    return new Response(JSON.stringify({ channelId: "chan-1", tenantId: "acme" }));
  }) as typeof fetch;

  const result = await createChannel({
    apiUrl,
    body: { tiles: ["892a100d2d7ffff"], res: 8, tenantId: "acme" },
    headers: { "content-type": "application/json", "x-api-key": "tenant-key" },
    signal: new AbortController().signal
  });

  assert.deepEqual(result, { channelId: "chan-1", tenantId: "acme" });
  assert.equal(requestUrl, "https://api.example.test/channels");
  assert.deepEqual(JSON.parse(requestBody), { tiles: ["892a100d2d7ffff"], res: 8, tenantId: "acme" });
  assert.deepEqual(requestHeaders, { "content-type": "application/json", "x-api-key": "tenant-key" });
});

test("mintStreamToken returns token string", async () => {
  globalThis.fetch = (async () => new Response(JSON.stringify({ token: "stream-token" }))) as typeof fetch;

  const token = await mintStreamToken({
    apiUrl,
    body: { channelId: "chan-1", tenantId: "acme" },
    headers: { "content-type": "application/json", "x-api-key": "tenant-key" },
    signal: new AbortController().signal
  });

  assert.equal(token, "stream-token");
});

test("createChannel surfaces HTTP status and response text", async () => {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ error: { code: "CHANNEL_API_KEY_INVALID", message: "nope" } }), {
      status: 401
    })) as typeof fetch;

  await assert.rejects(
    createChannel({
      apiUrl,
      body: { tiles: ["892a100d2d7ffff"], res: 8 },
      headers: { "content-type": "application/json" },
      signal: new AbortController().signal
    }),
    (err) => {
      assert.equal(err instanceof ChannelClientError, true);
      assert.equal((err as ChannelClientError).status, 401);
      assert.equal((err as ChannelClientError).code, "CHANNEL_API_KEY_INVALID");
      return true;
    }
  );
});

test("subscribeChannelStream sends resumable cursor id", async () => {
  let requestedUrl = "";
  globalThis.fetch = (async (input) => {
    requestedUrl = String(input);
    return new Response("");
  }) as typeof fetch;

  await new Promise<void>((resolve) => {
    subscribeChannelStream(apiUrl, {
      channelId: "chan-1",
      offset: "0-0",
      cursorId: "browser-1",
      onError: () => resolve()
    });
  });

  const url = new URL(requestedUrl);
  assert.equal(url.searchParams.get("cursorId"), "browser-1");
});

test("subscribeChannelStream surfaces structured stream errors", async () => {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ error: { code: "STREAM_TENANT_SUBSCRIBER_LIMIT_EXCEEDED" } }), {
      status: 429
    })) as typeof fetch;

  const error = await new Promise<unknown>((resolve) => {
    subscribeChannelStream(apiUrl, {
      channelId: "chan-1",
      offset: "0-0",
      onError: resolve
    });
  });

  assert.equal(error instanceof ChannelClientError, true);
  assert.equal((error as ChannelClientError).status, 429);
  assert.equal((error as ChannelClientError).code, "STREAM_TENANT_SUBSCRIBER_LIMIT_EXCEEDED");
});
