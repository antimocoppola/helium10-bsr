// One-off helper: consolidates the per-family tmp/overview_<FAMILY>.json files
// (each shaped {marketplace: {data:{...}, error} | {error:"..."}}) plus
// config/competitors.json into the single snapshot-input.json blob that
// append_snapshot.mjs expects. This was used for the initial historical
// backfill collected via parallel sub-agents; the daily scheduled task
// builds the snapshot-input blob directly instead (see the scheduled task's
// SKILL.md), so this script does not need to run daily.
//
// Usage: node build_snapshot_input.mjs > ../tmp/snapshot_input.json
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_DIR = path.join(__dirname, "..");
const CONFIG = JSON.parse(fs.readFileSync(path.join(PROJECT_DIR, "config", "competitors.json"), "utf8"));
const TMP_DIR = path.join(PROJECT_DIR, "tmp");

const results = [];

for (const [family, fam] of Object.entries(CONFIG.families)) {
  const file = path.join(TMP_DIR, `overview_${family}.json`);
  if (!fs.existsSync(file)) {
    console.error(`WARNING: missing ${file}, skipping family ${family}`);
    continue;
  }
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  for (const marketplace of fam.marketplaces) {
    const mainAsin = (fam.asin_overrides && fam.asin_overrides[marketplace]) || fam.asin;
    const entry = raw[marketplace];
    if (!entry) {
      results.push({ family, marketplace, main_asin: mainAsin, error: "not attempted (missing from overview file)" });
      continue;
    }
    if (entry.error) {
      results.push({ family, marketplace, main_asin: mainAsin, error: typeof entry.error === "string" ? entry.error : "H10 error" });
      continue;
    }
    if (entry.FAILED_NO_DATA) {
      results.push({ family, marketplace, main_asin: mainAsin, error: "no usable data (all null)" });
      continue;
    }
    const data = entry.data || {};
    const asinMap = data.asin_sales_data || {};
    const competitors = {};
    for (const [asin, obj] of Object.entries(asinMap)) {
      if (asin === mainAsin) continue;
      if (obj && obj.sales_data) competitors[asin] = obj.sales_data;
    }
    results.push({
      family, marketplace, main_asin: mainAsin, error: null,
      main_asin_sales_data: data.main_asin_sales_data || (asinMap[mainAsin] && asinMap[mainAsin].sales_data) || null,
      searched_products_avg: data.searched_products_avg || null,
      competitors,
    });
  }
}

const out = { date: new Date().toISOString().slice(0, 10), results };
process.stdout.write(JSON.stringify(out));
console.error(`\nBuilt snapshot input: ${results.length} combos (${results.filter(r=>!r.error).length} ok, ${results.filter(r=>r.error).length} failed)`);
