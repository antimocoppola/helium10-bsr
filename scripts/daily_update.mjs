// Daily BSR refresh (cheap): ONE search_products call per marketplace returns the current BSR of every tracked ASIN.
//
//   node scripts/daily_update.mjs --list            prints {marketplace: [asin,...]} for the 6 search_products calls
//   node scripts/daily_update.mjs <YYYY-MM-DD>      reads tmp/daily/<MP>.json ([[asin, sales_rank, index_updated_at], ...])
//                                                    and appends the day to database/bsr_series.json (+ best-BSR metrics)
// Then run build_bsr_charts.mjs and republish the artifact.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const P = (...a) => path.join(ROOT, ...a);
const storeFile = P("database", "bsr_series.json");
const store = JSON.parse(fs.readFileSync(storeFile, "utf8"));
const MPS = ["IT", "FR", "DE", "ES", "UK", "US"];

if (process.argv[2] === "--list") {
  const by = {};
  for (const k of Object.keys(store.series)) {
    const [a, m] = k.split("|");
    (by[m] = by[m] || []).push(a);
  }
  console.log(JSON.stringify(by));
  process.exit(0);
}

const date = process.argv[2];
if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "")) { console.error("usage: daily_update.mjs --list | <YYYY-MM-DD>"); process.exit(1); }
const dateMs = Date.parse(date + "T00:00:00Z");
let added = 0, stale = 0, missing = 0, jumps = [];
const summary = {};
for (const mp of MPS) {
  const f = P("tmp", "daily", `${mp}.json`);
  if (!fs.existsSync(f)) { summary[mp] = "file mancante"; continue; }
  const rows = JSON.parse(fs.readFileSync(f, "utf8"));
  const got = new Set();
  let n = 0;
  for (const [asin, rank, upd] of rows) {
    const key = `${asin}|${mp}`;
    if (!store.series[key] || rank == null) continue;
    got.add(asin);
    // rank not refreshed by Amazon/Helium10 for more than 14 days = stale, leave the day empty
    if (upd && (dateMs / 1000 - upd) > 14 * 86400) { stale++; continue; }
    const s = store.series[key];
    const prev = Object.keys(s).filter((d) => d < date && s[d] != null).sort().pop();
    if (prev && (rank / s[prev] > 5 || s[prev] / rank > 5)) jumps.push(`${key} ${s[prev]}→${rank}`);
    s[date] = rank;
    n++;
    // keep best-BSR metrics current
    const b = store.best && store.best[key];
    if (b) for (const w of ["y1", "y2", "all"]) if (b[w] && rank < b[w].bsr) b[w] = { bsr: rank, date };
  }
  const tracked = Object.keys(store.series).filter((k) => k.endsWith("|" + mp)).length;
  missing += tracked - got.size;
  added += n;
  summary[mp] = `${n}/${tracked}`;
}
fs.writeFileSync(storeFile, JSON.stringify(store));
console.log("daily", date, "aggiunti", added, "| per mercato", JSON.stringify(summary), "| stale", stale, "| ASIN senza dato oggi", missing);
if (jumps.length) console.log("ATTENZIONE salti >5x rispetto all'ultimo dato:", jumps.join("; "));
