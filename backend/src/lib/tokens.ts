import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../config.js";
import type { StreamTokenPayload } from "../types.js";
import { clampNumber, coerceInt } from "./scalars.js";

export function coerceStreamTokenTtl(input: unknown, fallback: number) {
  const value = coerceInt(input, fallback);
  return clampNumber(value, env.STREAM_TOKEN_TTL_MIN_SEC, env.STREAM_TOKEN_TTL_MAX_SEC);
}

function signPayloadPart(payloadPart: string, secret: string) {
  return createHmac("sha256", secret).update(payloadPart).digest("base64url");
}

function streamTokenSecrets() {
  const previous = env.STREAM_TOKEN_PREVIOUS_SECRETS.split(",")
    .map((secret) => secret.trim())
    .filter((secret) => secret.length > 0);
  return [env.STREAM_TOKEN_SECRET.trim(), ...previous].filter((secret) => secret.length > 0);
}

export function buildStreamTokenWithSecret(payload: StreamTokenPayload, secret: string) {
  const payloadPart = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sigPart = signPayloadPart(payloadPart, secret);
  return `${payloadPart}.${sigPart}`;
}

export function buildStreamToken(payload: StreamTokenPayload) {
  return buildStreamTokenWithSecret(payload, env.STREAM_TOKEN_SECRET.trim());
}

export function verifyStreamTokenWithSecrets(token: string, secrets: string[]) {
  const parts = token.split(".");
  if (parts.length !== 2) {
    return { ok: false as const, code: "STREAM_TOKEN_INVALID", message: "Malformed stream token." };
  }

  const [payloadPart, sigPart] = parts;
  const provided = Buffer.from(sigPart);
  const validSignature = secrets
    .map((secret) => secret.trim())
    .filter((secret) => secret.length > 0)
    .some((secret) => {
      const expected = Buffer.from(signPayloadPart(payloadPart, secret));
      return provided.length === expected.length && timingSafeEqual(provided, expected);
    });
  if (!validSignature) {
    return { ok: false as const, code: "STREAM_TOKEN_INVALID", message: "Invalid stream token signature." };
  }

  let payload: StreamTokenPayload;
  try {
    payload = JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf8")) as StreamTokenPayload;
  } catch {
    return { ok: false as const, code: "STREAM_TOKEN_INVALID", message: "Invalid stream token payload." };
  }

  if (
    !payload ||
    typeof payload !== "object" ||
    typeof payload.tenantId !== "string" ||
    payload.tenantId.length === 0 ||
    typeof payload.channelId !== "string" ||
    payload.channelId.length === 0 ||
    !Number.isInteger(payload.exp)
  ) {
    return { ok: false as const, code: "STREAM_TOKEN_INVALID", message: "Invalid stream token claims." };
  }

  const nowSec = Math.floor(Date.now() / 1000);
  if (payload.exp <= nowSec) {
    return { ok: false as const, code: "STREAM_TOKEN_EXPIRED", message: "Stream token expired." };
  }

  return { ok: true as const, payload };
}

export function verifyStreamToken(token: string) {
  return verifyStreamTokenWithSecrets(token, streamTokenSecrets());
}
