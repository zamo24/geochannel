export function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function coerceInt(input: unknown, fallback: number) {
  if (typeof input === "number" && Number.isInteger(input)) return input;
  if (typeof input === "string" && input.trim().length > 0) {
    const parsed = Number.parseInt(input, 10);
    if (Number.isInteger(parsed)) return parsed;
  }
  return fallback;
}
