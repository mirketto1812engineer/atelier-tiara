// Motore geometrico della tiara. Coordinate "piane": x = s (arco lungo la fascia, 0 = fronte),
// y = h (quota dal piatto), z = t (spessore, 0 = faccia interna, + verso l'esterno). Unità: mm.
// Dipendenze iniettate: wasm (manifold-3d inizializzato) e opentype.

export const DEFAULTS = {
  // principiante
  model: 'decorata', text: 'Micron', headCirc: 54, supports: true,
  // intermedio
  font: 'great-vibes', fit: 'medio', height: 58.5, filigree: 'ricca', beads: true, dotStyle: 'stella',
  teeth: true, bandDeco: true, material: 'PETG', supGap: 0.2, supTipD: 0.8, supSpacing: 3.0,
  // esperto
  bandH: 5.5, bandT: 3.2, wrapDeg: 122, flareL: 20, flareR: 16, frontGap: 7,
  ornT: 2.4, ornThicken: 0.2, ribH: 0.7, textT: 3.2, swashT: 2.4, textW: 74, textH: 22, thicken: 0.4, descender: 'fondi',
  teethPitch: 3.4, teethH: 1.3,
  supAngle: 45, supXY: 0.8, supBranchAngle: 40, supBranchD: 2.0, supTrunkDmax: 5.0, supMerge: 8,
  supFootD: 6, supFootH: 0.6, supSide: 'auto', supMinLen: 0.8, meshEdge: 4.0, bed: 220, printer: 'mk4s',
};

export const FONTS = {
  'great-vibes': { file: 'great-vibes-400.ttf', name: 'Great Vibes' },
  'pinyon-script': { file: 'pinyon-script-400.ttf', name: 'Pinyon Script' },
  'parisienne': { file: 'parisienne-400.ttf', name: 'Parisienne' },
  'tangerine': { file: 'tangerine-700.ttf', name: 'Tangerine' },
  'corinthia': { file: 'corinthia-700.ttf', name: 'Corinthia' },
  'classico': { file: 'liberation-serif-700.ttf', name: 'Classico (serif, prima versione)' },
};

// valori che cambiano col modello (se l'utente non li ha toccati)
export const MODEL_DEFAULTS = {
  decorata: { font: 'great-vibes', height: 58.5, textW: 74, textH: 22, dotStyle: 'stella', ornT: 2.4 },
  autoportante: { font: 'classico', height: 44.5, textW: 62, textH: 13, dotStyle: 'originale', ornT: 3.0 },
};

const MATERIALS = { PETG: { E: 2000, eps: 0.035, rho: 1.27 }, PLA: { E: 3300, eps: 0.02, rho: 1.24 } };
const FIT_GAP = { morbido: 4, medio: 6, forte: 8 };

// ------------------------------------------------------------------ geometria 2D di base
const TAU = Math.PI * 2;
const lerp = (a, b, u) => a + (b - a) * u;
const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);

function signedArea(poly) {
  let a = 0;
  for (let i = 0, n = poly.length; i < n; i++) {
    const p = poly[i], q = poly[(i + 1) % n];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}
const ccw = (poly) => (signedArea(poly) < 0 ? poly.slice().reverse() : poly);

export function circle(c, r, n) {
  n = n || Math.max(10, Math.min(28, Math.round(r * 9)));
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    out.push([c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)]);
  }
  return out;
}
const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];

export function catmull(points, nPer = 30, alpha = 0.5) {
  const P = points.map((p) => [p[0], p[1]]);
  const n0 = P.length;
  const first = [2 * P[0][0] - P[1][0], 2 * P[0][1] - P[1][1]];
  const last = [2 * P[n0 - 1][0] - P[n0 - 2][0], 2 * P[n0 - 1][1] - P[n0 - 2][1]];
  const Q = [first, ...P, last];
  const out = [];
  for (let i = 1; i < Q.length - 2; i++) {
    const p0 = Q[i - 1], p1 = Q[i], p2 = Q[i + 1], p3 = Q[i + 2];
    const t0 = 0;
    const t1 = t0 + Math.max(1e-6, dist(p0, p1)) ** alpha;
    const t2 = t1 + Math.max(1e-6, dist(p1, p2)) ** alpha;
    const t3 = t2 + Math.max(1e-6, dist(p2, p3)) ** alpha;
    const endpoint = i === Q.length - 3;
    const m = endpoint ? nPer : nPer;
    for (let j = 0; j < m; j++) {
      const t = t1 + (t2 - t1) * (endpoint ? j / (nPer - 1) : j / nPer);
      const A1 = [0, 1].map((k) => ((t1 - t) / (t1 - t0)) * p0[k] + ((t - t0) / (t1 - t0)) * p1[k]);
      const A2 = [0, 1].map((k) => ((t2 - t) / (t2 - t1)) * p1[k] + ((t - t1) / (t2 - t1)) * p2[k]);
      const A3 = [0, 1].map((k) => ((t3 - t) / (t3 - t2)) * p2[k] + ((t - t2) / (t3 - t2)) * p3[k]);
      const B1 = [0, 1].map((k) => ((t2 - t) / (t2 - t0)) * A1[k] + ((t - t0) / (t2 - t0)) * A2[k]);
      const B2 = [0, 1].map((k) => ((t3 - t) / (t3 - t1)) * A2[k] + ((t - t1) / (t3 - t1)) * A3[k]);
      out.push([0, 1].map((k) => ((t2 - t) / (t2 - t1)) * B1[k] + ((t - t1) / (t2 - t1)) * B2[k]));
    }
  }
  return out;
}

function resample(pts, step) {
  const d = [0];
  for (let i = 1; i < pts.length; i++) d.push(d[i - 1] + dist(pts[i - 1], pts[i]));
  const L = d[d.length - 1];
  const n = Math.max(8, Math.floor(L / step) + 1);
  const out = [], u = [];
  let j = 0;
  for (let i = 0; i < n; i++) {
    const s = (L * i) / (n - 1);
    while (j < d.length - 2 && d[j + 1] < s) j++;
    const seg = d[j + 1] - d[j] || 1e-9;
    const f = Math.min(1, Math.max(0, (s - d[j]) / seg));
    out.push([lerp(pts[j][0], pts[j + 1][0], f), lerp(pts[j][1], pts[j + 1][1], f)]);
    u.push(L > 0 ? s / L : 0);
  }
  return { pts: out, u };
}

// Tratto a larghezza variabile: quadrilateri CCW + dischi (unione con regola 'Positive')
export function varStroke(pts, wfun, step = 0.25) {
  const { pts: p, u } = resample(pts, step);
  const n = p.length;
  const w = u.map(wfun);
  const polys = [];
  const L = [], R = [];
  for (let i = 0; i < n; i++) {
    const a = p[Math.max(0, i - 1)], b = p[Math.min(n - 1, i + 1)];
    let tx = b[0] - a[0], ty = b[1] - a[1];
    const l = Math.hypot(tx, ty) || 1;
    tx /= l; ty /= l;
    L.push([p[i][0] - ty * w[i] / 2, p[i][1] + tx * w[i] / 2]);
    R.push([p[i][0] + ty * w[i] / 2, p[i][1] - tx * w[i] / 2]);
  }
  for (let i = 0; i < n - 1; i++) {
    const q = [L[i], L[i + 1], R[i + 1], R[i]];
    if (Math.abs(signedArea(q)) > 1e-6) polys.push(ccw(q));
  }
  for (let i = 0; i < n; i += 3) polys.push(circle(p[i], w[i] / 2, 12));
  polys.push(circle(p[0], w[0] / 2, 16), circle(p[n - 1], w[n - 1] / 2, 16));
  return polys;
}

function spiralTail(pEnd, heading, R0, R1, turns, side) {
  const Phi = turns * TAU;
  const n = Math.round(60 * turns) + 20;
  const dphi = Phi / (n - 1);
  const out = [[pEnd[0], pEnd[1]]];
  let x = pEnd[0], y = pEnd[1];
  for (let i = 0; i < n - 1; i++) {
    const phi = i * dphi;
    const R = R0 + ((R1 - R0) * phi) / Phi;
    const th = heading + side * phi;
    x += Math.cos(th) * R * dphi;
    y += Math.sin(th) * R * dphi;
    out.push([x, y]);
  }
  return out;
}

// Voluta: polilinea per punti di controllo + riccioli tangenti alle estremità
export function scroll(ctrl, { end = null, start = null, w = [1.9, 2.4, 1.6], eye = 1.05 } = {}) {
  const body = catmull(ctrl, 30);
  let path = body.slice();
  if (end) {
    const [side, R0, R1, turns] = end;
    const a = body[body.length - 4], b = body[body.length - 1];
    const tail = spiralTail(b, Math.atan2(b[1] - a[1], b[0] - a[0]), R0, R1, turns, side);
    path = path.concat(tail.slice(1));
  }
  if (start) {
    const [side, R0, R1, turns] = start;
    const a = body[3], b = body[0];
    const tail = spiralTail(b, Math.atan2(b[1] - a[1], b[0] - a[0]), R0, R1, turns, side);
    path = tail.slice(1).reverse().concat(path);
  }
  const [w0, wm, w1] = w;
  const wf = (u) => (u < 0.4 ? w0 + (wm - w0) * Math.sin((Math.PI / 2) * u / 0.4)
                             : w1 + (wm - w1) * Math.cos((Math.PI / 2) * (u - 0.4) / 0.6));
  const polys = varStroke(path, wf);
  if (end && eye) polys.push(circle(path[path.length - 1], eye, 18));
  if (start && eye) polys.push(circle(path[0], eye, 18));
  return { polys, path };
}

export function leaf(base, tip, wmax, bend = 0, n = 60) {
  const L = dist(base, tip);
  const ax = [(tip[0] - base[0]) / L, (tip[1] - base[1]) / L];
  const nr = [-ax[1], ax[0]];
  const left = [], right = [], mid = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const off = bend * L * Math.sin(Math.PI * t);
    const m = [base[0] + t * (tip[0] - base[0]) + off * nr[0], base[1] + t * (tip[1] - base[1]) + off * nr[1]];
    const hw = 0.5 * wmax * Math.pow(Math.max(0, Math.sin(Math.PI * Math.pow(t, 0.85))), 0.9);
    mid.push(m);
    left.push([m[0] + nr[0] * hw, m[1] + nr[1] * hw]);
    right.push([m[0] - nr[0] * hw, m[1] - nr[1] * hw]);
  }
  const poly = left.concat(right.slice(1, -1).reverse());
  return { polys: [ccw(poly)], mid };
}

function star4(c, rOut, rIn) {
  const out = [];
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4 + Math.PI / 2;
    const r = i % 2 === 0 ? rOut : rIn;
    out.push([c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)]);
  }
  return ccw(out);
}
function heart(c, s) { // punta in basso in c - (0, s)
  const out = [];
  for (let i = 0; i < 64; i++) {
    const t = (i / 64) * TAU;
    const x = 16 * Math.sin(t) ** 3;
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    out.push([c[0] + (x / 17) * s, c[1] + (y / 17) * s]);
  }
  return ccw(out);
}
const mirrorPolys = (polys) => polys.map((p) => p.map(([x, y]) => [-x, y]).reverse());

// ------------------------------------------------------------------ fascia a molla
export function bandPath(P) {
  const C = P.headCirc * 10;                       // mm
  const aH = C / 7.1458, bH = (aH * 95) / 75;      // testa: ellisse con rapporto 95/75
  const A = aH - FIT_GAP[P.fit], B = bH - P.frontGap;
  const PHI1 = (P.wrapDeg * Math.PI) / 180;
  const ds = 0.1;
  // ellisse ricampionata ad arco costante
  const N = 20000;
  const ex = [], ey = [], es = [0];
  for (let i = 0; i <= N; i++) {
    const ph = (PHI1 * i) / N;
    ex.push(A * Math.sin(ph)); ey.push(B * Math.cos(ph));
    if (i) es.push(es[i - 1] + Math.hypot(ex[i] - ex[i - 1], ey[i] - ey[i - 1]));
  }
  const px = [], py = [];
  let j = 0;
  for (let s = 0; s <= es[N]; s += ds) {
    while (j < N - 1 && es[j + 1] < s) j++;
    const f = (s - es[j]) / (es[j + 1] - es[j]);
    px.push(lerp(ex[j], ex[j + 1], f)); py.push(lerp(ey[j], ey[j + 1], f));
  }
  // svasatura
  const nE = px.length;
  let th = Math.atan2(py[nE - 1] - py[nE - 2], px[nE - 1] - px[nE - 2]);
  const kE = (A * B) / Math.pow(A * A * Math.cos(PHI1) ** 2 + B * B * Math.sin(PHI1) ** 2, 1.5);
  const n = Math.round(P.flareL / ds), n1 = Math.min(n, Math.round(5 / ds));
  const kF = 1 / P.flareR;
  for (let i = 0; i < n; i++) {
    const k = i < n1 ? lerp(-kE, kF, i / Math.max(1, n1 - 1)) : kF;
    th += k * ds;
    px.push(px[px.length - 1] + ds * Math.cos(th));
    py.push(py[py.length - 1] + ds * Math.sin(th));
  }
  const M = px.length;
  const nx = new Float64Array(M), ny = new Float64Array(M);
  for (let i = 0; i < M; i++) {
    const a = Math.max(0, i - 1), b = Math.min(M - 1, i + 1);
    let tx = px[b] - px[a], ty = py[b] - py[a];
    const l = Math.hypot(tx, ty);
    tx /= l; ty /= l;
    nx[i] = -ty; ny[i] = tx;                      // sinistra della marcia = esterno
  }
  const L = (M - 1) * ds;
  let iSide = 0;
  for (let i = 0; i < M; i++) if (Math.abs(py[i]) < Math.abs(py[iSide])) iSide = i;
  return { ds, px: Float64Array.from(px), py: Float64Array.from(py), nx, ny, L, A, B, aH, bH,
           quarter: iSide * ds, flareStart: L - P.flareL };
}

export function bendBatch(band) {
  const { ds, px, py, nx, ny } = band;
  const M = px.length;
  return (v, count) => {
    for (let i = 0; i < count; i++) {
      const s = v[3 * i], h = v[3 * i + 1], t = v[3 * i + 2];
      const a = Math.abs(s);
      let f = a / ds;
      let k = Math.floor(f);
      let X, Y, NX, NY;
      if (k >= M - 1) {                          // oltre la punta: prolungamento tangente
        const e = (a - (M - 1) * ds);
        const tx = ny[M - 1], ty = -nx[M - 1];
        X = px[M - 1] + tx * e; Y = py[M - 1] + ty * e; NX = nx[M - 1]; NY = ny[M - 1];
      } else {
        f -= k;
        X = px[k] + (px[k + 1] - px[k]) * f; Y = py[k] + (py[k + 1] - py[k]) * f;
        NX = nx[k] + (nx[k + 1] - nx[k]) * f; NY = ny[k] + (ny[k + 1] - ny[k]) * f;
        const l = Math.hypot(NX, NY); NX /= l; NY /= l;
      }
      const sg = s >= 0 ? -1 : 1;                // s>0 = destra di chi guarda la fronte = x<0
      v[3 * i] = sg * (X + NX * t);
      v[3 * i + 1] = Y + NY * t;
      v[3 * i + 2] = h;
    }
  };
}

// ------------------------------------------------------------------ filigrana
function filigree(P, kx, ky, ZB) {
  const kr = Math.max(0.8, Math.min(kx, ky));
  const X = (x) => x * kx;
  const Y = (y) => ZB + (y - 5.5) * ky;            // coordinate di progetto con fascia 5.5
  const pt = ([x, y]) => [X(x), Y(y)];
  const z = 5.5, t = 36.5;
  const rich = P.filigree === 'ricca';
  const orn = [], rib = [], beads = [];
  const addRib = (path, rw) => { if (path.length > 6) rib.push(...varStroke(path, (u) => rw * (1 - 0.35 * u))); };
  const S = (ctrl, opt = {}) => {
    const o = { ...opt };
    if (o.end) o.end = [o.end[0], o.end[1] * kr, o.end[2] * kr, o.end[3]];
    if (o.start) o.start = [o.start[0], o.start[1] * kr, o.start[2] * kr, o.start[3]];
    const r = scroll(ctrl.map(pt), o);
    orn.push(...r.polys);
    const trim = o.end ? 6 : 2;
    addRib(r.path.slice(2, r.path.length - trim), 0.8);
    return r.path;
  };
  const Lf = (base, tip, w, bend = 0) => {
    const r = leaf(pt(base), pt(tip), w * Math.sqrt(kr), bend);
    orn.push(...r.polys);
    addRib(r.mid.slice(5, -9), 0.7);
  };
  const Bead = (c, r) => { if (P.beads) { beads.push({ c, r }); orn.push(circle(c, r, 24)); } };
  const top = (path) => path.reduce((m, p) => (p[1] > m[1] ? p : m), path[0]);

  // 1. giglio centrale
  Lf([0, z - 0.8], [0, t - 1.4], 7.4);
  Lf([0.6, z - 1.7], [16.0, z + 0.6], 5.4, 0.10);
  Lf([1.0, z + 3.5], [7.6, z + 16.5], 3.8, 0.10);
  // 2. corno d'ariete interno
  S([[3.2, z - 0.3], [5.0, z + 9.0], [7.4, z + 20.0], [12.0, t - 1.5], [17.5, t - 2.4], [21.0, t - 7.0], [21.6, z + 19.0]],
    { end: [-1, 4.6, 1.5, 0.95], w: [2.4, 2.6, 1.7] });
  Lf([20.5, z - 0.6], [15.5, z + 9.5], 3.6, -0.12);
  if (rich) S([[24.0, z - 0.3], [24.6, z + 5.0], [27.0, z + 9.5]], { end: [1, 2.6, 1.0, 0.9], w: [1.9, 1.9, 1.5], eye: 0.9 });
  // 3. grande arco che incornicia la scritta
  const big = S([[57.5, z - 0.3], [55.5, z + 16.0], [52.0, z + 32.0], [47.5, 48.0], [43.0, 47.6], [40.8, 44.0], [40.6, t + 3.2]],
    { end: [1, 3.2, 1.1, 0.95], w: [2.6, 2.7, 1.9] });
  const ap = top(big);
  Bead([ap[0], ap[1] + 2.4], 1.8);
  // 4. dentro l'arco
  S([[30.0, z - 0.3], [31.0, z + 7.0], [34.0, z + 13.5], [38.5, z + 17.0]], { end: [-1, 3.4, 1.2, 1.0], w: [2.1, 2.2, 1.6] });
  if (rich) {
    Lf([33.2, z + 9.0], [27.0, z + 20.5], 3.4, -0.10);
    S([[47.0, z - 0.3], [46.5, z + 5.5], [44.0, z + 9.5]], { end: [1, 2.4, 0.9, 0.9], w: [1.8, 1.8, 1.4], eye: 0.85 });
    Lf([50.0, z - 0.6], [48.0, z + 13.0], 3.2, 0.10);
  }
  // 5. cascata laterale
  const hook = (xb, hA, r, foot) => {
    const xa = xb - 5.0 - r;
    const path = S([[xb, z - 0.3], [xb + 0.4, z + 0.45 * hA], [xb - 1.0, z + 0.85 * hA], [xa, z + hA],
                    [xa - 3.2, z + hA - 2.0], [xa - 3.8, z + hA - 6.0]], { end: [1, r, 1.0, 0.95], w: [2.2, 2.3, 1.6] });
    const tp = top(path);
    Bead([tp[0], tp[1] + 2.1], 1.5);
    if (foot && rich) S([[xb + 1.0, z - 0.3], [xb + 3.0, z + 3.6], [xb + 6.0, z + 5.0]], { end: [1, 1.9, 0.8, 0.8], w: [1.7, 1.7, 1.3], eye: 0.75 });
    Lf([xb - 2.0, z - 0.6], [xa - 1.0, z + 0.42 * hA], 3.0, -0.15);
  };
  hook(73.0, 30.0, 3.4, true);
  hook(89.0, 22.0, 2.9, false);
  hook(102.0, 14.5, 2.4, true);
  if (rich) {
    Lf([61.0, z - 0.6], [63.5, z + 11.0], 3.0, -0.10);
    S([[108.5, z - 0.3], [109.5, z + 2.6], [111.5, z + 3.6]], { end: [1, 1.6, 0.7, 0.75], w: [1.6, 1.6, 1.2], eye: 0.7 });
  }
  return { orn, rib, beads };
}

// Filigrana AUTOPORTANTE (prima versione): ogni ricciolo chiude con l'occhio appoggiato al giro sotto
// e ha un gambo che lo regge dalla fascia; foglie ripide; la scritta poggia su una barretta.
// Coordinate di progetto: fascia alta 5.5, linea di base scritta a 31.5 (5.5 + 26).
function filigreeSelf(rich = true, withPearls = true, pearlMin = 0) {
  const orn = [], rib = [], pearls = [], pearlPolys = [];
  const z = 5.5, TBH = 26.0;
  // larghezze dei tratti (prima dell'ispessimento globale): la stampa ha mostrato che 1,7 mm sotto un ricciolo alto si spezza
  const W1 = 2.4, W2 = 2.2, W3 = 2.0;
  const stroke = (pts, w0, w1 = w0) => {
    orn.push(...varStroke(pts, (u) => w0 + (w1 - w0) * u));
    rib.push(...varStroke(pts, (u) => 0.42 * (w0 + (w1 - w0) * u)));
  };
  // foglia: se nasce dalla fascia (o tocca la barretta) la radice è un raccordo largo, non una punta
  const lf = (base, tip, w, bend = 0, topRoot = false) => {
    const r = leaf(base, tip, w, bend);
    orn.push(...r.polys);
    const m = r.mid, n = m.length;
    if (base[1] <= z + 1.5) {
      const g = Math.max(1.4, 0.32 * w), a = m[Math.round(0.3 * (n - 1))];
      orn.push(ccw([[base[0] - g, Math.min(base[1], z) - 1.0], [base[0] + g, Math.min(base[1], z) - 1.0], a]));
    }
    if (topRoot) {
      const g = Math.max(1.6, 0.25 * w), a = m[Math.round(0.72 * (n - 1))];
      orn.push(ccw([[tip[0] + g, tip[1]], [tip[0] - g, tip[1]], a]));
    }
    if (r.mid.length > 12) rib.push(...varStroke(r.mid.slice(4, -8), (u) => 0.75 - 0.25 * u));
  };
  const curl = (c, r, w, ccwDir) => {
    const n = 140, pts = [];
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1);
      const a = ccwDir ? Math.PI + u * 1.5 * Math.PI : -u * 1.5 * Math.PI;
      const rr = r + (r * 0.86 - r) * u;
      pts.push([c[0] + rr * Math.cos(a), c[1] + rr * Math.sin(a)]);
    }
    stroke(pts, w, w * 0.85);
    const rBot = r - (r - r * 0.86) / 3, inner = rBot - w / 2;
    const er = (r - w / 2) * 0.42 + 0.35;
    const ec = [c[0], c[1] - (inner - er) - 0.45];       // occhio compenetrato nel fondo del ricciolo
    orn.push(circle(ec, er, 24));
    rib.push(circle(ec, er * 0.55, 16));
    return [c[0], c[1] - r];
  };
  const support = (bottom, xb, wTop = 2.7, wBot = 2.2, sway = 0.6) => {
    const [bx, by] = bottom;
    stroke(catmull([[xb, z - 0.6], [(xb + bx) / 2 + sway, (z + by) / 2], [bx, by + 0.9]], 30), wBot, wTop);
  };
  // perla a goccia: sfera su cono a 45° (autoportante in ogni direzione); la punta entra 0.6 mm nel tratto
  const pearlOn = (x, topY, r) => {
    if (!withPearls || !rich) return;
    r = Math.max(r, pearlMin);                       // la perla deve sporgere dallo spessore della filigrana
    const cy = topY - 0.6 + r * Math.SQRT2, s = r / Math.SQRT2;
    pearls.push({ c: [x, cy], r });
    pearlPolys.push(circle([x, cy], r, 28), ccw([[x - s, cy - s], [x + s, cy - s], [x, cy - r * Math.SQRT2]]));
  };
  const hook = (xb, c, r, hA, ax, { w = W2, ccwDir = true, supX = null, mids = null, pr = 0 } = {}) => {
    const side = ccwDir ? -1 : 1;
    const start = [c[0] + side * r, c[1]];
    const way = [[xb, z - 0.6]];
    if (mids) for (const [x, h] of mids) way.push([x, z + h]);
    else way.push([xb - 0.25 * (xb - ax) * 0.3, z + 0.5 * hA]);
    way.push([ax, z + hA], [start[0] + 0.35 * (ax - start[0]), z + hA - 0.25 * (z + hA - start[1])], [start[0], start[1] + 1.4], start);
    const pts = catmull(way, 34);
    stroke(pts, w, w * 0.95);
    const bottom = curl(c, r, w * 0.95, ccwDir);
    support(bottom, supX !== null ? supX : bottom[0] + 1.6);
    if (pr) { const t = pts.reduce((m, p) => (p[1] > m[1] ? p : m), pts[0]); pearlOn(t[0], t[1] + w / 2, pr); }
  };
  // giglio centrale
  lf([0, z - 0.6], [0, z + TBH - 0.3], 8.6, 0, true);   // regge il centro della barretta: radici larghe ai due capi
  lf([0.4, z - 1.6], [17.0, z + 0.3], 5.2, 0.10);
  lf([7.0, z + 12.0], [12.6, z + 19.6], 3.0, 0.10);
  if (rich) lf([12.5, z + 1.0], [15.0, z + 9.8], 2.6, -0.10);           // foglia ripida sulla foglia distesa
  // corno d'ariete interno: tocca la barretta e regge il centro
  const railBot = TBH - 1.9, c1 = [20.6, z + 14.6], r1 = 3.9;
  stroke(catmull([[3.2, z + 0.4], [6.2, z + 9.0], [9.0, z + 17.5], [13.5, z + railBot - 0.8], [19.5, z + railBot - 1.0],
                  [23.6, z + 20.6], [c1[0] + r1, c1[1] + 1.5], [c1[0] + r1, c1[1]]], 34), W1, W2);
  support(curl(c1, r1, W2, false), 23.0, 2.7, 2.2, 0.3);
  if (rich) lf([26.2, z - 0.6], [28.4, z + 8.8], 2.4, -0.10);           // foglia tra i due gambi
  // grande arco: il suo ricciolo regge l'estremità della barretta
  hook(55.0, [34.9, z + 21.6], 3.8, 30.6, 40.0, { w: W1, supX: 29.2, mids: [[52.2, 10.5], [49.0, 21.5], [45.0, 28.6]], pr: 1.8 });
  lf([32.4, z + 7.5], [37.8, z + 15.6], 3.4, 0.10);
  if (rich) {
    hook(46.5, [41.6, z + 13.8], 2.4, 20.0, 44.2, { w: W3, pr: 1.3 });   // gancio dentro l'arco
    hook(63.0, [58.6, z + 9.5], 2.1, 15.0, 60.6, { w: W3, pr: 1.2 });    // gancio tra arco e cascata
  } else lf([45.5, z - 0.6], [41.0, z + 10.5], 3.6, 0.12);
  // cascata laterale
  const cascade = (xb, hA, r, pr) => {
    const w = r > 3 ? W2 : W3;
    const cx = xb - r - w - 1.7, cy = z + hA - r - w - 1.5;
    hook(xb, [cx, cy], r, hA, (cx - r + xb) / 2 + 0.6, { w, mids: [[xb - 0.4, 0.5 * hA], [xb - 1.2, 0.85 * hA]], pr });
  };
  cascade(77.0, 25.0, 3.7, 1.5);
  cascade(97.0, 18.0, 3.1, 1.4);
  cascade(113.0, 12.5, 2.5, 1.2);
  if (rich) {
    lf([77.6, z + 7.0], [80.8, z + 17.2], 2.6, -0.08);                   // foglie ripide sui gambi della cascata
    lf([97.5, z + 5.0], [100.4, z + 12.6], 2.3, -0.08);
  } else lf([61.5, z - 0.6], [65.5, z + 10.0], 3.3, -0.12);
  lf([82.0, z - 0.6], [85.8, z + 8.5], 3.0, -0.12);
  lf([101.0, z - 0.6], [104.2, z + 6.6], 2.7, -0.12);
  lf([116.5, z - 0.6], [119.0, z + 5.0], 2.5, -0.12);
  return { orn, rib, pearls, pearlPolys };
}

function swashPath(kx, ky, ZB) {
  const TB = ZB + 31 * ky;
  const P = [[-41, 0.9], [-36, -0.6], [-25, -0.5], [-12, -0.6], [-5, -1.0], [0, -1.7], [5, -1.0],
             [12, -0.6], [25, -0.5], [36, -0.6], [41, 0.9]].map(([x, d]) => [x * kx, TB + d]);
  return catmull(P, 30);
}

// ------------------------------------------------------------------ scritta
function flattenPath(cmds, seg = 8) {
  const polys = [];
  let cur = [], x = 0, y = 0;
  for (const c of cmds) {
    if (c.type === 'M') { if (cur.length > 2) polys.push(cur); cur = [[c.x, -c.y]]; x = c.x; y = c.y; }
    else if (c.type === 'L') { cur.push([c.x, -c.y]); x = c.x; y = c.y; }
    else if (c.type === 'Q') {
      for (let i = 1; i <= seg; i++) {
        const u = i / seg, v = 1 - u;
        cur.push([v * v * x + 2 * v * u * c.x1 + u * u * c.x, -(v * v * y + 2 * v * u * c.y1 + u * u * c.y)]);
      }
      x = c.x; y = c.y;
    } else if (c.type === 'C') {
      for (let i = 1; i <= seg; i++) {
        const u = i / seg, v = 1 - u;
        cur.push([v ** 3 * x + 3 * v * v * u * c.x1 + 3 * v * u * u * c.x2 + u ** 3 * c.x,
                  -(v ** 3 * y + 3 * v * v * u * c.y1 + 3 * v * u * u * c.y2 + u ** 3 * c.y)]);
      }
      x = c.x; y = c.y;
    } else if (c.type === 'Z') { if (cur.length > 2) polys.push(cur); cur = []; }
  }
  if (cur.length > 2) polys.push(cur);
  return polys;
}

const DOT_CHARS = new Set(['i', 'j']);

// ------------------------------------------------------------------ motore
export function makeEngine(wasm, opentype) {
  const { CrossSection, Manifold } = wasm;
  const reg = [];
  const T = (o) => { reg.push(o); return o; };
  const CS = (polys, rule = 'Positive') => T(new CrossSection(polys.length ? polys : [[[0, 0], [0, 0], [0, 0]]], rule));
  const U = (list) => T(CrossSection.union(list));
  const cleanup = () => { for (const o of reg.splice(0)) { try { o.delete(); } catch (e) { /* già liberato */ } } };
  const fonts = {};

  function csBox(x0, y0, x1, y1) { return CS([rect(x0, y0, x1, y1)]); }
  function bboxOf(cs) { const b = cs.bounds(); return { x0: b.min[0], y0: b.min[1], x1: b.max[0], y1: b.max[1] }; }
  function parts(cs) { const d = cs.decompose(); d.forEach(T); return d; }

  function buildText(P, Wmax, Hmax, TB, warnings) {
    const font = fonts[P.font];
    const str = (P.text || '').normalize('NFC');
    if (!str.trim()) return { text: null, info: {} };
    const missing = [];
    for (const ch of str) if (ch.trim() && font.charToGlyph(ch).index === 0) missing.push(ch);
    if (missing.length) warnings.push({ level: 'warn', code: 'missingChars', p: { chars: [...new Set(missing)].join(' ') }, msg: `Il font non ha questi caratteri: ${[...new Set(missing)].join(' ')} (saranno vuoti).` });
    const paths = font.getPaths(str, 0, 0, 100, { kerning: true, features: { liga: false, rlig: false } });   // niente legature: un glifo per lettera
    const chars = [...str];
    const glyphs = []; // per glifo: corpi, isole, carattere
    paths.forEach((p, i) => {
      const polys = flattenPath(p.commands);
      if (!polys.length) return;
      const cs = CS(polys, 'NonZero');
      const comps = parts(cs).map((c) => ({ cs: c, area: c.area(), b: bboxOf(c) })).sort((a, b) => b.area - a.area);
      if (!comps.length) return;
      const body = comps[0];
      const islands = comps.slice(1).filter((c) => c.area > 0.002 * body.area);
      glyphs.push({ ch: chars[i] || '', body, islands, all: cs });
    });
    if (!glyphs.length) return { text: null, info: {} };
    // ingombro e scala
    let x0 = Infinity, x1 = -Infinity, y1 = -Infinity, y0 = Infinity;
    for (const g of glyphs) {
      const b = bboxOf(g.all);
      x0 = Math.min(x0, b.x0); x1 = Math.max(x1, b.x1); y1 = Math.max(y1, b.y1); y0 = Math.min(y0, b.y0);
    }
    const k = Math.min(Wmax / (x1 - x0), Hmax / Math.max(1e-6, y1));
    const cx = (x0 + x1) / 2;
    const toMM = (c) => T(T(T(c.translate([-cx, 0])).scale(k)).translate([0, TB]));
    const bodies = [], extras = [], decor = [];
    for (const g of glyphs) {
      const body = toMM(g.body.cs);
      bodies.push(body);
      const bb = bboxOf(body);
      const isDot = DOT_CHARS.has(g.ch) && g.islands.length === 1;
      for (const isl of g.islands) {
        const I = toMM(isl.cs);
        const ib = bboxOf(I);
        const decorate = isDot && P.dotStyle !== 'originale';
        if (decorate) decor.push({ kind: P.dotStyle, cx: (ib.x0 + ib.x1) / 2, cy: (ib.y0 + ib.y1) / 2, w: Math.max(ib.x1 - ib.x0, ib.y1 - ib.y0) });
        else extras.push(I);
        // collo verso il corpo della lettera
        const icx = (ib.x0 + ib.x1) / 2;
        const below = ib.y0 > bb.y0 + (bb.y1 - bb.y0) * 0.5;   // accento sopra (altrimenti sotto: cediglia)
        let xc = Math.min(Math.max(icx, bb.x0 + 0.4), bb.x1 - 0.4);
        const probe = T(body.intersect(csBox(xc - 0.3, below ? -1e3 : ib.y1, xc + 0.3, below ? ib.y0 : 1e3)));
        let edge;
        if (!probe.isEmpty()) { const pb = bboxOf(probe); edge = below ? pb.y1 : pb.y0; }
        else { xc = (bb.x0 + bb.x1) / 2; edge = below ? bb.y1 : bb.y0; }
        const nw = 0.35;
        extras.push(below ? csBox(xc - nw, edge - 0.5, xc + nw, ib.y0 + 0.5) : csBox(xc - nw, ib.y1 - 0.5, xc + nw, edge + 0.5));
      }
    }
    let text = T(U([...bodies, ...extras]).offset(P.thicken, 'Round', 2, 24));
    // puntini decorativi (stellina, cuore, tondo) al posto del puntino originale, già collegati dal collo
    const deco = [];
    for (const d of decor) {
      const r = Math.max(1.3, Math.min(2.8, 0.95 * d.w + P.thicken));
      if (d.kind === 'stella') deco.push(star4([d.cx, d.cy], r, r * 0.32));
      else if (d.kind === 'cuore') deco.push(heart([d.cx, d.cy + r * 0.15], r * 0.95));
      else deco.push(circle([d.cx, d.cy], d.w / 2 + P.thicken, 24));
    }
    if (deco.length) text = U([text, CS(deco)]);
    const tb = bboxOf(text);
    const info = { scale: k, width: tb.x1 - tb.x0, top: tb.y1, bottom: tb.y0 };
    // spessore minimo dei filetti: quanta area sparisce erodendo di 0.55 mm
    const er = T(T(text.offset(-0.55, 'Round')).offset(0.55, 'Round'));
    const loss = 1 - er.area() / text.area();
    info.thinLoss = loss;
    if (loss > 0.22) warnings.push({ level: 'warn', code: 'thin', msg: 'Scritta lunga: alcuni filetti sono sotto 1,1 mm. Aumenta "Ispessimento scritta" o accorcia il testo.' });
    if (k * 100 * 0.5 < 6 && str.length > 10) warnings.push({ level: 'info', code: 'small', msg: 'Testo lungo: le lettere minuscole sono piccole (< 6 mm).' });
    return { text, info };
  }

  function design2D(P, band, warnings) {
    if (P.model === 'autoportante') return design2DSelf(P, band, warnings);
    const ZB = P.bandH;
    const ky = (P.height - ZB) / 53.0;
    const ornEndLimit = band.quarter - 8;
    let kx = ky;
    if (112 * kx > ornEndLimit) {
      kx = ornEndLimit / 112;
      warnings.push({ level: 'info', code: 'narrow', msg: 'Decorazione ristretta in larghezza per non superare le orecchie.' });
    }
    const F = filigree(P, kx, ky, ZB);
    const right = F.orn;
    let orn = CS([...right, ...mirrorPolys(right)]);
    let rib = CS([...F.rib, ...mirrorPolys(F.rib)]);
    const beads = [...F.beads, ...F.beads.map((b) => ({ c: [-b.c[0], b.c[1]], r: b.r }))];
    const swPts = swashPath(kx, ky, ZB);
    const swash = CS(varStroke(swPts, (u) => 1.35 + 0.45 * Math.sin(Math.PI * u)));
    const TB = ZB + 31 * ky;
    const { text, info } = buildText(P, P.textW * kx, P.textH * ky, TB, warnings);
    const rr = ZB / 2, L = band.L;
    const band2d = CS([rect(-L + rr, 0, L - rr, ZB), rect(-L, 0, L, rr), circle([L - rr, rr], rr, 24), circle([-L + rr, rr], rr, 24)]);
    if (text && P.descender === 'ritaglia') {
      const legs = T(text.intersect(csBox(-1e3, -1e3, 1e3, TB - 1.5)));
      if (!legs.isEmpty()) orn = T(orn.subtract(T(legs.offset(0.9, 'Round'))));
    }
    orn = T(U([orn, swash]).subtract(csBox(-L - 5, -10, L + 5, ZB - 1.2)));
    rib = T(T(rib.intersect(orn)).subtract(T(swash.offset(0.3, 'Round'))));
    // filigrana rimasta isolata (dopo il ritaglio): eliminata
    let dropped = 0;
    {
      const comps = parts(T(U([orn, band2d])));
      if (comps.length > 1) {
        const keep = comps.reduce((m, c) => (c.area() > m.area() ? c : m));
        const lost = comps.filter((c) => c !== keep);
        dropped = lost.length;
        orn = T(orn.subtract(U(lost)));
        rib = T(rib.intersect(orn));
      }
    }
    if (dropped) warnings.push({ level: 'info', code: 'dropped', p: { n: dropped }, msg: `${dropped} pezzetti di filigrana tagliati dalle lettere sono stati rimossi.` });
    // ogni pezzo della scritta deve toccare svolazzo o filigrana
    let anchors = 0, textFinal = text;
    if (text) {
      const support = U([orn, band2d]);
      const add = [];
      for (const c of parts(text)) {
        const touch = T(c.intersect(support)).area();
        if (touch > 0.4) continue;
        // collo dal punto più basso del pezzo allo svolazzo
        let low = null;
        for (const poly of c.toPolygons()) for (const p of poly) if (!low || p[1] < low[1]) low = p;
        const xs = Math.max(swPts[0][0] + 1, Math.min(swPts[swPts.length - 1][0] - 1, low[0]));
        let ysw = TB;
        for (let i = 1; i < swPts.length; i++) if ((swPts[i - 1][0] - xs) * (swPts[i][0] - xs) <= 0) { ysw = swPts[i][1]; break; }
        add.push(csBox(xs - 0.65, Math.min(ysw, low[1]) - 0.2, xs + 0.65, Math.max(ysw, low[1]) + 0.8));
        anchors++;
      }
      if (add.length) textFinal = U([text, ...add]);
    }
    return { band2d, orn, rib, swash, text: textFinal, beads, kx, ky, TB, ZB, info, anchors, ornEnd: 112 * kx };
  }

  // Analisi a strati come nella prima versione: un pixel è sostenuto se c'è materiale sostenuto entro
  // l'angolo di sbalzo nello strato sotto, oppure se sta in un ponte (tra due appoggi) non più lungo di bridgeMax.
  function supportedMask(R, angleDeg, bridgeMax) {
    const { m, W, H, dx, dy } = R;
    const sup = new Uint8Array(W * H);
    for (let c = 0; c < W; c++) sup[c] = m[c];
    const reach = Math.max(1, Math.round(dy / Math.tan((angleDeg * Math.PI) / 180) / dx));
    const bmax = Math.round(bridgeMax / dx);
    const pre = new Int32Array(W + 1);
    for (let r = 1; r < H; r++) {
      const o = r * W, ob = (r - 1) * W;
      for (let c = 0; c < W; c++) pre[c + 1] = pre[c] + sup[ob + c];
      for (let c = 0; c < W; c++) {
        if (!m[o + c]) continue;
        const a = Math.max(0, c - reach), b = Math.min(W, c + reach + 1);
        if (pre[b] - pre[a] > 0) sup[o + c] = 1;
      }
      // ponti nella stessa riga
      let c = 0;
      while (c < W) {
        if (!m[o + c]) { c++; continue; }
        const c0 = c;
        while (c < W && m[o + c]) c++;
        let last = -1;
        for (let k = c0; k < c; k++) {
          if (sup[o + k]) {
            if (last >= 0 && k - last > 1 && k - last <= bmax) for (let q = last + 1; q < k; q++) sup[o + q] = 1;
            last = k;
          }
        }
      }
    }
    return sup;
  }
  function maskToCS(mask, R, keep) {
    const { W, H, x0, dx, dy } = R;
    const boxes = [];
    for (let r = 0; r < H; r++) {
      let c = 0;
      while (c < W) {
        if (!mask[r * W + c] || (keep && !keep(r, c))) { c++; continue; }
        const c0 = c;
        while (c < W && mask[r * W + c] && (!keep || keep(r, c))) c++;
        boxes.push(rect(x0 + c0 * dx, r * dy, x0 + c * dx, (r + 1) * dy));
      }
    }
    return boxes.length ? CS(boxes) : null;
  }

  function design2DSelf(P, band, warnings) {
    const ZB = P.bandH;
    const ky = (P.height - ZB) / 39.0;
    // la filigrana arriva a ~120 mm d'arco e deve restare prima dei dentini. Se serve si stringe solo in
    // larghezza: così le pendenze diventano più ripide (più sicure). Il contrario creerebbe sbalzi.
    const ornEndLimit = band.quarter - 8;               // come la decorata: lascia libero il tratto che fa molla
    const kx = Math.min(ky, ornEndLimit / 120);
    if (kx < ky * 0.9) warnings.push({ level: 'info', code: 'narrowSelf', msg: 'Decorazione ristretta in larghezza per non arrivare dietro le orecchie (le pendenze restano stampabili).' });
    const map = (polys) => polys.map((p) => p.map(([x, y]) => [x * kx, ZB + (y - 5.5) * ky]));
    const kr = Math.sqrt(kx * ky);
    const Fs = filigreeSelf(P.filigree === 'ricca', P.beads, (P.ornT / 2 + 0.45) / kr);
    const right = map(Fs.orn), ribR = map(Fs.rib), pearlR = map(Fs.pearlPolys);
    const pearlsR = Fs.pearls.map((p) => ({ c: [p.c[0] * kx, ZB + (p.c[1] - 5.5) * ky], r: p.r * kr, cone: true }));
    let orn = CS([...right, ...mirrorPolys(right)]);
    let rib = CS([...ribR, ...mirrorPolys(ribR)]);
    const TB = ZB + 26 * ky;                                  // linea di base = sopra la barretta
    const { text: text0, info } = buildText(P, P.textW * kx, P.textH * ky, TB, warnings);
    let text = text0;
    const rr = ZB / 2, L = band.L;
    const band2d = CS([rect(-L + rr, 0, L - rr, ZB), rect(-L, 0, L, rr), circle([L - rr, rr], rr, 24), circle([-L + rr, rr], rr, 24)]);
    // barretta: almeno fino ai riccioli dei grandi archi, che la reggono
    let xr = 31.4 * kx;
    if (text) { const tb = bboxOf(text); xr = Math.max(xr, Math.abs(tb.x0) + 0.2, Math.abs(tb.x1) + 0.2); }
    const rail = csBox(-xr, TB - 1.9, xr, TB + 0.3);
    // ispessimento globale dei tratti + raccordi (r 0,7 mm) in ogni angolo interno: gambi, foglie e barretta
    // si attaccano con una sezione piena invece che con uno spigolo vivo
    {
      const th = Math.max(0, P.ornThicken || 0), F = 1.0;
      let o = U([orn, rail]);
      if (th > 0) o = T(o.offset(th, 'Round', 2, 24));
      // raccordi solo dove i gambi nascono dalla fascia: lì la leva è massima; sopra i riccioli restano aperti
      const closed = T(T(o.offset(F, 'Round', 2, 24)).offset(-F, 'Round', 2, 24));
      orn = U([o, T(closed.intersect(csBox(-L - 5, ZB - 1.2, L + 5, ZB + 2.2)))]);
    }
    if (pearlR.length) orn = U([orn, CS([...pearlR, ...mirrorPolys(pearlR)])]);
    orn = T(orn.subtract(csBox(-L - 5, -10, L + 5, ZB - 1.2)));
    rib = T(T(rib.intersect(orn)).subtract(T(rail.offset(0.3, 'Round'))));
    // ancoraggi: ogni pezzo di scritta tocca la barretta
    let anchors = 0;
    if (text) {
      const support = U([orn, band2d]);
      const add = [];
      for (const c of parts(text)) {
        if (T(c.intersect(support)).area() > 0.4) continue;
        let low = null;
        for (const poly of c.toPolygons()) for (const p of poly) if (!low || p[1] < low[1]) low = p;
        const xs = Math.max(-xr + 0.8, Math.min(xr - 0.8, low[0]));
        add.push(csBox(xs - 0.65, TB - 0.2, xs + 0.65, Math.max(TB + 0.3, low[1]) + 0.8));
        anchors++;
      }
      if (add.length) text = U([text, ...add]);
    }
    // rifilatura: tolgo dalla scritta ciò che si stamperebbe nel vuoto (come nella prima versione)
    const selfInfo = { trimmed: 0, airFiligree: 0 };
    {
      const full = U([band2d, orn, ...(text ? [text] : [])]);
      const bb = bboxOf(full);
      const x0 = Math.max(bb.x0, -125) - 1, x1 = Math.min(bb.x1, 125) + 1;
      const R = rasterize(full, x0, x1, bb.y1 + 1, 0.1, 0.2);
      const sup = supportedMask(R, P.supAngle, 16);
      const air = new Uint8Array(R.m.length);
      for (let i = 0; i < air.length; i++) air[i] = R.m[i] && !sup[i] ? 1 : 0;
      if (text) {
        const RT = rasterize(text, x0, x1, bb.y1 + 1, 0.1, 0.2);
        const rTop = Math.floor((TB + 0.3) / 0.2);
        const cut = maskToCS(air, R, (r, c) => r > rTop && RT.m[r * R.W + c]);
        if (cut) {
          const before = text.area();
          text = T(T(T(text.subtract(T(cut.offset(0.06, 'Square')))).offset(-0.03, 'Round')).offset(0.03, 'Round'));
          selfInfo.trimmed = before - text.area();
          // briciole rimaste staccate dopo la rifilatura
          const support = U([orn, band2d]);
          const crumbs = parts(text).filter((c) => T(c.intersect(support)).area() < 0.05 && c.area() < 4);
          if (crumbs.length) text = T(text.subtract(U(crumbs)));
        }
        for (let i = 0; i < air.length; i++) if (RT.m[i]) air[i] = 0;
      }
      // zone di filigrana nel vuoto: conta la più grande (le minuscole dentro i riccioli si stampano bene)
      const lab = new Int32Array(air.length);
      let worst = 0, tot = 0;
      for (let i = 0; i < air.length; i++) {
        if (!air[i] || lab[i]) continue;
        let n = 0; const st = [i]; lab[i] = 1;
        while (st.length) {
          const q = st.pop(); n++;
          const r = (q / R.W) | 0, c = q % R.W;
          for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
            const rr2 = r + dr, cc = c + dc;
            if (rr2 < 0 || cc < 0 || rr2 >= R.H || cc >= R.W) continue;
            const j = rr2 * R.W + cc;
            if (air[j] && !lab[j]) { lab[j] = 1; st.push(j); }
          }
        }
        worst = Math.max(worst, n * 0.02); tot += n * 0.02;
      }
      selfInfo.airFiligree = tot; selfInfo.worstAir = worst;
    }
    const heavyTrim = selfInfo.trimmed > 25 && P.font !== 'classico';
    if (selfInfo.trimmed > 1) warnings.push({ level: heavyTrim ? 'warn' : 'info', code: heavyTrim ? 'trimHeavy' : 'trim', p: { a: selfInfo.trimmed }, msg: `Rifilati ${selfInfo.trimmed.toFixed(1).replace('.', ',')} mm² di scritta che si sarebbero stampati nel vuoto${heavyTrim ? ': con questo corsivo le lettere perdono qualche ricciolo, il carattere Classico resta intatto' : ' (terminali delle lettere, quasi invisibili)'}.` });
    if (selfInfo.worstAir > 3) warnings.push({ level: 'warn', code: 'air', p: { a: selfInfo.worstAir, h: 44.5 }, msg: `Una zona di filigrana di ${selfInfo.worstAir.toFixed(1).replace('.', ',')} mm² resta senza appoggio: con queste proporzioni un ricciolo può cedere un po'. Avvicina l'altezza a 44,5 mm.` });
    if (P.ornT < 2.5 || (P.ornThicken || 0) < 0.15) warnings.push({ level: 'warn', code: 'fragile', p: { t: P.ornT, k: P.ornThicken || 0 }, msg: 'Filigrana sottile: i gambi alti possono spezzarsi durante la stampa.' });
    const beads = [...pearlsR, ...pearlsR.map((b) => ({ ...b, c: [-b.c[0], b.c[1]] }))];
    return { band2d, orn, rib, swash: rail, text, beads, kx, ky, TB, ZB, info, anchors, selfInfo, ornEnd: 120 * kx };
  }

  // ---------------------------------------------------------------- raster del profilo
  function rasterize(cs, x0, x1, y1, dx, dy) {
    const W = Math.ceil((x1 - x0) / dx), H = Math.ceil(y1 / dy);
    const m = new Uint8Array(W * H);
    const edges = [];
    for (const poly of cs.toPolygons()) {
      for (let i = 0, n = poly.length; i < n; i++) {
        const a = poly[i], b = poly[(i + 1) % n];
        if (a[1] === b[1]) continue;
        edges.push(a[1] < b[1] ? [a[0], a[1], b[0], b[1]] : [b[0], b[1], a[0], a[1]]);
      }
    }
    edges.sort((e, f) => e[1] - f[1]);
    let active = [], ei = 0;
    const xs = [];
    for (let r = 0; r < H; r++) {
      const y = (r + 0.5) * dy;
      while (ei < edges.length && edges[ei][1] <= y) active.push(edges[ei++]);
      active = active.filter((e) => e[3] > y);
      xs.length = 0;
      for (const e of active) xs.push(e[0] + ((y - e[1]) * (e[2] - e[0])) / (e[3] - e[1]));
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const c0 = Math.max(0, Math.ceil((xs[k] - x0) / dx - 0.5)), c1 = Math.min(W - 1, Math.floor((xs[k + 1] - x0) / dx - 0.5));
        for (let c = c0; c <= c1; c++) m[r * W + c] = 1;
      }
    }
    return { m, W, H, x0, dx, dy };
  }

  // ---------------------------------------------------------------- supporti ad albero
  function treeSupports(P, D, thick) {
    const out = { contacts: 0, bridged: 0, worstBridge: 0, trunks: 0, prims: [] };
    const full = U([D.band2d, D.orn, ...(D.text ? [D.text] : []), ...(D.beads.length ? [CS(D.beads.map((b) => circle(b.c, b.r, 24)))] : [])]);
    const bb = bboxOf(full);
    const dx = 0.1, dy = 0.1;
    const x0 = Math.max(bb.x0, -D.kx * 125) - 1, x1 = Math.min(bb.x1, D.kx * 125) + 1;
    const R = rasterize(full, x0, x1, bb.y1 + 1, dx, dy);
    const RT = D.text ? rasterize(D.text, x0, x1, bb.y1 + 1, dx, dy) : null;
    const RS = rasterize(D.swash, x0, x1, bb.y1 + 1, dx, dy);
    const { m, W, H } = R;
    const at = (r, c) => (r < 0 || c < 0 || c >= W || r >= H ? 0 : m[r * W + c]);
    const layer = 2;                                  // confronto con 0.2 mm sotto
    const reach = Math.max(1, Math.round((layer * dy) / Math.tan((P.supAngle * Math.PI) / 180) / dx));
    // pixel di sbalzo che sono anche bordo inferiore
    const over = new Uint8Array(W * H);
    for (let r = layer; r < H; r++) {
      for (let c = 0; c < W; c++) {
        if (!m[r * W + c] || m[(r - 1) * W + c]) continue;
        let sup = false;
        for (let d = -reach; d <= reach && !sup; d++) if (at(r - layer, c + d)) sup = true;
        if (!sup) over[r * W + c] = 1;
      }
    }
    // regioni connesse (8-vicinato, con tolleranza di 2 pixel)
    const lab = new Int32Array(W * H);
    const regions = [];
    for (let i = 0; i < W * H; i++) {
      if (!over[i] || lab[i]) continue;
      const id = regions.length + 1, stack = [i], cells = [];
      lab[i] = id;
      while (stack.length) {
        const q = stack.pop(); cells.push(q);
        const r = (q / W) | 0, c = q % W;
        for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
          const rr = r + dr, cc = c + dc;
          if (rr < 0 || cc < 0 || rr >= H || cc >= W) continue;
          const j = rr * W + cc;
          if (over[j] && !lab[j]) { lab[j] = id; stack.push(j); }
        }
      }
      regions.push(cells);
    }
    const ang = Math.tan((P.supBranchAngle * Math.PI) / 180);
    const rTip = P.supTipD / 2, rB = P.supBranchD / 2;
    const tMin = Math.min(0, P.beads ? P.ornT / 2 - 1.8 : 0), tMax = Math.max(P.bandT + (P.bandDeco ? 0.6 : 0), P.textT, P.swashT, P.ornT + P.ribH, P.beads ? P.ornT / 2 + 1.8 : 0);
    const SA = new Uint32Array((W + 1) * (H + 1));            // somme cumulative: test di area libera O(1)
    for (let r = 0; r < H; r++) {
      let acc = 0;
      for (let c = 0; c < W; c++) { acc += m[r * W + c]; SA[(r + 1) * (W + 1) + c + 1] = SA[r * (W + 1) + c + 1] + acc; }
    }
    const free = (xa, xb, ya, yb) => {
      const c0 = Math.max(0, Math.floor((xa - x0) / dx)), c1 = Math.min(W - 1, Math.ceil((xb - x0) / dx));
      const r0 = Math.floor(ya / dy), r1 = Math.min(H - 1, Math.ceil(yb / dy));
      if (r0 < 0) return false;
      if (c1 < c0 || r1 < r0) return true;
      const w = W + 1;
      return SA[(r1 + 1) * w + c1 + 1] - SA[r0 * w + c1 + 1] - SA[(r1 + 1) * w + c0] + SA[r0 * w + c0] === 0;
    };
    const contacts = [];
    for (const cells of regions) {
      // per colonna, il bordo inferiore più basso
      const col = new Map();
      for (const q of cells) {
        const r = (q / W) | 0, c = q % W;
        if (!col.has(c) || col.get(c) > r) col.set(c, r);
      }
      const cs = [...col.keys()].sort((a, b) => a - b);
      const span = (cs[cs.length - 1] - cs[0] + 1) * dx;
      if (span < P.supMinLen) continue;
      const feasible = [];
      const step = Math.max(1, Math.round(0.5 / dx));
      for (let ci = 0; ci < cs.length; ci += step) {
        const cc = cs[ci];
        const xc = x0 + (cc + 0.5) * dx;
        let zu = Infinity;
        for (let d = -Math.ceil(rTip / dx); d <= Math.ceil(rTip / dx); d++) if (col.has(cc + d)) zu = Math.min(zu, col.get(cc + d) * dy);
        if (!isFinite(zu)) continue;
        const tipTop = zu - P.supGap;
        if (tipTop < 0.4) continue;
        const r0 = Math.round(zu / dy);
        const inText = RT && RT.m[r0 * W + cc], inSw = RS.m[r0 * W + cc];
        const tc = inText ? P.textT / 2 : inSw ? P.swashT / 2 : P.ornT / 2;
        const sides = P.supSide === 'interno' ? ['in'] : P.supSide === 'esterno' ? ['out'] : ['in', 'out'];
        let ok = null;
        for (const side of sides) {
          for (const dS of [0, -1, 1, -2, 2, -3, 3, -4.5, 4.5, -6, 6]) {
            const beadNear = D.beads.some((b) => Math.abs(b.c[0] - xc - dS / 2) < b.r + rB + P.supXY + 2 && b.c[1] - b.r < tipTop && b.c[1] + b.r > tipTop - 8);
            const tE = side === 'in' ? (beadNear ? tMin : 0) - P.supXY - rB : tMax + P.supXY + rB;
            const dz = Math.hypot(tc - tE, dS) / ang;
            if (tipTop - dz < 0.5) continue;
            let clear = true;
            const steps = Math.max(2, Math.ceil(Math.hypot(dS, dz) / 0.25));
            for (let q = 0; q <= steps && clear; q++) {
              const u = q / steps;
              const rr = lerp(rTip, rB, u) + P.supXY * Math.min(1, u / 0.35);   // la distanza XY entra lontano dalla punta
              const px = xc + dS * u, pz = tipTop - dz * u;
              if (!free(px - rr, px + rr, pz - rr * 0.5, pz)) clear = false;
            }
            if (clear) { ok = { side, tE, dz, dS }; break; }
          }
          if (ok) break;
        }
        if (ok) feasible.push({ x: xc, top: tipTop, tc, ...ok });
      }
      const regionContacts = [];
      if (feasible.length) {
        const xa = x0 + (cs[0] + 0.5) * dx;
        const nC = Math.max(1, Math.round(span / P.supSpacing));
        const used = new Set();
        for (let k = 0; k < nC; k++) {
          const target = xa + span * ((k + 0.5) / nC);
          let best = null;
          for (const f of feasible) if (!used.has(f) && Math.abs(f.x - target) <= Math.max(P.supSpacing / 2, 1) && (!best || Math.abs(f.x - target) < Math.abs(best.x - target))) best = f;
          if (best) { used.add(best); regionContacts.push(best); }
        }
        if (!regionContacts.length) regionContacts.push(feasible[(feasible.length / 2) | 0]);
      }
      const feasibleAny = regionContacts.length > 0;
      if (P._debug) out.debug = (out.debug || []).concat([{ x: +(x0 + cs[0] * dx).toFixed(1), x2: +(x0 + cs[cs.length - 1] * dx).toFixed(1), z: +(Math.min(...col.values()) * dy).toFixed(1), span: +span.toFixed(1), n: regionContacts.length }]);
      if (regionContacts.length) contacts.push(...regionContacts);
      if (!feasibleAny) {
        // ponte (appoggiato ai due capi) o sbalzo libero (un capo nel vuoto)?
        const endOk = (c, dir) => {
          const r = col.get(c);
          for (let k = 1; k <= 5; k++) for (let dr = -Math.round(0.6 / dy); dr <= 1; dr++) if (at(r + dr, c + dir * k)) return true;
          return false;
        };
        const bridge = endOk(cs[0], -1) && endOk(cs[cs.length - 1], 1);
        if (bridge) { out.bridged++; out.worstBridge = Math.max(out.worstBridge, span); }
        else { out.cantilevers = (out.cantilevers || 0) + 1; out.worstCantilever = Math.max(out.worstCantilever || 0, span); }
      }
    }
    out.contacts = contacts.length;
    if (!P.supports || !contacts.length) return out;
    // tronchi: raggruppo per lato e posizione
    const prims = [];
    const seen = new Set();
    const seg = (a, b, ra, rb) => {
      const key = [...a, ...b].map((v) => v.toFixed(2)).join();
      if (seen.has(key)) return;
      seen.add(key);
      const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const L = Math.hypot(...d);
      if (L < 0.05) return;
      const z = d.map((v) => v / L);
      const jit = (prims.length * 0.7548776662) % 1 * TAU;   // rotazione diversa per ogni ramo
      const ref0 = Math.abs(z[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
      const ref = [ref0[0] + 0.3 * Math.cos(jit), ref0[1] + 0.3 * Math.sin(jit), ref0[2] + 0.17];
      let x = [ref[1] * z[2] - ref[2] * z[1], ref[2] * z[0] - ref[0] * z[2], ref[0] * z[1] - ref[1] * z[0]];
      const lx = Math.hypot(...x); x = x.map((v) => v / lx);
      const y = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
      const mtx = [x[0], x[1], x[2], 0, y[0], y[1], y[2], 0, z[0], z[1], z[2], 0, a[0], a[1], a[2], 1];
      prims.push(T(T(Manifold.cylinder(L, ra, rb, P._prev ? 8 : 12)).transform(mtx)));
    };
    const ball = (p, r) => {
      const key = p.map((v) => v.toFixed(2)).join() + r.toFixed(2);
      if (seen.has(key)) return;                         // sfere identiche: niente superfici coincidenti
      seen.add(key);
      prims.push(T(T(Manifold.sphere(r * 1.06, P._prev ? 8 : 12)).translate(p)));   // un filo più grande del ramo: niente bordi tangenti
    };
    for (const side of ['in', 'out']) {
      const cs = contacts.filter((c) => c.side === side).sort((a, b) => a.x - b.x);
      let i = 0;
      while (i < cs.length) {
        let j = i;
        while (j + 1 < cs.length && cs[j + 1].x - cs[i].x <= P.supMerge) j++;
        const group = cs.slice(i, j + 1);
        i = j + 1;
        const n = group.length;
        const xc = group.reduce((s, c) => s + c.x, 0) / n;
        const rT = Math.min(P.supTrunkDmax / 2, Math.max(rB, rB * (1 + 0.3 * (n - 1))));
        const tT = side === 'in' ? tMin - P.supXY - rT : tMax + P.supXY + rT;
        let zTop = 0;
        for (const c of group) {
          const tip = [c.x, c.top, c.tc], E = [c.x + c.dS, c.top - c.dz, c.tE];
          if (E[1] < 0.2) { seg([c.x, 0, c.tE], tip, rB, rTip); continue; }
          seg(E, tip, rB, rTip);
          ball(E, rB);
          const dH = Math.hypot(E[0] - xc, c.tE - tT);
          const zJ = Math.max(P.supFootH + 1.0, E[1] - dH / ang);
          seg([xc, zJ, tT], E, rT * 0.9, rB);
          if (side === 'in' && tT > tMin - P.supXY - rT) { /* tronco già fuori dalle perline */ }
          ball([xc, zJ, tT], rT * 0.9);
          zTop = Math.max(zTop, zJ);
        }
        if (zTop <= 0) continue;
        // il tronco scende e si allontana dalla fascia, poi va dritto al piatto con un piede
        const rF = P.supFootD / 2;
        const tF = side === 'in' ? -(P.supXY + rF + 0.3) : P.bandT + (P.bandDeco ? 0.6 : 0) + P.supXY + rF + 0.3;
        const tFeet = side === 'in' ? Math.min(tT, tF) : Math.max(tT, tF);
        const zK = Math.min(zTop, Math.max(P.supFootH + 0.8, zTop - Math.abs(tFeet - tT) / ang));
        seg([xc, zK, tFeet], [xc, zTop, tT], rT, rT * 0.9);
        ball([xc, zK, tFeet], rT);
        seg([xc, 0, tFeet], [xc, zK, tFeet], rT, rT);
        prims.push(T(T(Manifold.cylinder(P.supFootH, rF, rF, 24)).rotate([-90, 0, 0]).translate([xc, 0, tFeet])));
        prims.push(T(T(Manifold.cylinder(Math.max(0.1, rF - rT), rF, rT, 24)).rotate([-90, 0, 0]).translate([xc, P.supFootH, tFeet])));
        out.trunks++;
      }
    }
    out.prims = prims;
    return out;
  }

  // ---------------------------------------------------------------- generazione completa
  function generate(Pin, fontBuffers) {
    const P = { ...DEFAULTS, ...Pin };
    const selfModel = P.model === 'autoportante';
    if (selfModel) P.supports = false;
    for (const [k, buf] of Object.entries(fontBuffers || {})) if (!fonts[k]) fonts[k] = opentype.parse(buf);
    const warnings = [];
    const t0 = Date.now();
    try {
      const tm = {}; let tl = Date.now(); const lap = (k) => { const n = Date.now(); tm[k] = n - tl; tl = n; };
      const band = bandPath(P); lap('fascia');
      const D = design2D(P, band, warnings); lap('disegno2D');
      if (P._dump2d) P._dump2d.d = { orn: D.orn.toPolygons(), text: D.text ? D.text.toPolygons() : [], band: D.band2d.toPolygons(), kx: D.kx, ky: D.ky, ZB: D.ZB, TB: D.TB };
      // estrusioni (piano: x=s, y=h, z=t)
      const ex = (cs, t0, t1) => (cs.isEmpty() ? null : T(T(T(cs.simplify(0.015)).extrude(t1 - t0)).translate([0, 0, t0])));
      if (P._dbgVerts && false) console.error('vertici 2D', { orn: D.orn.numVert(), rib: D.rib.numVert(), text: D.text ? D.text.numVert() : 0, swash: D.swash.numVert(), ornS: T(D.orn.simplify(0.015)).numVert() });
      const solids = [ex(D.band2d, 0, P.bandT), ex(T(D.orn.subtract(D.swash)), 0, P.ornT), ex(D.swash, 0, selfModel ? P.textT : P.swashT)];
      if (P.ribH > 0.05 && !D.rib.isEmpty()) solids.push(ex(D.rib, P.ornT - 0.2, P.ornT + P.ribH));
      if (D.text) solids.push(ex(D.text, 0, P.textT));
      for (const b of D.beads) {
        solids.push(T(T(Manifold.sphere(b.r, 20)).translate([b.c[0], b.c[1], P.ornT / 2])));
        if (b.cone) {                                   // cono a 45° sotto la perla: niente sbalzi in nessuna direzione
          const h = b.r * Math.SQRT2 - b.r / Math.SQRT2;
          solids.push(T(T(T(Manifold.cylinder(h, 0.02, b.r / Math.SQRT2, 20)).rotate([-90, 0, 0])).translate([b.c[0], b.c[1] - b.r * Math.SQRT2, P.ornT / 2])));
        }
      }
      if (P.bandDeco) {
        // rombi in rilievo sul fronte della fascia: lati a ≥ 50° dall'orizzontale, quindi autoportanti
        const hh = Math.max(0.8, Math.min(1.85, P.bandH / 2 - 0.9)), hw = Math.min(1.5, hh * 0.82);
        const zc = P.bandH / 2, S = D.ornEnd, polys = [];
        const rh = (x, a, b) => [[x, zc - b], [x + a, zc], [x, zc + b], [x - a, zc]];
        for (let x = 0; x <= S; x += 6) {
          for (const sx of x === 0 ? [0] : [x, -x]) polys.push(rh(sx, hw, hh));
          if (x + 3 <= S) for (const sx of [x + 3, -(x + 3)]) polys.push(rh(sx, hw * 0.45, hh * 0.5));
        }
        solids.push(ex(CS(polys), P.bandT - 0.3, P.bandT + 0.6));
      }
      const teeth = [];
      if (P.teeth) {
        const s0 = band.quarter + 4, s1 = band.flareStart - 2;
        const prof = CS([[[-0.95, -0.3], [0.95, -0.3], [0.3, P.teethH], [-0.3, P.teethH]]]);
        const tooth = T(T(prof.extrude(P.bandH - 0.9)).rotate([-90, 0, 0]));
        for (let s = s0; s <= s1; s += P.teethPitch) for (const sg of [1, -1]) teeth.push(T(tooth.translate([sg * s, 0, 0])));
      }
      let flat = T(Manifold.union([...solids.filter(Boolean), ...teeth]));
      {
        // frammenti degeneri (volume ~0) lasciati dalle booleane: via. I pezzi veri restano e vengono segnalati.
        const fc = flat.decompose(); fc.forEach(T);
        if (fc.length > 1) {
          const keep = fc.filter((c) => c.volume() > 0.5);
          if (keep.length < fc.length) flat = T(Manifold.compose(keep));
        }
      }
      const fitFlat = T(Manifold.union([solids[0], ...teeth])); lap('estrusione');
      const sup = selfModel ? { contacts: 0, trunks: 0, bridged: 0, worstBridge: 0, prims: [] } : treeSupports(P, D, null); lap('analisiSupporti');
      const bend = bendBatch(band);
      const finish = (M, edge) => T(T(M.refineToLength(edge)).warpBatch(bend));
      const tiara = finish(flat, P.meshEdge); lap('curvaturaTiara');
      const fit = P._noFit ? null : finish(fitFlat, P.meshEdge * 1.5);
      const supU = sup.prims.length ? T(Manifold.union(sup.prims)) : null; lap('unioneSupporti');
      const supM = supU ? finish(supU, P.meshEdge * 2) : null; lap('curvaturaSupporti');
      const bb = tiara.boundingBox();
      const off = [-(bb.min[0] + bb.max[0]) / 2, -(bb.min[1] + bb.max[1]) / 2, -bb.min[2]];
      const mesh = (M, q = 1e-4) => {
        if (!M) return null;
        const m = T(M.translate(off)).getMesh();
        const np = m.numProp;
        let v = m.vertProperties;
        if (np !== 3) { const w = new Float32Array((v.length / np) * 3); for (let i = 0, k = 0; i < v.length; i += np) { w[k++] = v[i]; w[k++] = v[i + 1]; w[k++] = v[i + 2]; } v = w; }
        return weld(v, m.triVerts, q);
      };
      const mat = MATERIALS[P.material];
      const supBB = supM ? supM.boundingBox() : null;
      const size = [bb.max[0] - bb.min[0], bb.max[1] - bb.min[1], bb.max[2] - bb.min[2]];
      let sizeAll = size.slice();
      if (supBB) {
        const mn = [0, 1, 2].map((k) => Math.min(bb.min[k], supBB.min[k])), mx = [0, 1, 2].map((k) => Math.max(bb.max[k], supBB.max[k]));
        sizeAll = [0, 1, 2].map((k) => mx[k] - mn[k]);
      }
      // molla: forza di serraggio e deformazione (trave curva, braccio flessibile oltre la decorazione)
      const spring = springCheck(P, band, D.kx * (selfModel ? 120 : 112), mat);
      const status = tiara.status();
      const comps = tiara.decompose(); comps.forEach(T);
      const partsInfo = P._dbgParts ? comps.map((c) => { const b = c.boundingBox(); return { vol: +c.volume().toFixed(2), min: b.min.map((v) => +v.toFixed(1)), max: b.max.map((v) => +v.toFixed(1)) }; }) : undefined;
      const result = {
        ok: true,
        tiara: mesh(tiara), supports: mesh(supM, 1e-6), fit: mesh(fit),
        stats: {
          size, sizeAll, volume: tiara.volume() / 1000, mass: (tiara.volume() / 1000) * mat.rho,
          supMass: supM ? (supM.volume() / 1000) * mat.rho : 0, bodies: comps.length, status: String(status),
          contacts: sup.contacts, trunks: sup.trunks, bridged: sup.bridged, worstBridge: sup.worstBridge, cantilevers: sup.cantilevers || 0, worstCantilever: sup.worstCantilever || 0,
          band: { A: band.A, B: band.B, L: band.L, inner: 2 * band.A, opening: spring.opening, headW: 2 * band.aH, headL: 2 * band.bH },
          spring, text: D.info, anchors: D.anchors, ms: 0, debug: sup.debug, model: P.model, self: D.selfInfo || null, parts: partsInfo,
        },
        warnings,
      };
      if (comps.length > 1) warnings.push({ level: 'error', code: 'pieces', p: { n: comps.length }, msg: `Il modello è in ${comps.length} pezzi separati: qualcosa non è collegato.` });
      const [bw, bd, bname] = P.printer === 'mk4s' ? [250, 210, 'della MK4S (250 × 210 mm)'] : [P.bed, P.bed, `da ${P.bed} mm`];
      const fits = (sizeAll[0] <= bw && sizeAll[1] <= bd) || (sizeAll[0] <= bd && sizeAll[1] <= bw);
      if (!fits) warnings.push({ level: 'error', code: P.printer === 'mk4s' ? 'bedMk4s' : 'bed', p: { s: P.bed, x: sizeAll[0], y: sizeAll[1] }, msg: `Non entra nel piatto ${bname}: servono ${sizeAll[0].toFixed(0)} × ${sizeAll[1].toFixed(0)} mm.` });
      const it = (v, d = 1) => v.toFixed(d).replace('.', ',');
      if (spring.strainOn > mat.eps) warnings.push({ level: 'error', code: 'strainOver', p: { pct: spring.strainOn * 100, mat: P.material, lim: mat.eps * 100 }, msg: `Infilandola la fascia si flette del ${it(spring.strainOn * 100)}%, oltre il limite del ${P.material} (${it(mat.eps * 100)}%): probabilmente si spezza. Usa PETG, serraggio più morbido o fascia più sottile.` });
      else if (spring.strainOn > 0.8 * mat.eps) warnings.push({ level: 'warn', code: 'strainNear', p: { pct: spring.strainOn * 100, mat: P.material, lim: mat.eps * 100 }, msg: `Infilandola la fascia si flette del ${it(spring.strainOn * 100)}%, vicino al limite del ${P.material} (${it(mat.eps * 100)}%). Aprila con delicatezza o scegli PETG.` });
      if (spring.force > 6) warnings.push({ level: 'warn', code: 'forceHigh', p: { f: spring.force }, msg: `Serraggio forte (circa ${it(spring.force)} N per lato): dopo un po' può dare fastidio.` });
      if (spring.force < 0.8) warnings.push({ level: 'warn', code: 'forceLow', msg: 'Serraggio molto leggero: potrebbe scivolare.' });
      if (!P.supports && sup.contacts) warnings.push({ level: 'info', code: 'slicerSup', p: { n: sup.contacts }, msg: `${sup.contacts} punti da sostenere: attiva i supporti ad albero nello slicer.` });
      if ((sup.worstCantilever || 0) > 3) warnings.push({ level: 'warn', code: 'cantilever', p: { mm: sup.worstCantilever }, msg: `Uno sbalzo libero di ${sup.worstCantilever.toFixed(1).replace('.', ',')} mm non è raggiungibile dai supporti: potrebbe colare un po'.` });
      if (sup.worstBridge > 12) warnings.push({ level: 'warn', code: 'bridge', p: { mm: sup.worstBridge }, msg: `Un ponte di ${sup.worstBridge.toFixed(0)} mm dentro una lettera o un ricciolo: lungo, controlla la ventola.` });
      lap('mesh'); result.stats.ms = Date.now() - t0; result.stats.timing = tm;
      return result;
    } catch (e) {
      return { ok: false, error: String(e && e.stack || e), warnings };
    } finally {
      cleanup();
    }
  }

  return { generate, fonts };
}

export function springCheck(P, band, sFlex, mat) {
  const { ds, px, py } = band;
  const ie = Math.min(px.length - 1, Math.round(band.flareStart / ds));
  const xc = px[ie], yc = py[ie];
  const yHead = band.B - band.bH;                       // centro testa nel riferimento della fascia
  const u = (yc - yHead) / band.bH;
  const headHalf = band.aH * Math.sqrt(Math.max(0, 1 - u * u));
  const need = Math.max(0, headHalf - xc);
  const needOn = Math.max(0, band.aH - xc);
  const I = (P.bandH * P.bandT ** 3) / 12, c = P.bandT / 2;
  const j0 = Math.round(sFlex / ds);
  let flex = 0, lmax = 0;
  for (let j = j0; j <= ie; j++) { const l = Math.abs(yc - py[j]); flex += l * l * ds; lmax = Math.max(lmax, l); }
  const force = flex > 0 ? (need * mat.E * I) / flex : 0;
  const strain = (force * lmax * c) / (mat.E * I);
  const strainOn = need > 0 ? (strain * needOn) / need : 0;
  return { force, strain, strainOn, need, needOn, opening: 2 * xc };
}

// Fonde i vertici che coincidono in float32 (entro 0.1 µm) ed elimina i triangoli diventati nulli
export function weld(v, tri, q = 1e-4) {
  const map = new Map();
  const remap = new Uint32Array(v.length / 3);
  const out = [];
  for (let i = 0; i < v.length / 3; i++) {
    const key = Math.round(v[3 * i] / q) + ',' + Math.round(v[3 * i + 1] / q) + ',' + Math.round(v[3 * i + 2] / q);
    let j = map.get(key);
    if (j === undefined) { j = out.length / 3; map.set(key, j); out.push(v[3 * i], v[3 * i + 1], v[3 * i + 2]); }
    remap[i] = j;
  }
  const t = [];
  for (let i = 0; i < tri.length; i += 3) {
    const a = remap[tri[i]], b = remap[tri[i + 1]], c = remap[tri[i + 2]];
    if (a !== b && b !== c && a !== c) t.push(a, b, c);
  }
  return { vert: Float32Array.from(out), tri: Uint32Array.from(t) };
}

// ------------------------------------------------------------------ STL binario
export function stlBinary(meshes, name = 'tiara') {
  let n = 0;
  for (const m of meshes) if (m) n += m.tri.length / 3;
  const buf = new ArrayBuffer(84 + 50 * n);
  const dv = new DataView(buf);
  const head = `${name} - generato da Tiara Maker`;
  for (let i = 0; i < Math.min(80, head.length); i++) dv.setUint8(i, head.charCodeAt(i) & 0x7f);
  dv.setUint32(80, n, true);
  let o = 84;
  for (const m of meshes) {
    if (!m) continue;
    const v = m.vert, t = m.tri;
    for (let i = 0; i < t.length; i += 3) {
      const a = 3 * t[i], b = 3 * t[i + 1], c = 3 * t[i + 2];
      const ux = v[b] - v[a], uy = v[b + 1] - v[a + 1], uz = v[b + 2] - v[a + 2];
      const wx = v[c] - v[a], wy = v[c + 1] - v[a + 1], wz = v[c + 2] - v[a + 2];
      let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
      const l = Math.hypot(nx, ny, nz) || 1;
      dv.setFloat32(o, nx / l, true); dv.setFloat32(o + 4, ny / l, true); dv.setFloat32(o + 8, nz / l, true);
      for (const k of [a, b, c]) { o += 12; dv.setFloat32(o, v[k], true); dv.setFloat32(o + 4, v[k + 1], true); dv.setFloat32(o + 8, v[k + 2], true); }
      o += 12;
      dv.setUint16(o, 0, true); o += 2;
    }
  }
  return buf;
}
