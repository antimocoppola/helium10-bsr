# Koala Babycare - BSR vs competitor

Dashboard del Best Sellers Rank dei nostri ASIN contro i competitor della sottocategoria, per prodotto e paese (IT/FR/DE/ES/UK/US). Dati da Helium10.

- `scripts/daily_update.mjs` - aggiunge il BSR di oggi (1 chiamata Helium10 per marketplace)
- `scripts/build_bsr_charts.mjs` - genera `dist/bsr_dashboard.html`
- `scripts/best_bsr.mjs` - calcola i miglior BSR (ultimo anno, 2 anni, di sempre)
- `config/` - competitor per prodotto/paese, nomi delle sottocategorie, liste manuali
- `database/bsr_series.json` - storico giornaliero per `ASIN|marketplace`
- `docs/index.html` - copia della dashboard servita da GitHub Pages

Aggiornamento: `node scripts/daily_update.mjs <YYYY-MM-DD>` (dopo aver scritto `tmp/daily/<MP>.json`), poi `node scripts/build_bsr_charts.mjs` e `bash scripts/publish_docs.sh`.
