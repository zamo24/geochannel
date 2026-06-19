import type { FastifyInstance, FastifyReply } from "fastify";
import type { ApiErrorPayload } from "@geochannel/contracts";
import { env } from "../config.js";

export const errorResponseSchema = {
  type: "object",
  required: ["error"],
  properties: {
    error: {
      type: "object",
      required: ["code", "message"],
      properties: {
        code: { type: "string" },
        message: { type: "string" },
        details: {}
      }
    }
  }
} as const;

export function sendApiError(reply: FastifyReply, statusCode: number, code: string, message: string, details?: unknown) {
  const payload: ApiErrorPayload = { error: { code, message } };
  if (details !== undefined) {
    payload.error.details = details;
  }
  return reply.code(statusCode).send(payload);
}

export function registerErrorHandler(app: FastifyInstance) {
  app.setErrorHandler((err, request, reply) => {
    if (reply.sent) return;

    if ((err as { code?: string }).code === "FST_ERR_CTP_BODY_TOO_LARGE") {
      sendApiError(
        reply,
        413,
        "PAYLOAD_TOO_LARGE",
        "Request body exceeded configured size limit.",
        { maxBytes: env.INGEST_MAX_BODY_BYTES }
      );
      return;
    }

    if ((err as { validation?: unknown }).validation) {
      sendApiError(reply, 400, "VALIDATION_ERROR", "Request validation failed.", {
        issues: (err as { validation?: unknown }).validation
      });
      return;
    }

    const statusCode = typeof (err as { statusCode?: unknown }).statusCode === "number"
      ? (err as { statusCode: number }).statusCode
      : 500;

    if (statusCode >= 500) {
      request.log.error({ err }, "unhandled request error");
      sendApiError(reply, 500, "INTERNAL_ERROR", "Internal server error.");
      return;
    }

    sendApiError(reply, statusCode, "REQUEST_ERROR", err instanceof Error ? err.message : "Request failed.");
  });
}
