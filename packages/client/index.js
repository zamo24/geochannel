export class ChannelClientError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = "ChannelClientError";
    this.status = options.status;
    this.responseText = options.responseText;
    this.code = options.code;
  }
}

function isObject(value) {
  return typeof value === "object" && value !== null;
}

function errorCodeFromText(text) {
  try {
    const payload = JSON.parse(text);
    return isObject(payload?.error) && typeof payload.error.code === "string" ? payload.error.code : undefined;
  } catch {
    return undefined;
  }
}

async function postJson(apiUrl, path, body, headers, signal) {
  const res = await fetch(apiUrl(path), {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal
  });
  const text = await res.text();
  if (!res.ok) {
    throw new ChannelClientError(`${path} failed (${res.status}).`, {
      status: res.status,
      responseText: text,
      code: errorCodeFromText(text)
    });
  }
  try {
    return text.length > 0 ? JSON.parse(text) : null;
  } catch {
    throw new ChannelClientError(`${path} returned invalid JSON.`, {
      status: res.status,
      responseText: text
    });
  }
}

export async function createChannel(params) {
  const data = await postJson(params.apiUrl, "/channels", params.body, params.headers, params.signal);
  if (!isObject(data) || typeof data.channelId !== "string" || data.channelId.length === 0) {
    throw new ChannelClientError("Channel response invalid.");
  }
  return {
    channelId: data.channelId,
    tenantId: typeof data.tenantId === "string" ? data.tenantId : undefined
  };
}

export async function mintStreamToken(params) {
  const data = await postJson(params.apiUrl, "/token", params.body, params.headers, params.signal);
  if (!isObject(data) || typeof data.token !== "string" || data.token.length === 0) {
    throw new ChannelClientError("Token response invalid.");
  }
  return data.token;
}

function parseSseBlock(block) {
  let eventName = "message";
  const dataParts = [];
  for (const line of block.split("\n")) {
    if (!line || line.startsWith(":")) continue;
    if (line.startsWith("event:")) {
      eventName = line.slice("event:".length).trim() || "message";
    } else if (line.startsWith("data:")) {
      dataParts.push(line.slice("data:".length).trimStart());
    }
  }
  const payloadText = dataParts.join("\n");
  if (!payloadText) return { eventName, payload: undefined };
  try {
    return { eventName, payload: JSON.parse(payloadText) };
  } catch {
    return { eventName, payload: payloadText };
  }
}

function subscribeSSE(url, options) {
  const controller = new AbortController();
  let closed = false;

  const run = async () => {
    const res = await fetch(url, { headers: options.headers, signal: controller.signal });
    if (!res.ok) {
      const responseText = await res.text();
      throw new ChannelClientError(`SSE connect failed (${res.status}).`, {
        status: res.status,
        responseText,
        code: errorCodeFromText(responseText)
      });
    }
    if (!res.body) throw new ChannelClientError("SSE connection returned no response body.", { status: res.status });
    options.onOpen?.();

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (!closed) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true }).replaceAll("\r\n", "\n");
      let idx = buffer.indexOf("\n\n");
      while (idx >= 0) {
        const raw = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        idx = buffer.indexOf("\n\n");
        if (!raw) continue;
        const { eventName, payload } = parseSseBlock(raw);
        if (payload === undefined) continue;
        if (eventName === "ready") options.onReady?.(payload);
        else options.onMessage?.(payload);
      }
    }
    if (!closed) throw new Error("SSE connection closed.");
  };

  run().catch((err) => {
    if (closed || (err instanceof DOMException && err.name === "AbortError")) return;
    options.onError?.(err);
  });

  return {
    close() {
      if (closed) return;
      closed = true;
      controller.abort();
    }
  };
}

export function subscribeChannelStream(apiUrl, options) {
  const url = new URL(apiUrl("/stream"));
  url.searchParams.set("channelId", options.channelId);
  url.searchParams.set("offset", options.offset);
  if (options.cursorId) url.searchParams.set("cursorId", options.cursorId);
  return subscribeSSE(url.toString(), options);
}
