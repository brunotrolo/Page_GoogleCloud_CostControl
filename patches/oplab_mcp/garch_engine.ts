// ---------------------------------------------------------------------------
// Simulador de Volatilidade — GARCH(1,1) + Monte Carlo
//
// Ferramenta NOVA e independente (não altera nenhuma outra ferramenta/skill).
// Estima a volatilidade CONDICIONAL via GARCH(1,1) — que reage a clusters de
// volatilidade (vol de hoje correlacionada com vol de ontem), ao contrário da
// vol histórica simples de janela fixa — e usa essa vol (variável dia-a-dia,
// não constante) para simular o preço no vencimento via Monte Carlo (GBM).
//
// Sempre busca dados PRÓPRIOS e frescos (histórico OHLC) na hora em que roda
// — nunca herda volatilidade/preço/dado de mercado de outra chamada.
//
// Esta ferramenta NÃO decide nada e NÃO grava nada (read-only, stateless):
// devolve probabilidade de exercício como "estatística complementar" e
// percentis crus de preço. NÃO substitui o delta Black-Scholes do OpLab como
// métrica oficial de entrada — apenas contrasta os dois números e sinaliza
// divergência (fato numérico calculado), nunca uma recomendação de ação.
// ---------------------------------------------------------------------------

import type { AxiosInstance } from "axios";

const DAY_MS = 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 20_000;

// ── Parsing de candles (mesma lógica de backtest_engine.ts, duplicada aqui
//    para manter este arquivo autocontido — convenção já usada no projeto:
//    cada engine tem seu próprio parsing/RNG, sem acoplamento cruzado). ────
interface Candle { date: string; close: number; }
function toDateStr(t: number): string {
  const ms = t < 1e12 ? t * 1000 : t;
  return new Date(ms).toISOString().slice(0, 10);
}
function extractCandles(raw: unknown): Candle[] {
  const obj = raw as Record<string, unknown> | undefined;
  const rows = Array.isArray(raw) ? raw : obj && Array.isArray(obj.data) ? (obj.data as unknown[]) : [];
  return rows
    .map((row): Candle => {
      const r = row as Record<string, unknown>;
      const close = Number(r.close ?? r.c ?? r.price);
      const rawDate = r.date ?? r.datetime ?? r.time;
      const date = typeof rawDate === "string" ? rawDate.slice(0, 10) : toDateStr(Number(rawDate));
      return { date, close };
    })
    .filter((c) => isFinite(c.close) && c.close > 0 && c.date.length === 10)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function parseDate(s: string): Date {
  return new Date(s + "T00:00:00Z");
}
function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function round(x: number, n = 4): number {
  const f = 10 ** n;
  return Math.round(x * f) / f;
}
function num(v: unknown, def: number): number {
  const n = Number(v);
  return isFinite(n) ? n : def;
}

// ── RNG determinístico (mulberry32 + Box-Muller) — mesma técnica já usada em
//    manejo_engine.ts, reimplementada aqui p/ manter este arquivo autocontido
//    (convenção já adotada no projeto: cada engine tem sua própria RNG). ────
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gaussFactory(rand: () => number): () => number {
  let spare: number | null = null;
  return () => {
    if (spare !== null) {
      const v = spare;
      spare = null;
      return v;
    }
    let u = 0, v = 0;
    do { u = rand(); } while (u === 0);
    v = rand();
    const mag = Math.sqrt(-2 * Math.log(u));
    spare = mag * Math.sin(2 * Math.PI * v);
    return mag * Math.cos(2 * Math.PI * v);
  };
}

// ── 1. Retornos log ───────────────────────────────────────────────────────
export function logReturns(closes: number[]): number[] {
  const r: number[] = [];
  for (let i = 1; i < closes.length; i++) r.push(Math.log(closes[i] / closes[i - 1]));
  return r;
}

// ── 2. Ajuste GARCH(1,1) por máxima verossimilhança (Nelder-Mead) ─────────
//
// sigma_t^2 = omega + alpha*r_{t-1}^2 + beta*sigma_{t-1}^2 , sigma_1^2 = var amostral
// LL = -0.5 * soma[ log(2π) + log(sigma_t^2) + r_t^2/sigma_t^2 ]
// Maximizamos LL (minimizamos -LL) sujeito a omega>0, alpha>=0, beta>=0,
// alpha+beta<1 (estacionariedade) — os parâmetros são reparametrizados para
// um espaço irrestrito (exp/sigmoide) para que o Nelder-Mead simplex opere
// sem lidar com fronteiras.

export interface GarchFitResult {
  convergiu: boolean;
  motivo_nao_convergencia?: string;
  omega: number;
  alpha: number;
  beta: number;
  vol_condicional_diaria: number; // sigma projetada p/ o PRÓXIMO dia (fração, não %)
  vol_condicional_anualizada: number; // ×sqrt(252) — só para comparação, em fração
  vol_historica_simples_anualizada_pct: number; // desvio-padrão simples ×sqrt(252), em % — contraste
}

function garchLogLik(returns: number[], omega: number, alpha: number, beta: number, sigma2Inicial: number): number {
  const T = returns.length;
  let sigma2 = sigma2Inicial;
  let ll = 0;
  for (let t = 0; t < T; t++) {
    if (t > 0) sigma2 = omega + alpha * returns[t - 1] * returns[t - 1] + beta * sigma2;
    if (!(sigma2 > 1e-14) || !isFinite(sigma2)) return -Infinity;
    ll += -0.5 * (Math.log(2 * Math.PI) + Math.log(sigma2) + (returns[t] * returns[t]) / sigma2);
  }
  return ll;
}

/** Reparametrização irrestrita → (omega>0, alpha∈[0,0.98), beta tal que alpha+beta<0.98). */
function unpackParams(theta: number[], sampleVar: number): [number, number, number] {
  const omega = Math.exp(theta[0]) * sampleVar * 0.05;
  const sig = (x: number) => 1 / (1 + Math.exp(-x));
  const alpha = sig(theta[1]) * 0.98;
  const beta = sig(theta[2]) * (0.98 - alpha);
  return [omega, alpha, beta];
}

/** Nelder-Mead simplex genérico — minimiza f: R^n → R. */
function nelderMead(f: (x: number[]) => number, x0: number[], maxIter: number): { x: number[]; iter: number } {
  const n = x0.length;
  const alpha = 1, gamma = 2, rho = 0.5, sigmaShrink = 0.5;
  let simplex: number[][] = [x0.slice()];
  for (let i = 0; i < n; i++) {
    const p = x0.slice();
    p[i] += p[i] !== 0 ? Math.abs(p[i]) * 0.15 : 0.15;
    simplex.push(p);
  }
  let fvals = simplex.map(f);
  let iter = 0;
  for (; iter < maxIter; iter++) {
    const order = fvals.map((v, i) => [v, i] as [number, number]).sort((a, b) => a[0] - b[0]).map((v) => v[1]);
    simplex = order.map((i) => simplex[i]);
    fvals = order.map((i) => fvals[i]);
    if (Math.abs(fvals[n] - fvals[0]) < 1e-10) break;
    const centroid = new Array(n).fill(0);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) centroid[j] += simplex[i][j] / n;
    const worst = simplex[n];
    const xr = centroid.map((c, j) => c + alpha * (c - worst[j]));
    const fr = f(xr);
    if (fr < fvals[0]) {
      const xe = centroid.map((c, j) => c + gamma * (xr[j] - c));
      const fe = f(xe);
      if (fe < fr) { simplex[n] = xe; fvals[n] = fe; } else { simplex[n] = xr; fvals[n] = fr; }
    } else if (fr < fvals[n - 1]) {
      simplex[n] = xr; fvals[n] = fr;
    } else {
      const xc = centroid.map((c, j) => c + rho * (worst[j] - c));
      const fc = f(xc);
      if (fc < fvals[n]) { simplex[n] = xc; fvals[n] = fc; }
      else {
        for (let i = 1; i <= n; i++) {
          simplex[i] = simplex[i].map((v, j) => simplex[0][j] + sigmaShrink * (v - simplex[0][j]));
          fvals[i] = f(simplex[i]);
        }
      }
    }
  }
  const order = fvals.map((v, i) => [v, i] as [number, number]).sort((a, b) => a[0] - b[0]).map((v) => v[1]);
  return { x: simplex[order[0]], iter };
}

export function ajustarGarch11(returns: number[]): GarchFitResult {
  const T = returns.length;
  const sampleVar = returns.reduce((s, r) => s + r * r, 0) / T;
  const volHistSimplesPct = T > 1 ? round(Math.sqrt(returns.reduce((s, r) => s + r * r, 0) / (T - 1)) * Math.sqrt(252) * 100, 2) : NaN;

  if (!isFinite(sampleVar) || sampleVar < 1e-12) {
    return {
      convergiu: false,
      motivo_nao_convergencia: "série sem variação (retornos constantes ou degenerados) — GARCH exige variância amostral positiva",
      omega: NaN, alpha: NaN, beta: NaN,
      vol_condicional_diaria: NaN, vol_condicional_anualizada: NaN,
      vol_historica_simples_anualizada_pct: volHistSimplesPct,
    };
  }

  const negLL = (theta: number[]) => {
    const [omega, alpha, beta] = unpackParams(theta, sampleVar);
    const ll = garchLogLik(returns, omega, alpha, beta, sampleVar);
    return isFinite(ll) ? -ll : 1e12;
  };
  // ponto inicial típico p/ ações: alpha~0.08, beta~0.90 (persistência alta, padrão do mercado)
  const theta0 = [Math.log(1 / 0.05), Math.log(0.08 / (1 - 0.08)), Math.log(0.90 / (0.98 - 0.90 * 0.98))];
  const { x, iter } = nelderMead(negLL, theta0, 4000);
  const [omega, alpha, beta] = unpackParams(x, sampleVar);
  const persistencia = alpha + beta;
  const llFinal = garchLogLik(returns, omega, alpha, beta, sampleVar);

  const convergiu = iter < 4000 && omega > 0 && alpha >= 0 && beta >= 0 && persistencia < 0.999 && isFinite(llFinal);
  if (!convergiu) {
    return {
      convergiu: false,
      motivo_nao_convergencia: "otimizador não convergiu dentro do limite de iterações, ou parâmetros na fronteira de estacionariedade (alpha+beta>=1)",
      omega, alpha, beta,
      vol_condicional_diaria: NaN, vol_condicional_anualizada: NaN,
      vol_historica_simples_anualizada_pct: volHistSimplesPct,
    };
  }

  // sigma2 filtrado recursivamente até o penúltimo retorno, depois projeta o próximo dia
  let sigma2 = sampleVar;
  for (let t = 1; t < T; t++) sigma2 = omega + alpha * returns[t - 1] * returns[t - 1] + beta * sigma2;
  const sigma2Proximo = omega + alpha * returns[T - 1] * returns[T - 1] + beta * sigma2;

  return {
    convergiu: true, omega, alpha, beta,
    vol_condicional_diaria: Math.sqrt(sigma2Proximo),
    vol_condicional_anualizada: Math.sqrt(sigma2Proximo) * Math.sqrt(252),
    vol_historica_simples_anualizada_pct: volHistSimplesPct,
  };
}

/** Projeta a vol condicional (diária, em fração) dia-a-dia até `nDias` à frente. */
export function projetarVolFutura(fit: GarchFitResult, nDias: number): number[] {
  const persistencia = fit.alpha + fit.beta;
  const vol: number[] = [];
  let sigma2 = fit.vol_condicional_diaria ** 2;
  for (let h = 0; h < nDias; h++) {
    if (h > 0) sigma2 = fit.omega + persistencia * sigma2;
    vol.push(Math.sqrt(sigma2));
  }
  return vol;
}

// ── 3. Monte Carlo com vol variável dia-a-dia (GBM, drift neutro por padrão) ─
export interface MonteCarloGarchResult {
  precosFinais: number[];
  percentis: { p5: number; p25: number; p50: number; p75: number; p95: number };
}

export function monteCarloGarch(spot: number, volPathDiaria: number[], drift: number, nSimulacoes: number, seed: number): MonteCarloGarchResult {
  const gauss = gaussFactory(mulberry32(seed));
  const precosFinais = new Array<number>(nSimulacoes);
  for (let p = 0; p < nSimulacoes; p++) {
    let logS = Math.log(spot);
    for (let h = 0; h < volPathDiaria.length; h++) {
      const sigma = volPathDiaria[h];
      logS += drift - 0.5 * sigma * sigma + sigma * gauss();
    }
    precosFinais[p] = Math.exp(logS);
  }
  const sorted = precosFinais.slice().sort((a, b) => a - b);
  const pct = (q: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))))];
  return {
    precosFinais,
    percentis: { p5: round(pct(0.05), 2), p25: round(pct(0.25), 2), p50: round(pct(0.5), 2), p75: round(pct(0.75), 2), p95: round(pct(0.95), 2) },
  };
}

// ── 4. Probabilidade de exercício por strike (+ divergência vs delta BS) ──
export interface StrikeInput { strike: number; tipo: "PUT" | "CALL"; delta_bs?: number; }
export interface ProbExercicioResult {
  strike: number; tipo: "PUT" | "CALL"; probabilidade_pct: number;
  delta_bs?: number; divergencia_pp?: number; alerta_divergencia?: string;
}

export function calcularProbExercicio(precosFinais: number[], strikes: StrikeInput[], divergenciaRelevantePp: number): ProbExercicioResult[] {
  const n = precosFinais.length;
  return strikes.map((s) => {
    let count = 0;
    for (const p of precosFinais) if (s.tipo === "PUT" ? p < s.strike : p > s.strike) count++;
    const probPct = round((count / n) * 100, 2);
    const out: ProbExercicioResult = { strike: s.strike, tipo: s.tipo, probabilidade_pct: probPct };
    if (s.delta_bs !== undefined && isFinite(s.delta_bs)) {
      const deltaRefPct = round(Math.abs(s.delta_bs) * 100, 2);
      const diff = round(probPct - deltaRefPct, 2);
      out.delta_bs = s.delta_bs;
      out.divergencia_pp = diff;
      if (Math.abs(diff) > divergenciaRelevantePp) {
        out.alerta_divergencia = `Divergência de ${diff > 0 ? "+" : ""}${diff}pp entre probabilidade GARCH-MC (${probPct}%) e delta BS (${deltaRefPct}%) — vol implícita e vol condicional/histórica estão descoladas.`;
      }
    }
    return out;
  });
}

// ── 5. Normalização de parâmetros ─────────────────────────────────────────
export interface GarchSimParams {
  ticker: string;
  vencimento?: string;
  dte_dias?: number;
  data_referencia: string;
  strikes: StrikeInput[];
  janela_historico_dias: number;
  minimo_observacoes: number;
  n_simulacoes: number;
  drift_padrao: number;
  semente_aleatoria: number;
  divergencia_relevante_pp: number;
}

export function normalizarGarchParams(a: Record<string, unknown>): GarchSimParams {
  const strikesRaw = Array.isArray(a.strikes) ? a.strikes : [];
  const strikes: StrikeInput[] = strikesRaw
    .map((s): StrikeInput => {
      const o = s as Record<string, unknown>;
      return {
        strike: num(o.strike, NaN),
        tipo: o.tipo === "CALL" ? "CALL" : "PUT",
        delta_bs: o.delta_bs !== undefined ? num(o.delta_bs, NaN) : undefined,
      };
    })
    .filter((s) => isFinite(s.strike));
  return {
    ticker: String(a.ticker ?? "").toUpperCase(),
    vencimento: typeof a.vencimento === "string" ? a.vencimento : undefined,
    dte_dias: a.dte_dias !== undefined ? num(a.dte_dias, NaN) : undefined,
    data_referencia: typeof a.data_referencia === "string" && a.data_referencia ? a.data_referencia : fmtDate(new Date()),
    strikes,
    janela_historico_dias: Math.round(num(a.janela_historico_dias, 252)),
    minimo_observacoes: Math.round(num(a.minimo_observacoes, 40)),
    n_simulacoes: Math.min(100_000, Math.max(2_000, Math.round(num(a.n_simulacoes, 50_000)))),
    drift_padrao: num(a.drift_padrao, 0),
    semente_aleatoria: Math.round(num(a.semente_aleatoria, 42)),
    divergencia_relevante_pp: num(a.divergencia_relevante_pp, 5),
  };
}

// ── 6. Busca de histórico (dados PRÓPRIOS e frescos — nunca herdados) ─────
export async function buscarHistoricoGarch(
  client: AxiosInstance, ticker: string, dataReferencia: string, janelaCorridos: number
): Promise<{ closes: number[]; datas: string[] } | { erro: string }> {
  const to = parseDate(dataReferencia);
  const from = new Date(to.getTime() - janelaCorridos * DAY_MS);
  let candles: Candle[];
  try {
    const { data } = await client.get(`/market/historical/${ticker}/1d`, {
      params: { from: fmtDate(from), to: fmtDate(to) },
      timeout: REQUEST_TIMEOUT_MS,
    });
    candles = extractCandles(data);
  } catch {
    return { erro: `${ticker}: sem resposta da API de histórico (TIMEOUT ou erro de rede)` };
  }
  return { closes: candles.map((c) => c.close), datas: candles.map((c) => c.date) };
}

// ── 7. Orquestrador ────────────────────────────────────────────────────────
export async function getSimuladorVolatilidadeGarch(client: AxiosInstance, argsRaw: Record<string, unknown>): Promise<unknown> {
  const p = normalizarGarchParams(argsRaw);

  if (!p.ticker) return { erro: "DADOS_INCOMPLETOS", motivo: "'ticker' é obrigatório" };
  if (p.strikes.length === 0) {
    return { erro: "DADOS_INCOMPLETOS", motivo: "informe ao menos um strike em 'strikes': [{strike, tipo:'PUT'|'CALL', delta_bs?}]" };
  }
  if (!p.vencimento && (p.dte_dias === undefined || !isFinite(p.dte_dias))) {
    return { erro: "DADOS_INCOMPLETOS", motivo: "informe 'vencimento' (YYYY-MM-DD) ou 'dte_dias' (dias corridos até o vencimento)" };
  }

  const hist = await buscarHistoricoGarch(client, p.ticker, p.data_referencia, p.janela_historico_dias);
  if ("erro" in hist) return { erro: "DADOS_INCOMPLETOS", motivo: hist.erro };
  if (hist.closes.length < p.minimo_observacoes) {
    return { erro: "DADOS_INCOMPLETOS", motivo: `histórico insuficiente para ${p.ticker} (${hist.closes.length} observações, mínimo ${p.minimo_observacoes})` };
  }

  const spot = hist.closes[hist.closes.length - 1];
  const returns = logReturns(hist.closes);
  const fit = ajustarGarch11(returns);
  if (!fit.convergiu) {
    return {
      erro: "DADOS_INCOMPLETOS",
      motivo: `modelo GARCH não convergiu para ${p.ticker}: ${fit.motivo_nao_convergencia}`,
      vol_historica_simples_anualizada_pct: fit.vol_historica_simples_anualizada_pct,
    };
  }

  const dteCorridos = p.dte_dias !== undefined && isFinite(p.dte_dias)
    ? Math.round(p.dte_dias)
    : Math.round((parseDate(p.vencimento!).getTime() - parseDate(p.data_referencia).getTime()) / DAY_MS);
  if (dteCorridos <= 0) return { erro: "DADOS_INCOMPLETOS", motivo: "'vencimento' deve ser posterior a 'data_referencia' (ou 'dte_dias' deve ser > 0)" };
  const diasUteis = Math.max(1, Math.round(dteCorridos * (252 / 365)));

  const volPath = projetarVolFutura(fit, diasUteis);
  const mc = monteCarloGarch(spot, volPath, p.drift_padrao, p.n_simulacoes, p.semente_aleatoria);
  const probabilidades = calcularProbExercicio(mc.precosFinais, p.strikes, p.divergencia_relevante_pp);

  return {
    ticker: p.ticker,
    data_referencia: p.data_referencia,
    spot_atual: round(spot, 2),
    dias_corridos_ate_vencimento: dteCorridos,
    dias_uteis_simulados: diasUteis,
    candles_historico: hist.closes.length,
    garch: {
      omega: fit.omega,
      alpha: round(fit.alpha, 6),
      beta: round(fit.beta, 6),
      persistencia: round(fit.alpha + fit.beta, 6),
      vol_condicional_diaria_pct: round(fit.vol_condicional_diaria * 100, 3),
      vol_condicional_anualizada_pct: round(fit.vol_condicional_anualizada * 100, 2),
      vol_historica_simples_anualizada_pct: fit.vol_historica_simples_anualizada_pct,
    },
    percentis_preco_vencimento: mc.percentis,
    probabilidades_exercicio: probabilidades,
    parametros: {
      n_simulacoes: p.n_simulacoes,
      semente_aleatoria: p.semente_aleatoria,
      drift_padrao: p.drift_padrao,
      divergencia_relevante_pp: p.divergencia_relevante_pp,
      janela_historico_dias: p.janela_historico_dias,
      minimo_observacoes: p.minimo_observacoes,
      aviso_drift: p.drift_padrao !== 0
        ? "drift_padrao != 0 introduz viés direcional — a leitura deixa de ser um 'espelho estatístico neutro' e passa a embutir uma visão própria."
        : undefined,
    },
    metodologia: "GARCH(1,1) ajustado por máxima verossimilhança sobre log-retornos diários, com dados PRÓPRIOS e frescos (nunca herdados de outra chamada). Monte Carlo com GBM usando a vol CONDICIONAL projetada dia-a-dia (não uma vol histórica fixa). A probabilidade de exercício é uma ESTATÍSTICA COMPLEMENTAR — não substitui o delta Black-Scholes do OpLab como métrica oficial de entrada; apenas contrasta os dois números (campo divergencia_pp) sem julgar qual está certo. GARCH(1,1) ainda assume normalidade condicional — não captura caudas extremas tipo gap overnight. Ferramenta read-only e stateless: não decide, não recomenda ação, não grava nada.",
  };
}
