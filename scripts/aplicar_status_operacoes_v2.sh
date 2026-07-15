#!/usr/bin/env bash
#
# aplicar_status_operacoes_v2.sh — Publica a reescrita de get_status_operacoes no
# MCP Cockpit (Google Sheets). A classificação e o cálculo de risco passam a se
# basear na MECÂNICA DE PAYOFF real (casamento venda×proteção por quantidade, mesmo
# tipo de opção), não em heurística de notional bruto.
#
# O QUE MUDA:
#  • Casamento por quantidade: 4000 PUTs vendidas / 3000 protegidas ⇒ 3000 casadas
#    + 1000 descobertas EXPLÍCITAS (antes: rótulo de trava escondia o descoberto).
#  • Risco separado: risco_maximo_travado (largura×qtd_casada − crédito) vs
#    risco_adicional_descoberto (venda sem proteção, flag de risco ilimitado).
#  • Concentração por RISCO REAL (risco travado e descoberto, cada um com seu
#    limite) em vez do notional bruto. Ex. real BBDC4: R$153.294 (102% do patrimônio)
#    → risco real R$11.862 (~7,9%).
#  • custo_zerar com convenção documentada (positivo=crédito recebido / negativo=débito
#    pago) — ponto que já causou erro de sinal invertido nesta conta.
#  • Núcleo puro em src/status_engine.ts, com 9 testes de oráculo manual (a–i).
#
# BREAKING CHANGE: "notional_vendido"/"pct_patrimonio" saíram; agora há
# concentracao_risco_pct + concentracao_descoberta_pct (notional bruto continua como
# "notional_vendido_bruto" só para referência).
#
#   cd ~/GoogleCloud_Projects && git pull && ./scripts/aplicar_status_operacoes_v2.sh
#
set -euo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/patches/google-sheets-mcp"
WORK="$(mktemp -d)"; cd "$WORK"

git clone --depth 1 https://github.com/brunotrolo/google-sheets-mcp.git
cd google-sheets-mcp

cp "$SRC/index.ts"          src/index.ts
cp "$SRC/status_engine.ts"  src/status_engine.ts

# Testes de oráculo antes de subir (falha aborta o deploy).
echo "==> Rodando testes do núcleo (status_engine)..."
cp "$SRC/status_engine.test.ts" src/status_engine.test.ts
node --experimental-strip-types src/status_engine.test.ts
rm -f src/status_engine.test.ts

if git diff --quiet && [ -z "$(git status --porcelain)" ]; then
  echo "Nada a mudar (já está atualizado)."
else
  git add src/
  git config user.email "actions@github.com"
  git config user.name "status-operacoes-bot"
  git commit -qm "feat: get_status_operacoes por logica de payoff (casamento por quantidade, risco travado vs descoberto)"
  git push
  echo "✅ Código enviado ao GitHub."
fi

echo "==> Redeploy preservando anti cold-start (lazy googleapis + cpu-boost, custo ~R\$0)..."
gcloud run deploy oplab-sheets-mcp --source . \
  --region us-east1 --project oplab-sheets-mcp-project \
  --cpu=1 --memory=512Mi --cpu-throttling --cpu-boost \
  --min-instances=0 --max-instances=2 --timeout=120

echo ""
echo "✅ Deploy concluído. No claude.ai NÃO precisa reconectar (mesma URL /mcp),"
echo "   mas abra uma CONVERSA NOVA para o novo schema aparecer. Teste ponta a ponta:"
cat <<'CURL'
curl -s -X POST https://oplab-sheets-mcp-6763522987.us-east1.run.app/mcp \
  -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_status_operacoes","arguments":{"patrimonio":150000}}}' | head -c 4000
CURL
echo ""
