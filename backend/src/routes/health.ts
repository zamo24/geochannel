import type { FastifyInstance } from "fastify";
import type Redis from "ioredis";

export function registerHealthRoutes(app: FastifyInstance, redis: Redis) {
  app.get(
    "/health",
    {
      schema: {
        response: {
          200: {
            type: "object",
            required: ["status", "service", "time"],
            properties: {
              status: { type: "string" },
              service: { type: "string" },
              time: { type: "string", format: "date-time" }
            }
          }
        }
      }
    },
    async () => ({
      status: "ok",
      service: "geochannel-backend",
      time: new Date().toISOString()
    })
  );

  app.get(
    "/health/redis",
    {
      schema: {
        response: {
          200: {
            type: "object",
            required: ["status", "ping"],
            properties: {
              status: { type: "string" },
              ping: { type: "string" }
            }
          }
        }
      }
    },
    async () => {
      const pong = await redis.ping();
      return {
        status: pong === "PONG" ? "ok" : "degraded",
        ping: pong
      };
    }
  );
}
