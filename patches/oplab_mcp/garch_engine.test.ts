// Testes do simulador de volatilidade GARCH(1,1) + Monte Carlo.
// Executar: node --experimental-strip-types garch_engine.test.ts
import {
  logReturns,
  ajustarGarch11,
  projetarVolFutura,
  monteCarloGarch,
  calcularProbExercicio,
  normalizarGarchParams,
  getSimuladorVolatilidadeGarch,
  type GarchFitResult,
} from "./garch_engine.ts";

let passed = 0;
function ok(desc: string, cond: boolean) {
  if (cond) { console.log(`  ✓ ${desc}`); passed++; }
  else { console.log(`  ✗ ${desc}`); process.exitCode = 1; }
}

console.log("garch_engine — testes\n");

// ── Fixture sintética: 130 dias calmos + 30 dias turbulentos (vol clustering
//    deliberado, determinístico — sem aleatoriedade, para reprodutibilidade) ─
function fixtureClosesComClustering(): number[] {
  const closes: number[] = [100];
  // 130 dias "calmos": oscilação pequena e determinística
  for (let t = 1; t <= 130; t++) {
    const r = 0.002 * Math.sin(t * 1.7) + 0.0005 * Math.cos(t * 0.9);
    closes.push(closes[closes.length - 1] * Math.exp(r));
  }
  // 30 dias "turbulentos": amplitude ~15x maior
  for (let t = 1; t <= 30; t++) {
    const r = 0.03 * Math.sin(t * 2.3) + 0.015 * Math.cos(t * 1.1);
    closes.push(closes[closes.length - 1] * Math.exp(r));
  }
  return closes;
}

// ── 1. test_garch_model ───────────────────────────────────────────────────
{
  const closes = fixtureClosesComClustering();
  const returns = logReturns(closes);
  const fit = ajustarGarch11(returns);
  ok("GARCH converge na fixture com vol clustering", fit.convergiu);
  ok("alpha e beta dentro do domínio válido (>=0, soma<1)", fit.alpha >= 0 && fit.beta >= 0 && fit.alpha + fit.beta < 1);

  // vol condicional média do período calmo (primeiros 100 retornos) vs vol
  // projetada para o dia seguinte ao período turbulento (fim da série).
  const returnsCalmos = returns.slice(0, 100);
  const volMediaCalma = Math.sqrt(returnsCalmos.reduce((s, r) => s + r * r, 0) / returnsCalmos.length);
  ok(
    "vol condicional projetada após período turbulento > vol média do período calmo (prova de clustering)",
    fit.vol_condicional_diaria > volMediaCalma
  );

  // Caso degenerado: preço constante → sem variação → não converge com erro explícito
  const closesConstantes = new Array(60).fill(100);
  const fitDegenerado = ajustarGarch11(logReturns(closesConstantes));
  ok("série degenerada (preço constante) retorna convergiu=false com motivo explícito", !fitDegenerado.convergiu && !!fitDegenerado.motivo_nao_convergencia);
}

// ── 2. test_monte_carlo ────────────────────────────────────────────────────
{
  // Vol condicional CONSTANTE (caso degenerado do GARCH: alpha=beta=0) — a
  // simulação deve bater com a fórmula fechada do GBM log-normal.
  const spot = 100, sigma = 0.02, nDias = 20, nSim = 50_000, seed = 42;
  const volPath = new Array(nDias).fill(sigma);
  const mc = monteCarloGarch(spot, volPath, 0, nSim, seed);

  // Fórmula fechada: log(S_T/S0) ~ Normal(-0.5*nDias*sigma^2, nDias*sigma^2)
  const mu = -0.5 * nDias * sigma * sigma;
  const sd = sigma * Math.sqrt(nDias);
  // mediana teórica (P50) = S0 * exp(mu)
  const p50Teorico = spot * Math.exp(mu);
  const erroRelP50 = Math.abs(mc.percentis.p50 - p50Teorico) / p50Teorico;
  ok(`P50 simulado (${mc.percentis.p50}) bate com fórmula fechada (${p50Teorico.toFixed(2)}) dentro de 1%`, erroRelP50 < 0.01);

  // P95 teórico via aproximação normal (z=1.645)
  const p95Teorico = spot * Math.exp(mu + 1.645 * sd);
  const erroRelP95 = Math.abs(mc.percentis.p95 - p95Teorico) / p95Teorico;
  ok(`P95 simulado (${mc.percentis.p95}) bate com fórmula fechada (${p95Teorico.toFixed(2)}) dentro de 2%`, erroRelP95 < 0.02);

  // Reprodutibilidade: mesma semente → mesmo resultado
  const mc2 = monteCarloGarch(spot, volPath, 0, nSim, seed);
  ok("mesma semente reproduz exatamente o mesmo resultado", JSON.stringify(mc.percentis) === JSON.stringify(mc2.percentis));

  // Semente diferente → resultado diferente
  const mc3 = monteCarloGarch(spot, volPath, 0, nSim, 7);
  ok("semente diferente muda o resultado", JSON.stringify(mc.percentis) !== JSON.stringify(mc3.percentis));
}

// ── 3. test_prob_exercicio ─────────────────────────────────────────────────
{
  const precosFinais = [80, 85, 90, 95, 100, 105, 110, 115, 120, 125]; // 10 preços, à mão
  const strikes = [
    { strike: 100, tipo: "PUT" as const },   // 4/10 abaixo de 100 → 40%
    { strike: 100, tipo: "CALL" as const },  // 5/10 acima de 100 → 50%
  ];
  const resultados = calcularProbExercicio(precosFinais, strikes, 5);
  ok("probabilidade PUT bate com cálculo manual (40%)", resultados[0].probabilidade_pct === 40);
  ok("probabilidade CALL bate com cálculo manual (50%)", resultados[1].probabilidade_pct === 50);

  // Divergência: 3pp não deve alertar, 8pp deve alertar (threshold=5)
  const semAlerta = calcularProbExercicio(precosFinais, [{ strike: 100, tipo: "PUT" as const, delta_bs: -0.37 }], 5); // |delta|=37%, prob=40% → diff=3pp
  ok("diferença de 3pp NÃO dispara alerta (threshold=5pp)", semAlerta[0].divergencia_pp === 3 && !semAlerta[0].alerta_divergencia);

  const comAlerta = calcularProbExercicio(precosFinais, [{ strike: 100, tipo: "PUT" as const, delta_bs: -0.32 }], 5); // |delta|=32%, prob=40% → diff=8pp
  ok("diferença de 8pp DISPARA alerta (threshold=5pp)", comAlerta[0].divergencia_pp === 8 && !!comAlerta[0].alerta_divergencia);
}

// ── 4. Projeção de vol futura (caminho, não número único) ──────────────────
{
  const fitAlta: GarchFitResult = {
    convergiu: true, omega: 0.00001, alpha: 0.1, beta: 0.85,
    vol_condicional_diaria: 0.03, vol_condicional_anualizada: 0.03 * Math.sqrt(252),
    vol_historica_simples_anualizada_pct: 20,
  };
  const path = projetarVolFutura(fitAlta, 10);
  ok("caminho de vol futura tem o número de dias pedido", path.length === 10);
  // Persistência 0.95 < 1 → converge para a vol de longo prazo (decai a partir do choque inicial alto)
  ok("vol de choque alto DECAI ao longo do caminho projetado (reversão à média)", path[9] < path[0]);
}

// ── 5. Teste de integração — main() fim-a-fim com client mockado ──────────
{
  const closes = fixtureClosesComClustering();
  const candles = closes.map((c, i) => ({ date: `2026-01-${String((i % 28) + 1).padStart(2, "0")}`, close: c, open: c, high: c, low: c, volume: 0 }));
  const clientOk = {
    get: async () => ({ data: { data: candles } }),
  } as unknown as import("axios").AxiosInstance;

  await (async () => {
    const resultado: any = await getSimuladorVolatilidadeGarch(clientOk, {
      ticker: "TESTE4",
      dte_dias: 20,
      strikes: [{ strike: closes[closes.length - 1] * 0.9, tipo: "PUT", delta_bs: -0.25 }],
    });
    ok("integração fim-a-fim retorna campos esperados (garch, percentis, probabilidades)", !!resultado.garch && !!resultado.percentis_preco_vencimento && Array.isArray(resultado.probabilidades_exercicio));
    ok("metodologia é exposta na resposta", typeof resultado.metodologia === "string" && resultado.metodologia.length > 0);
  })();

  // Propagação de erro: histórico insuficiente
  const clientPoucosDados = {
    get: async () => ({ data: { data: candles.slice(0, 5) } }),
  } as unknown as import("axios").AxiosInstance;
  await (async () => {
    const resultado: any = await getSimuladorVolatilidadeGarch(clientPoucosDados, {
      ticker: "TESTE4", dte_dias: 20, strikes: [{ strike: 90, tipo: "PUT" }],
    });
    ok("histórico insuficiente propaga DADOS_INCOMPLETOS (sem fallback silencioso)", resultado.erro === "DADOS_INCOMPLETOS" && /histórico insuficiente/.test(resultado.motivo));
  })();

  // Validação de entrada: sem strikes
  const semStrikes: any = await getSimuladorVolatilidadeGarch(clientOk, { ticker: "TESTE4", dte_dias: 20, strikes: [] });
  ok("sem strikes retorna DADOS_INCOMPLETOS", semStrikes.erro === "DADOS_INCOMPLETOS");

  // Validação de entrada: sem vencimento nem dte_dias
  const semVencimento: any = await getSimuladorVolatilidadeGarch(clientOk, { ticker: "TESTE4", strikes: [{ strike: 90, tipo: "PUT" }] });
  ok("sem vencimento/dte_dias retorna DADOS_INCOMPLETOS", semVencimento.erro === "DADOS_INCOMPLETOS");
}

// ── 6. normalizarGarchParams — defaults e clamping ─────────────────────────
{
  const p = normalizarGarchParams({ ticker: "petr4", strikes: [{ strike: 30, tipo: "PUT" }] });
  ok("ticker é normalizado para maiúsculo", p.ticker === "PETR4");
  ok("n_simulacoes default é 50000", p.n_simulacoes === 50_000);
  ok("semente_aleatoria default é 42 (determinístico)", p.semente_aleatoria === 42);
  ok("drift_padrao default é 0 (neutro)", p.drift_padrao === 0);
  const pClamped = normalizarGarchParams({ ticker: "X", strikes: [], n_simulacoes: 999_999_999 });
  ok("n_simulacoes é limitado ao teto (100000)", pClamped.n_simulacoes === 100_000);
}

console.log(`\n${process.exitCode ? "❌" : "✅"} ${passed} testes passaram.`);
