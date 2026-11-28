// Geometría del editor de naves (editor.html), sin DOM: puntos `[x, z]` en metros, como el contorno del esquema
// (docs/ESQUEMA.md: x = ancho, z = fondo). Las prueban test/editor-geom.test.mjs. En pantalla z crece hacia abajo
// (como en `planSVG`), así que un contorno «antihorario» del esquema (área con signo positiva) se ve en sentido horario.

/** Lo que se considera el mismo punto (m). */
export const EPS = 1e-6;
/** La tolerancia `TOL` del validador (crates/park3d-core/src/validate.rs), m. */
export const TOL = 0.02;
/**
 * Hasta dónde un punto «sobre el borde» del contorno cuenta como dentro (m): `on_boundary` de `rect_inside` en el
 * validador, `TOL × 5`. Con menos, el editor marcaba como fuera lo que el validador acepta (una escalera 2 cm por fuera
 * de un muro inclinado, en rubi-schumann).
 */
export const ON_EDGE = TOL * 5;

export const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
export const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
/** Redondeo a `d` decimales que no deja `0.30000000000000004` en el JSON. */
export const round = (v, d = 3) => {
  const k = 10 ** d;
  const r = Math.round(v * k) / k;
  return Object.is(r, -0) ? 0 : r;
};
export const roundPt = (p, d = 3) => [round(p[0], d), round(p[1], d)];

/** Área con signo (fórmula del lazo): positiva = el «antihorario» del esquema. */
export function signedArea(poly) {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return s / 2;
}
export const area = poly => Math.abs(signedArea(poly));

/** Caja del contorno: `{ x0, z0, x1, z1 }` (todo 0 si está vacío). */
export function bbox(poly) {
  if (!poly.length) return { x0: 0, z0: 0, x1: 0, z1: 0 };
  let [x0, z0] = poly[0];
  let [x1, z1] = poly[0];
  for (const [x, z] of poly) {
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    z0 = Math.min(z0, z);
    z1 = Math.max(z1, z);
  }
  return { x0, z0, x1, z1 };
}

/** Si `(x, z)` cae dentro del contorno (par-impar, como `inside` del validador). */
export function pointInPoly(poly, x, z) {
  let c = false;
  for (let i = 0, n = poly.length; i < n; i++) {
    const [x1, z1] = poly[i];
    const [x2, z2] = poly[(i + 1) % n];
    if (z1 > z !== z2 > z && x < x1 + ((z - z1) * (x2 - x1)) / (z2 - z1)) c = !c;
  }
  return c;
}

/** Proyección de `p` sobre el segmento `a`–`b`: `{ t }` (0..1), el punto y la distancia. */
export function projectOnSegment(p, a, b) {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const l2 = dx * dx + dz * dz;
  const t = l2 < EPS * EPS ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l2));
  const q = [a[0] + dx * t, a[1] + dz * t];
  return { t, point: q, d: dist(p, q) };
}

/** Distancia de `p` al borde del contorno. */
export const distToPoly = (poly, p) => nearestEdge(poly, p)?.d ?? Infinity;

/** Si `(x, z)` está dentro o sobre el borde (a menos de `tol`). */
export const insideOrOn = (poly, x, z, tol = ON_EDGE) => pointInPoly(poly, x, z) || distToPoly(poly, [x, z]) <= tol;

/** Si el rectángulo `{ x, z, w, d }` cae dentro del contorno: sus esquinas y su centro (como `rect_inside`). */
export function rectInPoly(poly, r, tol = ON_EDGE) {
  const pts = [
    [r.x, r.z],
    [r.x + r.w, r.z],
    [r.x, r.z + r.d],
    [r.x + r.w, r.z + r.d],
    [r.x + r.w / 2, r.z + r.d / 2],
  ];
  return pts.every(([x, z]) => insideOrOn(poly, x, z, tol));
}

/** La arista más cercana a `p`: `{ k, t, point, d }` (o null sin aristas). */
export function nearestEdge(poly, p) {
  let best = null;
  for (let k = 0, n = poly.length; n >= 2 && k < n; k++) {
    const pr = projectOnSegment(p, poly[k], poly[(k + 1) % n]);
    if (!best || pr.d < best.d) best = { k, ...pr };
  }
  return best;
}

/**
 * La arista `k`: extremos, largo, dirección unitaria y normal hacia dentro (las cuentas de `edgeFrame` de
 * `@snowpark-bcn/park3d/plan`: la normal es la de la izquierda salvo que el punto medio corrido 5 cm caiga fuera).
 */
export function edgeFrame(poly, k) {
  const n = poly.length;
  const a = poly[k];
  const b = poly[(k + 1) % n];
  const len = dist(a, b);
  const dir = len > EPS ? [(b[0] - a[0]) / len, (b[1] - a[1]) / len] : [1, 0];
  let nIn = [-dir[1], dir[0]];
  const mx = (a[0] + b[0]) / 2 + nIn[0] * 0.05;
  const mz = (a[1] + b[1]) / 2 + nIn[1] * 0.05;
  if (!pointInPoly(poly, mx, mz)) nIn = [dir[1], -dir[0]];
  return { a, b, len, dir, nIn };
}

/** Si los segmentos `a`–`b` y `c`–`d` se cruzan o se tocan (con tolerancia `EPS`). */
export function segmentsIntersect(a, b, c, d) {
  const o = (p, q, r) => {
    const v = (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
    return Math.abs(v) < EPS ? 0 : Math.sign(v);
  };
  const on = (p, q, r) =>
    Math.min(p[0], r[0]) - EPS <= q[0] &&
    q[0] <= Math.max(p[0], r[0]) + EPS &&
    Math.min(p[1], r[1]) - EPS <= q[1] &&
    q[1] <= Math.max(p[1], r[1]) + EPS;
  const o1 = o(a, b, c);
  const o2 = o(a, b, d);
  const o3 = o(c, d, a);
  const o4 = o(c, d, b);
  if (o1 !== o2 && o3 !== o4) return true;
  return (
    (o1 === 0 && on(a, c, b)) || (o2 === 0 && on(a, d, b)) || (o3 === 0 && on(c, a, d)) || (o4 === 0 && on(c, b, d))
  );
}

/**
 * Lo que impide que el contorno sea un polígono simple: aristas de largo 0 (`{ kind: 'zero', k }`) y pares de aristas
 * no contiguas que se cruzan o se tocan (`{ kind: 'cross', i, j }`).
 */
export function polyProblems(poly) {
  const n = poly.length;
  const out = [];
  for (let k = 0; k < n; k++) if (dist(poly[k], poly[(k + 1) % n]) < 1e-3) out.push({ kind: 'zero', k });
  if (n < 4) return out;
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      if (j === i + 1 || (i === 0 && j === n - 1)) continue; // contiguas: comparten un vértice
      if (segmentsIntersect(poly[i], poly[(i + 1) % n], poly[j], poly[(j + 1) % n])) out.push({ kind: 'cross', i, j });
    }
  return out;
}

/** El punto de la rejilla de paso `step` más cercano (sin paso, el mismo). */
export function snapToGrid(p, step) {
  if (!(step > 0)) return [...p];
  return [Math.round(p[0] / step) * step, Math.round(p[1] / step) * step];
}

/** Ángulo de `a` a `b` en grados, de −180 a 180 (0 = +x; 90 = +z, hacia abajo en pantalla). */
export const angleDeg = (a, b) => (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;

/** El punto a `len` m de `from` en la dirección `deg` (grados, como `angleDeg`). */
export function polar(from, deg, len) {
  const r = (deg * Math.PI) / 180;
  return [from[0] + Math.cos(r) * len, from[1] + Math.sin(r) * len];
}

/**
 * `to` llevado a la dirección más cercana de las múltiplos de `stepDeg` vistas desde `from`, a la misma distancia,
 * si está a menos de `tolDeg` de ella (o siempre, con `force`). Devuelve `{ point, deg, snapped }`.
 */
export function snapAngle(from, to, { stepDeg = 45, tolDeg = 7, force = false } = {}) {
  const deg = angleDeg(from, to);
  const len = dist(from, to);
  const near = Math.round(deg / stepDeg) * stepDeg;
  if (len > EPS && (force || Math.abs(deg - near) <= tolDeg))
    return { point: polar(from, near, len), deg: near, snapped: true };
  return { point: [...to], deg, snapped: false };
}

/**
 * Lee un número escrito a mano: coma o punto decimal, espacios, y + − × / con paréntesis («12,5 + 3», «16.4/2»).
 * Devuelve `NaN` si no es eso (sin `eval`).
 */
export function parseNum(text) {
  const s = String(text ?? '')
    .trim()
    .replace(/(\d),(\d)/g, '$1.$2')
    .replace(/[×x*]/gi, '*')
    .replace(/÷/g, '/')
    .replace(/−/g, '-')
    .replace(/\s+/g, '')
    .replace(/m$/i, '');
  if (!s) return NaN;
  let i = 0;
  const peek = () => s[i];
  const num = () => {
    const m = /^\d*\.?\d+(?:e[+-]?\d+)?|^\d+\.?/i.exec(s.slice(i));
    if (!m) return NaN;
    i += m[0].length;
    return Number(m[0]);
  };
  const factor = () => {
    if (peek() === '-') {
      i++;
      return -factor();
    }
    if (peek() === '+') {
      i++;
      return factor();
    }
    if (peek() === '(') {
      i++;
      const v = expr();
      if (peek() !== ')') return NaN;
      i++;
      return v;
    }
    return num();
  };
  const term = () => {
    let v = factor();
    while (peek() === '*' || peek() === '/') v = s[i++] === '*' ? v * factor() : v / factor();
    return v;
  };
  const expr = () => {
    let v = term();
    while (peek() === '+' || peek() === '-') v = s[i++] === '+' ? v + term() : v - term();
    return v;
  };
  const v = expr();
  return i === s.length && Number.isFinite(v) ? v : NaN;
}

const FORMATS = new Map();
/**
 * Un número para la interfaz: coma decimal y hasta `d` decimales («14,6»). El texto es el de `toLocaleString` con las
 * mismas opciones, con un `Intl.NumberFormat` por cantidad de decimales: armar uno en cada llamada costaba ~1 ms por
 * cuadro de un arrastre (las cotas de las aristas).
 */
export const fmt = (v, d = 2) => {
  if (!Number.isFinite(v)) return '—';
  let f = FORMATS.get(d);
  if (!f) FORMATS.set(d, (f = new Intl.NumberFormat('es-ES', { maximumFractionDigits: d, useGrouping: false })));
  return f.format(v);
};
