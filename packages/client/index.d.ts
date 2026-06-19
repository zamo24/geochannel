export type ApiUrl = (path: string) => string;

export type ChannelRequestBody = {
  tiles?: string[];
  polygon?: unknown;
  res: number;
  tenantId?: string;
};

export type ChannelResponse = {
  channelId: string;
  tenantId?: string;
};

export type StreamTokenRequestBody = {
  channelId: string;
  tenantId?: string;
  ttlSec?: number;
};

export type ChannelStreamOptions = {
  channelId: string;
  offset: string;
  cursorId?: string;
  headers?: Record<string, string>;
  onOpen?: () => void;
  onReady?: (payload: unknown) => void;
  onError?: (err: unknown) => void;
  onMessage?: (frame: unknown) => void;
};

export declare class ChannelClientError extends Error {
  readonly status?: number;
  readonly responseText?: string;
  readonly code?: string;
  constructor(message: string, options?: { status?: number; responseText?: string; code?: string });
}

export declare function createChannel(params: {
  apiUrl: ApiUrl;
  body: ChannelRequestBody;
  headers: Record<string, string>;
  signal: AbortSignal;
}): Promise<ChannelResponse>;

export declare function mintStreamToken(params: {
  apiUrl: ApiUrl;
  body: StreamTokenRequestBody;
  headers: Record<string, string>;
  signal: AbortSignal;
}): Promise<string>;

export declare function subscribeChannelStream(
  apiUrl: ApiUrl,
  options: ChannelStreamOptions
): { close: () => void };
