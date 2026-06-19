import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

function parseIntEnv(name, fallback) {
  const parsed = Number.parseInt(process.env[name] ?? String(fallback), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseNumEnv(name, fallback) {
  const parsed = Number.parseFloat(process.env[name] ?? String(fallback));
  return Number.isFinite(parsed) ? parsed : fallback;
}

const cfg = {
  RUNS: Math.max(1, parseIntEnv("LIMIT_MULTI_RUNS", 3)),
  OUTPUT_FILE: (process.env.LIMIT_MULTI_OUTPUT_FILE ?? "").trim(),
  RUN_OUTPUT_DIR: (process.env.LIMIT_MULTI_RUN_OUTPUT_DIR ?? "").trim(),
  LIMITS_SCRIPT: (process.env.LIMIT_MULTI_LIMITS_SCRIPT ?? "scripts/metrics-limits.mjs").trim(),
  MIN_WORST_STABLE_STAGE: parseIntEnv("LIMIT_MULTI_MIN_WORST_STABLE_STAGE", 0),
  MIN_WORST_STABLE_INGEST: parseIntEnv("LIMIT_MULTI_MIN_WORST_STABLE_INGEST", 0),
  MIN_WORST_STABLE_CLIENTS: parseIntEnv("LIMIT_MULTI_MIN_WORST_STABLE_CLIENTS", 0),
  MAX_WORST_DROP_RATE: parseNumEnv("LIMIT_MULTI_MAX_WORST_DROP_RATE", 1)
};
const backendDir = resolve(fileURLToPath(new URL("..", import.meta.url)));

function stableWorseThan(a, b) {
  // lower stage, then ingest rate, then stream clients is worse
  if (a === null) return true;
  if (b === null) return false;
  if (a.stageNo !== b.stageNo) return a.stageNo < b.stageNo;
  if (a.ingestRatePerSec !== b.ingestRatePerSec) return a.ingestRatePerSec < b.ingestRatePerSec;
  return a.streamClients < b.streamClients;
}

function summarizeRun(report, runNo, file) {
  const stages = Array.isArray(report.stages) ? report.stages : [];
  const failedStages = stages.filter((stage) => !stage.passed);
  const worstDropRate = stages.reduce((acc, stage) => Math.max(acc, Number(stage?.stageStats?.dropRate ?? 0)), 0);
  const worstClientP95 = stages.reduce((acc, stage) => {
    const value = stage?.stageStats?.clientLatencyP95Ms;
    return Number.isFinite(value) ? Math.max(acc, value) : acc;
  }, 0);
  const worstClientP99 = stages.reduce((acc, stage) => {
    const value = stage?.stageStats?.clientLatencyP99Ms;
    return Number.isFinite(value) ? Math.max(acc, value) : acc;
  }, 0);
  return {
    runNo,
    file,
    channelId: report.channelId,
    stoppedReason: report.stoppedReason,
    stageCount: stages.length,
    bestStable: report.bestStable ?? null,
    recommendedCapacity: report.recommendedCapacity ?? null,
    firstFailedStageNo: failedStages[0]?.stageNo ?? null,
    worstDropRate,
    worstClientP95Ms: worstClientP95 > 0 ? worstClientP95 : null,
    worstClientP99Ms: worstClientP99 > 0 ? worstClientP99 : null
  };
}

function runLimitsOnce(runNo, outFile) {
  return new Promise((resolveRun, rejectRun) => {
    const env = {
      ...process.env,
      LIMIT_OUTPUT_FILE: outFile
    };
    const child = spawn(process.execPath, [cfg.LIMITS_SCRIPT], {
      cwd: backendDir,
      env,
      stdio: "inherit"
    });
    child.on("error", rejectRun);
    child.on("exit", (code) => {
      if (code === 0) resolveRun();
      else rejectRun(new Error(`limits run ${runNo} failed with exit code ${code}`));
    });
  });
}

async function main() {
  const runDir = cfg.RUN_OUTPUT_DIR
    ? resolve(cfg.RUN_OUTPUT_DIR)
    : await mkdtemp(join(tmpdir(), "metrics-limits-multi-"));
  if (cfg.RUN_OUTPUT_DIR) {
    await mkdir(runDir, { recursive: true });
  }
  const timestamp = new Date().toISOString().replaceAll(":", "-");
  const runs = [];

  console.log("[limits:multi] runs", cfg.RUNS);
  console.log("[limits:multi] run output dir", runDir);

  for (let i = 0; i < cfg.RUNS; i += 1) {
    const runNo = i + 1;
    const outFile = join(runDir, `metrics-limits-run-${timestamp}-${runNo}.json`);
    console.log(`\n[limits:multi] run ${runNo}/${cfg.RUNS} start -> ${outFile}`);
    await runLimitsOnce(runNo, outFile);
    const report = JSON.parse(await readFile(outFile, "utf8"));
    const summary = summarizeRun(report, runNo, outFile);
    runs.push(summary);
    console.log(
      `[limits:multi] run ${runNo} bestStable=` +
        `${summary.bestStable ? `stage ${summary.bestStable.stageNo} @ ${summary.bestStable.ingestRatePerSec}/s ${summary.bestStable.streamClients}c` : "none"} ` +
        `worstDrop=${(summary.worstDropRate * 100).toFixed(2)}%`
    );
  }

  let worstStable = null;
  for (const run of runs) {
    const stable = run.bestStable ?? null;
    if (worstStable === null || stableWorseThan(stable, worstStable)) {
      worstStable = stable;
    }
  }

  const worstObserved = {
    dropRate: runs.reduce((acc, run) => Math.max(acc, run.worstDropRate), 0),
    clientP95Ms: runs.reduce((acc, run) => Math.max(acc, Number(run.worstClientP95Ms ?? 0)), 0),
    clientP99Ms: runs.reduce((acc, run) => Math.max(acc, Number(run.worstClientP99Ms ?? 0)), 0)
  };

  const summary = {
    generatedAt: new Date().toISOString(),
    config: {
      runs: cfg.RUNS,
      limitsScript: cfg.LIMITS_SCRIPT,
      runOutputDir: runDir
    },
    worstStable,
    worstObserved,
    runs
  };

  const outputFile = cfg.OUTPUT_FILE ? resolve(cfg.OUTPUT_FILE) : join(runDir, "metrics-limits-multi-summary.json");
  await writeFile(outputFile, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  console.log("\n[limits:multi] summary");
  console.log(JSON.stringify(summary, null, 2));
  console.log("[limits:multi] wrote summary:", outputFile);

  const failures = [];
  if (!worstStable) {
    failures.push("no stable stage found in any run");
  } else {
    if (cfg.MIN_WORST_STABLE_STAGE > 0 && worstStable.stageNo < cfg.MIN_WORST_STABLE_STAGE) {
      failures.push(`worst stable stage ${worstStable.stageNo} < required ${cfg.MIN_WORST_STABLE_STAGE}`);
    }
    if (cfg.MIN_WORST_STABLE_INGEST > 0 && worstStable.ingestRatePerSec < cfg.MIN_WORST_STABLE_INGEST) {
      failures.push(
        `worst stable ingest ${worstStable.ingestRatePerSec}/s < required ${cfg.MIN_WORST_STABLE_INGEST}/s`
      );
    }
    if (cfg.MIN_WORST_STABLE_CLIENTS > 0 && worstStable.streamClients < cfg.MIN_WORST_STABLE_CLIENTS) {
      failures.push(`worst stable clients ${worstStable.streamClients} < required ${cfg.MIN_WORST_STABLE_CLIENTS}`);
    }
  }
  if (cfg.MAX_WORST_DROP_RATE >= 0 && worstObserved.dropRate > cfg.MAX_WORST_DROP_RATE) {
    failures.push(
      `worst drop rate ${(worstObserved.dropRate * 100).toFixed(2)}% > allowed ${(cfg.MAX_WORST_DROP_RATE * 100).toFixed(2)}%`
    );
  }

  if (failures.length > 0) {
    console.error("[limits:multi] gate failed:", failures.join("; "));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("[limits:multi] fatal", err);
  process.exit(1);
});
