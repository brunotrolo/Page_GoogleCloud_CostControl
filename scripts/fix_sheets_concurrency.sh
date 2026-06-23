#!/usr/bin/env bash
#
# fix_sheets_concurrency.sh — Corrige a fragilidade de concorrência do MCP Sheets:
# troca o "servidor compartilhado + reconnect" por "servidor novo por requisição"
# (mesmo padrão robusto do OpLab). Também deixa o serverInfo.name distinto.
# Já validado: compila, builda e passa em 8 requisições concorrentes.
#
#   cd ~/GoogleCloud_Projects && git pull && ./scripts/fix_sheets_concurrency.sh
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
  git config user.name "concurrency-fix-bot"
  git commit -aqm "fix: servidor novo por requisicao (robusto sob concorrencia) + serverInfo.name distinto"
  git push
  echo "✅ Código corrigido e enviado."
fi

echo "==> Redeploy preservando configs de custo..."
gcloud run deploy oplab-sheets-mcp --source . \
  --region us-east1 --project oplab-sheets-mcp-project \
  --cpu=1 --memory=512Mi --cpu-throttling --min-instances=0 --max-instances=2 --timeout=120

echo ""
echo "✅ Deploy feito. Agora no claude.ai: apague o conector do Sheets, adicione de novo"
echo "   com a URL /mcp, e abra uma conversa nova."
echo "   Teste: curl -s https://oplab-sheets-mcp-6763522987.us-east1.run.app/health"
