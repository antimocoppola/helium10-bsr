// Merge a historical gap fill (tmp/gap2/out_*.json from get_asin_bsr_history) into database/bsr_series.json.
// Input value per "ASIN|MP": [["MM-DD", bsr], ...] = segment starts; a rank holds until the next start, the last one until END.
// Only fills days that have no value yet (daily snapshots win). Prints a sanity report against the existing points.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const P = (...a) => path.join(ROOT, ...a);
const YEAR = "2026", END = "2026-11-22";
const storeFile = P("database", "bsr_series.json");
const store = JSON.parse(fs.readFileSync(storeFile, "utf8"));
const dir = P("tmp", "gap2");
const day = (iso) => new Date(iso + "T00:00:00Z");
const fmt = (d) => d.toISOString().slice(0, 10);

let keys = 0, empty = 0, errors = [], filled = 0, suspicious = [], notInStore = [], dup = 0;
const seen = new Set();
for (const f of fs.readdirSync(dir).filter((x) => /^out_.*\.json$/.test(x))) {
  const o = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
  for (const [key, segs] of Object.entries(o)) {
    if (seen.has(key)) dup++;
    seen.add(key);
    keys++;
    if (typeof segs === "string") { errors.push(`${key} ${segs}`); continue; }
    if (!segs.length) { empty++; continue; }
    const s = store.series[key];
    if (!s) { notInStore.push(key); continue; }
    const sorted = segs.map(([d, v]) => [`${YEAR}-${d}`, v]).sort((a, b) => a[0].localeCompare(b[0]));
    // expand
    const exp = {};
    for (let i = 0; i < sorted.length; i++) {
      const from = day(sorted[i][0]);
      const to = i + 1 < sorted.length ? day(sorted[i + 1][0]) : new Date(day(END).getTime() + 86400000);
      const span = Math.round((to - from) / 86400000);
      for (let t = from, n = 0; t < to; t = new Date(t.getTime() + 86400000), n++) {
        if (fmt(t) > END) break;
        exp[fmt(t)] = span > 14 && n >= 7 ? null : sorted[i][1];
      }
    }
    // sanity: compare with snapshot points already stored (Nov 2, 6, 23) – history may be shifted by a day, accept 3x
    for (const d of ["2026-11-02", "2026-11-06"]) {
      const a = s[d], b = exp[d];
      if (a != null && b != null && (a / b > 3 || b / a > 3)) suspicious.push(`${key} ${d} snapshot ${a} vs storico ${b}`);
    }
    const last = exp[END], snap = s["2026-11-23"];
    if (snap != null && last != null && (snap / last > 4 || last / snap > 4)) suspicious.push(`${key} 22/11 storico ${last} vs 23/11 ${snap}`);
    for (const [d, v] of Object.entries(exp)) {
      if (v == null) continue;
      if (s[d] === undefined || s[d] === null) { s[d] = v; filled++; }
      const b = store.best && store.best[key];
      if (b) for (const w of ["y1", "y2", "all"]) if (b[w] && v < b[w].bsr) b[w] = { bsr: v, date: d };
    }
  }
}
fs.writeFileSync(storeFile, JSON.stringify(store));
console.log(`chiavi ${keys} (duplicate ${dup}) | vuote ${empty} | errori ${errors.length} | non in store ${notInStore.length} | giorni riempiti ${filled}`);
if (errors.length) console.log("ERRORI:", errors.join("; "));
if (notInStore.length) console.log("NON IN STORE:", notInStore.join(","));
console.log("SOSPETTI (" + suspicious.length + "):", suspicious.join("\n  "));
