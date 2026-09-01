#!/usr/bin/env bash
#
# aplicar_patch_mcps.sh — Aplica a correção SSE → Streamable HTTP (stateless)
# nos dois MCPs, faz commit/push e redeploy no Cloud Run preservando env/secrets.
#
# Rode a partir do diretório do repo no Cloud Shell:
#   cd ~/GoogleCloud_Projects && git pull && ./scripts/aplicar_patch_mcps.sh
#
set -euo pipefail

PATCHES="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/patches"
WORK="$(mktemp -d)"
echo "Trabalhando em: $WORK"

deploy_flags=(--region us-east1 --cpu=1 --memory=512Mi --timeout=120 \
  --concurrency=80 --min-instances=0 --max-instances=2)

# ---------------------- oplab_mcp ----------------------
echo "==> 1/2 oplab_mcp"
git -C "$WORK" clone --depth 1 https://github.com/brunotrolo/oplab_mcp.git
cp "$PATCHES/oplab_mcp/index.ts" "$WORK/oplab_mcp/src/index.ts"
git -C "$WORK/oplab_mcp" config user.email "actions@github.com"
git -C "$WORK/oplab_mcp" config user.name  "cost-fix-bot"
if ! git -C "$WORK/oplab_mcp" diff --quiet; then
  git -C "$WORK/oplab_mcp" commit -am "fix: SSE -> Streamable HTTP stateless (corta custo de CPU)"
  git -C "$WORK/oplab_mcp" push
fi
gcloud run deploy oplab-mcp-server --source "$WORK/oplab_mcp" \
  --project oplab-mcp-server "${deploy_flags[@]}"

# ------------------- google-sheets-mcp -------------------
echo "==> 2/2 google-sheets-mcp"
git -C "$WORK" clone --depth 1 https://github.com/brunotrolo/MCP_ControleOpcoes.git
cp "$PATCHES/google-sheets-mcp/index.ts" "$WORK/MCP_ControleOpcoes/src/index.ts"
( cd "$WORK/MCP_ControleOpcoes" && npm pkg set 'dependencies.@modelcontextprotocol/sdk=^1.12.1' )
git -C "$WORK/MCP_ControleOpcoes" config user.email "actions@github.com"
git -C "$WORK/MCP_ControleOpcoes" config user.name  "cost-fix-bot"
if ! git -C "$WORK/MCP_ControleOpcoes" diff --quiet; then
  git -C "$WORK/MCP_ControleOpcoes" commit -am "fix: SSE -> Streamable HTTP stateless (corta custo de CPU)"
  git -C "$WORK/MCP_ControleOpcoes" push
fi
gcloud run deploy oplab-sheets-mcp --source "$WORK/MCP_ControleOpcoes" \
  --project oplab-sheets-mcp-project "${deploy_flags[@]}"

echo ""
echo "✅ Patch aplicado e MCPs redeployados."
echo ""
echo "⚠️  IMPORTANTE: o endpoint mudou de  /sse  para  /mcp."
echo "    Atualize a URL dos MCPs no seu cliente (Claude) de:"
echo "      https://oplab-mcp-server-544531071750.us-east1.run.app/sse"
echo "      https://oplab-sheets-mcp-6763522987.us-east1.run.app/sse"
echo "    para:"
echo "      https://oplab-mcp-server-544531071750.us-east1.run.app/mcp"
echo "      https://oplab-sheets-mcp-6763522987.us-east1.run.app/mcp"
