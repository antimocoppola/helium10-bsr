import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_DIR = path.join(__dirname, "..");

function main() {
  const config = JSON.parse(fs.readFileSync(path.join(PROJECT_DIR, "config", "competitors.json"), "utf8"));
  const dbPath = path.join(PROJECT_DIR, "database", "bsr_history.json");
  const db = fs.existsSync(dbPath) ? JSON.parse(fs.readFileSync(dbPath, "utf8")) : { rows: [] };

  const familyOrder = Object.keys(config.families);
  const familyNames = {};
  const familyMarketplaces = {};
  for (const [fam, f] of Object.entries(config.families)) {
    familyNames[fam] = f.name;
    familyMarketplaces[fam] = f.marketplaces;
  }

  // compact rows: [date, family, marketplace, asin, role, bsr, price, review_count, rating, sales, revenue]
  const rows = db.rows.map((r) => [r.date, r.family, r.marketplace, r.asin, r.role, r.bsr, r.price, r.review_count, r.rating, r.sales, r.revenue]);

  let minDate = null, maxDate = null;
  for (const r of db.rows) {
    if (!r.date) continue;
    if (!minDate || r.date < minDate) minDate = r.date;
    if (!maxDate || r.date > maxDate) maxDate = r.date;
  }

  const dataset = {
    generatedAt: new Date().toISOString(),
    minDate, maxDate,
    familyOrder, familyNames, familyMarketplaces,
    rows,
  };

  const template = fs.readFileSync(path.join(__dirname, "dashboard_template.html"), "utf8");
  const out = template.replace("__DATA_PLACEHOLDER__", JSON.stringify(dataset));

  const distDir = path.join(PROJECT_DIR, "dist");
  if (!fs.existsSync(distDir)) fs.mkdirSync(distDir, { recursive: true });
  const outPath = path.join(distDir, "bsr_dashboard.html");
  fs.writeFileSync(outPath, out);

  console.log("rows:", rows.length, "dates:", minDate, "->", maxDate);
  console.log("families:", familyOrder.length);
  console.log("written:", outPath, "size KB:", Math.round(out.length / 1024));
}

main();
