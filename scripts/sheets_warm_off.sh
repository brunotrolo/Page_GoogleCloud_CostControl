#!/usr/bin/env bash
#
# sheets_warm_off.sh — ROLLBACK: volta o MCP do Google Sheets para min-instances=0
# (escala a zero, custo ~R$0). Use se o custo do modo quente não compensar.
#
# NÃO faz rebuild — só atualiza a flag. Efeito imediato.
#
#   cd ~/GoogleCloud_Projects && ./scripts/sheets_warm_off.sh
#
set -euo pipefail

gcloud run services update oplab-sheets-mcp \
  --region us-east1 --project oplab-sheets-mcp-project \
  --min-instances=0

echo ""
echo "✅ Rollback feito. min-instances=0 — o serviço volta a escalar a zero (~R\$0)."
