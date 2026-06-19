import type { StreamAggregateFrame, StreamEventFrame, StreamFrame } from "@geochannel/contracts";

export type Frame = StreamEventFrame;
export type AggregateFrame = StreamAggregateFrame;
export type AnyFrame = StreamFrame;

export type FeatureCollectionLike = {
  type: "FeatureCollection";
  features: any[];
};
