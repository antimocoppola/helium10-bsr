// Appends one day's BSR snapshot into database/bsr_history.json.
//
// Usage: node append_snapshot.mjs <path-to-snapshot-input.json> [YYYY-MM-DD]
//
// The input file must be shaped like:
// {
//   "date": "2026-09-02",              // optional; overridden by CLI arg 2 if given; defaults to today (local) otherwise
//   "results": [
//     {
//       "family": "KCB",
//       "marketplace": "IT",
//       "main_asin": "B07G84LSYJ",
//       "error": null,                  // set to a string if the whole combo failed (e.g. "H10 INVALID_ASIN_FOR_MARKETPLACE")
//       "main_asin_sales_data": { "sales_rank":181, "price":54.99, "review_count":22038, "reviews_rating":4.5, "monthly_revenue":110846, "monthly_sales":2038 },
//       "searched_products_avg": { "sales_rank":117, "price":41, "review_count":10516, "reviews_rating":4.6, "monthly_revenue":155108, "monthly_sales":5160 }, // optional group-average row
//       "competitors": {                // optional map of competitorAsin -> sales_data (same shape as main_asin_sales_data)
//         "B08MXSBRSB": { "sales_rank":2, "price":42.9, "review_count":35822, "reviews_rating":4.8, "monthly_revenue":419080, "monthly_sales":14425 },
//         ...
//       }
//     },
//     ...
//   ]
// }
//
// Re-running with the same date overwrites that date's rows (dedup by date), so it's always safe to re-run.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_DIR = path.join(__dirname, "..");
const DB_FILE = path.join(PROJECT_DIR, "database", "bsr_history.json");

function loadDB() {
  if (!fs.existsSync(DB_FILE)) return { rows: [], last_updated: null };
  return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
}
function saveDB(db) {
  db.last_updated = new Date().toISOString();
  const dir = path.dirname(DB_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(DB_FILE, JSON.stringify(db));
}
function num(v) {
  if (v === null || v === undefined) return null;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

function main() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    console.error("Usage: node append_snapshot.mjs <path-to-snapshot-input.json> [YYYY-MM-DD]");
    process.exit(1);
  }
  const input = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  const date = process.argv[3] || input.date || new Date().toISOString().slice(0, 10);

  const db = loadDB();
  // Drop any existing rows for this date (dedup-by-overwrite), then append fresh ones.
  db.rows = (db.rows || []).filter((r) => r.date !== date);

  let addedRows = 0;
  const failedCombos = [];
  const okCombos = [];

  for (const r of input.results || []) {
    const { family, marketplace, main_asin } = r;
    if (r.error) {
      failedCombos.push(`${family}/${marketplace}: ${r.error}`);
      continue;
    }
    const main = r.main_asin_sales_data;
    if (!main || main.sales_rank === null || main.sales_rank === undefined) {
      failedCombos.push(`${family}/${marketplace}: no usable data (main_asin_sales_data null)`);
      continue;
    }
    okCombos.push(`${family}/${marketplace}`);

    db.rows.push({
      date, family, marketplace, asin: main_asin, role: "mine",
      bsr: num(main.sales_rank), price: num(main.price), review_count: num(main.review_count),
      rating: num(main.reviews_rating), sales: num(main.monthly_sales), revenue: num(main.monthly_revenue),
    });
    addedRows++;

    for (const [asin, c] of Object.entries(r.competitors || {})) {
      if (!c || c.sales_rank === null || c.sales_rank === undefined) continue;
      db.rows.push({
        date, family, marketplace, asin, role: "competitor",
        bsr: num(c.sales_rank), price: num(c.price), review_count: num(c.review_count),
        rating: num(c.reviews_rating), sales: num(c.monthly_sales), revenue: num(c.monthly_revenue),
      });
      addedRows++;
    }

    if (r.searched_products_avg) {
      const g = r.searched_products_avg;
      db.rows.push({
        date, family, marketplace, asin: null, role: "group_avg",
        bsr: num(g.sales_rank), price: num(g.price), review_count: num(g.review_count),
        rating: num(g.reviews_rating), sales: num(g.monthly_sales), revenue: num(g.monthly_revenue),
      });
      addedRows++;
    }
  }

  saveDB(db);

  console.log(`Date: ${date}`);
  console.log(`OK combos (${okCombos.length}): ${okCombos.join(", ")}`);
  console.log(`Failed combos (${failedCombos.length}): ${failedCombos.join(" | ")}`);
  console.log(`Rows added: ${addedRows}`);
  console.log(`Total rows in DB: ${db.rows.length}`);
  console.log(`Distinct dates in DB: ${new Set(db.rows.map((r) => r.date)).size}`);
}

main();
