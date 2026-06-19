import type { FastifyInstance } from "fastify";
import type Redis from "ioredis";
import { env } from "../config.js";
import { errorResponseSchema, sendApiError } from "../http/errors.js";
import { buildStreamToken, coerceStreamTokenTtl, resolveTenantAuth } from "../lib/core.js";
import { checkTokenMintRateLimit } from "../lib/tokenMintRateLimit.js";
import type { ChannelRecord } from "../types.js";

export function registerTokenRoutes(app: FastifyInstance, redis: Redis, tenantApiKeyIndex: Map<string, string>) {
  app.post(
    "/token",
    {
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: ["channelId"],
          properties: {
            channelId: { type: "string", minLength: 1 },
            tenantId: { type: "string", minLength: 1 },
            ttlSec: { type: "integer", minimum: 1 }
          }
        },
        response: {
          200: {
            type: "object",
            required: ["token", "tokenType", "ttlSec", "expiresAt"],
            properties: {
              token: { type: "string" },
              tokenType: { type: "string" },
              ttlSec: { type: "integer", minimum: 1 },
              expiresAt: { type: "string", format: "date-time" },
              channelId: { type: "string" },
              tenantId: { type: "string" }
            }
          },
          400: errorResponseSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
          404: errorResponseSchema,
          429: errorResponseSchema
        }
      }
    },
    async (request, reply) => {
      const body = request.body as { channelId: string; tenantId?: string; ttlSec?: number };
      const channelId = body.channelId.trim();
      if (!channelId) {
        return sendApiError(reply, 400, "TOKEN_CHANNEL_REQUIRED", "channelId is required.");
      }

      const requestedTenantIdRaw = typeof body.tenantId === "string" ? body.tenantId : undefined;
      let authenticatedTenantId: string | null = null;
      if (env.TOKEN_AUTH_REQUIRED) {
        const tenantAuth = resolveTenantAuth(request.headers, {
          required: true,
          apiKeyIndex: tenantApiKeyIndex,
          suppliedTenantId: requestedTenantIdRaw,
          missingCode: "TOKEN_API_KEY_MISSING",
          invalidCode: "TOKEN_API_KEY_INVALID",
          invalidTenantCode: "TOKEN_TENANT_INVALID",
          mismatchCode: "TOKEN_TENANT_MISMATCH"
        });
        if (!tenantAuth.ok) {
          return sendApiError(reply, tenantAuth.statusCode, tenantAuth.code, tenantAuth.message);
        }
        authenticatedTenantId = tenantAuth.tenantId;
      }

      const raw = await redis.get(`chan:${channelId}`);
      if (!raw) {
        return sendApiError(reply, 404, "TOKEN_CHANNEL_NOT_FOUND", "Channel not found.");
      }

      let record: ChannelRecord;
      try {
        record = JSON.parse(raw) as ChannelRecord;
      } catch {
        request.log.error({ channelId }, "invalid channel record");
        return sendApiError(reply, 500, "CHANNEL_RECORD_INVALID", "Channel record could not be read.");
      }

      const tenantAuth =
        authenticatedTenantId === null
          ? resolveTenantAuth(request.headers, {
              required: false,
              apiKeyIndex: tenantApiKeyIndex,
              suppliedTenantId: requestedTenantIdRaw,
              defaultTenantId: record.tenantId,
              missingCode: "TOKEN_API_KEY_MISSING",
              invalidCode: "TOKEN_API_KEY_INVALID",
              invalidTenantCode: "TOKEN_TENANT_INVALID",
              mismatchCode: "TOKEN_TENANT_MISMATCH"
            })
          : { ok: true as const, tenantId: authenticatedTenantId, authenticated: true };
      if (!tenantAuth.ok) {
        return sendApiError(reply, tenantAuth.statusCode, tenantAuth.code, tenantAuth.message);
      }
      if (tenantAuth.tenantId !== record.tenantId) {
        return sendApiError(reply, 403, "TOKEN_TENANT_MISMATCH", "Requested tenant does not match channel tenant.");
      }

      const rateLimit = await checkTokenMintRateLimit(
        redis,
        record.tenantId,
        Date.now(),
        env.TOKEN_MINT_RATE_LIMIT_PER_MIN
      );
      if (!rateLimit.allowed) {
        return sendApiError(reply, 429, "TOKEN_RATE_LIMIT_EXCEEDED", "Tenant token mint rate limit exceeded.", {
          maxTokensPerMin: env.TOKEN_MINT_RATE_LIMIT_PER_MIN,
          mintedThisMinute: rateLimit.current
        });
      }

      const ttlSec = coerceStreamTokenTtl(body.ttlSec, env.STREAM_TOKEN_TTL_SEC);
      const exp = Math.floor(Date.now() / 1000) + ttlSec;
      const token = buildStreamToken({
        tenantId: record.tenantId,
        channelId: record.id,
        exp
      });

      request.log.info(
        {
          auditEvent: "token.mint",
          requestId: request.id,
          tenantId: record.tenantId,
          channelId: record.id,
          ttlSec,
          expiresAt: new Date(exp * 1000).toISOString(),
          authenticated: tenantAuth.authenticated
        },
        "audit token mint"
      );

      return {
        token,
        tokenType: "Bearer",
        ttlSec,
        expiresAt: new Date(exp * 1000).toISOString(),
        channelId: record.id,
        tenantId: record.tenantId
      };
    }
  );
}
