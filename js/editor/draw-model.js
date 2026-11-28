// La nave del editor (editor.html) como dato: plantillas, las operaciones del dibujo sobre el contorno (insertar,
// borrar y mover vértices, cambiar el largo de una arista) que llevan con ellas lo que cuelga de cada arista (huecos,
// la fachada de calle, los tramos y juntas de los muros, las cruces de San Andrés), mover la nave entera, la retícula
// de pilares y los chequeos que se pueden hacer sin el núcleo (los del paquete los suma draw-check.js). Sin DOM: lo
// prueban test/editor-geom.test.mjs. Una nave es `{ id, name, city?, shell }` (una `Nave` de docs/ESQUEMA.md).
import {
  EPS,
  TOL,
  area,
  bbox,
  dist,
  edgeFrame,
  fmt,
  lerp,
  polyProblems,
  projectOnSegment,
  rectInPoly,
  round,
  signedArea,
} from './draw-geom.js';

export const clone = v => (v === undefined ? v : structuredClone(v));

/** Tipos de hueco del editor: el `type` del esquema y, si va, la hoja (`leaf`) que lo distingue. */
// oxfmt-ignore
export const OPENING_KINDS = [
  { key: 'pedestrian-door', label: 'Puerta peatonal', type: 'pedestrian-door', width: 1.0, height: 2.1 },
  { key: 'sectional-door', label: 'Portón seccional', type: 'sectional-door', width: 4.5, height: 4.5 },
  { key: 'roller', label: 'Persiana enrollable', type: 'sectional-door', leaf: 'slats', width: 4.0, height: 4.0 },
  { key: 'tir-door', label: 'Portón TIR (dos hojas)', type: 'tir-door', width: 4.0, height: 4.5 },
  { key: 'glazed-entrance', label: 'Acceso acristalado', type: 'glazed-entrance', width: 2.0, height: 2.5 },
  { key: 'emergency-exit', label: 'Salida de emergencia', type: 'emergency-exit', width: 1.2, height: 2.1 },
  { key: 'window', label: 'Ventana', type: 'window', width: 2.0, height: 1.2, sill: 1.2 },
];
/** La clave de `OPENING_KINDS` de un hueco del esquema. */
export const openingKind = o => (o.type === 'sectional-door' && o.leaf === 'slats' ? 'roller' : o.type);
export const openingLabel = o => OPENING_KINDS.find(k => k.key === openingKind(o))?.label ?? o.type;

/** Un hueco nuevo del tipo `key` en la arista `edge`, centrado en `t`. */
export function newOpening(key, edge, t) {
  const k = OPENING_KINDS.find(x => x.key === key) ?? OPENING_KINDS[0];
  const o = { type: k.type, edge, t: round(t, 4), width: k.width, height: k.height, sill: k.sill ?? 0 };
  if (k.leaf) o.leaf = k.leaf;
  return o;
}

/** Cambia el tipo de un hueco conservando lo demás (la hoja de la persiana va y viene con el tipo). */
export function withOpeningKind(o, key) {
  const k = OPENING_KINDS.find(x => x.key === key);
  if (!k) return o;
  const out = { ...o, type: k.type };
  if (k.leaf) out.leaf = k.leaf;
  else if (o.leaf === 'slats') delete out.leaf;
  if (key === 'window' && !(o.sill > 0)) out.sill = k.sill;
  if (key !== 'window' && o.type === 'window') out.sill = 0;
  return out;
}

// ------------------------------------------------------------------------------------------------ plantillas

/** Lo que lleva una nave nueva además del contorno (el resto lo pone el visor por defecto). */
function baseShell(outline, clearHeight = 7) {
  const b = bbox(outline);
  const w = b.x1 - b.x0;
  const l = b.z1 - b.z0;
  const axis = l >= w ? 'z' : 'x';
  const span = axis === 'z' ? w : l;
  const eave = round(clearHeight + 0.6, 2);
  return {
    outline,
    clearHeight,
    eaveHeight: eave,
    ridgeHeight: round(eave + Math.max(0.3, span * 0.06), 2),
    roof: { type: 'gable', ridgeAxis: axis },
    structure: { type: 'precast-concrete', frameAxis: axis, frameSpacing: 6, beamDepth: 0.8, columns: [] },
    walls: { type: 'precast-panel' },
    floor: { type: 'polished-concrete' },
    openings: [],
    existing: [],
    exterior: { streetEdge: 0, sidewalk: 3, road: 7 },
  };
}

/** Una nave vacía, sin contorno todavía (para dibujarlo de cero). */
export function emptyBuilding() {
  return { id: 'nave-nueva', name: 'Nave nueva', shell: { ...baseShell([]), exterior: { sidewalk: 3, road: 7 } } };
}

/**
 * Un rectángulo de `w` (x) × `l` (z) m, con su fachada a la calle en la arista 0 y, con `doors`, un portón seccional
 * y una puerta peatonal en ella.
 */
export function rectangleBuilding(w = 15, l = 40, { clearHeight = 7, doors = true, name = 'Nave nueva' } = {}) {
  const shell = baseShell(
    [
      [0, 0],
      [round(w), 0],
      [round(w), round(l)],
      [0, round(l)],
    ],
    clearHeight,
  );
  if (doors && w >= 6) shell.openings = [newOpening('sectional-door', 0, 0.3), newOpening('pedestrian-door', 0, 0.75)];
  else if (doors) shell.openings = [newOpening('pedestrian-door', 0, 0.5)];
  return { id: 'nave-nueva', name, shell };
}

/** Lo de una nave (o de un layout entero: sin la pista, las zonas, las vistas ni las notas) que dibuja el editor. */
export function naveOf(L) {
  if (!L || typeof L !== 'object' || !L.shell || !Array.isArray(L.shell.outline))
    throw new Error('no es una nave: falta shell.outline');
  const b = { id: String(L.id ?? 'nave'), name: String(L.name ?? L.id ?? 'Nave'), shell: clone(L.shell) };
  if (L.city) b.city = String(L.city);
  return normalize(b);
}

// ------------------------------------------------------------------------------------------------ las aristas

/**
 * Lleva lo que cuelga de las aristas del contorno viejo al nuevo. `map(edge, t)` da `{ edge, t }` en el nuevo (o null:
 * se va), con `t` de 0 a 1 a lo largo de la arista; `outline` es el contorno nuevo (para los largos en metros).
 */
function remapEdges(shell, oldOutline, outline, map) {
  const len = (poly, k) => dist(poly[k], poly[(k + 1) % poly.length]);
  if (shell.openings)
    shell.openings = shell.openings.flatMap(o => {
      const m = map(o.edge, o.t);
      return m ? [{ ...o, edge: m.edge, t: round(m.t, 4) }] : [];
    });
  if (shell.exterior && Number.isInteger(shell.exterior.streetEdge)) {
    const m = map(shell.exterior.streetEdge, 0.5);
    if (m) shell.exterior = { ...shell.exterior, streetEdge: m.edge };
    else {
      shell.exterior = { ...shell.exterior };
      delete shell.exterior.streetEdge;
    }
  }
  const byEdge = obj => {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      const m = map(Number(k), 0.5);
      if (m) out[String(m.edge)] = v;
    }
    return out;
  };
  if (shell.walls) {
    const w = (shell.walls = { ...shell.walls });
    for (const key of ['plinthByEdge', 'colorByEdge', 'jointsByEdge']) if (w[key]) w[key] = byEdge(w[key]);
  }
  /** Un tramo `{ edge, from, to }` en metros desde el vértice k. */
  const span = s => {
    const L0 = len(oldOutline, s.edge) || 1;
    const mid = map(s.edge, ((s.from ?? 0) + (s.to ?? L0)) / 2 / L0);
    if (!mid) return [];
    const L1 = len(outline, mid.edge);
    const end = (v, dflt) => {
      const m = map(s.edge, (v ?? dflt) / L0);
      const t = m && m.edge === mid.edge ? m.t : v === s.from ? 0 : 1;
      return round(Math.max(0, Math.min(1, t)) * L1);
    };
    const out = { ...s, edge: mid.edge };
    if (s.from !== undefined) out.from = end(s.from, 0);
    if (s.to !== undefined) out.to = end(s.to, L0);
    return [out];
  };
  if (shell.walls?.sections) shell.walls.sections = shell.walls.sections.flatMap(span);
  if (shell.structure?.bracing)
    shell.structure = { ...shell.structure, bracing: shell.structure.bracing.flatMap(span) };
}

/** La nave con un vértice nuevo `p` en la arista `k` (queda como vértice k + 1). */
export function insertVertex(b, k, p) {
  const out = clone(b);
  const old = out.shell.outline;
  const n = old.length;
  const pr = projectOnSegment(p, old[k], old[(k + 1) % n]);
  const s = pr.t;
  const outline = [...old.slice(0, k + 1), [round(p[0]), round(p[1])], ...old.slice(k + 1)];
  out.shell.outline = outline;
  remapEdges(out.shell, old, outline, (e, t) => {
    if (e < k) return { edge: e, t };
    if (e > k) return { edge: e + 1, t };
    if (s <= EPS) return { edge: k + 1, t };
    if (s >= 1 - EPS) return { edge: k, t };
    return t < s ? { edge: k, t: t / s } : { edge: k + 1, t: (t - s) / (1 - s) };
  });
  return out;
}

/** La nave sin el vértice `i` (sus dos aristas quedan en una); con 3 vértices no se puede (devuelve la misma). */
export function deleteVertex(b, i) {
  const old = b.shell.outline;
  const n = old.length;
  if (n <= 3) return b;
  const out = clone(b);
  const outline = old.filter((_, j) => j !== i);
  out.shell.outline = outline;
  const prev = (i - 1 + n) % n;
  // la arista nueva va del vértice i − 1 al i + 1: en el contorno nuevo es la i − 1 (o la última si i = 0)
  const merged = i === 0 ? n - 2 : i - 1;
  remapEdges(out.shell, old, outline, (e, t) => {
    if (e === prev || e === i) {
      const p = lerp(old[e], old[(e + 1) % n], t);
      const pr = projectOnSegment(p, outline[merged], outline[(merged + 1) % outline.length]);
      return { edge: merged, t: pr.t };
    }
    if (i === 0) return { edge: e - 1, t };
    return { edge: e > i ? e - 1 : e, t };
  });
  return out;
}

/**
 * La nave con los vértices de `moves` (`Map` índice → punto) en su sitio nuevo. Un hueco se queda a la misma
 * distancia del extremo de su arista que no se mueve (con los dos quietos o los dos movidos, en su `t`), sin salirse.
 */
export function moveVertices(b, moves) {
  const out = clone(b);
  const old = b.shell.outline;
  const n = old.length;
  const outline = old.map((p, i) => (moves.has(i) ? [round(moves.get(i)[0]), round(moves.get(i)[1])] : [...p]));
  out.shell.outline = outline;
  const len = (poly, k) => dist(poly[k], poly[(k + 1) % n]);
  if (out.shell.openings)
    out.shell.openings = out.shell.openings.map(o => {
      const k = o.edge;
      if (!(k >= 0 && k < n)) return o;
      const a = moves.has(k);
      const z = moves.has((k + 1) % n);
      if (a === z) return o;
      const L0 = len(old, k);
      const L1 = len(outline, k);
      if (L1 < EPS) return o;
      let t = z ? (o.t * L0) / L1 : 1 - ((1 - o.t) * L0) / L1;
      const half = (o.width ?? 0) / 2 / L1;
      t = half >= 0.5 ? 0.5 : Math.max(half, Math.min(1 - half, t));
      return { ...o, t: round(t, 4) };
    });
  return out;
}

/** La nave con el vértice `i` en `p`. */
export const moveVertex = (b, i, p) => moveVertices(b, new Map([[i, p]]));

/**
 * La arista `k` con largo `len`: se corre su vértice final a lo largo de ella y, si la arista siguiente es
 * perpendicular, también el otro extremo de esa (corre el muro entero: un rectángulo sigue siéndolo).
 */
export function setEdgeLength(b, k, len) {
  const poly = b.shell.outline;
  const n = poly.length;
  if (!(len > 0) || n < 3) return b;
  const f = edgeFrame(poly, k);
  const delta = [f.dir[0] * (len - f.len), f.dir[1] * (len - f.len)];
  const j = (k + 1) % n;
  const c = (k + 2) % n;
  const moves = new Map([[j, [poly[j][0] + delta[0], poly[j][1] + delta[1]]]]);
  const g = edgeFrame(poly, j);
  if (n >= 4 && Math.abs(f.dir[0] * g.dir[0] + f.dir[1] * g.dir[1]) < 0.02 && c !== k)
    moves.set(c, [poly[c][0] + delta[0], poly[c][1] + delta[1]]);
  return moveVertices(b, moves);
}

/** La nave con el contorno al revés (de horario a antihorario), con lo que cuelga de las aristas. */
export function reverseOutline(b) {
  const out = clone(b);
  const old = b.shell.outline;
  const n = old.length;
  const outline = old.map((_, i) => [...old[(n - i) % n]]);
  out.shell.outline = outline;
  remapEdges(out.shell, old, outline, (e, t) => ({ edge: n - 1 - e, t: 1 - t }));
  return out;
}

// ------------------------------------------------------------------------------------------------ mover la nave

/** Corre un punto de planta. */
const sh = (p, dx, dz) => [round(p[0] + dx), round(p[1] + dz)];
/** Corre un rectángulo `{ x, z }` (lo demás queda igual). */
const shR = (r, dx, dz) => ({ ...r, x: round(r.x + dx), z: round(r.z + dz) });

/** La nave entera corrida `(dx, dz)`: contorno, pilares, altillos, escaleras, luminarias, falsos techos, grúas… */
export function translateBuilding(b, dx, dz) {
  if (!dx && !dz) return b;
  const out = clone(b);
  const s = out.shell;
  s.outline = s.outline.map(p => sh(p, dx, dz));
  if (s.structure?.columns) s.structure.columns = s.structure.columns.map(c => shR(c, dx, dz));
  if (s.existing)
    s.existing = s.existing.map(e => {
      const r = shR(e, dx, dz);
      if (Array.isArray(e.columns)) r.columns = e.columns.map(c => shR(c, dx, dz));
      const door = e.enclosure?.door;
      if (door && Number.isFinite(door.at))
        r.enclosure = { ...e.enclosure, door: { ...door, at: round(door.at + (/x$/.test(door.side) ? dz : dx)) } };
      return r;
    });
  for (const key of ['lights', 'ceilings', 'cranes', 'platforms'])
    if (Array.isArray(s[key]))
      s[key] = s[key].map(r => {
        const o = { ...r };
        if (Number.isFinite(r.x)) o.x = round(r.x + dx);
        if (Number.isFinite(r.z)) o.z = round(r.z + dz);
        if (Array.isArray(r.bands))
          o.bands = r.bands.map(bd => {
            const q = { ...bd };
            if (Number.isFinite(bd.x)) q.x = round(bd.x + dx);
            if (Number.isFinite(bd.z)) q.z = round(bd.z + dz);
            return q;
          });
        return o;
      });
  if (s.floor?.marks)
    s.floor.marks = s.floor.marks.map(m => ({ ...m, points: (m.points ?? []).map(p => sh(p, dx, dz)) }));
  const range = s.roof?.skylights?.range;
  if (Array.isArray(range)) {
    const along = (s.roof.ridgeAxis ?? 'z') === 'z' ? dz : dx;
    s.roof.skylights.range = range.map(v => round(v + along));
  }
  return out;
}

/**
 * La nave como la pide el esquema: contorno antihorario (área positiva) y, si se fue a negativos, corrida para que la
 * esquina mínima de su caja quede en (0, 0). Devuelve la misma si no hay nada que cambiar.
 */
export function normalize(b, { origin = false } = {}) {
  let out = b;
  if (out.shell.outline.length >= 3 && signedArea(out.shell.outline) < 0) out = reverseOutline(out);
  const bb = bbox(out.shell.outline);
  if (out.shell.outline.length && (origin || bb.x0 < -EPS || bb.z0 < -EPS))
    out = translateBuilding(out, -bb.x0, -bb.z0);
  return out;
}

// ------------------------------------------------------------------------------------------------ pilares

/**
 * Pilares en retícula: líneas cada `sx` en x y cada `sz` en z desde la esquina mínima de la caja más el desfase `ox`,
 * `oz`, de sección `w` × `d`; los de los bordes quedan pegados al muro (dentro de la caja) y solo van los que caen
 * dentro del contorno.
 */
export function columnGrid(outline, { sx, sz, ox = 0, oz = 0, w = 0.4, d = 0.4 }) {
  const bb = bbox(outline);
  const lines = (a0, a1, step, off) => {
    const out = [];
    if (!(step > 0)) return out;
    for (let v = a0 + off, i = 0; v <= a1 + 1e-6 && i < 400; v += step, i++) out.push(v);
    return out;
  };
  const xs = lines(bb.x0, bb.x1, sx, ox);
  const zs = lines(bb.z0, bb.z1, sz, oz);
  const cols = [];
  for (const cx of xs)
    for (const cz of zs) {
      const x = Math.max(bb.x0, Math.min(bb.x1 - w, cx - w / 2));
      const z = Math.max(bb.z0, Math.min(bb.z1 - d, cz - d / 2));
      const r = { x: round(x), z: round(z), w, d };
      // estricto (no la tolerancia del validador): un pilar de la retícula no asoma por un muro inclinado
      if (rectInPoly(outline, r, TOL) && !cols.some(c => Math.abs(c.x - r.x) < 0.01 && Math.abs(c.z - r.z) < 0.01))
        cols.push(r);
    }
  return cols;
}

// ------------------------------------------------------------------------------------------------ chequeos

const SIDES = ['+x', '-x', '+z', '-z'];
const GATES = new Set(['tir-door', 'sectional-door']);
const WICKETS = new Set(['pedestrian-door', 'emergency-exit']);

/**
 * Dos huecos de la misma arista que se pisan a propósito (`ca`, `cb`: sus centros en m desde el vértice): un acceso
 * acristalado o un hueco de la propuesta detrás de un portón (montigala: «salvo el que tiene un acceso acristalado
 * detrás», docs/ESQUEMA.md), o una puerta peatonal o de emergencia recortada en la hoja de un portón (el portillo de
 * barbera-santamaria).
 */
function nested(a, b, ca, cb) {
  const [gate, cg, other, co] = GATES.has(a.type) ? [a, ca, b, cb] : GATES.has(b.type) ? [b, cb, a, ca] : [];
  if (!gate) return false;
  if (other.type === 'glazed-entrance' || other.proposed) return true;
  const within =
    co - other.width / 2 >= cg - gate.width / 2 - 0.01 &&
    co + other.width / 2 <= cg + gate.width / 2 + 0.01 &&
    (other.sill ?? 0) + other.height <= (gate.sill ?? 0) + gate.height + 0.01;
  return WICKETS.has(other.type) && within;
}
const nameOf = e => (e.type === 'mezzanine' ? 'altillo' : e.type === 'stairs-existing' ? 'escalera' : 'bloque');

/**
 * Lo que se ve sin el núcleo: `[{ level: 'error' | 'warning', path, msg }]`, con `path` del campo
 * (`shell.openings[2]`, `shell.clearHeight`…). Error = la nave no se puede armar o el validador lo rechaza; lo que el
 * validador acepta pero conviene mirar (dos huecos que se pisan) es aviso.
 */
export function checkBuilding(b) {
  const out = [];
  const err = (path, msg) => out.push({ level: 'error', path, msg });
  const warn = (path, msg) => out.push({ level: 'warning', path, msg });
  const s = b?.shell;
  if (!s || !Array.isArray(s.outline)) {
    err('shell', 'falta el contorno (shell.outline)');
    return out;
  }
  const poly = s.outline;
  const n = poly.length;
  if (!String(b.id ?? '').trim()) err('id', 'falta el id de la nave');
  if (!String(b.name ?? '').trim()) warn('name', 'falta el nombre de la nave');
  if (n < 3) err('shell.outline', `contorno de ${n} vértices: hacen falta 3 o más (dibujalo o elegí una plantilla)`);
  for (const [i, p] of poly.entries())
    if (!Number.isFinite(p[0]) || !Number.isFinite(p[1])) err(`shell.outline[${i}]`, `el vértice ${i} no es un número`);
  for (const pr of n >= 3 ? polyProblems(poly) : [])
    if (pr.kind === 'zero')
      err(`shell.outline[${pr.k}]`, `la arista ${pr.k} mide 0 m (dos vértices en el mismo sitio)`);
    else err(`shell.outline[${pr.i}]`, `las aristas ${pr.i} y ${pr.j} del contorno se cruzan`);
  if (n >= 3) {
    const bb = bbox(poly);
    if (bb.x1 - bb.x0 > 500 || bb.z1 - bb.z0 > 500)
      err('shell.outline', 'el contorno mide más de 500 m de lado (¿en mm?)');
    const a = area(poly);
    if (a > 6000) warn('shell.outline', `${fmt(a, 0)} m² de planta: autoLayout no arma naves de más de 6.000 m²`);
    if (a < 50) warn('shell.outline', `${fmt(a, 0)} m² de planta: no entra una pista`);
    if (signedArea(poly) < 0) warn('shell.outline', 'contorno en sentido horario (el esquema lo pide antihorario)');
  }
  const clear = s.clearHeight;
  if (!(Number.isFinite(clear) && clear > 0)) err('shell.clearHeight', 'falta la altura libre (> 0 m)');
  const eave = s.eaveHeight;
  if (eave !== undefined && Number.isFinite(clear) && !(eave >= clear + 0.35 - 1e-9))
    warn(
      'shell.eaveHeight',
      `alero a ${fmt(eave)} m: el visor lo sube a la altura libre + 0,35 (${fmt(clear + 0.35)} m)`,
    );
  if (s.ridgeHeight !== undefined && eave !== undefined && s.ridgeHeight < eave - 1e-9)
    warn('shell.ridgeHeight', 'la cumbrera queda por debajo del alero: el visor la sube al alero');
  if (
    s.roof &&
    s.roof.type !== 'flat' &&
    s.ridgeHeight !== undefined &&
    eave !== undefined &&
    s.ridgeHeight - eave < 0.05
  )
    warn('shell.ridgeHeight', 'cumbrera = alero: el visor la dibuja plana');
  const street = s.exterior?.streetEdge;
  if (street !== undefined && n >= 3 && !(Number.isInteger(street) && street >= 0 && street < n))
    err('shell.exterior.streetEdge', `la fachada de calle es la arista ${street}: el contorno tiene ${n}`);

  // huecos
  const ops = s.openings ?? [];
  for (const [i, o] of ops.entries()) {
    const path = `shell.openings[${i}]`;
    if (!(Number.isInteger(o.edge) && o.edge >= 0 && o.edge < n)) {
      err(path, `hueco ${i}: la arista ${o.edge} no existe (el contorno tiene ${n})`);
      continue;
    }
    if (!(o.width > 0) || !(o.height > 0)) err(path, `hueco ${i}: ancho y alto tienen que ser > 0`);
    if (!(o.t >= 0 && o.t <= 1)) err(path, `hueco ${i}: la posición t = ${o.t} va de 0 a 1`);
    const L = dist(poly[o.edge], poly[(o.edge + 1) % n]);
    const c = o.t * L;
    if (o.width > L + 0.01)
      err(path, `hueco ${i}: ${fmt(o.width)} m de ancho no entran en la arista ${o.edge} (${fmt(L)} m)`);
    else if (c - o.width / 2 < -0.01 || c + o.width / 2 > L + 0.01)
      err(path, `hueco ${i}: se sale de la arista ${o.edge} (córrelo hacia adentro)`);
    const top = (o.sill ?? 0) + (o.height ?? 0);
    if (Number.isFinite(eave ?? clear) && top > (eave ?? clear) + 1e-6)
      warn(path, `hueco ${i}: llega a ${fmt(top)} m, más alto que el alero`);
    for (let j = 0; j < i; j++) {
      const p = ops[j];
      if (p.edge !== o.edge) continue;
      const pc = p.t * L;
      const overlapW = Math.min(c + o.width / 2, pc + p.width / 2) - Math.max(c - o.width / 2, pc - p.width / 2);
      const overlapH = Math.min(top, (p.sill ?? 0) + p.height) - Math.max(o.sill ?? 0, p.sill ?? 0);
      // el validador no lo rechaza: aviso, salvo que vayan así a propósito (`nested`)
      if (overlapW > 0.01 && overlapH > 0.01 && !nested(p, o, pc, c))
        warn(path, `los huecos ${j} y ${i} se pisan en la arista ${o.edge}`);
    }
  }

  // pilares
  for (const [i, c] of (s.structure?.columns ?? []).entries()) {
    const path = `shell.structure.columns[${i}]`;
    if (![c.x, c.z, c.w, c.d].every(Number.isFinite)) err(path, `pilar ${i}: x, z, w y d tienen que ser números`);
    else if (!(c.w > 0 && c.d > 0)) err(path, `pilar ${i}: la sección tiene que ser > 0`);
    else if (n >= 3 && !rectInPoly(poly, c)) warn(path, `pilar ${i}: fuera del contorno`);
  }

  // altillos, escaleras y bloques existentes
  for (const [i, e] of (s.existing ?? []).entries()) {
    const path = `shell.existing[${i}]`;
    const what = `${nameOf(e)} ${i}`;
    if (![e.x, e.z, e.w, e.d].every(Number.isFinite)) {
      err(path, `${what}: x, z, w y d tienen que ser números`);
      continue;
    }
    if (!(e.w > 0 && e.d > 0)) err(path, `${what}: las medidas tienen que ser > 0`);
    else if (n >= 3 && !rectInPoly(poly, e)) err(path, `${what}: sale del contorno`);
    if (e.type === 'mezzanine') {
      if (!(e.floorHeight > 0)) err(path, `${what}: falta la cota del forjado (> 0 m)`);
      else if (Number.isFinite(clear) && e.floorHeight >= clear)
        err(path, `${what}: el forjado (${fmt(e.floorHeight)} m) no cabe bajo la altura libre`);
      else if (Number.isFinite(clear) && e.floorHeight + (e.height ?? 0) > (s.ridgeHeight ?? eave ?? clear) + 0.01)
        warn(path, `${what}: las oficinas (${fmt(e.floorHeight + (e.height ?? 0))} m) pasan la cubierta`);
    }
    if (e.type === 'stairs-existing') {
      if (!(Number.isFinite(e.rise) && e.rise !== 0)) err(path, `${what}: falta el desnivel (rise)`);
      if (e.dir !== undefined && !SIDES.includes(e.dir)) err(path, `${what}: dir = ${e.dir} (+x, -x, +z o -z)`);
    }
  }
  return out;
}

/** Los chequeos de un objeto (`path` y lo que cuelga de él). */
export const issuesAt = (issues, path) => issues.filter(i => i.path === path || i.path.startsWith(path + '.'));

/** El largo de la arista `k`. */
export const edgeLength = (b, k) => {
  const p = b.shell.outline;
  return p.length >= 2 ? dist(p[k], p[(k + 1) % p.length]) : 0;
};
