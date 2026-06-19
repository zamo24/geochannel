import { timingSafeEqual } from "node:crypto";

function constantTimeEqual(supplied: string, expected: string) {
  const suppliedBuffer = Buffer.from(supplied);
  const expectedBuffer = Buffer.from(expected);
  return suppliedBuffer.length === expectedBuffer.length && timingSafeEqual(suppliedBuffer, expectedBuffer);
}

export function bearerTokenMatches(header: string | string[] | undefined, expectedToken: string) {
  const value = Array.isArray(header) ? header[0] : header;
  if (typeof value !== "string" || !value.startsWith("Bearer ")) return false;
  const supplied = value.slice("Bearer ".length).trim();
  return supplied.length > 0 && expectedToken.length > 0 && constantTimeEqual(supplied, expectedToken);
}
