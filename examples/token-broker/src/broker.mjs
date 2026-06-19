export class BrokerError extends Error {
  constructor(message, statusCode = 500, code = "BROKER_ERROR", details) {
    super(message);
    this.name = "BrokerError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

function normalizeBaseUrl(value) {
  const url = new URL(value);
  url.pathname = url.pathname.replace(/\/+$/, "");
  return url;
}

function upstreamUrl(baseUrl, path) {
  const url = normalizeBaseUrl(baseUrl);
  url.pathname = `${url.pathname}${path}`;
  return url;
}

async function parseJsonResponse(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    throw new BrokerError("GeoChannel returned invalid JSON.", 502, "UPSTREAM_INVALID_RESPONSE");
  }
}

async function postGeoChannel(config, path, body, fetchImpl) {
  let response;
  try {
    response = await fetchImpl(upstreamUrl(config.apiUrl, path), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": config.tenantApiKey
      },
      body: JSON.stringify(body)
    });
  } catch (error) {
    throw new BrokerError("GeoChannel could not be reached.", 502, "UPSTREAM_UNAVAILABLE", {
      cause: error instanceof Error ? error.message : String(error)
    });
  }

  const payload = await parseJsonResponse(response);
  if (!response.ok) {
    throw new BrokerError("GeoChannel rejected the request.", response.status, "UPSTREAM_REJECTED", {
      upstream: payload
    });
  }
  return payload;
}

function validateChannelInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new BrokerError("Request body must be an object.", 400, "INVALID_REQUEST");
  }
  const hasTiles = Array.isArray(input.tiles) && input.tiles.length > 0;
  const hasPolygon = Array.isArray(input.polygon) && input.polygon.length > 0;
  if (hasTiles === hasPolygon) {
    throw new BrokerError("Provide exactly one of tiles or polygon.", 400, "INVALID_CHANNEL_INPUT");
  }
  if (!Number.isInteger(input.res)) {
    throw new BrokerError("res must be an integer.", 400, "INVALID_CHANNEL_INPUT");
  }
}

export async function createChannelSession(config, input, fetchImpl = fetch) {
  validateChannelInput(input);
  const channel = await postGeoChannel(config, "/channels", {
    tiles: input.tiles,
    polygon: input.polygon,
    res: input.res,
    ttlSec: input.ttlSec,
    tenantId: config.tenantId
  }, fetchImpl);

  if (!channel || typeof channel.channelId !== "string") {
    throw new BrokerError("GeoChannel channel response was incomplete.", 502, "UPSTREAM_INVALID_RESPONSE");
  }

  const token = await postGeoChannel(config, "/token", {
    channelId: channel.channelId,
    tenantId: config.tenantId,
    ttlSec: input.tokenTtlSec
  }, fetchImpl);

  if (!token || typeof token.token !== "string") {
    throw new BrokerError("GeoChannel token response was incomplete.", 502, "UPSTREAM_INVALID_RESPONSE");
  }

  return {
    channelId: channel.channelId,
    tenantId: channel.tenantId ?? config.tenantId,
    tilesCount: channel.tilesCount,
    res: channel.res,
    token: token.token,
    tokenType: token.tokenType ?? "Bearer",
    expiresAt: token.expiresAt,
    ttlSec: token.ttlSec
  };
}
