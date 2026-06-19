import type { FastifyInstance } from "fastify";
import * as h3 from "h3-js";
import type Redis from "ioredis";
import { env } from "../config.js";
import { errorResponseSchema, sendApiError } from "../http/errors.js";
import { reserveChannelWithQuota } from "../lib/channelQuota.js";
import {
  H3_MAX_RES,
  H3_MIN_RES,
  clampResToStreamRange,
  coerceRes,
  coerceTtl,
  estimateNormalizedTileCountUpperBound,
  estimatePolygonCellMaterialization,
  generateChannelId,
  normalizeTilesToRes,
  parsePolygon,
  parseTiles,
  resolveTenantAuth
} from "../lib/core.js";
import type { ChannelRecord } from "../types.js";

const channelPolygonPointSchema = {
  type: "array",
  minItems: 2,
  maxItems: 2,
  items: [{ type: "number" }, { type: "number" }]
} as const;

export function registerChannelRoutes(app: FastifyInstance, redis: Redis, tenantApiKeyIndex: Map<string, string>) {
  app.post(
    "/channels",
    {
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          properties: {
            tenantId: { type: "string", minLength: 1 },
            ttlSec: { type: "integer" },
            res: { type: "integer", minimum: H3_MIN_RES, maximum: H3_MAX_RES },
            polygon: {
              type: "array",
              minItems: 3,
              maxItems: env.MAX_POLYGON_POINTS,
              items: channelPolygonPointSchema
            },
            tiles: {
              type: "array",
              minItems: 1,
              items: { type: "string", minLength: 1 }
            }
          },
          anyOf: [{ required: ["polygon"] }, { required: ["tiles"] }]
        },
        response: {
          200: {
            type: "object",
            required: ["channelId", "ttlSec", "tilesCount", "res"],
            properties: {
              channelId: { type: "string" },
              tenantId: { type: "string" },
              ttlSec: { type: "integer", minimum: 1 },
              tilesCount: { type: "integer", minimum: 0 },
              res: { type: "integer", minimum: H3_MIN_RES, maximum: H3_MAX_RES },
              aoiRes: { type: "integer", minimum: H3_MIN_RES, maximum: H3_MAX_RES }
            }
          },
          400: errorResponseSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
          413: errorResponseSchema,
          429: errorResponseSchema
        }
      }
    },
    async (request, reply) => {
      const body = request.body as Record<string, unknown> | null;
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        return sendApiError(reply, 400, "CHANNELS_INVALID_BODY", "Body must be an object.");
      }

      const requestedTenantId = typeof body.tenantId === "string" ? body.tenantId : undefined;
      const tenantAuth = resolveTenantAuth(request.headers, {
        required: env.CHANNEL_AUTH_REQUIRED,
        apiKeyIndex: tenantApiKeyIndex,
        suppliedTenantId: requestedTenantId,
        missingCode: "CHANNEL_API_KEY_MISSING",
        invalidCode: "CHANNEL_API_KEY_INVALID",
        invalidTenantCode: "CHANNEL_TENANT_INVALID",
        mismatchCode: "CHANNEL_TENANT_MISMATCH"
      });
      if (!tenantAuth.ok) {
        return sendApiError(reply, tenantAuth.statusCode, tenantAuth.code, tenantAuth.message);
      }
      const tenantId = tenantAuth.tenantId;
      const ttlSec = coerceTtl(body.ttlSec, env.CHANNEL_TTL_SEC);

      const hasPolygon = body.polygon !== undefined;
      const hasTiles = body.tiles !== undefined;
      if ((hasPolygon && hasTiles) || (!hasPolygon && !hasTiles)) {
        return sendApiError(
          reply,
          400,
          "CHANNEL_INPUT_EXCLUSIVE_REQUIRED",
          "Provide either polygon or tiles, but not both."
        );
      }

      const requestedRes = clampResToStreamRange(coerceRes(body.res, env.H3_RES_INGEST));
      const streamRes = requestedRes;
      const materializationLimit = env.MAX_CHANNEL_TILE_MATERIALIZATION > 0
        ? env.MAX_CHANNEL_TILE_MATERIALIZATION
        : env.MAX_TILES_PER_CHANNEL;
      let tiles: string[] = [];
      let aoiRes: number | undefined = undefined;

      if (hasPolygon) {
        const polygonResult = parsePolygon(body.polygon, env.MAX_POLYGON_POINTS);
        if (!polygonResult.ok) {
          return sendApiError(reply, 400, "CHANNEL_INVALID_POLYGON", polygonResult.error);
        }
        aoiRes = requestedRes;
        const estimatedTiles = estimatePolygonCellMaterialization(polygonResult.ring, streamRes);
        if (materializationLimit > 0 && estimatedTiles > materializationLimit) {
          return sendApiError(
            reply,
            413,
            "CHANNEL_TILE_MATERIALIZATION_LIMIT_EXCEEDED",
            "Channel input would require too many tiles to materialize safely.",
            {
              maxMaterializedTiles: materializationLimit,
              estimatedTiles
            }
          );
        }
        tiles = h3.polygonToCells([polygonResult.ring], streamRes);
      } else {
        const tilesResult = parseTiles(body.tiles);
        if (!tilesResult.ok) {
          return sendApiError(reply, 400, "CHANNEL_INVALID_TILES", tilesResult.error);
        }
        aoiRes = tilesResult.resMax;
        const estimatedTiles = estimateNormalizedTileCountUpperBound(tilesResult.tiles, streamRes);
        if (materializationLimit > 0 && estimatedTiles > materializationLimit) {
          return sendApiError(
            reply,
            413,
            "CHANNEL_TILE_MATERIALIZATION_LIMIT_EXCEEDED",
            "Channel input would require too many tiles to materialize safely.",
            {
              maxMaterializedTiles: materializationLimit,
              estimatedTiles
            }
          );
        }
        const normalized = normalizeTilesToRes(tilesResult.tiles, streamRes);
        if (!normalized.ok) {
          return sendApiError(reply, 400, "CHANNEL_TILE_NORMALIZATION_FAILED", normalized.error);
        }
        tiles = normalized.tiles;
      }

      if (tiles.length === 0) {
        return sendApiError(reply, 400, "CHANNEL_NO_TILES", "No tiles generated for the provided input.");
      }

      if (env.MAX_TILES_PER_CHANNEL > 0 && tiles.length > env.MAX_TILES_PER_CHANNEL) {
        return sendApiError(reply, 413, "CHANNEL_TILE_LIMIT_EXCEEDED", "Channel tile limit exceeded.", {
          maxTiles: env.MAX_TILES_PER_CHANNEL,
          provided: tiles.length
        });
      }

      const channelId = generateChannelId();
      const record: ChannelRecord = {
        id: channelId,
        tiles,
        res: streamRes,
        aoiRes,
        ttlSec,
        tenantId,
        createdAt: new Date().toISOString()
      };

      const reservation = await reserveChannelWithQuota(redis, record, {
        nowMs: Date.now(),
        maxActive: env.MAX_CHANNELS_PER_TENANT_ACTIVE,
        maxHourly: env.MAX_CHANNELS_PER_TENANT_HOUR,
        activeSetTtlSec: env.CHANNEL_TTL_MAX_SEC,
        hourlySetTtlSec: 2 * 60 * 60
      });
      if (!reservation.ok && reservation.limit === "active") {
        return sendApiError(reply, 429, "CHANNEL_ACTIVE_LIMIT_EXCEEDED", "Active channel limit exceeded.", {
          maxActiveChannels: env.MAX_CHANNELS_PER_TENANT_ACTIVE,
          currentActiveChannels: reservation.current
        });
      }
      if (!reservation.ok) {
        return sendApiError(reply, 429, "CHANNEL_HOURLY_LIMIT_EXCEEDED", "Hourly channel creation limit exceeded.", {
          maxChannelsPerHour: env.MAX_CHANNELS_PER_TENANT_HOUR,
          currentChannelsThisHour: reservation.current
        });
      }

      request.log.info(
        {
          auditEvent: "channel.create",
          requestId: request.id,
          tenantId,
          channelId,
          ttlSec,
          channelRes: streamRes,
          aoiRes,
          tilesCount: tiles.length,
          authenticated: tenantAuth.authenticated
        },
        "audit channel create"
      );

      return {
        channelId,
        tenantId,
        ttlSec,
        tilesCount: tiles.length,
        res: streamRes,
        aoiRes
      };
    }
  );
}
