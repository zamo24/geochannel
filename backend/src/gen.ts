const env = {
  GEN_URL: process.env.GEN_URL ?? "http://localhost:8081/ingest/events",
  GEN_RATE_MS: Number.parseInt(process.env.GEN_RATE_MS ?? "1000", 10),
  GEN_BATCH: Number.parseInt(process.env.GEN_BATCH ?? "25", 10),
  GEN_ASSETS: Number.parseInt(process.env.GEN_ASSETS ?? "200", 10),
  GEN_CENTER_LON: Number.parseFloat(process.env.GEN_CENTER_LON ?? "-73.9857"),
  GEN_CENTER_LAT: Number.parseFloat(process.env.GEN_CENTER_LAT ?? "40.7484"),
  GEN_SPREAD_DEG: Number.parseFloat(process.env.GEN_SPREAD_DEG ?? "0.02")
};

type GenEvent = {
  id: string;
  ts: string;
  loc: [number, number];
  attrs: Record<string, unknown>;
};

function randInRange(center: number, spread: number) {
  return center + (Math.random() * 2 - 1) * spread;
}

function buildAssets(count: number) {
  return Array.from({ length: count }, (_, i) => `asset-${i + 1}`);
}

const assets = buildAssets(env.GEN_ASSETS);

function buildBatch(batchSize: number): GenEvent[] {
  const events: GenEvent[] = [];
  for (let i = 0; i < batchSize; i += 1) {
    const id = assets[Math.floor(Math.random() * assets.length)];
    const lon = randInRange(env.GEN_CENTER_LON, env.GEN_SPREAD_DEG);
    const lat = randInRange(env.GEN_CENTER_LAT, env.GEN_SPREAD_DEG);
    events.push({
      id,
      ts: new Date().toISOString(),
      loc: [lon, lat],
      attrs: {
        speed: Math.round(Math.random() * 80),
        heading: Math.round(Math.random() * 360)
      }
    });
  }
  return events;
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendBatch(batch: GenEvent[]) {
  const res = await fetch(env.GEN_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(batch)
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("[gen] error", res.status, text);
    return;
  }

  const payload = (await res.json()) as { accepted?: number };
  console.log("[gen] sent", batch.length, "accepted:", payload.accepted ?? "?");
}

async function main() {
  console.log("[gen] target", env.GEN_URL);
  console.log("[gen] batch", env.GEN_BATCH, "rate(ms)", env.GEN_RATE_MS);
  while (true) {
    const batch = buildBatch(env.GEN_BATCH);
    await sendBatch(batch);
    await sleep(env.GEN_RATE_MS);
  }
}

main().catch((err) => {
  console.error("[gen] fatal", err);
  process.exit(1);
});
