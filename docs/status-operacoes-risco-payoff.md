# get_status_operacoes — risco por lógica de payoff (v2)

**Data:** 2026-07-15 · **MCP:** Cockpit (Google Sheets) · **Arquivos:** `patches/google-sheets-mcp/{index.ts, status_engine.ts, status_engine.test.ts}`

## Problema que motivou a reescrita
A versão anterior media "concentração/risco" somando cegamente `strike × quantidade`
de **toda** perna vendida (`notional_vendido`), sem checar se a venda estava protegida.
Resultado: uma trava com risco travado de **R$2.880** e uma PUT descoberta de **R$41.425**
disparavam o mesmo tipo de alarme, porque contribuíam para o mesmo somatório bruto.

## O que mudou
Classificação e risco passam a se basear na **mecânica de payoff** de cada combinação
de pernas (tipo, lado, strike, quantidade):

1. **Agrupamento** por `(TICKER, vencimento)` — não por data de entrada. Pernas do mesmo
   tipo/lado/vencimento entradas em dias diferentes são **agregadas**.
2. **Casamento venda×proteção por quantidade** (mesmo tipo de opção; PUT protege PUT,
   CALL protege CALL — nunca cruzado). Ex.: 4000 PUTs vendidas / 3000 protegidas ⇒
   **3000 casadas + 1000 descobertas explícitas**. Pareia o pior strike vendido com a
   melhor proteção disponível, por chunks (put ladder / múltiplos strikes funcionam).
3. **Risco separado**:
   - `risco_maximo_travado` = `largura×qtd_casada − crédito_casado` (crédito rateado pela
     fração casada das vendas).
   - `risco_adicional_descoberto` = `strike_vendido × qtd_descoberta`, com
     `risco_ilimitado_parcial=true`.
4. **Tipos**: PUT_SECA, CALL_SECA, TRAVA_ALTA, TRAVA_BAIXA, IRON_CONDOR, DESCOBERTA_MISTA,
   ESTRUTURA_COMPLEXA (fallback: `revisao_manual=true`, fora dos agregados).
   Tipo de opção indeterminável ⇒ ESTRUTURA_COMPLEXA (nenhuma suposição silenciosa).
5. **Concentração por RISCO REAL**: `concentracao_risco_pct` (travado, limite padrão 25%)
   e `concentracao_descoberta_pct` (descoberto, limite padrão 15% — mais rígido, porque ali
   o notional É o risco).
6. **`custo_zerar`** com convenção única e documentada: **positivo = crédito recebido** ao
   zerar; **negativo = débito pago**. (Fechar VENDA = recompra = paga; fechar COMPRA = vende
   = recebe.) Ponto de alta atenção — já causou erro de sinal invertido nesta conta.

## Validação em dados reais (snapshot 2026-07-15, patrimônio R$150.000)
BBDC4 — o caso do notional inflado:

| | ANTES (notional bruto) | DEPOIS (risco real) |
|---|---|---|
| BBDC4 | R$153.294 (102,2%) | **R$8.350 travado + R$3.512 descoberto = R$11.862 (~7,9%)** |

A nova visão também revela o que o bruto escondia: o risco de verdade é o **descoberto** —
EGIE3 27,6% e VALE3 16,1% do patrimônio (acima do limite de 15%), enquanto as travas
cobertas da BBDC4 quase não pesam.

## Testes
`status_engine.test.ts` — 9 oráculos calculados à mão (a–i): PUT_SECA, TRAVA_ALTA casada,
TRAVA_ALTA desigual (venda>compra), DESCOBERTA_MISTA, IRON_CONDOR, agregação multi-entrada,
tipo indeterminado sem crash, casamento multi-strike e convenção de sinal do custo_zerar.
Rodar: `node --experimental-strip-types patches/google-sheets-mcp/status_engine.test.ts`.

## Breaking change
`notional_vendido` / `pct_patrimonio` saíram. Use `concentracao_risco_pct` +
`concentracao_descoberta_pct`. O notional bruto continua como `notional_vendido_bruto`
(apenas referência). A ferramenta **não** decide rolar/encerrar — isso é do `get_analise_manejo`.

## Deploy
`./scripts/aplicar_status_operacoes_v2.sh` (roda os testes antes de subir; redeploy preserva
o anti cold-start lazy + cpu-boost, custo ~R$0).
