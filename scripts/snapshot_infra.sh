#!/usr/bin/env bash
#
# snapshot_infra.sh — Tira uma "foto" SEGURA da infra do Cloud Run e salva em infra/.
# NÃO grava valores de variáveis/secrets — apenas nomes, imagem e parâmetros.
# Também lista todos os serviços de todos os projetos pra detectar algo fora do GitHub.
#
# Uso (no Cloud Shell, dentro do repo):
#   ./scripts/snapshot_infra.sh && git add infra/ && git commit -m "infra snapshot" && git push
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/infra"
mkdir -p "$OUT"
PROJETOS=("oplab-mcp-server" "oplab-sheets-mcp-project" "researchopcoes")
REGION="us-east1"

INV="$OUT/INVENTARIO.md"
echo "# Inventário Cloud Run — $(date -u '+%F %T') UTC" > "$INV"
echo "" >> "$INV"

for P in "${PROJETOS[@]}"; do
  echo "## Projeto: $P" >> "$INV"
  SERVICES=$(gcloud run services list --project "$P" --region "$REGION" --format='value(metadata.name)' 2>/dev/null || true)
  if [ -z "$SERVICES" ]; then echo "_sem serviços Cloud Run_" >> "$INV"; echo "" >> "$INV"; continue; fi
  for S in $SERVICES; do
    echo "- **$S**" >> "$INV"
    F="$OUT/${P}__${S}.yaml"
    {
      echo "# Snapshot seguro (sem valores de env/secrets) — $S @ $P"
      echo "service: $S"
      echo "project: $P"
      echo "region: $REGION"
      echo "image: $(gcloud run services describe "$S" --project "$P" --region "$REGION" --format='value(spec.template.spec.containers[0].image)')"
      echo "cpu: $(gcloud run services describe "$S" --project "$P" --region "$REGION" --format="value(spec.template.spec.containers[0].resources.limits.cpu)")"
      echo "memory: $(gcloud run services describe "$S" --project "$P" --region "$REGION" --format="value(spec.template.spec.containers[0].resources.limits.memory)")"
      echo "timeoutSeconds: $(gcloud run services describe "$S" --project "$P" --region "$REGION" --format='value(spec.template.spec.timeoutSeconds)')"
      echo "concurrency: $(gcloud run services describe "$S" --project "$P" --region "$REGION" --format='value(spec.template.spec.containerConcurrency)')"
      echo "minScale: $(gcloud run services describe "$S" --project "$P" --region "$REGION" --format="value(spec.template.metadata.annotations['autoscaling.knative.dev/minScale'])")"
      echo "maxScale: $(gcloud run services describe "$S" --project "$P" --region "$REGION" --format="value(spec.template.metadata.annotations['autoscaling.knative.dev/maxScale'])")"
      echo "cpuThrottling: $(gcloud run services describe "$S" --project "$P" --region "$REGION" --format="value(spec.template.metadata.annotations['run.googleapis.com/cpu-throttling'])")"
      echo "envVarNames:"
      gcloud run services describe "$S" --project "$P" --region "$REGION" \
        --format="value(spec.template.spec.containers[0].env[].name)" | tr ';' '\n' | sed 's/^/  - /' || true
    } > "$F"
    echo "  - config salva em \`infra/$(basename "$F")\`" >> "$INV"
  done
  echo "" >> "$INV"
done

echo "✅ Snapshot salvo em infra/. Revise antes de commitar (não deve haver valores de secret)."
