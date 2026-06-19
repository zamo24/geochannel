import type Redis from "ioredis";
import { assertRedisPipelineSucceeded } from "./redis.js";

export function streamCursorKey(tenantId: string, cursorId: string) {
  return `cursor:tenant:${tenantId}:${cursorId}`;
}

export async function loadStreamCursor(redis: Pick<Redis, "hgetall">, tenantId: string, cursorId: string) {
  return redis.hgetall(streamCursorKey(tenantId, cursorId));
}

function compareStreamOffsets(left: string, right: string) {
  const [leftMs, leftSeq] = left.split("-").map((part) => Number.parseInt(part, 10));
  const [rightMs, rightSeq] = right.split("-").map((part) => Number.parseInt(part, 10));
  if (![leftMs, leftSeq, rightMs, rightSeq].every(Number.isFinite)) return left.localeCompare(right);
  if (leftMs !== rightMs) return leftMs - rightMs;
  return leftSeq - rightSeq;
}

export class StreamCursorWriter {
  private readonly pending = new Map<string, string>();
  private readonly latest = new Map<string, string>();
  private flushPromise: Promise<void> = Promise.resolve();

  constructor(
    private readonly redis: Redis,
    private readonly key: string,
    private readonly ttlSec: number
  ) {}

  mark(tile: string | undefined, offset: string | undefined) {
    if (!tile || !offset) return;
    const current = this.latest.get(tile);
    if (!current || compareStreamOffsets(offset, current) > 0) {
      this.latest.set(tile, offset);
      this.pending.set(tile, offset);
    }
  }

  flush() {
    const next = this.flushPromise.then(() => this.flushPending());
    this.flushPromise = next.catch(() => undefined);
    return next;
  }

  private async flushPending() {
    if (this.pending.size === 0) return;
    const entries = Array.from(this.pending.entries());
    this.pending.clear();
    const pipeline = this.redis.pipeline();
    pipeline.hset(this.key, Object.fromEntries(entries));
    pipeline.expire(this.key, this.ttlSec);
    try {
      assertRedisPipelineSucceeded(await pipeline.exec(), "Stream cursor update");
    } catch (err) {
      for (const [tile, offset] of entries) {
        if (!this.pending.has(tile)) this.pending.set(tile, offset);
      }
      throw err;
    }
  }
}
