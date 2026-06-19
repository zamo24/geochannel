import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = path.join(webRoot, "dist");
const assetsDir = path.join(distDir, "assets");

function readBudget(name, fallback) {
  const value = Number.parseInt(process.env[name] ?? fallback, 10);
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be a positive integer.`);
  return value;
}

const maxInitialJsBytes = readBudget("MAX_INITIAL_JS_BYTES", "300000");
const maxJsChunkBytes = readBudget("MAX_JS_CHUNK_BYTES", "1100000");

function formatBytes(bytes) {
  return `${(bytes / 1024).toFixed(1)} KiB`;
}

if (!fs.existsSync(path.join(distDir, "index.html"))) {
  throw new Error("web/dist/index.html is missing. Run the web build first.");
}

const html = fs.readFileSync(path.join(distDir, "index.html"), "utf8");
const initialAssets = new Set(
  Array.from(html.matchAll(/(?:src|href)="\/?(assets\/[^"]+\.js)"/g), (match) => match[1])
);
const jsChunks = fs
  .readdirSync(assetsDir)
  .filter((file) => file.endsWith(".js"))
  .map((file) => ({
    file,
    bytes: fs.statSync(path.join(assetsDir, file)).size
  }))
  .sort((a, b) => b.bytes - a.bytes);
const initialJsBytes = Array.from(initialAssets).reduce(
  (total, asset) => total + fs.statSync(path.join(distDir, asset)).size,
  0
);
const failures = [];

if (initialJsBytes > maxInitialJsBytes) {
  failures.push(`initial JavaScript is ${formatBytes(initialJsBytes)}; limit is ${formatBytes(maxInitialJsBytes)}`);
}
for (const chunk of jsChunks) {
  if (chunk.bytes > maxJsChunkBytes) {
    failures.push(`${chunk.file} is ${formatBytes(chunk.bytes)}; chunk limit is ${formatBytes(maxJsChunkBytes)}`);
  }
}

console.log(`Initial JavaScript: ${formatBytes(initialJsBytes)} across ${initialAssets.size} asset(s).`);
for (const chunk of jsChunks) console.log(`Chunk ${chunk.file}: ${formatBytes(chunk.bytes)}.`);

if (failures.length > 0) {
  throw new Error(`Web bundle limits exceeded:\n- ${failures.join("\n- ")}`);
}
