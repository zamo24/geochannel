import { randomUUID } from "node:crypto";

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

export function normalizeRequestId(input: string | string[] | undefined) {
  const value = Array.isArray(input) ? input[0] : input;
  if (typeof value !== "string") return null;
  const requestId = value.trim();
  return REQUEST_ID_PATTERN.test(requestId) ? requestId : null;
}

export function resolveRequestId(input: string | string[] | undefined) {
  return normalizeRequestId(input) ?? randomUUID();
}
