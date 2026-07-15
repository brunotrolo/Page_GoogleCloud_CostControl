// Testes de get_status_operacoes (núcleo puro). Cada oráculo foi calculado À MÃO
// ANTES de rodar (comentado ao lado). Rodar com:
//   node --experimental-strip-types status_engine.test.ts
import assert from 'node:assert';
import { buildStatusOperacoes, casarProtecao } from './status_engine.ts';

const HOJE = new Date('2026-07-15T00:00:00.000Z');
let passed = 0;
function t(nome: string, fn: () => void) { fn(); passed++; console.log(`  ✓ ${nome}`); }
const approx = (a: number, b: number, tol = 0.01) => Math.abs(a - b) <= tol;

// Fábrica de linha crua da planilha (nomes de coluna reais da aba COCKPIT).
function row(o: Partial<Record<string, any>>): any {
  return {
    STATUS: 'ATIVO', TICKER: 'XPTO3', OPTION_TICKER: 'XPTO1', SIDE: 'VENDA',
    OPTION_TYPE: 'PUT', QUANTITY: '1000', STRIKE: '20.00', SPOT: '25.00',
    LAST_PREMIUM: '0.50', ENTRY_PRICE: '1.00', PL_VALUE: '0.00', EXPIRY: '18/09/2026',
    ...o,
  };
}
function build(rows: any[], args: any = {}) { return buildStatusOperacoes(rows, args, HOJE); }
function only(rows: any[], args: any = {}) { const r = build(rows, args); assert.strictEqual(r.estruturas.length, 1, 'esperava 1 estrutura'); return r.estruturas[0]; }

console.log('status_engine — testes com oráculos manuais\n');

// (a) PUT_SECA simples ────────────────────────────────────────────────────────
// 1 PUT vendida 1000 @ 20; sem proteção. Oráculo:
//   desembolso = 20×1000 = 20000; custo_zerar = −(0.50×1000) = −500 (débito);
//   risco_ilimitado=true; qtd_descoberta_put=1000.
t('(a) PUT_SECA simples', () => {
  const e = only([row({ OPTION_TICKER: 'XPTOA', SIDE: 'VENDA', OPTION_TYPE: 'PUT', QUANTITY: '1000', STRIKE: '20.00', ENTRY_PRICE: '1.00', LAST_PREMIUM: '0.50' })]);
  assert.strictEqual(e.tipo, 'PUT_SECA');
  assert.strictEqual(e.risco_ilimitado, true);
  assert.ok(approx(e.desembolso_se_exercido_total, 20000));
  assert.ok(approx(e.custo_zerar, -500), `custo_zerar=${e.custo_zerar}`);
  assert.strictEqual(e.qtd_vendida_put, 1000);
  assert.strictEqual(e.qtd_descoberta_put, 1000);
});

// (b) TRAVA_ALTA casada igual ─────────────────────────────────────────────────
// VENDA PUT 1000 @ 20 (entry 1.00, last 0.50) + COMPRA PUT 1000 @ 18 (entry 0.40, last 0.20).
// largura=2.00 ⇒ bruto=2000; credito=(1.00−0.40)×1000=600 ⇒ risco_travado=1400.
// custo_zerar = −0.50×1000 + 0.20×1000 = −300 (débito).
t('(b) TRAVA_ALTA casada igual', () => {
  const e = only([
    row({ OPTION_TICKER: 'V', SIDE: 'VENDA', OPTION_TYPE: 'PUT', QUANTITY: '1000', STRIKE: '20.00', ENTRY_PRICE: '1.00', LAST_PREMIUM: '0.50' }),
    row({ OPTION_TICKER: 'C', SIDE: 'COMPRA', OPTION_TYPE: 'PUT', QUANTITY: '1000', STRIKE: '18.00', ENTRY_PRICE: '0.40', LAST_PREMIUM: '0.20' }),
  ]);
  assert.strictEqual(e.tipo, 'TRAVA_ALTA');
  assert.strictEqual(e.qtd_casada_put, 1000);
  assert.strictEqual(e.qtd_descoberta_put, 0);
  assert.ok(approx(e.risco_maximo_travado, 1400), `risco=${e.risco_maximo_travado}`);
  assert.strictEqual(e.risco_ilimitado, false);
  assert.strictEqual(e.risco_ilimitado_parcial, false);
  assert.ok(approx(e.custo_zerar, -300), `custo_zerar=${e.custo_zerar}`);
});

// (c) TRAVA_ALTA DESIGUAL (venda > compra — o caso real BBDC4/ITUB4) ──────────
// VENDA PUT 800 @ 20 (entry 1.00) + COMPRA PUT 700 @ 18 (entry 0.40).
// casada=700, descoberta=100. bruto=2.00×700=1400.
// credito_total=1.00×800 − 0.40×700 = 800−280 = 520 ⇒ credito_casado=520×700/800=455.
// risco_travado = 1400−455 = 945. risco_adicional_descoberto = 20×100 = 2000. parcial=true.
t('(c) TRAVA_ALTA desigual (venda>compra)', () => {
  const e = only([
    row({ OPTION_TICKER: 'V', SIDE: 'VENDA', OPTION_TYPE: 'PUT', QUANTITY: '800', STRIKE: '20.00', ENTRY_PRICE: '1.00', LAST_PREMIUM: '0.50' }),
    row({ OPTION_TICKER: 'C', SIDE: 'COMPRA', OPTION_TYPE: 'PUT', QUANTITY: '700', STRIKE: '18.00', ENTRY_PRICE: '0.40', LAST_PREMIUM: '0.20' }),
  ]);
  assert.strictEqual(e.tipo, 'TRAVA_ALTA');
  assert.strictEqual(e.qtd_casada_put, 700);
  assert.strictEqual(e.qtd_descoberta_put, 100);
  assert.ok(approx(e.risco_maximo_travado, 945), `risco_travado=${e.risco_maximo_travado}`);
  assert.ok(approx(e.risco_adicional_descoberto, 2000), `desc=${e.risco_adicional_descoberto}`);
  assert.strictEqual(e.risco_ilimitado_parcial, true);
});

// (d) DESCOBERTA_MISTA (PUT vendida + CALL comprada, que não protege) ─────────
// VENDA PUT 500 @ 30 (entry 2.00) + COMPRA CALL 500 @ 35. Oráculo:
//   tipo DESCOBERTA_MISTA; risco_ilimitado=true; desembolso=30×500=15000.
//   custo_zerar = −(1.00×500) [recompra put] + (0.30×500) [vende call] = −350.
t('(d) DESCOBERTA_MISTA (put vendida + call comprada)', () => {
  const e = only([
    row({ OPTION_TICKER: 'VP', SIDE: 'VENDA', OPTION_TYPE: 'PUT', QUANTITY: '500', STRIKE: '30.00', SPOT: '31.00', ENTRY_PRICE: '2.00', LAST_PREMIUM: '1.00' }),
    row({ OPTION_TICKER: 'CC', SIDE: 'COMPRA', OPTION_TYPE: 'CALL', QUANTITY: '500', STRIKE: '35.00', SPOT: '31.00', ENTRY_PRICE: '0.50', LAST_PREMIUM: '0.30' }),
  ]);
  assert.strictEqual(e.tipo, 'DESCOBERTA_MISTA');
  assert.strictEqual(e.risco_ilimitado, true);
  assert.ok(approx(e.desembolso_se_exercido_total, 15000));
  assert.ok(approx(e.custo_zerar, -350), `custo_zerar=${e.custo_zerar}`);
});

// (e) IRON_CONDOR completo ────────────────────────────────────────────────────
// VP 1000@90(e1.00) CP 1000@85(e0.40) | VC 1000@110(e1.00) CC 1000@115(e0.40).
// put: bruto=5×1000=5000, credito=600 ⇒ 4400. call: bruto=5×1000=5000, credito=600 ⇒ 4400.
// risco_travado total = 8800. desembolso = 90×1000 + 110×1000 = 200000.
t('(e) IRON_CONDOR completo', () => {
  const e = only([
    row({ OPTION_TICKER: 'VP', SIDE: 'VENDA', OPTION_TYPE: 'PUT', QUANTITY: '1000', STRIKE: '90.00', SPOT: '100.00', ENTRY_PRICE: '1.00', LAST_PREMIUM: '0.50' }),
    row({ OPTION_TICKER: 'CP', SIDE: 'COMPRA', OPTION_TYPE: 'PUT', QUANTITY: '1000', STRIKE: '85.00', SPOT: '100.00', ENTRY_PRICE: '0.40', LAST_PREMIUM: '0.20' }),
    row({ OPTION_TICKER: 'VC', SIDE: 'VENDA', OPTION_TYPE: 'CALL', QUANTITY: '1000', STRIKE: '110.00', SPOT: '100.00', ENTRY_PRICE: '1.00', LAST_PREMIUM: '0.50' }),
    row({ OPTION_TICKER: 'CC', SIDE: 'COMPRA', OPTION_TYPE: 'CALL', QUANTITY: '1000', STRIKE: '115.00', SPOT: '100.00', ENTRY_PRICE: '0.40', LAST_PREMIUM: '0.20' }),
  ]);
  assert.strictEqual(e.tipo, 'IRON_CONDOR');
  assert.ok(approx(e.risco_maximo_travado, 8800), `risco=${e.risco_maximo_travado}`);
  assert.ok(approx(e.desembolso_se_exercido_total, 200000));
  assert.strictEqual(e.qtd_casada_put, 1000);
  assert.strictEqual(e.qtd_casada_call, 1000);
});

// (f) Duas vendas do mesmo tipo/vencimento em strikes diferentes ⇒ agregadas ──
// VENDA PUT 1000 @ 20 + VENDA PUT 500 @ 21, mesmo TICKER/EXPIRY, sem proteção.
// Oráculo: 1 estrutura PUT_SECA; qtd_vendida_put=1500; desembolso=20×1000+21×500=30500.
t('(f) duas vendas mesmo tipo/vencimento agregadas', () => {
  const r = build([
    row({ OPTION_TICKER: 'V1', SIDE: 'VENDA', OPTION_TYPE: 'PUT', QUANTITY: '1000', STRIKE: '20.00', ENTRY_PRICE: '1.00' }),
    row({ OPTION_TICKER: 'V2', SIDE: 'VENDA', OPTION_TYPE: 'PUT', QUANTITY: '500', STRIKE: '21.00', ENTRY_PRICE: '1.20' }),
  ]);
  assert.strictEqual(r.estruturas.length, 1, 'deve agregar em UMA estrutura');
  const e = r.estruturas[0];
  assert.strictEqual(e.tipo, 'PUT_SECA');
  assert.strictEqual(e.qtd_vendida_put, 1500);
  assert.ok(approx(e.desembolso_se_exercido_total, 30500), `desemb=${e.desembolso_se_exercido_total}`);
});

// (g) ESTRUTURA_COMPLEXA / tipo indeterminado NÃO quebra e sai dos agregados ──
// OPTION_TYPE vazio ⇒ revisao_manual=true, fora de risco_travado/descoberto.
t('(g) tipo indeterminado ⇒ revisao_manual, sem crash', () => {
  const r = build([
    row({ OPTION_TICKER: 'ZZ', SIDE: 'VENDA', OPTION_TYPE: '', QUANTITY: '300', STRIKE: '10.00' }),
  ]);
  const e = r.estruturas[0];
  assert.strictEqual(e.tipo, 'ESTRUTURA_COMPLEXA');
  assert.strictEqual(e.revisao_manual, true);
  assert.strictEqual(r.resumo.risco_descoberto_carteira, 0, 'nao entra no risco');
  assert.strictEqual(r.resumo.alerta_revisao_manual.length, 1);
});

// (h) casarProtecao multi-strike (put ladder) — pareamento por chunks ─────────
// sold: 18.33/3000, 17.83/4000 ; bought: 17.33/3000, 16.83/4000. Ambas larguras=1.00.
// bruto = 1.00×3000 + 1.00×4000 = 7000; casada=7000; descoberta=0.
t('(h) casarProtecao put ladder multi-strike', () => {
  const m = casarProtecao(
    [{ strike: 17.83, quantity: 4000, entry: 0.35 }, { strike: 18.33, quantity: 3000, entry: 0.54 }],
    [{ strike: 16.83, quantity: 4000, entry: 0.17 }, { strike: 17.33, quantity: 3000, entry: 0.27 }],
    true,
  );
  assert.strictEqual(m.qtd_casada, 7000);
  assert.strictEqual(m.qtd_descoberta, 0);
  assert.ok(approx(m.largura_risco_bruto, 7000), `bruto=${m.largura_risco_bruto}`);
});

// (i) Convenção de sinal do custo_zerar — trava que gera CRÉDITO ao zerar ──────
// VENDA PUT 1000 @ last 0.20 (recompra barata) + COMPRA PUT 1000 @ last 0.60 (vende cara).
// custo = −0.20×1000 + 0.60×1000 = +400 ⇒ POSITIVO = crédito recebido ao zerar.
t('(i) custo_zerar positivo = credito recebido', () => {
  const e = only([
    row({ OPTION_TICKER: 'V', SIDE: 'VENDA', OPTION_TYPE: 'PUT', QUANTITY: '1000', STRIKE: '20.00', ENTRY_PRICE: '1.00', LAST_PREMIUM: '0.20' }),
    row({ OPTION_TICKER: 'C', SIDE: 'COMPRA', OPTION_TYPE: 'PUT', QUANTITY: '1000', STRIKE: '18.00', ENTRY_PRICE: '0.40', LAST_PREMIUM: '0.60' }),
  ]);
  assert.ok(approx(e.custo_zerar, 400), `custo_zerar=${e.custo_zerar}`);
  assert.match(e.custo_zerar_convencao, /positivo = credito/);
});

console.log(`\n✅ ${passed} testes passaram.`);
