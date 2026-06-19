import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const args = process.argv.slice(2);
const targetArg = args.find((arg) => arg.startsWith("--target="));
const target = targetArg ? targetArg.slice("--target=".length) : "all";

const checks = [];

if (target === "all" || target === "backend") {
  checks.push({
    name: "backend",
    root: path.join(repoRoot, "backend", "src"),
    disallow: ["web/"]
  });
}

if (target === "all" || target === "web") {
  checks.push({
    name: "web",
    root: path.join(repoRoot, "web", "src"),
    disallow: ["backend/"]
  });
}

if (checks.length === 0) {
  console.error(`Unknown target "${target}". Use --target=backend|web|all.`);
  process.exit(1);
}

const failures = [];
const MAX_FILE_LINES = 450;

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(full));
      continue;
    }
    if (!entry.isFile()) continue;
    if (!/\.(ts|tsx|js|mjs|cjs)$/.test(entry.name)) continue;
    out.push(full);
  }
  return out;
}

function normalizeImportPath(spec) {
  if (!spec.startsWith(".")) return spec;
  return spec.replaceAll("\\", "/");
}

for (const check of checks) {
  const files = walk(check.root);
  for (const file of files) {
    const rel = path.relative(repoRoot, file).replaceAll("\\", "/");
    const text = fs.readFileSync(file, "utf8");
    const lines = text.split("\n").length;
    if (lines > MAX_FILE_LINES) {
      failures.push(`${rel}: exceeds ${MAX_FILE_LINES} lines (${lines})`);
    }

    const matches = text.matchAll(/from\s+["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g);
    for (const match of matches) {
      const spec = match[1] ?? match[2];
      if (!spec) continue;
      if (spec === "@geochannel/contracts") continue;

      const normalized = normalizeImportPath(spec);
      for (const blocked of check.disallow) {
        if (normalized.includes(blocked)) {
          failures.push(`${rel}: imports disallowed module path "${spec}"`);
        }
      }
    }
  }
}

if (failures.length > 0) {
  console.error("Structure checks failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Structure checks passed.");
