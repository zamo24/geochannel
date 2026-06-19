export type RedisPipelineResult = [error: Error | null, result: unknown][] | null;

export function assertRedisPipelineSucceeded(results: RedisPipelineResult, operation: string) {
  if (results === null) {
    throw new Error(`${operation} returned no Redis pipeline results.`);
  }

  const failures = results
    .map(([error], index) => (error ? { index, error } : null))
    .filter((failure): failure is { index: number; error: Error } => failure !== null);
  if (failures.length === 0) return;

  throw new AggregateError(
    failures.map((failure) => failure.error),
    `${operation} failed for ${failures.length} Redis pipeline command(s).`
  );
}
