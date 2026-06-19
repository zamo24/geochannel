import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { BrokerError, createChannelSession } from "./broker.mjs";

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

export function loadConfig() {
  return {
    port: Number.parseInt(process.env.PORT ?? "8090", 10),
    apiUrl: requiredEnv("GEOCHANNEL_API_URL"),
    tenantId: requiredEnv("GEOCHANNEL_TENANT_ID"),
    tenantApiKey: requiredEnv("GEOCHANNEL_TENANT_API_KEY"),
    brokerAccessToken: requiredEnv("BROKER_ACCESS_TOKEN")
  };
}

function tokenMatches(supplied, expected) {
  const suppliedBuffer = Buffer.from(supplied);
  const expectedBuffer = Buffer.from(expected);
  return suppliedBuffer.length === expectedBuffer.length && timingSafeEqual(suppliedBuffer, expectedBuffer);
}

function isAuthorized(request, expectedToken) {
  const authorization = request.headers.authorization ?? "";
  if (!authorization.startsWith("Bearer ")) return false;
  return tokenMatches(authorization.slice("Bearer ".length).trim(), expectedToken);
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  response.end(JSON.stringify(payload));
}

async function readJson(request, maxBytes = 128 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBytes) throw new BrokerError("Request body is too large.", 413, "PAYLOAD_TOO_LARGE");
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new BrokerError("Request body must be valid JSON.", 400, "INVALID_JSON");
  }
}

export function buildServer(config, fetchImpl = fetch) {
  return createServer(async (request, response) => {
    if (request.method === "GET" && request.url === "/health") {
      return sendJson(response, 200, { status: "ok", service: "geochannel-token-broker-example" });
    }

    if (request.method !== "POST" || request.url !== "/channel-session") {
      return sendJson(response, 404, { error: { code: "NOT_FOUND", message: "Route not found." } });
    }
    if (!isAuthorized(request, config.brokerAccessToken)) {
      return sendJson(response, 401, {
        error: { code: "BROKER_UNAUTHORIZED", message: "Valid broker authentication is required." }
      });
    }

    try {
      const input = await readJson(request);
      const session = await createChannelSession(config, input, fetchImpl);
      return sendJson(response, 200, session);
    } catch (error) {
      const brokerError = error instanceof BrokerError
        ? error
        : new BrokerError("Unexpected broker failure.", 500, "BROKER_ERROR");
      return sendJson(response, brokerError.statusCode, {
        error: {
          code: brokerError.code,
          message: brokerError.message,
          details: brokerError.details
        }
      });
    }
  });
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const config = loadConfig();
  buildServer(config).listen(config.port, "0.0.0.0", () => {
    console.log(`GeoChannel token broker example listening on port ${config.port}`);
  });
}
