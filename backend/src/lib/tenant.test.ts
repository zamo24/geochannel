import assert from "node:assert/strict";
import test from "node:test";
import { TENANT_ID_PATTERN } from "@geochannel/contracts";
import { normalizeTenantId, parseIngestApiKeys, resolveTenantAuth } from "./tenant.js";

test("normalizeTenantId accepts ids that match shared pattern", () => {
  const regex = new RegExp(TENANT_ID_PATTERN);
  const value = "acme-tenant_1";
  assert.equal(regex.test(value), true);
  assert.equal(normalizeTenantId(value), value);
});

test("normalizeTenantId rejects invalid ids", () => {
  assert.equal(normalizeTenantId("bad tenant"), null);
  assert.equal(normalizeTenantId(""), null);
  assert.equal(normalizeTenantId(123), null);
});

test("parseIngestApiKeys keeps only valid tenant:key entries", () => {
  const parsed = parseIngestApiKeys("acme:key-1,bad tenant:key-2,globex:key-3,broken");
  assert.equal(parsed.get("key-1"), "acme");
  assert.equal(parsed.get("key-3"), "globex");
  assert.equal(parsed.has("key-2"), false);
});

test("resolveTenantAuth derives tenant from api key when required", () => {
  const resolved = resolveTenantAuth(
    { "x-api-key": "key-1" },
    {
      required: true,
      apiKeyIndex: new Map([["key-1", "acme"]]),
      missingCode: "MISSING",
      invalidCode: "INVALID",
      invalidTenantCode: "BAD_TENANT",
      mismatchCode: "MISMATCH"
    }
  );

  assert.deepEqual(resolved, { ok: true, tenantId: "acme", authenticated: true });
});

test("resolveTenantAuth rejects missing or invalid required api keys", () => {
  const options = {
    required: true,
    apiKeyIndex: new Map([["key-1", "acme"]]),
    missingCode: "MISSING",
    invalidCode: "INVALID",
    invalidTenantCode: "BAD_TENANT",
    mismatchCode: "MISMATCH"
  };

  assert.deepEqual(resolveTenantAuth({}, options), {
    ok: false,
    statusCode: 401,
    code: "MISSING",
    message: "x-api-key header is required."
  });
  assert.deepEqual(resolveTenantAuth({ "x-api-key": "bad" }, options), {
    ok: false,
    statusCode: 401,
    code: "INVALID",
    message: "Invalid tenant API key."
  });
});

test("resolveTenantAuth rejects tenant body mismatch when auth is required", () => {
  const resolved = resolveTenantAuth(
    { "x-api-key": "key-1" },
    {
      required: true,
      apiKeyIndex: new Map([["key-1", "acme"]]),
      suppliedTenantId: "globex",
      missingCode: "MISSING",
      invalidCode: "INVALID",
      invalidTenantCode: "BAD_TENANT",
      mismatchCode: "MISMATCH"
    }
  );

  assert.equal(resolved.ok, false);
  if (!resolved.ok) {
    assert.equal(resolved.statusCode, 403);
    assert.equal(resolved.code, "MISMATCH");
  }
});

test("resolveTenantAuth keeps unauthenticated fallback behavior when not required", () => {
  assert.deepEqual(
    resolveTenantAuth(
      {},
      {
        required: false,
        apiKeyIndex: new Map(),
        missingCode: "MISSING",
        invalidCode: "INVALID",
        invalidTenantCode: "BAD_TENANT",
        mismatchCode: "MISMATCH"
      }
    ),
    { ok: true, tenantId: "public", authenticated: false }
  );
  assert.deepEqual(
    resolveTenantAuth(
      {},
      {
        required: false,
        apiKeyIndex: new Map(),
        suppliedTenantId: "acme",
        missingCode: "MISSING",
        invalidCode: "INVALID",
        invalidTenantCode: "BAD_TENANT",
        mismatchCode: "MISMATCH"
      }
    ),
    { ok: true, tenantId: "acme", authenticated: false }
  );
});
