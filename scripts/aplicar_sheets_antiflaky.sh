#!/usr/bin/env bash
#
# aplicar_sheets_antiflaky.sh — Corrige o "tool not found" intermitente do MCP
# Controle de Operações (Google Sheets) no claude.ai.
#
# CAUSA RAIZ: o `import { google } from 'googleapis'` (biblioteca pesada) e o
# `new GoogleAuth()` rodavam no TOPO do módulo, atrasando o BOOT do container.
# Com min-instances=0, o container dorme; quando o claude.ai reconecta, o
# handshake MCP (initialize/tools/list) chega no container ainda frio e estoura
# o timeout do conector → "tool not found".
#
# CONSERTO (sem custo fixo):
#  1. googleapis + GoogleAuth agora são LAZY (só carregam na 1ª chamada de
#     ferramenta, nunca no handshake). Boot = só o Express, igual ao OpLab.
#     Cliente cacheado no módulo ⇒ token OAuth reaproveitado entre requisições.
#  2. --cpu-boost: CPU turbo durante o cold start (grátis), acelerando o boot.
#
# Já validado: compila (tsc), builda e o tools/list responde SEM credencial do
# Google (prova de que o handshake não depende mais do googleapis).
#
#   cd ~/GoogleCloud_Projects && git pull && ./scripts/aplicar_sheets_antiflaky.sh
#
set -euo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/patches/google-sheets-mcp/index.ts"
WORK="$(mktemp -d)"; cd "$WORK"

git clone --depth 1 https://github.com/brunotrolo/google-sheets-mcp.git
cp "$SRC" google-sheets-mcp/src/index.ts
cd google-sheets-mcp

if git diff --quiet; then
  echo "Nada a mudar (já está atualizado)."
else
  git config user.email "actions@github.com"
  git config user.name "sheets-antiflaky-bot"
  git commit -aqm "fix: googleapis/auth lazy (anti cold-start) — handshake MCP nao depende mais do Google"
  git push
  echo "✅ Código corrigido e enviado."
fi

echo "==> Redeploy com CPU boost no startup (preserva min-instances=0 / custo ~R\$0)..."
gcloud run deploy oplab-sheets-mcp --source . \
  --region us-east1 --project oplab-sheets-mcp-project \
  --cpu=1 --memory=512Mi --cpu-throttling --cpu-boost \
  --min-instances=0 --max-instances=2 --timeout=120

echo ""
echo "✅ Deploy feito. No claude.ai NÃO precisa reconectar (mesma URL /mcp),"
echo "   mas abra uma CONVERSA NOVA. Teste a estabilidade:"
echo "   curl -s https://oplab-sheets-mcp-6763522987.us-east1.run.app/health"
