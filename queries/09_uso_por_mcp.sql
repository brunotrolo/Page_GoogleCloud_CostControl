-- 09 — USO POR MCP (atribui custo às suas interações)
-- Cada chamada de ferramenta do MCP = ~1 requisição ao Cloud Run.
-- Mostra, por serviço (= cada MCP): nº de requisições, CPU consumida, custo e
-- o custo médio POR requisição. É o mais perto de "quanto custou cada uso".
SELECT
  COALESCE(resource.name, service.description)          AS mcp,
  ROUND(SUM(cost) + SUM(IFNULL((SELECT SUM(c.amount) FROM UNNEST(credits) c), 0)), 2) AS custo_liquido,
  ROUND(SUM(IF(sku.description LIKE '%Requests%', usage.amount, 0)), 0)               AS requisicoes,
  ROUND(SUM(IF(sku.description LIKE '%CPU%', usage.amount, 0)), 0)                    AS cpu_segundos,
  currency                                              AS moeda
FROM `@TABLE@`
WHERE DATE(usage_start_time) BETWEEN '@START@' AND '@END@'
  AND service.description = 'Cloud Run'
GROUP BY mcp, moeda
HAVING custo_liquido > 0.001 OR requisicoes > 0
ORDER BY custo_liquido DESC;
