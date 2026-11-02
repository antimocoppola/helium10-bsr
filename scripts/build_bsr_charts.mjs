// Builds dist/bsr_dashboard.html (interactive BSR chart per product x country).
//
// Inputs
//   config/competitors.json            families (hero asin, marketplaces, names)
//   config/competitor_sets.json        competitor lists per family|marketplace (written by `--merge-discovery`)
//   database/bsr_series.json           daily BSR per "asin|marketplace" ({ "2026-05-01": 109, ... })
//   tmp/bf/*.json                      raw segment files from get_asin_bsr_history (merged into the series store)
//
// Usage
//   node build_bsr_charts.mjs                 merge tmp/bf into the series store (if any) and rebuild the dashboard
//   node build_bsr_charts.mjs --merge-discovery   first rebuild config/competitor_sets.json from tmp/discovery_*.json + tmp/hero_pick.json
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const P = (...a) => path.join(ROOT, ...a);
const readJSON = (f) => JSON.parse(fs.readFileSync(f, "utf8"));

const YEAR = "2026";
const RANGE_START = "2026-04-30";
const BF_END = "2026-10-30"; // last day covered by the one-off 6-month backfill (tmp/bf, tmp/yoy)
let RANGE_END = BF_END; // chart end = latest day with data (extended by the daily snapshots)

// Judgement on sub-categories whose competitors are not like-for-like (checked against the sub-category NAME, not verified product by product)
const FLAGS = {
  "KSC|US": "'Breast Shells & Creams': dominata da creme/lanolina; solo Silverette e Maymom sono coppette",
  "KSC|DE": "'Stilleinlagen' sono dischetti assorbilatte: prodotto affine ma non identico",
  "KSC|IT": "'Allattamento al seno' e' larghissima (tiralatte, biberon): nessun competitor e' una coppetta",
  "KST|FR": "'Couvertures d'emmaillotage' sono coperte swaddle: confronto parziale con le nostre mussole",
  "KPH|ES": "'Cojines' e' generica: il primo competitor e' un produttore di materassi",
  "KPH|IT": "Diversi competitor sono materassi/biancheria",
  "KPH|DE": "Coda competitor molto debole (50-177 unita/mese)",
  "KPH|FR": "4 degli 8 competitor sono Totsy Baby; volumi bassi",
  "KPHB|UK": "Competitor fuori tema (tessili casa)",
  "KPHB|ES": "'Cojines' e' generica: il primo competitor e' un materasso",
  "KPHB|FR": "'Oreillers' e' generica (cuscini)",
  "CBA|ES": "'Cestas' e' di cucina/casa: cesti generici",
  "CBA|DE": "'Utensilientaschen': borse generiche",
  "KSF|FR": "'Peluches doudou': nodo largo di peluche",
  "HUG|DE": "Nodo largo (biancheria e cuscini generici)",
  "KBB|DE": "Un portabebe tra i primi (Hoppediz): probabile fuori tema",
  "CBR|IT": "Nodo generale portabebe, non il segmento estate/mare",
  "CBR|FR": "Nodo generale portabebe, non il segmento estate/mare",
  "CBR|DE": "Nodo generale portabebe, non il segmento estate/mare",
  "CBR|ES": "Nodo generale portabebe, non il segmento estate/mare",
};

// Koala ASIN -> family (config family codes; KCB = Sellerboard KCB1)
const KOALA = {
  KCB: ["B07G85PQ5J","B07G84LSYJ","B07G85W2CN","B0892MT1V3","B0892LL85K","B0892M2BB1","B0F9B38HPL","B0F9B5KDH6"],
  KCB2: ["B0B972NB6J","B0B97439HB","B0CDD58HPG","B0CDCQPHR8","B0B974V32V","B0B977LBZF","B0D4ZNFKYQ","B0D4ZXLW6R","B0D4ZNFKYP","B0D4ZNZDRH","B0D4ZMP6XH","B0D4ZLGZCC","B0D4ZMPS1Z","B0D512ZDZD"],
  KSC: ["B07ND58735","B07Y7JSRNJ","B085NY3RJQ","B085NYR3QG"],
  KST: ["B0B5LD23HJ","B0F9PXS546","B0B5LDVDZQ","B0B5LD2H1Z","B0B5LCT5LT","B0F9PTC7QT","B0B5LFPPQ2","B0B5LFH48C","B0C6KS2VFY","B0F9PXWXXD","B0C6KTLNQ9","B0C6KSGLKF","B0C6KQ3V5D","B0F9PR6363","B0C6KSVQQC","B0C6KPC7LT","B0D4YXMHN8","B0F9PSP71B","B0D4YYPVTV","B0D4ZKJLTC","B0F9PS7YTC","B0F9PTHFF3","B0F9PVQGYY","B0F9PT3TJJ","B0D4YW1GP4","B0F9PSJ39V","B0D4YZ6CV9","B0D4ZJTG1L"],
  CBA: ["B0GYFNKKJQ","B0GYFXCLZH","B0GYFVQDL5","B0GYFVC5ML"], KBB: ["B0BFN7K7S2","B0BFN66S42","B0BFN7S56N","B0BFN7FT4Z","B0BFN5ZX4B"],
  CBR: ["B0FCS94QLM","B0FCS9PFYQ","B0FCS9GK5J","B0FCS9NL5S"], CCA: ["B0H71TR6L7","B0H71VK8SZ","B0H71Y87Q2","B0H71VC9LG"],
  KPH: ["B07287LFMS","B071VQG35B","B071493954","B0F9PB5W82","B0F9P56QBR"], KPHB: ["B07FC27HPT","B07FC1DTZ3","B07FC27HGD","B0F9P3TKKC","B0F9P5WS8Z"],
  HUG: ["B07FC37H9N","B0F6N5SV5B","B0F6N5T3XW","B0DQYT9ZZL","B0DQYSTHXP","B0DQYSTR3K","B0DQYTP167","B0DQYTBYSS","B07FC6KSL3","B0F6N5WR9M","B0F6N47D22","B0DQYSW8QR","B0DQYRGY8W","B0DQYQFXFL","B0BR8DNJQ2","B0BR8FWVNF","B0BR8DQ96R","B0DTQBHK2B","B0DTQD4336","B0DZ157VP6"],
};
const FAM_OF = {};
for (const [f, a] of Object.entries(KOALA)) for (const x of a) FAM_OF[x] = f;
const disp = (f) => (f === "KCB" ? "KCB1" : f); // Sellerboard/users call it KCB1
const EXTRA_TOP = 5; // another Koala product is added to the chart when it ranks in the top 5 of the sub-category

function mergeDiscovery() {
  const cfg = readJSON(P("config", "competitors.json"));
  const byKey = {};
  for (let n = 1; n <= 5; n++) {
    const f = P("tmp", `discovery_${n}.json`);
    if (!fs.existsSync(f)) continue;
    for (const r of readJSON(f).results) {
      const k = `${r.family}|${r.marketplace}`;
      if (!byKey[k] || (byKey[k].error && !r.error)) byKey[k] = r;
    }
  }
  for (const mp of cfg.families.KCB2.marketplaces) {
    const kcb = byKey[`KCB|${mp}`];
    if (kcb && !kcb.error) byKey[`KCB2|${mp}`] = { ...kcb, family: "KCB2", reused_from: "KCB" };
  }
  const heroPick = fs.existsSync(P("tmp", "hero_pick.json")) ? readJSON(P("tmp", "hero_pick.json")) : {};
  const sets = {};
  for (const [fam, f] of Object.entries(cfg.families)) {
    for (const mp of f.marketplaces) {
      const k = `${fam}|${mp}`;
      const r = byKey[k];
      const cfgHero = (f.asin_overrides || {})[mp] || f.asin;
      if (!r || r.error) { sets[k] = { status: "na", reason: r?.error || "nessun risultato", hero: cfgHero }; continue; }
      sets[k] = {
        status: "ok", node: r.node_id, reused_from: r.reused_from || null,
        hero: heroPick[k]?.hero || cfgHero, cfg_hero: cfgHero,
        ours: (r.ours || []).map(o => ({ asin: o.asin, sub: o.sub_rank ?? null, sales: o.monthly_sales ?? null })),
        competitors: (r.competitors || []).slice(0, 8).map(c => ({ asin: c.asin, brand: c.brand, rank: c.sales_rank ?? null, sub: c.sub_rank ?? null, sales: c.monthly_sales ?? null })),
      };
    }
  }
  fs.writeFileSync(P("config", "competitor_sets.json"), JSON.stringify(sets, null, 1));
  console.log("competitor_sets.json written:", Object.keys(sets).length, "combos,", Object.values(sets).filter(s => s.status === "ok").length, "ok");
}

function expandSegments(segments) {
  // segments: [["04-30",109], ...]; value holds from its start until the next segment's start; last holds until RANGE_END
  const out = {};
  const startsISO = segments.map(([d]) => `${YEAR}-${d}`);
  const day = (iso) => new Date(iso + "T00:00:00Z");
  const fmt = (dt) => dt.toISOString().slice(0, 10);
  for (let i = 0; i < segments.length; i++) {
    const from = day(startsISO[i]);
    const to = i + 1 < segments.length ? day(startsISO[i + 1]) : new Date(day(BF_END).getTime() + 86400000);
    // a rank that "holds" for more than 14 days is stale data (e.g. inactive listing): keep 7 days, leave the rest empty
    const spanDays = Math.round((to - from) / 86400000);
    for (let t = from, n = 0; t < to; t = new Date(t.getTime() + 86400000), n++) out[fmt(t)] = (spanDays > 14 && n >= 7) ? null : segments[i][1];
  }
  return out;
}

function mergeBackfill() {
  const storeFile = P("database", "bsr_series.json");
  const store = fs.existsSync(storeFile) ? readJSON(storeFile) : { series: {}, notes: {} };
  const dir = P("tmp", "bf");
  if (!fs.existsSync(dir)) return store;
  let merged = 0, failed = 0;
  for (const f of fs.readdirSync(dir).filter(x => x.endsWith(".json"))) {
    const r = readJSON(path.join(dir, f));
    const key = `${r.asin}|${r.marketplace}`;
    if (r.error || !r.segments?.length) { store.notes[key] = { error: r.error || "nessun dato" }; failed++; continue; }
    store.series[key] = { ...(store.series[key] || {}), ...expandSegments(r.segments) };
    store.notes[key] = { used_asin: r.used_asin };
    merged++;
  }
  // year-over-year: BSR on the same day one year before RANGE_END (last segment starting on/before it)
  const ydir = P("tmp", "yoy");
  const target = (Number(BF_END.slice(0, 4)) - 1) + BF_END.slice(4);
  store.yoy = store.yoy || {};
  if (fs.existsSync(ydir)) {
    for (const f of fs.readdirSync(ydir).filter(x => x.endsWith(".json"))) {
      const r = readJSON(path.join(ydir, f));
      let v = null;
      for (const [d, bsr] of (r.segments || [])) if (d <= target) v = bsr;
      store.yoy[`${r.asin}|${r.marketplace}`] = v;
    }
  }
  // best-BSR metrics (scripts/best_bsr.mjs output) and YoY fallback for ASINs without the dedicated YoY file
  store.best = store.best || {};
  const bdir = P("tmp", "best");
  if (fs.existsSync(bdir)) {
    for (const f of fs.readdirSync(bdir).filter(x => x.endsWith(".json"))) {
      const r = readJSON(path.join(bdir, f));
      if (r.error) continue;
      const key = `${r.asin}|${r.marketplace}`;
      store.best[key] = { first: r.first, y1: r.y1, y2: r.y2, all: r.all, used_asin: r.used_asin };
      if ((store.yoy[key] === undefined || store.yoy[key] === null) && r.yoy != null) store.yoy[key] = r.yoy;
    }
  }
  // daily snapshots (scripts/daily_update.mjs) after the backfill: keep the best-BSR records current
  for (const [key, b] of Object.entries(store.best)) {
    const sr = store.series[key]; if (!sr) continue;
    for (const d of Object.keys(sr)) if (d > BF_END && sr[d] != null) for (const w of ["y1", "y2", "all"]) if (b[w] && sr[d] < b[w].bsr) b[w] = { bsr: sr[d], date: d };
  }
  fs.writeFileSync(storeFile, JSON.stringify(store));
  console.log("backfill merged:", merged, "series,", failed, "failed/empty");
  return store;
}

function build(store) {
  const cfg = readJSON(P("config", "competitors.json"));
  const sets = readJSON(P("config", "competitor_sets.json"));
  let lastDay = BF_END;
  for (const sr of Object.values(store.series)) for (const d of Object.keys(sr)) if (sr[d] != null && d > lastDay) lastDay = d;
  RANGE_END = lastDay;
  const dates = [];
  for (let t = new Date(RANGE_START + "T00:00:00Z"); t <= new Date(RANGE_END + "T00:00:00Z"); t = new Date(t.getTime() + 86400000)) dates.push(t.toISOString().slice(0, 10));

  const NODE_NAMES = readJSON(P("config", "node_names.json"));
  // hand-picked competitor lists (config/manual_competitors.json: { "FAM|MP": { competitors: [...] } }) override the sub-category lists
  const HERO_ONLY = fs.existsSync(P("config", "hero_only.json")) ? readJSON(P("config", "hero_only.json")) : {};
  const MANUAL = fs.existsSync(P("config", "manual_competitors.json")) ? readJSON(P("config", "manual_competitors.json")) : {};
  const series = {};
  const need = new Set();
  const combos = {};
  for (const [fam, f] of Object.entries(cfg.families)) {
    for (const mp of f.marketplaces) {
      const k = `${fam}|${mp}`;
      const s0 = sets[k];
      const s = MANUAL[k] && s0 && s0.status === "ok" ? { ...s0, competitors: MANUAL[k].competitors, manual: true } : s0;
      if (!s || s.status !== "ok") {
        const hoAsin = HERO_ONLY[k];
        const hoKey = hoAsin ? `${hoAsin}|${mp}` : null;
        if (hoKey && store.series[hoKey]) {
          need.add(hoKey);
          const man = MANUAL[k];
          const hcomps = man ? man.competitors.map((c) => ({ ...c, plot: !!store.series[`${c.asin}|${mp}`] })) : [];
          for (const c of hcomps) need.add(`${c.asin}|${mp}`);
          combos[disp(fam) + "|" + mp] = {
            status: "ok", noComps: !man, node: null, nodeName: null, reused: null, manual: !!man, flag: null,
            hero: { asin: hoAsin, key: hoKey, hasData: true },
            ours: [{ asin: hoAsin, family: disp(fam), key: hoKey, sub: null, sales: null }], comps: hcomps,
          };
        } else combos[disp(fam) + "|" + mp] = { status: "na", reason: s?.reason || "nessun risultato" };
        continue;
      }
      const heroKey = `${s.hero}|${mp}`;
      const heroNote = store.notes[heroKey];
      const usedHero = heroNote?.used_asin || s.hero;
      const heroSeriesKey = `${s.hero}|${mp}`;
      const comps = s.competitors.map((c) => ({ ...c, plot: !!store.series[`${c.asin}|${mp}`] }));
      const plottedKeys = comps.map(c => `${c.asin}|${mp}`);
      // ONE Koala ASIN for this product (the hero)...
      const heroOurs = s.ours.filter(o => FAM_OF[o.asin] === fam).sort((a, b) => (a.asin === s.hero ? -1 : 0) - (b.asin === s.hero ? -1 : 0) || (a.sub ?? 99) - (b.sub ?? 99))[0];
      const ours = [{ asin: usedHero, family: disp(fam), key: heroSeriesKey, sub: heroOurs?.sub ?? null, sales: heroOurs?.sales ?? null }];
      // ...plus one ASIN of each OTHER Koala product that sits in the top 5 of the same sub-category
      const best = {};
      for (const o of s.ours) { const g = FAM_OF[o.asin]; if (!g || g === fam) continue; if (!best[g] || (o.sub ?? 99) < (best[g].sub ?? 99)) best[g] = o; }
      const extras = [];
      for (const [g, o] of Object.entries(best)) {
        if ((o.sub ?? 99) > EXTRA_TOP) continue;
        const gs = sets[`${g}|${mp}`];
        const gHeroKey = gs && gs.status === "ok" ? `${gs.hero}|${mp}` : null;
        const key = gHeroKey && store.series[gHeroKey] ? gHeroKey : (store.series[`${o.asin}|${mp}`] ? `${o.asin}|${mp}` : null);
        if (!key) continue;
        extras.push({ asin: key.split("|")[0], family: disp(g), key, sub: o.sub, sales: o.sales ?? null });
      }
      for (const key of [heroSeriesKey, ...plottedKeys, ...extras.map(e => e.key)]) need.add(key);
      combos[disp(fam) + "|" + mp] = {
        status: "ok", node: s.node, nodeName: NODE_NAMES[`${mp}|${s.node}`] || null, reused: s.reused_from, manual: !!s.manual, flag: s.manual ? null : (FLAGS[k] || null),
        hero: { asin: usedHero, key: heroSeriesKey, hasData: !!store.series[heroSeriesKey] },
        ours: [...ours, ...extras], comps,
      };
    }
  }
  for (const key of need) {
    const sr = store.series[key];
    if (!sr) continue;
    series[key] = dates.map(d => (sr[d] === undefined ? null : sr[d]));
  }
  const dataset = {
    generatedAt: new Date().toISOString(), dates,
    markets: ["IT", "FR", "DE", "ES", "UK", "US"],
    families: Object.entries(cfg.families).map(([code, f]) => ({ code: disp(code), name: f.name, markets: f.marketplaces })),
    combos, series,
    best: Object.fromEntries(Object.entries(store.best || {}).filter(([k]) => series[k])),
    yoy: Object.fromEntries(Object.entries(store.yoy || {}).filter(([k, v]) => v != null && series[k])),
  };
  const tpl = fs.readFileSync(path.join(__dirname, "bsr_charts_template.html"), "utf8");
  const json = JSON.stringify(dataset).replace(/</g, "\\u003c");
  const out = tpl.replace("__DATA_PLACEHOLDER__", json);
  fs.mkdirSync(P("dist"), { recursive: true });
  fs.writeFileSync(P("dist", "bsr_dashboard.html"), out);
  const okCombos = Object.values(combos).filter(c => c.status === "ok");
  console.log("combos:", Object.keys(combos).length, "ok:", okCombos.length, "with hero series:", okCombos.filter(c => series[c.hero.key]).length);
  console.log("series:", Object.keys(series).length, "of", need.size, "needed; dates", dates[0], "->", dates[dates.length - 1]);
  console.log("written:", P("dist", "bsr_dashboard.html"), "size KB:", Math.round(out.length / 1024));
}

if (process.argv.includes("--merge-discovery")) mergeDiscovery();
const store = mergeBackfill();
build(store);
