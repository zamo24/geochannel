import type { IngestResponsePayload } from "@geochannel/contracts";

export type { IngestEvent, IngestResponsePayload, StreamTokenPayload } from "@geochannel/contracts";

export type IngestIdempotencyRecord =
  | {
      state: "pending";
      payloadHash: string;
      createdAt: string;
    }
  | {
      state: "completed";
      payloadHash: string;
      createdAt: string;
      response: {
        accepted: number;
        rejected: number;
        tenantId?: string;
        errors?: Array<{ index: number; reason: string }>;
      };
    };

export type ChannelRecord = {
  id: string;
  tiles: string[];
  res: number;
  aoiRes?: number;
  createdAt: string;
  ttlSec: number;
  tenantId: string;
  mode?: string;
};
