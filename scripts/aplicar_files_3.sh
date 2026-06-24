#!/usr/bin/env bash
#
# aplicar_files_3.sh — Substitui os 8 arquivos de files/ pelos 3 consolidados.
# SÓ rode após revisar os 3 arquivos em patches/google-sheets-mcp-files/.
# Faz backup dos 8 originais em files/_arquivo_antigo/ (não apaga de vez).
#
#   cd ~/GoogleCloud_Projects && git pull && ./scripts/aplicar_files_3.sh
#
set -euo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/patches/google-sheets-mcp-files"
WORK="$(mktemp -d)"; cd "$WORK"

git clone --depth 1 https://github.com/brunotrolo/google-sheets-mcp.git
cd google-sheets-mcp

mkdir -p files/_arquivo_antigo
# move os antigos (preserva como backup no repo); remove só os 8 .md/.txt da raiz de files/
for f in files/*.md files/*.txt; do
  [ -e "$f" ] || continue
  git mv "$f" "files/_arquivo_antigo/$(basename "$f")" 2>/dev/null || mv "$f" "files/_arquivo_antigo/"
done

cp "$SRC/00_INICIO.md"   files/00_INICIO.md
cp "$SRC/01_PROJETO.md"  files/01_PROJETO.md
cp "$SRC/02_SISTEMA.md"  files/02_SISTEMA.md

git add files/
git config user.email "actions@github.com"
git config user.name "files-consolidation-bot"
git commit -q -m "docs: consolida files/ 8 -> 3 (backup dos antigos em _arquivo_antigo)"
git push
echo "✅ Consolidado: files/ agora tem 00_INICIO, 01_PROJETO, 02_SISTEMA."
echo "   Os 8 originais ficaram em files/_arquivo_antigo/ (backup)."
echo "   Se aprovar de vez, depois é só: git rm -r files/_arquivo_antigo && git commit && git push"
