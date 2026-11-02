#!/bin/sh
# copia la dashboard in docs/ (GitHub Pages), senza indicizzazione dai motori di ricerca
cd "$(dirname "$0")/.." || exit 1
mkdir -p docs
sed 's#<head>#<head><meta name="robots" content="noindex,nofollow">#' dist/bsr_dashboard.html > docs/index.html
