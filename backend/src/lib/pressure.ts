export type StreamConnectionState = {
  pendingFrames: number;
  pendingBytes: number;
  waitingDrain: boolean;
};

export type StreamPressureSnapshot = {
  subscribersCurrent: number;
  waitingSubscribers: number;
  pendingFrames: number;
  pendingBytes: number;
};

type ConnectionEntry = StreamConnectionState & { id: number };

function clampNonNegativeInt(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}
export class StreamPressureRegistry {
  private nextConnectionId = 1;
  private readonly connections = new Map<number, ConnectionEntry>();
  private subscribersCurrent = 0;
  private waitingSubscribers = 0;
  private pendingFrames = 0;
  private pendingBytes = 0;

  registerConnection() {
    const id = this.nextConnectionId++;
    const entry: ConnectionEntry = {
      id,
      pendingFrames: 0,
      pendingBytes: 0,
      waitingDrain: false
    };
    this.connections.set(id, entry);
    this.subscribersCurrent += 1;
    return id;
  }

  updateConnection(id: number, nextState: StreamConnectionState) {
    const entry = this.connections.get(id);
    if (!entry) return;

    const pendingFrames = clampNonNegativeInt(nextState.pendingFrames);
    const pendingBytes = clampNonNegativeInt(nextState.pendingBytes);
    const waitingDrain = Boolean(nextState.waitingDrain);

    this.pendingFrames += pendingFrames - entry.pendingFrames;
    this.pendingBytes += pendingBytes - entry.pendingBytes;
    if (entry.waitingDrain !== waitingDrain) {
      this.waitingSubscribers += waitingDrain ? 1 : -1;
    }

    entry.pendingFrames = pendingFrames;
    entry.pendingBytes = pendingBytes;
    entry.waitingDrain = waitingDrain;

    if (this.waitingSubscribers < 0) this.waitingSubscribers = 0;
    if (this.pendingFrames < 0) this.pendingFrames = 0;
    if (this.pendingBytes < 0) this.pendingBytes = 0;
  }

  unregisterConnection(id: number) {
    const entry = this.connections.get(id);
    if (!entry) return;
    this.connections.delete(id);

    this.subscribersCurrent = Math.max(0, this.subscribersCurrent - 1);
    if (entry.waitingDrain) {
      this.waitingSubscribers = Math.max(0, this.waitingSubscribers - 1);
    }
    this.pendingFrames = Math.max(0, this.pendingFrames - entry.pendingFrames);
    this.pendingBytes = Math.max(0, this.pendingBytes - entry.pendingBytes);
  }

  snapshot(): StreamPressureSnapshot {
    return {
      subscribersCurrent: this.subscribersCurrent,
      waitingSubscribers: this.waitingSubscribers,
      pendingFrames: this.pendingFrames,
      pendingBytes: this.pendingBytes
    };
  }
}
