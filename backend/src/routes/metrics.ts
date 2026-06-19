import type { FastifyInstance } from "fastify";
import { errorResponseSchema, sendApiError } from "../http/errors.js";
import { bearerTokenMatches } from "../lib/authToken.js";
import type { MetricsRegistry } from "../lib/metrics.js";

type MetricsRouteOptions = {
  resetEnabled: boolean;
  resetToken: string;
  authRequired: boolean;
  authToken: string;
};

function metricsAuthorized(authorization: string | string[] | undefined, options: MetricsRouteOptions) {
  return !options.authRequired || bearerTokenMatches(authorization, options.authToken);
}

const metricsSummaryResponseSchema = {
  type: "object",
  required: ["status", "generatedAt", "process", "window", "summary", "latencyHistogram", "byTenantMode"],
  properties: {
    status: { type: "string" },
    generatedAt: { type: "string", format: "date-time" },
    process: {
      type: "object",
      required: ["startedAtSec", "uptimeSec"],
      properties: {
        startedAtSec: { type: "number" },
        uptimeSec: { type: "number" }
      }
    },
    window: {
      type: "object",
      required: ["resetAtSec", "sinceResetSec", "generation"],
      properties: {
        resetAtSec: { type: "number" },
        sinceResetSec: { type: "number" },
        generation: { type: "number" }
      }
    },
    summary: {
      type: "object",
      required: [
        "ingestRate1m",
        "streamRate1m",
        "subscribersCurrent",
        "latencyP95Ms",
        "latencyP99Ms",
        "ingestEventsTotal",
        "streamFramesTotal",
        "dropsBackpressureTotal",
        "dropsInvalidTotal",
        "backpressureSignalsTotal"
      ],
      properties: {
        ingestRate1m: { type: "number" },
        streamRate1m: { type: "number" },
        subscribersCurrent: { type: "number" },
        latencyP95Ms: { type: ["number", "null"] },
        latencyP99Ms: { type: ["number", "null"] },
        ingestEventsTotal: { type: "number" },
        streamFramesTotal: { type: "number" },
        dropsBackpressureTotal: { type: "number" },
        dropsInvalidTotal: { type: "number" },
        backpressureSignalsTotal: { type: "number" }
      }
    },
    latencyHistogram: {
      type: "object",
      required: ["boundsMs", "cumulative", "sampleCount", "sumMs"],
      properties: {
        boundsMs: { type: "array", items: { type: "number" } },
        cumulative: { type: "array", items: { type: "number" } },
        sampleCount: { type: "number" },
        sumMs: { type: "number" }
      }
    },
    byTenantMode: {
      type: "array",
      items: {
        type: "object",
        required: [
          "tenantId",
          "mode",
          "streamFramesTotal",
          "subscribersCurrent",
          "dropsBackpressureTotal",
          "dropsInvalidTotal",
          "backpressureSignalsTotal"
        ],
        properties: {
          tenantId: { type: "string" },
          mode: { type: "string" },
          streamFramesTotal: { type: "number" },
          subscribersCurrent: { type: "number" },
          dropsBackpressureTotal: { type: "number" },
          dropsInvalidTotal: { type: "number" },
          backpressureSignalsTotal: { type: "number" }
        }
      }
    }
  }
} as const;

export function registerMetricsRoutes(app: FastifyInstance, metrics: MetricsRegistry, options: MetricsRouteOptions) {
  app.get(
    "/metrics/summary",
    {
      schema: {
        response: {
          200: metricsSummaryResponseSchema,
          401: errorResponseSchema
        }
      }
    },
    async (request, reply) => {
      if (!metricsAuthorized(request.headers.authorization, options)) {
        return sendApiError(reply, 401, "METRICS_UNAUTHORIZED", "Valid metrics bearer token is required.");
      }
      return metrics.renderSummary();
    }
  );

  app.get("/metrics", async (request, reply) => {
    if (!metricsAuthorized(request.headers.authorization, options)) {
      return sendApiError(reply, 401, "METRICS_UNAUTHORIZED", "Valid metrics bearer token is required.");
    }
    reply.header("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
    return metrics.renderPrometheus();
  });

  if (options.resetEnabled) {
    app.post(
      "/metrics/reset",
      {
        schema: {
          response: {
            200: metricsSummaryResponseSchema,
            401: errorResponseSchema
          }
        }
      },
      async (request, reply) => {
        if (!metricsAuthorized(request.headers.authorization, options)) {
          return sendApiError(reply, 401, "METRICS_UNAUTHORIZED", "Valid metrics bearer token is required.");
        }
        if (options.resetToken.length > 0) {
          const supplied = request.headers["x-metrics-reset-token"];
          if (typeof supplied !== "string" || supplied !== options.resetToken) {
            return sendApiError(reply, 401, "METRICS_RESET_UNAUTHORIZED", "metrics reset token is invalid.");
          }
        }
        metrics.resetSummaryWindow();
        return metrics.renderSummary();
      }
    );
  }
}
