import type { FastifyInstance } from "fastify";
import type Redis from "ioredis";
import {
  STREAM_CURSOR_ID_PATTERN,
  STREAM_FRAME_TYPE_EVENT,
  STREAM_OFFSET_LIVE,
  STREAM_OFFSET_PATTERN,
  STREAM_OFFSET_REPLAY_START,
} from "@geochannel/contracts";
import { env } from "../config.js";
import { errorResponseSchema, sendApiError } from "../http/errors.js";
import { buildAggregateFrames, shouldAggregateByRes, thinEntries } from "../lib/aggregation.js";
import { streamTileKey, verifyStreamToken } from "../lib/core.js";
import { buildEventFrameBatches } from "../lib/eventFrameBatch.js";
import { SseFramePump, type StreamMode } from "../lib/framePump.js";
import type { MetricsRegistry } from "../lib/metrics.js";
import type { StreamPressureRegistry } from "../lib/pressure.js";
import {
  refreshSubscriberLease,
  releaseSubscriberLease,
  type SubscriberLease
} from "../lib/subscriberQuota.js";
import { acquireConfiguredSubscriberLease } from "../lib/subscriberQuota.js";
import { loadStreamCursor, streamCursorKey, StreamCursorWriter } from "../lib/streamCursor.js";
import type { ChannelRecord } from "../types.js";

function parseEventTimestampMs(ts: string | undefined) {
  if (!ts) return null;
  const parsed = Date.parse(ts);
  return Number.isFinite(parsed) ? parsed : null;
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function parseBooleanFlag(raw: string | undefined, fallback: boolean) {
  if (raw === undefined) return fallback;
  const value = raw.trim().toLowerCase();
  if (value === "1" || value === "true" || value === "yes" || value === "on") return true;
  if (value === "0" || value === "false" || value === "no" || value === "off") return false;
  return fallback;
}

export function registerStreamRoutes(
  app: FastifyInstance,
  redis: Redis,
  metrics: MetricsRegistry,
  pressure: StreamPressureRegistry
) {
  app.get(
    "/stream",
    {
      schema: {
        querystring: {
          type: "object",
          additionalProperties: false,
          required: ["channelId"],
          properties: {
            channelId: { type: "string", minLength: 1 },
            offset: { type: "string", pattern: STREAM_OFFSET_PATTERN },
            cursorId: { type: "string", pattern: STREAM_CURSOR_ID_PATTERN },
            includeAttrs: { type: "string", enum: ["1", "0", "true", "false"] }
          }
        },
        response: {
          400: errorResponseSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
          404: errorResponseSchema,
          413: errorResponseSchema,
          429: errorResponseSchema
        }
      }
    },
    async (request, reply) => {
      const query = request.query as { channelId: string; offset?: string; cursorId?: string; includeAttrs?: string };
      const channelId = query.channelId;
      const offset = query.offset ?? STREAM_OFFSET_REPLAY_START;
      const includeAttrs = parseBooleanFlag(query.includeAttrs, true);

      const raw = await redis.get(`chan:${channelId}`);
      if (!raw) {
        return sendApiError(reply, 404, "STREAM_CHANNEL_NOT_FOUND", "Channel not found.");
      }

      let record: ChannelRecord;
      try {
        record = JSON.parse(raw) as ChannelRecord;
      } catch {
        request.log.error({ channelId }, "invalid channel record");
        return sendApiError(reply, 500, "CHANNEL_RECORD_INVALID", "Channel record could not be read.");
      }

      if (!record.tiles || record.tiles.length === 0) {
        return sendApiError(reply, 404, "STREAM_CHANNEL_NO_TILES", "Channel has no tiles.");
      }

      if (env.STREAM_AUTH_REQUIRED) {
        const authHeader = request.headers.authorization;
        if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
          return sendApiError(reply, 401, "STREAM_TOKEN_MISSING", "Bearer token is required.");
        }
        const token = authHeader.slice("Bearer ".length).trim();
        if (!token) {
          return sendApiError(reply, 401, "STREAM_TOKEN_MISSING", "Bearer token is required.");
        }

        const verification = verifyStreamToken(token);
        if (!verification.ok) {
          return sendApiError(reply, 401, verification.code, verification.message);
        }
        if (verification.payload.channelId !== channelId) {
          return sendApiError(reply, 403, "STREAM_TOKEN_CHANNEL_MISMATCH", "Token channel does not match request.");
        }
        if (verification.payload.tenantId !== record.tenantId) {
          return sendApiError(reply, 403, "STREAM_TOKEN_TENANT_MISMATCH", "Token tenant does not match channel.");
        }
      }

      const streamTiles = record.tiles;
      if (env.MAX_TILES_PER_CHANNEL > 0 && streamTiles.length > env.MAX_TILES_PER_CHANNEL) {
        return sendApiError(reply, 413, "CHANNEL_TILE_LIMIT_EXCEEDED", "Channel tile limit exceeded.", {
          maxTiles: env.MAX_TILES_PER_CHANNEL,
          provided: streamTiles.length
        });
      }
      const aggregateMode = shouldAggregateByRes(record.res, env.STREAM_AGGREGATE_MAX_RES);
      const streamMode: StreamMode = aggregateMode ? "aggregate" : "event";
      const cursorOffsets = query.cursorId ? await loadStreamCursor(redis, record.tenantId, query.cursorId) : {};
      const cursorWriter = query.cursorId
        ? new StreamCursorWriter(redis, streamCursorKey(record.tenantId, query.cursorId), env.STREAM_CURSOR_TTL_SEC)
        : null;
      let subscriberLease: SubscriberLease | null = null;
      if (env.MAX_STREAM_SUBSCRIBERS_PER_TENANT > 0 || env.MAX_STREAM_SUBSCRIBERS_PER_CHANNEL > 0) {
        const admission = await acquireConfiguredSubscriberLease(redis, record.tenantId, channelId);
        if (!admission.ok) {
          metrics.recordStreamSubscriberLimitRejected(
            record.tenantId,
            admission.limit === "tenant" ? "tenant" : "channel"
          );
          return sendApiError(
            reply,
            429,
            admission.limit === "tenant" ? "STREAM_TENANT_SUBSCRIBER_LIMIT_EXCEEDED" : "STREAM_CHANNEL_SUBSCRIBER_LIMIT_EXCEEDED",
            `${admission.limit === "tenant" ? "Tenant" : "Channel"} stream subscriber limit exceeded.`,
            { currentSubscribers: admission.current }
          );
        }
        subscriberLease = admission.lease;
      }
      if (Object.keys(cursorOffsets).length > 0) {
        metrics.recordStreamCursorResume(record.tenantId);
      }
      request.log.info(
        {
          auditEvent: "stream.subscribe",
          requestId: request.id,
          tenantId: record.tenantId,
          channelId,
          mode: streamMode,
          offset,
          tilesCount: streamTiles.length,
          authRequired: env.STREAM_AUTH_REQUIRED
        },
        "audit stream subscribe"
      );

      reply.hijack();
      for (const [name, value] of Object.entries(reply.getHeaders())) {
        if (value !== undefined) reply.raw.setHeader(name, value);
      }
      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no"
      });
      reply.raw.write(`event: ready\ndata: ${JSON.stringify({
        channelId,
        mode: streamMode,
        cursorId: query.cursorId
      })}\n\n`);

      let closed = false;
      let streamRedis: Redis | null = null;
      request.raw.on("close", () => {
        closed = true;
        streamRedis?.disconnect();
        void cursorWriter?.flush().catch((err) => request.log.error({ err }, "stream cursor update failed"));
      });

      metrics.recordStreamSubscribe(record.tenantId, streamMode);
      const pressureConnectionId = pressure.registerConnection();

      const framePump = new SseFramePump(
        (chunk) => {
          if (closed) return false;
          return reply.raw.write(chunk);
        },
        env.STREAM_MAX_PENDING_FRAMES,
        {
          onSend: (frame) => {
            const latencyMs = frame.tsMs === null ? null : Math.max(0, Date.now() - frame.tsMs);
            const frameCount = Math.max(1, Math.floor(frame.frameCount ?? 1));
            const payloadBytes = frame.sizeBytes ?? Buffer.byteLength(frame.payload, "utf8");
            metrics.recordStreamFramesSentBatch(
              record.tenantId,
              frame.mode,
              frameCount,
              payloadBytes,
              latencyMs
            );
            cursorWriter?.mark(frame.cursorTile, frame.cursorOffset);
          },
          onDrop: (frame) => {
            metrics.recordStreamFrameDroppedBackpressure(record.tenantId, frame.mode, frame.frameCount ?? 1);
          },
          onBackpressure: (frame) => {
            metrics.recordStreamBackpressureSignal(record.tenantId, frame.mode);
          },
          onStateChange: (state) => {
            pressure.updateConnection(pressureConnectionId, state);
          }
        },
        {
          maxPendingBytes: env.STREAM_MAX_PENDING_BYTES
        }
      );
      reply.raw.on("drain", () => {
        framePump.onDrain();
      });

      const heartbeat = setInterval(() => {
        if (!closed) {
          reply.raw.write(`: keepalive ${Date.now()}\n\n`);
          if (subscriberLease) {
            void refreshSubscriberLease(
              redis,
              subscriberLease,
              Date.now() + env.STREAM_SUBSCRIBER_LEASE_SEC * 1000,
              Math.max(env.STREAM_SUBSCRIBER_LEASE_SEC * 2, 1)
            ).catch((err) => request.log.error({ err }, "subscriber lease refresh failed"));
          }
          void cursorWriter?.flush().catch((err) => request.log.error({ err }, "stream cursor update failed"));
        }
      }, 15000);

      streamRedis = redis.duplicate();
      streamRedis.on("error", (err) => {
        request.log.error({ err }, "stream redis error");
      });

      const streamKeys = streamTiles.map((tile) => streamTileKey(record.tenantId, tile));
      const streamIndexByKey = new Map<string, number>();
      streamKeys.forEach((key, index) => streamIndexByKey.set(key, index));
      let lastIds = streamTiles.map((tile) => cursorOffsets[tile] ?? offset);
      let liveMode = lastIds.every((id) => id === STREAM_OFFSET_LIVE);
      const frameThreshold = env.STREAM_MAX_PENDING_FRAMES > 0
        ? Math.max(1, Math.floor((env.STREAM_MAX_PENDING_FRAMES * env.STREAM_BACKPRESSURE_PAUSE_THRESHOLD_PCT) / 100))
        : 0;
      const byteThreshold = env.STREAM_MAX_PENDING_BYTES > 0
        ? Math.max(1, Math.floor((env.STREAM_MAX_PENDING_BYTES * env.STREAM_BACKPRESSURE_PAUSE_THRESHOLD_PCT) / 100))
        : 0;
      const baseReadCount = Math.max(1, env.STREAM_READ_COUNT);
      const minReadCount = Math.max(1, Math.min(baseReadCount, env.STREAM_READ_COUNT_MIN));
      const maxReadCount = Math.max(baseReadCount, env.STREAM_READ_COUNT_MAX);
      let readCount = baseReadCount;
      const adaptiveReadCount = env.STREAM_READ_COUNT_ADAPTIVE && maxReadCount > minReadCount;

      try {
        while (!closed) {
          if (adaptiveReadCount) {
            const frameUsage = env.STREAM_MAX_PENDING_FRAMES > 0
              ? framePump.pendingCount() / env.STREAM_MAX_PENDING_FRAMES
              : 0;
            const byteUsage = env.STREAM_MAX_PENDING_BYTES > 0
              ? framePump.pendingBytes() / env.STREAM_MAX_PENDING_BYTES
              : 0;
            const usage = Math.max(frameUsage, byteUsage);
            const rampStep = Math.max(1, Math.floor(baseReadCount / 8));
            if (framePump.isWaitingDrain() || usage >= 0.9) {
              readCount = Math.max(minReadCount, Math.floor(readCount * 0.6));
            } else if (usage >= 0.75) {
              readCount = Math.max(minReadCount, Math.floor(readCount * 0.8));
            } else if (usage <= 0.25) {
              readCount = Math.min(maxReadCount, readCount + rampStep);
            }
          }

          if (framePump.isWaitingDrain() && env.STREAM_BACKPRESSURE_PAUSE_MS > 0) {
            const shouldPauseByFrames = frameThreshold > 0 && framePump.pendingCount() >= frameThreshold;
            const shouldPauseByBytes = byteThreshold > 0 && framePump.pendingBytes() >= byteThreshold;
            if (shouldPauseByFrames || shouldPauseByBytes) {
              await sleep(env.STREAM_BACKPRESSURE_PAUSE_MS);
              continue;
            }
          }

          const block = liveMode ? env.STREAM_BLOCK_MS : 0;
          const res = (await streamRedis.xread(
            "COUNT",
            readCount,
            "BLOCK",
            block,
            "STREAMS",
            ...streamKeys,
            ...lastIds
          )) as Array<[string, Array<[string, string[]]>]> | null;

          if (closed) break;
          if (!res || res.length === 0) {
            if (!liveMode) {
              liveMode = true;
            }
            continue;
          }

          for (const [key, entries] of res) {
            const streamIndex = streamIndexByKey.get(key);
            if (streamIndex === undefined) continue;
            if (entries.length === 0) continue;

            const lastEntry = entries[entries.length - 1];
            lastIds[streamIndex] = lastEntry[0];

            if (aggregateMode) {
              const aggregateFrames = buildAggregateFrames(key, entries, env.STREAM_AGGREGATE_WINDOW_MS);
              for (const aggregateFrame of aggregateFrames) {
                const payload = `data: ${JSON.stringify(aggregateFrame)}\n\n`;
                framePump.enqueue({
                  payload,
                  mode: "aggregate",
                  tsMs: parseEventTimestampMs(aggregateFrame.ts),
                  cursorTile: aggregateFrame.tile,
                  cursorOffset: aggregateFrame.offset
                });
              }
              if (aggregateFrames.length === 0) {
                metrics.recordStreamFrameDroppedInvalid(record.tenantId, "aggregate", entries.length);
              }
              continue;
            }

            const emitEntries = thinEntries(entries, env.STREAM_THIN_MAX_EVENTS_PER_TILE_READ);
            if (emitEntries.length < entries.length) {
              metrics.recordStreamFramesThinned(record.tenantId, entries.length - emitEntries.length);
            }
            const eventBatches = buildEventFrameBatches(key, emitEntries, {
              includeAttrs,
              maxFrames: env.STREAM_EVENT_BATCH_MAX_FRAMES,
              maxBytes: env.STREAM_EVENT_BATCH_MAX_BYTES
            });
            if (eventBatches.invalidCount > 0) {
              metrics.recordStreamFrameDroppedInvalid(record.tenantId, "event", eventBatches.invalidCount);
            }
            for (const frame of eventBatches.frames) framePump.enqueue(frame);
          }
        }
      } catch (err) {
        if (!closed) {
          request.log.error({ err }, "stream error");
        }
      } finally {
        clearInterval(heartbeat);
        framePump.close();
        pressure.unregisterConnection(pressureConnectionId);
        streamRedis.disconnect();
        metrics.recordStreamUnsubscribe(record.tenantId, streamMode);
        await cursorWriter?.flush().catch((err) => request.log.error({ err }, "stream cursor update failed"));
        if (subscriberLease) {
          await releaseSubscriberLease(redis, subscriberLease).catch((err) => {
            request.log.error({ err }, "subscriber lease release failed");
          });
        }
        if (!closed) {
          reply.raw.end();
        }
      }
    }
  );
}
