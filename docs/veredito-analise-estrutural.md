# Veredito — Análise estrutural NÃO tem edge como filtro de entrada

**Data:** 2026-07-09 · **Ferramenta:** `get_backtest_estrutural` (OpLab MCP) · **Status:** CONCLUÍDO — hipótese REJEITADA.

## Pergunta testada
Filtrar as entradas de venda de volatilidade (venda de PUT / Bull Put Spread) pela
**estrutura de preço** (`get_analise_estrutura`) melhora o win rate sobre o baseline?

## Método (sem look-ahead)
Backtest determinístico sobre OHLC + cadeia de opções histórica real. Em cada data
de entrada, o estado estrutural foi reconstruído com `classificarEstrutura(candles.slice(0, di+1))`
— **só candles até a entrada** — e os indicadores (IV Rank, M9/M21) via `buildIndicators`
point-in-time. O spot no vencimento entrou **apenas** no resultado, nunca num filtro.
Cada coorte é um subconjunto do mesmo baseline (mesma janela de oportunidades).

## Amostra
**556 operações**, **27 tickers** (whitelist), **24 meses**. `dte_alvo=25`, `delta_alvo=-0.25`,
`use_spread=true`. Rodado em 3 blocos e agregado (win rate é aditivo por n e wins).

## Resultado

| Coorte | n | Win rate | Lift vs baseline |
|---|---|---|---|
| baseline (sem filtro) | 556 | **57,6%** | — |
| apenas_iv (IV Rank>50) | 224 | 54,5% | −3,1pp |
| apenas_m9m21 (>1,00) | 284 | 52,8% | −4,7pp |
| apenas_alta_estrutural | 166 | 52,4% | −5,1pp |
| alta_estrutural_e_iv | 67 | 44,8% | −12,8pp |
| apenas_transicao | 1 | — | n<30 |
| rompimento_com_volume | 19 | 57,9% | +0,3pp (n<30) |
| full_stack | 47 | 48,9% | −8,6pp |

## Veredito: `ESTRUTURA_SEM_EDGE`

**Filtrar por estrutura não melhora o win rate — piora.** Toda coorte estrutural com
amostra válida (n≥30) ficou ABAIXO do baseline. A única com sinal positivo
(`rompimento_com_volume`, +0,3pp) é desprezível e tem n=19.

O edge está na **venda de volatilidade em si** (baseline 57,6%), não na leitura
estrutural. A `get_analise_estrutura` serve para **DESCREVER** (contexto: fase, rompimento,
topos/fundos), **não para PREVER** nem para decidir entrada.

### Nota sobre o smoke test
Um teste inicial com 2 tickers / 12 meses mostrou `alta_estrutural` em 88,9% (n=9).
Era **ruído de amostra pequena** — foi exatamente por isso que o gate exige n≥30. Com
n=166, a mesma coorte é 52,4%.

## Decisão
- **NÃO construir** `get_projecao_estrutural` (#2) — a premissa que a justificaria (regime
  estrutural com poder preditivo) foi refutada empiricamente.
- **`get_backtest_estrutural`** vira guardrail permanente: qualquer novo filtro proposto
  passa por ele antes de virar ferramenta.

## Ressalvas
Simulação simplificada (resolução no vencimento, prêmio da cadeia histórica, volume não
verificado). O que vale é a comparação RELATIVA entre coortes — consistente e negativa.

## Para reproduzir
```
get_backtest_estrutural  (OpLab MCP)  — tickers=whitelist, lookback_meses=24
```
Se um dia a conclusão precisar ser revista, rode de novo e compare com esta tabela.
Não re-testar por intuição: os números acima já responderam.
