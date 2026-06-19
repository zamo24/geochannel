import { createHash } from "node:crypto";
import { IDEMPOTENCY_KEY_MAX_LENGTH, IDEMPOTENCY_KEY_PATTERN } from "@geochannel/contracts";

const IDEMPOTENCY_KEY_RE = new RegExp(IDEMPOTENCY_KEY_PATTERN);

export function normalizeIdempotencyKey(value: unknown) {
  if (typeof value !== "string") return null;
  const key = value.trim();
  if (key.length === 0) return null;
  return key;
}

export function isValidIdempotencyKey(key: string) {
  return key.length <= IDEMPOTENCY_KEY_MAX_LENGTH && IDEMPOTENCY_KEY_RE.test(key);
}

export function hashRequestBody(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
