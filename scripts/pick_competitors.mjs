// Reads a raw search_competitors_by_asin tool-result JSON file and prints
// up to 10 competitor ASINs (top by monthly_revenue, excluding our own brand
// and the seed ASIN itself) as a JSON array to stdout.
//
// Usage: node pick_competitors.mjs <raw_result_file> [seed_asin]
import fs from "fs";

const file = process.argv[2];
const seed = (process.argv[3] || "").toUpperCase();
const OWN_BRAND_RE = /koala/i;

const raw = fs.readFileSync(file, "utf8");
const parsed = JSON.parse(raw);
const list = parsed?.data?.competitor_products || [];

const filtered = list
  .filter((p) => p.amazon_standard_identification_number && p.amazon_standard_identification_number.toUpperCase() !== seed)
  .filter((p) => !OWN_BRAND_RE.test(p.brand || ""))
  .filter((p) => (p.monthly_revenue || 0) > 0 || (p.monthly_sales || 0) > 0)
  .sort((a, b) => (b.monthly_revenue || 0) - (a.monthly_revenue || 0));

const top = filtered.slice(0, 10).map((p) => p.amazon_standard_identification_number);

console.log(JSON.stringify(top));
console.error(`total=${list.length} filtered=${filtered.length} picked=${top.length}`);
