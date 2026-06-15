# Relatório de Custos GCP — 2026-06-15

- **Período:** 2026-05-16 → 2026-06-15 (30 dias)
- **Fonte:** `oplab-mcp-server.billing.gcp_billing_export_resource_v1_01A65F_62F735_7F6904` (BigQuery Billing Export)
- **Gerado em (UTC):** 2026-06-15 21:59:23

## 1. Custo por Serviço (visão macro)

```
FATAL Flags parsing error: Unknown command line flag ' 01 — Custo por SERVIÇO (visão macro: "qual produto do GCP está cobrando")
-- Responde: Cloud Run? Compute? Logging? Networking? Storage?
SELECT
  service.description                                   AS servico,
  ROUND(SUM(cost), 2)                                  AS custo_bruto,
  ROUND(SUM(IFNULL((SELECT SUM(c.amount) FROM UNNEST(credits) c), 0)), 2) AS creditos,
  ROUND(SUM(cost) + SUM(IFNULL((SELECT SUM(c.amount) FROM UNNEST(credits) c), 0)), 2) AS custo_liquido,
  currency                                              AS moeda
FROM `oplab-mcp-server.billing.gcp_billing_export_resource_v1_01A65F_62F735_7F6904`
WHERE DATE(usage_start_time) BETWEEN '2026-05-16' AND '2026-06-15'
GROUP BY servico, moeda
HAVING custo_liquido > 0.001
ORDER BY custo_liquido DESC;'
Run 'bq.py help' to get help
```

## 2. Custo por SKU (item exato cobrado)

```
FATAL Flags parsing error: Unknown command line flag ' 02 — Custo por SKU (granularidade fina: o item exato cobrado)
-- Ex.: "Cloud Run CPU Allocation Time", "Network Egress", "PD Capacity"
SELECT
  service.description                                   AS servico,
  sku.description                                       AS sku,
  ROUND(SUM(cost), 2)                                   AS custo_bruto,
  ROUND(SUM(cost) + SUM(IFNULL((SELECT SUM(c.amount) FROM UNNEST(credits) c), 0)), 2) AS custo_liquido,
  ROUND(SUM(usage.amount), 2)                           AS quantidade,
  ANY_VALUE(usage.unit)                                 AS unidade,
  currency                                              AS moeda
FROM `oplab-mcp-server.billing.gcp_billing_export_resource_v1_01A65F_62F735_7F6904`
WHERE DATE(usage_start_time) BETWEEN '2026-05-16' AND '2026-06-15'
GROUP BY servico, sku, moeda
HAVING custo_liquido > 0.001
ORDER BY custo_liquido DESC
LIMIT 50;'
Run 'bq.py help' to get help
```

## 3. Custo por Recurso específico

```
FATAL Flags parsing error: Unknown command line flag ' 03 — Custo por RECURSO específico (qual instância/serviço/disco é o vilão)
-- Requer o export "detalhado" (resource-level). resource.name '
Run 'bq.py help' to get help
```

## 4. Custo por Dia (tendência)

```
FATAL Flags parsing error: Unknown command line flag ' 04 — Custo por DIA (tendência: detecta o "liguei o projeto e disparou")
SELECT
  DATE(usage_start_time)                                AS dia,
  ROUND(SUM(cost) + SUM(IFNULL((SELECT SUM(c.amount) FROM UNNEST(credits) c), 0)), 2) AS custo_liquido,
  currency                                              AS moeda
FROM `oplab-mcp-server.billing.gcp_billing_export_resource_v1_01A65F_62F735_7F6904`
WHERE DATE(usage_start_time) BETWEEN '2026-05-16' AND '2026-06-15'
GROUP BY dia, moeda
ORDER BY dia;'
Run 'bq.py help' to get help
```

## 5. Custo por Label

```
FATAL Flags parsing error: Unknown command line flag ' 05 — Custo por LABEL (separa MCP-A de MCP-B, ambiente, dono...)
-- Só funciona bem se você rotular os recursos. Mostra labels existentes.
SELECT
  l.key                                                 AS label_chave,
  l.value                                               AS label_valor,
  ROUND(SUM(cost) + SUM(IFNULL((SELECT SUM(c.amount) FROM UNNEST(credits) c), 0)), 2) AS custo_liquido,
  currency                                              AS moeda
FROM `oplab-mcp-server.billing.gcp_billing_export_resource_v1_01A65F_62F735_7F6904`, UNNEST(labels) AS l
WHERE DATE(usage_start_time) BETWEEN '2026-05-16' AND '2026-06-15'
GROUP BY label_chave, label_valor, moeda
HAVING custo_liquido > 0.001
ORDER BY custo_liquido DESC
LIMIT 50;'
Run 'bq.py help' to get help
```

## 6. Créditos aplicados

```
FATAL Flags parsing error: Unknown command line flag ' 06 — CRÉDITOS aplicados (free tier, descontos, promoções)
-- Mostra o que está sendo abatido — útil pra prever quando o crédito acabar.
SELECT
  service.description                                   AS servico,
  c.type                                                AS tipo_credito,
  c.name                                                AS nome_credito,
  ROUND(SUM(c.amount), 2)                               AS valor_credito,
  currency                                              AS moeda
FROM `oplab-mcp-server.billing.gcp_billing_export_resource_v1_01A65F_62F735_7F6904`, UNNEST(credits) AS c
WHERE DATE(usage_start_time) BETWEEN '2026-05-16' AND '2026-06-15'
GROUP BY servico, tipo_credito, nome_credito, moeda
ORDER BY valor_credito;'
Run 'bq.py help' to get help
```

## 7. Custo Recorrente / Idle (liga e já cobra)

```
Traceback (most recent call last):
  File "/opt/hostedtoolcache/gcloud/568.0.0/x64/platform/bq/bq.py", line 162, in <module>
    appcommands.Run()
    ~~~~~~~~~~~~~~~^^
  File "/opt/hostedtoolcache/gcloud/568.0.0/x64/platform/bq/third_party/pyglib/appcommands.py", line 837, in Run
    return app.run(_CommandsStart, flags_parser=ParseFlagsWithUsage)
           ~~~~~~~^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "/opt/hostedtoolcache/gcloud/568.0.0/x64/platform/bq/third_party/absl/app.py", line 312, in run
    _run_main(main, args)
    ~~~~~~~~~^^^^^^^^^^^^
  File "/opt/hostedtoolcache/gcloud/568.0.0/x64/platform/bq/third_party/absl/app.py", line 258, in _run_main
    sys.exit(main(argv))
             ~~~~^^^^^^
  File "/opt/hostedtoolcache/gcloud/568.0.0/x64/platform/bq/third_party/pyglib/appcommands.py", line 821, in _CommandsStart
    raise sys.exit(command.CommandRun(GetCommandArgv()))
                   ~~~~~~~~~~~~~~~~~~^^^^^^^^^^^^^^^^^^
  File "/opt/hostedtoolcache/gcloud/568.0.0/x64/platform/bq/third_party/pyglib/appcommands.py", line 328, in CommandRun
    argv = ParseFlagsWithUsage(argv)
  File "/opt/hostedtoolcache/gcloud/568.0.0/x64/platform/bq/third_party/pyglib/appcommands.py", line 749, in ParseFlagsWithUsage
    _cmd_argv = FLAGS(argv)
  File "/opt/hostedtoolcache/gcloud/568.0.0/x64/platform/bq/third_party/absl/flags/_flagvalues.py", line 668, in __call__
    suggestions = _helpers.get_flag_suggestions(name, list(self))
  File "/opt/hostedtoolcache/gcloud/568.0.0/x64/platform/bq/third_party/absl/flags/_helpers.py", line 217, in get_flag_suggestions
    distances = [(_damerau_levenshtein(attempt, option[0:len(attempt)]), option)
                  ~~~~~~~~~~~~~~~~~~~~^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "/opt/hostedtoolcache/gcloud/568.0.0/x64/platform/bq/third_party/absl/flags/_helpers.py", line 261, in _damerau_levenshtein
    return distance(a, b)
  File "/opt/hostedtoolcache/gcloud/568.0.0/x64/platform/bq/third_party/absl/flags/_helpers.py", line 250, in distance
    distance(x[1:], y) + 1,  # correct an insertion error
    ~~~~~~~~^^^^^^^^^^
  File "/opt/hostedtoolcache/gcloud/568.0.0/x64/platform/bq/third_party/absl/flags/_helpers.py", line 250, in distance
    distance(x[1:], y) + 1,  # correct an insertion error
    ~~~~~~~~^^^^^^^^^^
  File "/opt/hostedtoolcache/gcloud/568.0.0/x64/platform/bq/third_party/absl/flags/_helpers.py", line 250, in distance
    distance(x[1:], y) + 1,  # correct an insertion error
    ~~~~~~~~^^^^^^^^^^
  [Previous line repeated 987 more times]
RecursionError: maximum recursion depth exceeded
```

## 8. Custo por Projeto

```
FATAL Flags parsing error: Unknown command line flag ' 08 — Custo por PROJETO (se houver mais de um projeto na conta de billing)
SELECT
  project.id                                            AS projeto_id,
  project.name                                          AS projeto_nome,
  ROUND(SUM(cost) + SUM(IFNULL((SELECT SUM(c.amount) FROM UNNEST(credits) c), 0)), 2) AS custo_liquido,
  currency                                              AS moeda
FROM `oplab-mcp-server.billing.gcp_billing_export_resource_v1_01A65F_62F735_7F6904`
WHERE DATE(usage_start_time) BETWEEN '2026-05-16' AND '2026-06-15'
GROUP BY projeto_id, projeto_nome, moeda
HAVING custo_liquido > 0.001
ORDER BY custo_liquido DESC;'
Run 'bq.py help' to get help
```

## 09_uso_por_mcp.sql

```
FATAL Flags parsing error: Unknown command line flag ' 09 — USO POR MCP (atribui custo às suas interações)
-- Cada chamada de ferramenta do MCP '
Run 'bq.py help' to get help
```

## 10_chamadas_por_dia.sql

```
FATAL Flags parsing error: Unknown command line flag ' 10 — CHAMADAS por dia, por MCP (origem: logs de requisição do Cloud Run)
-- Cada linha '
Run 'bq.py help' to get help
```

