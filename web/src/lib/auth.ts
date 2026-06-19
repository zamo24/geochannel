const TENANT_API_KEY = String(import.meta.env.VITE_TENANT_API_KEY ?? "").trim();
const TENANT_ID = String(import.meta.env.VITE_TENANT_ID ?? "").trim();
const INGEST_API_KEY = String(import.meta.env.VITE_INGEST_API_KEY ?? TENANT_API_KEY).trim();
const INGEST_TENANT_ID = String(import.meta.env.VITE_INGEST_TENANT_ID ?? TENANT_ID).trim();

function jsonHeaders(apiKey: string, tenantId: string) {
  const headers: Record<string, string> = {
    "content-type": "application/json"
  };

  if (apiKey) {
    headers["x-api-key"] = apiKey;
  } else if (tenantId) {
    headers["x-tenant-id"] = tenantId;
  }

  return headers;
}

export function jsonHeadersWithTenantAuth() {
  return jsonHeaders(TENANT_API_KEY, TENANT_ID);
}

export function jsonHeadersWithIngestAuth() {
  return jsonHeaders(INGEST_API_KEY, INGEST_TENANT_ID);
}

export function withConfiguredTenant<T extends Record<string, unknown>>(body: T): T & { tenantId?: string } {
  const next = { ...body } as T & { tenantId?: string };
  if (!next.tenantId && TENANT_ID) {
    next.tenantId = TENANT_ID;
  }
  return next;
}
