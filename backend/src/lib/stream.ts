export function streamTileKey(tenantId: string, tile: string) {
  return `stream:tenant:${tenantId}:tile:${tile}`;
}

export function tileFromStreamKey(key: string) {
  const marker = ":tile:";
  const idx = key.lastIndexOf(marker);
  if (idx < 0) return key;
  return key.slice(idx + marker.length);
}

export function buildEntry(fields: string[]) {
  const obj: Record<string, string> = {};
  for (let i = 0; i < fields.length; i += 2) {
    obj[fields[i]] = fields[i + 1];
  }
  return obj;
}
