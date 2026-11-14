// Trend fit used on the Findings tab. Ordinary least squares on monthly values with
//   12 month-of-year terms (the seasonal shape), a straight-line trend, and a change in that trend's slope after the
//   release month. Standard errors are Newey-West (robust to autocorrelation up to 12 months).
// Everything is plain arithmetic on the published monthly series; nothing is fitted to anything else.
export const RELEASE = '2022-11';
const ymNum = (ym) => Number(ym.slice(0, 4)) * 12 + Number(ym.slice(5, 7)) - 1;

function solve(A, b) {           // Gaussian elimination with partial pivoting; A is k x k, b is k x m
  const k = A.length, M = A.map((r, i) => [...r, ...b[i]]), m = b[0].length;
  for (let c = 0; c < k; c++) {
    let p = c;
    for (let r = c + 1; r < k; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-12) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < k; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      if (f) for (let j = c; j < k + m; j++) M[r][j] -= f * M[c][j];
    }
  }
  return M.map((r, i) => r.slice(k).map((v) => v / M[i][i]));
}
const normCdf = (z) => { const t = 1 / (1 + 0.2316419 * Math.abs(z)); const d = 0.3989423 * Math.exp((-z * z) / 2); const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return z > 0 ? 1 - p : p; };

// months: ['YYYY-MM'], values: numbers or null. Returns null when there is too little data on either side.
export function trendFit(months, values, { lag = 12, brk = RELEASE } = {}) {
  const t0 = ymNum(brk);
  const rows = [];
  months.forEach((m, i) => { if (values[i] != null && isFinite(values[i])) rows.push({ m, y: values[i], t: (ymNum(m) - t0) / 12, s: Number(m.slice(5, 7)) - 1 }); });
  const nPre = rows.filter((r) => r.t <= 0).length, nPost = rows.length - nPre;
  if (nPre < 24 || nPost < 24) return null;
  const K = 14, xrow = (r) => { const x = new Array(K).fill(0); x[r.s] = 1; x[12] = r.t; x[13] = Math.max(0, r.t); return x; };
  const X = rows.map(xrow), n = rows.length;
  const XtX = Array.from({ length: K }, () => new Array(K).fill(0)), Xty = new Array(K).fill(0);
  X.forEach((x, i) => { for (let a = 0; a < K; a++) { Xty[a] += x[a] * rows[i].y; for (let b = 0; b < K; b++) XtX[a][b] += x[a] * x[b]; } });
  const I = Array.from({ length: K }, (_, i) => Array.from({ length: K }, (_, j) => (i === j ? 1 : 0)));
  const inv = solve(XtX, I);
  if (!inv) return null;
  const beta = inv.map((r) => r.reduce((s, v, j) => s + v * Xty[j], 0));
  const e = X.map((x, i) => rows[i].y - x.reduce((s, v, j) => s + v * beta[j], 0));
  // Newey-West: S = sum_l w_l (G_l + G_l'), G_l = sum_t e_t e_{t-l} x_t x_{t-l}'
  const S = Array.from({ length: K }, () => new Array(K).fill(0));
  for (let l = 0; l <= lag; l++) {
    const w = l === 0 ? 1 : 1 - l / (lag + 1);
    for (let i = l; i < n; i++) {
      const f = w * e[i] * e[i - l];
      for (let a = 0; a < K; a++) for (let b = 0; b < K; b++) { S[a][b] += f * X[i][a] * X[i - l][b]; if (l) S[a][b] += f * X[i - l][a] * X[i][b]; }
    }
  }
  const mul = (A, B) => A.map((r) => B[0].map((_, j) => r.reduce((s, v, k2) => s + v * B[k2][j], 0)));
  const V = mul(mul(inv, S), inv).map((r) => r.map((v) => (v * n) / (n - K)));
  const season = beta.slice(0, 12), level = season.reduce((a, b) => a + b, 0) / 12;
  const pre = beta[12], dSlope = beta[13], post = pre + dSlope;
  const se = (v) => Math.sqrt(Math.max(v, 0));
  const sePre = se(V[12][12]), seD = se(V[13][13]), sePost = se(V[12][12] + V[13][13] + 2 * V[12][13]);
  const z = dSlope / seD, p = 2 * (1 - normCdf(Math.abs(z)));
  const ybar = rows.reduce((s, r) => s + r.y, 0) / n;
  const sse = e.reduce((s, v) => s + v * v, 0);
  const r2 = 1 - sse / rows.reduce((s, r) => s + (r.y - ybar) ** 2, 0);
  const fitAt = (m, counterfactual = false) => { const t = (ymNum(m) - t0) / 12; return season[Number(m.slice(5, 7)) - 1] + pre * t + (counterfactual ? 0 : dSlope * Math.max(0, t)); };
  return { n, nPre, nPost, sse, brk, level, pre, post, dSlope, sePre, sePost, seD, z, p, r2, lag, significant: p < 0.05, postSignificant: Math.abs(post / sePost) > 1.96, preSignificant: Math.abs(pre / sePre) > 1.96,
    first: rows[0].m, last: rows[n - 1].m, fitAt };
}

// hours-weighted trailing 12-month mean; null unless all 12 months are present
export function rolling12(months, values) {
  const h = months.map((m) => new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0).getDate() * 24);
  return months.map((_, i) => {
    if (i < 11) return null;
    let s = 0, w = 0;
    for (let k = i - 11; k <= i; k++) { if (values[k] == null) return null; s += values[k] * h[k]; w += h[k]; }
    return s / w;
  });
}

// Which month, used as the point where the slope changes, fits the series best (smallest squared error)?
// Candidates leave at least 24 months on each side. Returns { best, atRelease, months: [{ m, sse }] }.
export function breakScan(months, values) {
  const out = [];
  for (const m of months) {
    const f = trendFit(months, values, { brk: m });
    if (f) out.push({ m, sse: f.sse, f });
  }
  if (!out.length) return null;
  const best = out.reduce((a, c) => (c.sse < a.sse ? c : a));
  return { best, list: out };
}
