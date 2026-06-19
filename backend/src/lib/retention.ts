export function buildStreamTrimArgs(retentionMs: number, maxLen: number, nowMs: number) {
  if (Number.isFinite(retentionMs) && retentionMs > 0) {
    const minIdMs = Math.max(0, Math.floor(nowMs - retentionMs));
    return ["MINID", "~", `${minIdMs}-0`] as const;
  }
  return ["MAXLEN", "~", Math.max(1, Math.floor(maxLen)).toString()] as const;
}
