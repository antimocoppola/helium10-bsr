// Computes best-ever BSR metrics (and the 6-month segment file / YoY value) from a get_asin_bsr_history response.
//
// Usage: node best_bsr.mjs <input.json> <asin> <marketplace> [--bf] [--used-asin=<asin>]
//   <input.json> is either
//     - the raw tool-result file saved by the harness ({ data: { segments: [{start,end,bsr}] } }), or
//     - a compact file { "segments": [["YYYY-MM-DD", bsr], ...] } (each value holds until the next start)
//   Writes tmp/best/<asin>_<marketplace>.json ; with --bf also tmp/bf/<asin>_<marketplace>.json (2026-04-30..2026-10-30, "MM-DD" starts).
//
// Rules: segments with no bsr are ignored; a segment that holds the same rank for more than 14 days is treated as stale
// (e.g. inactive listing) and ignored, same rule as the dashboard chart.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const END = "2026-10-30";
const WIN = { y1: "2025-10-30", y2: "2024-10-30" };
const STALE_DAYS = 14;

const [input, asin, mp] = process.argv.slice(2).filter(a => !a.startsWith("--"));
const wantBf = process.argv.includes("--bf");
const usedAsin = (process.argv.find(a => a.startsWith("--used-asin=")) || "").split("=")[1] || asin;
if (!input || !asin || !mp) { console.error("usage: node best_bsr.mjs <input.json> <asin> <marketplace> [--bf]"); process.exit(1); }

const day = (iso) => Math.round(Date.parse(iso + "T00:00:00Z") / 86400000);
const iso = (d) => new Date(d * 86400000).toISOString().slice(0, 10);

const raw = JSON.parse(fs.readFileSync(input, "utf8"));
let segs; // [{s, e, bsr}] in day numbers, e exclusive
if (raw.data && Array.isArray(raw.data.segments)) {
  segs = raw.data.segments.map(x => ({ s: day(x.start), e: x.end ? day(x.end) : day(x.start), bsr: x.bsr ?? null }));
} else if (Array.isArray(raw.segments)) {
  segs = raw.segments.map(([d, b], i, a) => ({ s: day(d), e: i + 1 < a.length ? day(a[i + 1][0]) : day(END), bsr: b ?? null }));
} else { console.error("unrecognised input"); process.exit(1); }
// the API reports end == next start; a trailing segment may have e == s
segs.forEach((x, i) => { if (x.e <= x.s) x.e = i + 1 < segs.length ? segs[i + 1].s : x.s + 1; });

const out = { asin, marketplace: mp, used_asin: usedAsin, error: null };
if (!segs.length) { out.error = "nessun dato"; }
else {
  const valid = segs.filter(x => x.bsr != null && (x.e - x.s) <= STALE_DAYS);
  out.first = iso(segs.find(x => x.bsr != null)?.s ?? segs[0].s);
  out.last = iso(segs[segs.length - 1].s);
  out.n_segments = segs.length;
  const best = (fromISO) => {
    const from = fromISO ? day(fromISO) : -Infinity;
    let b = null;
    for (const x of valid) { if (x.e <= from) continue; if (!b || x.bsr < b.bsr) b = { bsr: x.bsr, date: iso(Math.max(x.s, from === -Infinity ? x.s : from)) }; }
    return b;
  };
  out.y1 = best(WIN.y1); out.y2 = best(WIN.y2); out.all = best(null);
  // YoY: rank in force on the same day one year before END
  const t = day(WIN.y1); const hit = segs.find(x => x.s <= t && t < Math.max(x.e, x.s + 1));
  out.yoy = hit && hit.bsr != null && (hit.e - hit.s) <= STALE_DAYS ? hit.bsr : null;
  out.window_start = iso(segs[0].s);
  if (wantBf) {
    const from = day("2026-04-30");
    const six = segs.filter(x => x.e > from).map(x => [iso(Math.max(x.s, from)).slice(5), x.bsr]);
    fs.mkdirSync(path.join(ROOT, "tmp", "bf"), { recursive: true });
    fs.writeFileSync(path.join(ROOT, "tmp", "bf", `${asin}_${mp}.json`), JSON.stringify({ asin, marketplace: mp, used_asin: usedAsin, segments: six, error: six.length ? null : "nessun dato" }));
  }
}
fs.mkdirSync(path.join(ROOT, "tmp", "best"), { recursive: true });
fs.writeFileSync(path.join(ROOT, "tmp", "best", `${asin}_${mp}.json`), JSON.stringify(out));
console.log(JSON.stringify(out));
