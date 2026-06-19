import { TENANT_ID_PATTERN } from "@geochannel/contracts";

const TENANT_ID_RE = new RegExp(TENANT_ID_PATTERN);
type HeaderValue = string | string[] | undefined;

export type TenantAuthResolution =
  | { ok: true; tenantId: string; authenticated: boolean }
  | { ok: false; statusCode: 400 | 401 | 403; code: string; message: string };

export function normalizeTenantId(input: unknown) {
  if (typeof input !== "string") return null;
  const tenantId = input.trim();
  if (!tenantId || !TENANT_ID_RE.test(tenantId)) return null;
  return tenantId;
}

export function parseIngestApiKeys(input: string) {
  const map = new Map<string, string>();
  const entries = input
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  for (const entry of entries) {
    const idx = entry.indexOf(":");
    if (idx <= 0 || idx === entry.length - 1) continue;
    const tenantId = normalizeTenantId(entry.slice(0, idx));
    const apiKey = entry.slice(idx + 1).trim();
    if (!tenantId || !apiKey) continue;
    map.set(apiKey, tenantId);
  }

  return map;
}

export const parseTenantApiKeys = parseIngestApiKeys;

function firstHeaderValue(value: HeaderValue) {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return value[0]?.trim() ?? "";
  return "";
}

export function resolveTenantAuth(
  headers: Record<string, HeaderValue>,
  options: {
    required: boolean;
    apiKeyIndex: Map<string, string>;
    suppliedTenantId?: unknown;
    defaultTenantId?: string;
    missingCode: string;
    invalidCode: string;
    invalidTenantCode: string;
    mismatchCode: string;
  }
): TenantAuthResolution {
  if (options.required) {
    const apiKey = firstHeaderValue(headers["x-api-key"]);
    if (!apiKey) {
      return {
        ok: false,
        statusCode: 401,
        code: options.missingCode,
        message: "x-api-key header is required."
      };
    }

    const tenantId = options.apiKeyIndex.get(apiKey);
    if (!tenantId) {
      return {
        ok: false,
        statusCode: 401,
        code: options.invalidCode,
        message: "Invalid tenant API key."
      };
    }

    if (options.suppliedTenantId !== undefined) {
      const suppliedTenantId = normalizeTenantId(options.suppliedTenantId);
      if (!suppliedTenantId) {
        return {
          ok: false,
          statusCode: 400,
          code: options.invalidTenantCode,
          message: `tenantId must match ${TENANT_ID_PATTERN}.`
        };
      }
      if (suppliedTenantId !== tenantId) {
        return {
          ok: false,
          statusCode: 403,
          code: options.mismatchCode,
          message: "tenantId does not match the authenticated tenant."
        };
      }
    }

    return { ok: true, tenantId, authenticated: true };
  }

  const tenantId =
    options.suppliedTenantId === undefined
      ? options.defaultTenantId ?? "public"
      : normalizeTenantId(options.suppliedTenantId);
  if (!tenantId) {
    return {
      ok: false,
      statusCode: 400,
      code: options.invalidTenantCode,
      message: `tenantId must match ${TENANT_ID_PATTERN}.`
    };
  }

  return { ok: true, tenantId, authenticated: false };
}
