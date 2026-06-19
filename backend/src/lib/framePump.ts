export type StreamMode = "event" | "aggregate";

export type QueuedSseFrame = {
  payload: string;
  mode: StreamMode;
  tsMs: number | null;
  sizeBytes?: number;
  frameCount?: number;
  cursorTile?: string;
  cursorOffset?: string;
};

export type PumpDropReason = "queue_full_frames" | "queue_full_bytes";

type PumpCallbacks = {
  onSend?: (frame: QueuedSseFrame) => void;
  onDrop?: (frame: QueuedSseFrame, reason: PumpDropReason) => void;
  onBackpressure?: (frame: QueuedSseFrame) => void;
  onStateChange?: (state: { pendingFrames: number; pendingBytes: number; waitingDrain: boolean }) => void;
};

type PumpOptions = {
  maxPendingBytes?: number;
};

export class SseFramePump {
  private readonly queue: QueuedSseFrame[] = [];
  private queueBytes = 0;
  private readonly maxPendingBytes: number;
  private waitingDrain = false;
  private closed = false;

  constructor(
    private readonly writeChunk: (chunk: string) => boolean,
    private readonly maxPendingFrames: number,
    private readonly callbacks: PumpCallbacks = {},
    options: PumpOptions = {}
  ) {
    this.maxPendingBytes = Math.max(0, Math.floor(options.maxPendingBytes ?? 0));
  }

  enqueue(frame: QueuedSseFrame) {
    if (this.closed) return false;
    const frameSize = frame.sizeBytes ?? Buffer.byteLength(frame.payload, "utf8");
    const queuedFrame: QueuedSseFrame = {
      ...frame,
      sizeBytes: frameSize,
      frameCount: frame.frameCount ?? 1
    };

    if (this.maxPendingBytes > 0 && frameSize > this.maxPendingBytes) {
      this.callbacks.onDrop?.(queuedFrame, "queue_full_bytes");
      return false;
    }

    while (this.maxPendingFrames > 0 && this.queue.length >= this.maxPendingFrames) {
      this.dropOldest("queue_full_frames");
    }
    while (this.maxPendingBytes > 0 && this.queueBytes + frameSize > this.maxPendingBytes && this.queue.length > 0) {
      this.dropOldest("queue_full_bytes");
    }

    if (this.maxPendingBytes > 0 && this.queueBytes + frameSize > this.maxPendingBytes) {
      this.callbacks.onDrop?.(queuedFrame, "queue_full_bytes");
      return false;
    }

    this.queue.push(queuedFrame);
    this.queueBytes += frameSize;
    this.publishState();
    this.flush();
    return true;
  }

  onDrain() {
    if (this.closed || !this.waitingDrain) return;
    this.waitingDrain = false;
    this.publishState();
    this.flush();
  }

  close() {
    this.closed = true;
    this.queue.length = 0;
    this.queueBytes = 0;
    this.waitingDrain = false;
    this.publishState();
  }

  isWaitingDrain() {
    return this.waitingDrain;
  }

  pendingCount() {
    return this.queue.length;
  }

  pendingBytes() {
    return this.queueBytes;
  }

  private dropOldest(reason: PumpDropReason) {
    const dropped = this.queue.shift();
    if (!dropped) return;
    this.queueBytes = Math.max(0, this.queueBytes - (dropped.sizeBytes ?? 0));
    this.callbacks.onDrop?.(dropped, reason);
    this.publishState();
  }

  private publishState() {
    this.callbacks.onStateChange?.({
      pendingFrames: this.queue.length,
      pendingBytes: this.queueBytes,
      waitingDrain: this.waitingDrain
    });
  }

  private flush() {
    if (this.closed || this.waitingDrain) return;

    while (this.queue.length > 0) {
      const next = this.queue[0];
      const wrote = this.writeChunk(next.payload);
      this.queue.shift();
      this.queueBytes = Math.max(0, this.queueBytes - (next.sizeBytes ?? 0));
      this.callbacks.onSend?.(next);
      if (!wrote) {
        this.waitingDrain = true;
        this.callbacks.onBackpressure?.(next);
        this.publishState();
        return;
      }
      this.publishState();
    }
  }
}
