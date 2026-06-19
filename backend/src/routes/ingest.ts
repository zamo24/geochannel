import type { FastifyInstance } from "fastify";
import * as h3 from "h3-js";
import type Redis from "ioredis";
import { IDEMPOTENCY_KEY_MAX_LENGTH, IDEMPOTENCY_KEY_PATTERN, TENANT_ID_PATTERN } from "@geochannel/contracts";
import { env } from "../config.js";
import { errorResponseSchema, sendApiError } from "../http/errors.js";
import {
  getStreamResBounds,
  hashRequestBody,
  isValidIdempotencyKey,
  normalizeIdempotencyKey,
  normalizeTenantId,
  parseEvent,
  streamTileKey
} from "../lib/core.js";
import type { MetricsRegistry } from "../lib/metrics.js";
import type { StreamPressureRegistry } from "../lib/pressure.js";
import { assertRedisPipelineSucceeded } from "../lib/redis.js";
import { buildStreamTrimArgs } from "../lib/retention.js";
import { checkIngestRateLimit } from "../lib/ingestRateLimit.js";
import type { IngestEvent, IngestIdempotencyRecord, IngestResponsePayload } from "../types.js";

const ingestEventItemSchema = {
  type: "object",
  additionalProperties: false,
  required: ["id", "ts", "loc"],
  properties: {
    id: { type: "string", minLength: 1 },
    ts: { type: "string", format: "date-time" },
    loc: {
      type: "array",
      minItems: 2,
      maxItems: 2,
      items: [{ type: "number" }, { type: "number" }]
    },
    attrs: { type: "object", additionalProperties: true }
  }
} as const;

export function registerIngestRoutes(
  app: FastifyInstance,
  redis: Redis,
  ingestApiKeyIndex: Map<string, string>,
  metrics: MetricsRegistry,
  pressure: StreamPressureRegistry
) {
  app.post(
    "/ingest/events",
    {
      schema: {
        body: {
          type: "array",
          minItems: 1,
          items: ingestEventItemSchema
        },
        response: {
          200: {
            type: "object",
            required: ["accepted", "rejected"],
            properties: {
              accepted: { type: "integer", minimum: 0 },
              rejected: { type: "integer", minimum: 0 },
              tenantId: { type: "string" },
              idempotencyKey: { type: "string" },
              idempotencyReplay: { type: "boolean" },
              errors: {
                type: "array",
                items: {
                  type: "object",
                  required: ["index", "reason"],
                  properties: {
                    index: { type: "integer", minimum: 0 },
                    reason: { type: "string" }
                  }
                }
              }
            }
          },
          400: errorResponseSchema,
          401: errorResponseSchema,
          409: errorResponseSchema,
          429: errorResponseSchema,
          413: errorResponseSchema
        }
      }
    },
    async (request, reply) => {
      const requestStartedAt = Date.now();
      const body = request.body as unknown;
      if (!Array.isArray(body)) {
        return sendApiError(reply, 400, "INGEST_INVALID_BODY", "Body must be an array of events.");
      }

      let tenantId = "public";
      if (env.INGEST_AUTH_REQUIRED) {
        const rawApiKey = request.headers["x-api-key"];
        const apiKey =
          typeof rawApiKey === "string" ? rawApiKey.trim() : Array.isArray(rawApiKey) ? rawApiKey[0]?.trim() : "";
        if (!apiKey) {
          return sendApiError(reply, 401, "INGEST_API_KEY_MISSING", "x-api-key header is required.");
        }
        const resolvedTenantId = ingestApiKeyIndex.get(apiKey);
        if (!resolvedTenantId) {
          return sendApiError(reply, 401, "INGEST_API_KEY_INVALID", "Invalid ingest API key.");
        }
        tenantId = resolvedTenantId;
      } else {
        const rawTenantId = request.headers["x-tenant-id"];
        const tenantIdHeader =
          typeof rawTenantId === "string" ? rawTenantId : Array.isArray(rawTenantId) ? rawTenantId[0] : undefined;
        if (tenantIdHeader !== undefined) {
          const parsedTenantId = normalizeTenantId(tenantIdHeader);
          if (!parsedTenantId) {
            return sendApiError(
              reply,
              400,
              "INGEST_TENANT_INVALID",
              `x-tenant-id must match ${TENANT_ID_PATTERN}.`
            );
          }
          tenantId = parsedTenantId;
        }
      }

      const idempotencyHeader = request.headers["idempotency-key"];
      const idempotencyKey = normalizeIdempotencyKey(
        Array.isArray(idempotencyHeader) ? idempotencyHeader[0] : idempotencyHeader
      );
      if (idempotencyKey !== null && !isValidIdempotencyKey(idempotencyKey)) {
        return sendApiError(
          reply,
          400,
          "IDEMPOTENCY_KEY_INVALID",
          `Idempotency key must match ${IDEMPOTENCY_KEY_PATTERN} and be at most ${IDEMPOTENCY_KEY_MAX_LENGTH} chars.`
        );
      }

      if (env.INGEST_MAX_EVENTS_PER_REQUEST > 0 && body.length > env.INGEST_MAX_EVENTS_PER_REQUEST) {
        return sendApiError(reply, 413, "INGEST_EVENT_LIMIT_EXCEEDED", "Too many events in one request.", {
          maxEvents: env.INGEST_MAX_EVENTS_PER_REQUEST,
          provided: body.length
        });
      }

      const accepted: IngestEvent[] = [];
      const rejected: { index: number; reason: string }[] = [];

      body.forEach((item, index) => {
        const parsed = parseEvent(item);
        if (!parsed) {
          rejected.push({ index, reason: "Invalid event shape." });
          return;
        }
        accepted.push(parsed);
      });

      if (accepted.length === 0) {
        return sendApiError(reply, 400, "INGEST_NO_VALID_EVENTS", "No valid events in request body.", {
          rejected
        });
      }

      let pressureRejected = 0;
      if (env.INGEST_PRESSURE_SHED_ENABLED) {
        const snapshot = pressure.snapshot();
        let shedFraction = 0;

        if (env.INGEST_PRESSURE_WAITING_SUBSCRIBERS_SOFT_LIMIT > 0) {
          const ratio = snapshot.waitingSubscribers / env.INGEST_PRESSURE_WAITING_SUBSCRIBERS_SOFT_LIMIT;
          if (ratio > 1) shedFraction = Math.max(shedFraction, ratio - 1);
        }
        if (env.INGEST_PRESSURE_PENDING_FRAMES_SOFT_LIMIT > 0) {
          const ratio = snapshot.pendingFrames / env.INGEST_PRESSURE_PENDING_FRAMES_SOFT_LIMIT;
          if (ratio > 1) shedFraction = Math.max(shedFraction, ratio - 1);
        }
        if (env.INGEST_PRESSURE_PENDING_BYTES_SOFT_LIMIT > 0) {
          const ratio = snapshot.pendingBytes / env.INGEST_PRESSURE_PENDING_BYTES_SOFT_LIMIT;
          if (ratio > 1) shedFraction = Math.max(shedFraction, ratio - 1);
        }

        const maxShed = Math.max(0, Math.min(0.99, env.INGEST_PRESSURE_MAX_SHED_FRACTION));
        shedFraction = Math.max(0, Math.min(maxShed, shedFraction));

        if (shedFraction > 0 && accepted.length > 1) {
          const keepCount = Math.max(1, Math.floor(accepted.length * (1 - shedFraction)));
          pressureRejected = Math.max(0, accepted.length - keepCount);
          accepted.length = keepCount;
        }
      }

      const payloadHash = idempotencyKey ? hashRequestBody(body) : null;
      const idempotencyRedisKey = idempotencyKey ? `idem:ingest:${tenantId}:${idempotencyKey}` : null;
      let idempotencyReserved = false;
      let idempotencyCompleted = false;
      if (idempotencyRedisKey && payloadHash) {
        const pendingRecord: IngestIdempotencyRecord = {
          state: "pending",
          payloadHash,
          createdAt: new Date().toISOString()
        };

        const reserved = await redis.set(
          idempotencyRedisKey,
          JSON.stringify(pendingRecord),
          "EX",
          env.INGEST_IDEMPOTENCY_TTL_SEC,
          "NX"
        );

        if (reserved === "OK") {
          idempotencyReserved = true;
        } else {
          const existingRaw = await redis.get(idempotencyRedisKey);
          if (!existingRaw) {
            return sendApiError(
              reply,
              409,
              "IDEMPOTENCY_IN_PROGRESS",
              "Another request with this idempotency key is in progress."
            );
          }

          let existingRecord: IngestIdempotencyRecord | null = null;
          try {
            existingRecord = JSON.parse(existingRaw) as IngestIdempotencyRecord;
          } catch {
            return sendApiError(
              reply,
              409,
              "IDEMPOTENCY_KEY_CONFLICT",
              "Idempotency key exists with unreadable state. Use a new key."
            );
          }

          if (existingRecord.payloadHash !== payloadHash) {
            return sendApiError(
              reply,
              409,
              "IDEMPOTENCY_KEY_CONFLICT",
              "Idempotency key was already used with different request payload."
            );
          }

          if (existingRecord.state === "completed") {
            const replay: IngestResponsePayload = {
              ...existingRecord.response,
              idempotencyKey: idempotencyKey ?? undefined,
              idempotencyReplay: true
            };
            metrics.recordIngest(tenantId, 0, 0, Date.now() - requestStartedAt);
            return replay;
          }

          return sendApiError(
            reply,
            409,
            "IDEMPOTENCY_IN_PROGRESS",
            "Another request with this idempotency key is in progress."
          );
        }
      }

      let rateLimit;
      try {
        rateLimit = await checkIngestRateLimit(
          redis,
          tenantId,
          accepted.length,
          Date.now(),
          env.INGEST_RATE_LIMIT_EVENTS_PER_SEC
        );
      } catch (err) {
        if (idempotencyRedisKey && idempotencyReserved) {
          await redis.del(idempotencyRedisKey);
        }
        throw err;
      }
      if (!rateLimit.allowed) {
        metrics.recordIngestRateLimitRejected(tenantId);
        if (idempotencyRedisKey && idempotencyReserved) {
          await redis.del(idempotencyRedisKey);
        }
        return sendApiError(reply, 429, "INGEST_RATE_LIMIT_EXCEEDED", "Tenant ingest event rate limit exceeded.", {
          maxEventsPerSec: env.INGEST_RATE_LIMIT_EVENTS_PER_SEC,
          acceptedThisSecond: rateLimit.current
        });
      }

      const pipeline = redis.pipeline();
      const { min: streamMin, max: streamMax } = getStreamResBounds();
      const streamTrimArgs = buildStreamTrimArgs(env.STREAM_RETENTION_MS, env.STREAM_MAXLEN, Date.now());

      try {
        for (const event of accepted) {
          const [lon, lat] = event.loc;
          const cell = h3.latLngToCell(lat, lon, env.H3_RES_INGEST);
          const attrsObject = event.attrs ?? {};
          const attrsJson = JSON.stringify(attrsObject);

          for (let res = streamMin; res <= streamMax; res += 1) {
            const streamCell = res === env.H3_RES_INGEST ? cell : h3.cellToParent(cell, res);
            const key = streamTileKey(tenantId, streamCell);
            const payloadBase = JSON.stringify({
              tile: streamCell,
              ts: event.ts,
              id: event.id,
              loc: [lon, lat],
              attrs: attrsObject
            });
            pipeline.xadd(
              key,
              ...streamTrimArgs,
              "*",
              "id",
              event.id,
              "ts",
              event.ts,
              "lon",
              lon.toString(),
              "lat",
              lat.toString(),
              "cell",
              streamCell,
              "attrs",
              attrsJson,
              "p",
              payloadBase
            );
          }
        }

        assertRedisPipelineSucceeded(await pipeline.exec(), "Ingest event writes");

        const responsePayload: IngestResponsePayload = {
          accepted: accepted.length,
          rejected: rejected.length + pressureRejected,
          tenantId,
          errors: rejected.length > 0 ? rejected : undefined,
          idempotencyKey: idempotencyKey ?? undefined,
          idempotencyReplay: idempotencyKey ? false : undefined
        };
        metrics.recordIngest(
          tenantId,
          responsePayload.accepted,
          responsePayload.rejected,
          Date.now() - requestStartedAt
        );

        if (idempotencyRedisKey && payloadHash && idempotencyKey) {
          const completedRecord: IngestIdempotencyRecord = {
            state: "completed",
            payloadHash,
            createdAt: new Date().toISOString(),
            response: {
              accepted: responsePayload.accepted,
              rejected: responsePayload.rejected,
              tenantId: responsePayload.tenantId,
              errors: responsePayload.errors
            }
          };
          await redis.set(idempotencyRedisKey, JSON.stringify(completedRecord), "EX", env.INGEST_IDEMPOTENCY_TTL_SEC);
          idempotencyCompleted = true;
        }

        return responsePayload;
      } catch (err) {
        if (idempotencyRedisKey && idempotencyReserved && !idempotencyCompleted) {
          await redis.del(idempotencyRedisKey);
        }
        throw err;
      }
    }
  );
}
