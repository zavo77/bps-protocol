// TASK 10B-8A item 2 — price-collection step.
// * decimal price strings -> micro-USD via STRING/BigInt arithmetic only (no float)
// * records requestedAt AND respondedAt separately per source
// * live mode (--live): mode="live", live=true, and capturedAt + EVERY observation <= 300s old
// * fails on stale, malformed or mismatched data
import { writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

const LIVE = process.argv.includes("--live");
const MODE = LIVE ? "live" : "historical-fixture";
const MAX_AGE_SECONDS = 300;
const sha256 = (s) => "0x" + createHash("sha256").update(s).digest("hex");

// decimal string -> micro-USD BigInt, string arithmetic only (truncates beyond 6dp; no Number)
function toMicroUsd(dec) {
  const s = String(dec).trim();
  if (!/^\d+(\.\d+)?$/.test(s)) throw new Error(`malformed price string: ${dec}`);
  const [intPart, fracRaw = ""] = s.split(".");
  const frac = (fracRaw + "000000").slice(0, 6);         // pad/truncate to exactly 6 decimals
  return BigInt(intPart) * 1_000_000n + BigInt(frac);
}

const SRC = [
  { name: "coinbase", endpoint: "https://api.coinbase.com/v2/prices/ETH-USD/spot", parse: (j) => j.data.amount },
  { name: "kraken", endpoint: "https://api.kraken.com/0/public/Ticker?pair=ETHUSD", parse: (j) => Object.values(j.result)[0].c[0] },
];

const sources = [];
for (const s of SRC) {
  const requestedAt = new Date().toISOString();
  const r = await fetch(s.endpoint);
  const raw = await r.text();
  const respondedAt = new Date().toISOString();
  if (r.status !== 200) throw new Error(`${s.name} HTTP ${r.status}`);
  let priceUsd; try { priceUsd = s.parse(JSON.parse(raw)); } catch (e) { throw new Error(`${s.name} malformed response: ${e.message}`); }
  const microUsd = toMicroUsd(priceUsd).toString();      // throws on malformed
  sources.push({ name: s.name, endpoint: s.endpoint, priceUsd: String(priceUsd), microUsd, requestedAt, respondedAt, rawResponse: raw, rawResponseSha256: sha256(raw) });
}

if (new Set(sources.map(s => s.name)).size < 2) throw new Error("require two DISTINCT sources");
const capturedAt = new Date().toISOString();
const ageSec = (iso) => (Date.parse(capturedAt) - Date.parse(iso)) / 1000;

if (LIVE) {
  for (const s of sources) {
    const age = (Date.now() - Date.parse(s.respondedAt)) / 1000;
    if (!(age <= MAX_AGE_SECONDS)) throw new Error(`${s.name} observation stale: ${age}s > ${MAX_AGE_SECONDS}s`);
  }
  const capAge = (Date.now() - Date.parse(capturedAt)) / 1000;
  if (!(capAge <= MAX_AGE_SECONDS)) throw new Error(`capturedAt stale: ${capAge}s`);
}

const microMax = sources.reduce((m, s) => BigInt(s.microUsd) > m ? BigInt(s.microUsd) : m, 0n);
const selected = sources.find(s => BigInt(s.microUsd) === microMax);

const snap = {
  asset: "ETH/USD",
  kind: "collected price snapshot (fixed-point micro-USD via string/BigInt; raw responses + sha256; separate request/response timestamps)",
  mode: MODE, live: LIVE, executable: false,
  capturedAt,
  freshnessRuleSeconds: MAX_AGE_SECONDS,
  observationAgesAtCaptureSeconds: Object.fromEntries(sources.map(s => [s.name, ageSec(s.respondedAt)])),
  sources,
  selectionRule: "higher of the two independent sources",
  selected: { source: selected.name, microUsd: selected.microUsd },
};
writeFileSync(new URL("./price-snapshot.json", import.meta.url), JSON.stringify(snap, null, 2));
console.log("collected:", sources.map(s => `${s.name}=${s.priceUsd}(${s.microUsd})`).join(" "), "-> selected", selected.name, selected.microUsd, "| mode", MODE);
