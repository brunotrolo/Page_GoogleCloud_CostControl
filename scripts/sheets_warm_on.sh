#!/usr/bin/env bash
#
# sheets_warm_on.sh — Liga min-instances=1 no MCP do Google Sheets para garantir
# que o container esteja SEMPRE quente quando o claude.ai indexa as ferramentas
# no início da sessão (conserta o "tool_search não acha get_cockpit_ativas").
#
# NÃO faz rebuild — só atualiza a flag do serviço (segundos). Reversível com
# sheets_warm_off.sh (min-instances=0), sem tocar no código.
#
# Custo estimado: ~R$45-50/mês (1 vCPU + 512Mi sempre quente, tarifa idle com
# cpu-throttling). Rollback a qualquer momento zera de novo.
#
#   cd ~/GoogleCloud_Projects && ./scripts/sheets_warm_on.sh
#
set -euo pipefail

gcloud run services update oplab-sheets-mcp \
  --region us-east1 --project oplab-sheets-mcp-project \
  --min-instances=1

echo ""
echo "✅ min-instances=1 aplicado. Container agora fica sempre quente."
echo "   Confira: gcloud run services describe oplab-sheets-mcp --region us-east1 \\"
echo "            --project oplab-sheets-mcp-project --format='value(spec.template.metadata.annotations)'"
echo ""
echo "   No claude.ai: abra uma CONVERSA NOVA e peça sua carteira."
echo "   Rollback (volta a R\$0): ./scripts/sheets_warm_off.sh"
