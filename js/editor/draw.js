// El dibujo del editor de naves (editor.html): el plano en metros con su rejilla, las herramientas (seleccionar,
// contorno, huecos, pilares, altillos, escaleras, calibrar el fondo), los ajustes (rejilla, 0/45/90°, vértices) y el
// teclado. La nave vive en state.js; acá está lo de la pantalla (vista, selección, lo que se está dibujando). El
// inspector de la izquierda es draw-panel.js, la barra de arriba draw-io.js, la imagen de fondo draw-bg.js y los
// chequeos del núcleo draw-check.js.
//
// Coordenadas: la nave en metros (x → derecha, z → abajo, como `planSVG`). La vista guarda la escala (px por metro) y
// dónde cae el origen; `off` es cuánto se corrió la nave para dejar su esquina mínima en (0, 0) (`normalize`) desde
// que se abrió: así correrla no la mueve en pantalla ni la despega del fondo, también al deshacer.
import * as S from './state.js';
import {
  angleDeg,
  bbox,
  dist,
  edgeFrame,
  fmt,
  nearestEdge,
  parseNum,
  pointInPoly,
  polar,
  projectOnSegment,
  round,
  snapAngle,
  snapToGrid,
} from './draw-geom.js';
import {
  OPENING_KINDS,
  clone,
  deleteVertex,
  insertVertex,
  moveVertex,
  moveVertices,
  newOpening,
  normalize,
  openingKind,
  translateBuilding,
} from './draw-model.js';
import { initPanel } from './draw-panel.js';
import { initIO } from './draw-io.js';
import { initBackground } from './draw-bg.js';
import { initCheck } from './draw-check.js';
import { patchItems } from './svg-patch.js';

const $ = s => /** @type {HTMLElement} */ (document.querySelector(s));
const svg = /** @type {SVGSVGElement} */ (/** @type {unknown} */ ($('#plan')));
const L = {
  bg: $('#bgWorld'),
  grid: $('#gridLayer'),
  world: $('#world'),
  floor: $('#floorLayer'),
  shell: $('#shellLayer'),
  ui: $('#uiLayer'),
};
const N = v => round(v, 3);
const pts = poly => poly.map(p => `${N(p[0])},${N(p[1])}`).join(' ');
const esc = s =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;');

// ------------------------------------------------------------------------------------------------ estado de pantalla

const ui = {
  tool: 'select',
  /** `{ kind: 'building' | 'vertex' | 'edge' | 'opening' | 'column' | 'existing', i }` o null. */
  sel: null,
  hover: null,
  /** El contorno a medio dibujar: `{ points }`; un rectángulo: `{ a, b }`; la calibración: `{ points }`. */
  draft: null,
  cursor: null,
  snapped: null,
  guides: [],
  drag: null,
  pan: null,
  typed: '',
  space: false,
  alt: false,
  shift: false,
  openingKind: 'pedestrian-door',
  columnSize: [0.4, 0.4],
  snap: { grid: true, step: 0.1, angle: true, vertex: true },
};
const view = { scale: 14, ox: 80, oy: 70 };
/** Lo que se corrió cada nave del historial desde que se abrió (ver arriba). */
const offsets = new WeakMap();
const offOf = b => offsets.get(b) ?? [0, 0];
let lastBuilding = S.getBuilding();
offsets.set(lastBuilding, [0, 0]);

const toScreen = p => {
  const o = offOf(S.getBuilding());
  return [view.ox + (p[0] - o[0]) * view.scale, view.oy + (p[1] - o[1]) * view.scale];
};
const toWorld = (sx, sy) => {
  const o = offOf(S.getBuilding());
  return [(sx - view.ox) / view.scale + o[0], (sy - view.oy) / view.scale + o[1]];
};

/** Lo que comparten los módulos del dibujo. */
const ed = {
  ui,
  view,
  svg,
  toScreen,
  toWorld,
  get b() {
    return S.getBuilding();
  },
  /** Cambia la nave (lo de las herramientas, el inspector y la barra): normaliza y conserva la vista. */
  commit,
  select,
  setTool,
  render,
  fit,
  toast,
  /** Los chequeos de ahora (los del dibujo y los del núcleo), que muestra el inspector. */
  issues: [],
  onIssues: () => {},
  offsetOf: offOf,
  showTyped,
};

/**
 * Pone `nb` en el estado. Sin `live`, lo deja como lo pide el esquema (antihorario, esquina mínima en 0 si se fue a
 * negativos) sin moverlo en pantalla. `undoable: false`: sin un paso nuevo para deshacer.
 */
function commit(nb, { undoable = true, live = false, origin = false } = {}) {
  const prev = S.getBuilding();
  let o = offOf(prev);
  let out = nb;
  if (!live) {
    const before = bbox(nb.shell.outline);
    out = normalize(nb, { origin });
    const after = bbox(out.shell.outline);
    if (out !== nb && nb.shell.outline.length) o = [o[0] + (after.x0 - before.x0), o[1] + (after.z0 - before.z0)];
  }
  S.setBuilding(out, { undoable, live });
  offsets.set(S.getBuilding(), o);
}

// cada cambio (también los del panel del park y deshacer): la nave nueva hereda el corrimiento de la anterior
S.subscribe((b, { reason }) => {
  if (!offsets.has(b)) offsets.set(b, reason === 'load' ? [0, 0] : offOf(lastBuilding));
  const wasEmpty = (lastBuilding.shell.outline?.length ?? 0) < 3;
  lastBuilding = b;
  if (ui.sel && !selectionExists(ui.sel)) ui.sel = null;
  if (reason === 'load') {
    ui.sel = null;
    ui.draft = null;
    fit();
  } else if (wasEmpty && b.shell.outline.length >= 3 && reason !== 'set') fit();
  render();
});

function selectionExists(sel) {
  const s = S.getBuilding().shell;
  const n = s.outline.length;
  switch (sel.kind) {
    case 'vertex':
    case 'edge':
      return sel.i < n;
    case 'opening':
      return sel.i < (s.openings?.length ?? 0);
    case 'column':
      return sel.i < (s.structure?.columns?.length ?? 0);
    case 'existing':
      return sel.i < (s.existing?.length ?? 0);
    default:
      return true;
  }
}

function select(sel) {
  ui.sel = sel;
  render();
  panel.update(true);
}

/** Qué hacer ahora, para el recuadro de arriba del plano: la herramienta y el paso siguiente. */
function nextStep() {
  const s = S.getBuilding().shell;
  const P = ui.draft?.points ?? [];
  const exit = ' · Esc: salir';
  switch (ui.tool) {
    case 'outline':
      if (!P.length) return `Contorno · clic en la primera esquina${bg.shown ? ' del plano' : ''}${exit}`;
      if (P.length < 3)
        return 'Contorno · clic en la esquina siguiente, o escribí el largo del tramo y Enter · ⌫ borra';
      return 'Contorno · clic en el primer punto (o Enter) para cerrarlo · ⌫ borra el último';
    case 'opening': {
      const k = OPENING_KINDS.find(x => x.key === ui.openingKind)?.label ?? 'hueco';
      return `Hueco · clic en un muro para poner: ${k.toLowerCase()} (el tipo, en el panel)${exit}`;
    }
    case 'column':
      return `Pilar · clic donde va (la retícula entera, en el panel de la nave)${exit}`;
    case 'mezzanine':
      return `Altillo · arrastrá el rectángulo; las medidas, después en el panel${exit}`;
    case 'stairs':
      return `Escalera · arrastrá el rectángulo (sube por el lado largo)${exit}`;
    case 'calibrate':
      if (!bg.has) return 'Calibrar · primero un plano: Importar una imagen o soltarla acá';
      if (bg.moving) return `Fondo · arrastrá la imagen para moverla${exit}`;
      if (!P.length) return `Calibrar · clic en un extremo de una medida conocida del plano${exit}`;
      if (P.length === 1) return `Calibrar · clic en el otro extremo${exit}`;
      return 'Calibrar · escribí la distancia real en metros y Enter';
    default:
      if (s.outline.length < 3)
        return 'Sin contorno · P para dibujarlo (o Nueva ▾ → Rectángulo), o Importar un plano para calcarlo';
      if (!s.openings?.length) return 'D: poné la puerta de entrada en un muro · el park se arma solo, a la derecha';
      return 'Clic para elegir · arrastrar para mover · doble clic en un muro: vértice nuevo · ?: atajos';
  }
}

function setTool(tool) {
  if (ui.tool === 'outline' && tool !== 'outline') ui.draft = null;
  ui.tool = tool;
  ui.draft = tool === 'outline' && S.getBuilding().shell.outline.length < 3 ? { points: [] } : null;
  ui.typed = '';
  showTyped();
  for (const btn of document.querySelectorAll('#tools [data-tool]'))
    btn.classList.toggle('on', /** @type {HTMLElement} */ (btn).dataset.tool === tool);
  svg.classList.toggle('crosshair', tool !== 'select');
  render();
  panel.update(true);
}

// ------------------------------------------------------------------------------------------------ vista

/** Encuadra la nave; sin contorno, la imagen de fondo; con `withBg`, las dos juntas. */
function fit({ withBg = false } = {}) {
  const b = S.getBuilding();
  const poly = b.shell.outline;
  const r = svg.getBoundingClientRect();
  const W = r.width || 800;
  const H = r.height || 600;
  const o = offOf(b);
  // la imagen está en el marco: + o, a coordenadas de la nave
  const f = bg.bounds();
  const im =
    f && (withBg || poly.length < 3) ? { x0: f.x0 + o[0], z0: f.z0 + o[1], x1: f.x1 + o[0], z1: f.z1 + o[1] } : null;
  const nave = poly.length >= 3 || (poly.length && !im) ? bbox(poly) : null;
  const bb =
    im && nave
      ? {
          x0: Math.min(im.x0, nave.x0),
          z0: Math.min(im.z0, nave.z0),
          x1: Math.max(im.x1, nave.x1),
          z1: Math.max(im.z1, nave.z1),
        }
      : (im ?? nave ?? { x0: 0, z0: 0, x1: 40, z1: 40 });
  const w = Math.max(5, bb.x1 - bb.x0);
  const h = Math.max(5, bb.z1 - bb.z0);
  view.scale = Math.max(2, Math.min(200, Math.min((W - 140) / w, (H - 120) / h)));
  view.ox = W / 2 - ((bb.x0 + bb.x1) / 2 - o[0]) * view.scale;
  view.oy = H / 2 - ((bb.z0 + bb.z1) / 2 - o[1]) * view.scale;
  render();
}

function zoomAt(sx, sy, k) {
  const s = Math.max(1, Math.min(400, view.scale * k));
  const f = s / view.scale;
  view.ox = sx - (sx - view.ox) * f;
  view.oy = sy - (sy - view.oy) * f;
  view.scale = s;
  render();
}

// ------------------------------------------------------------------------------------------------ dibujar

const OPENING_COLOR = {
  'pedestrian-door': '#2b6cb0',
  'emergency-exit': '#1f8a4c',
  'sectional-door': '#c76a00',
  roller: '#a8501a',
  'tir-door': '#7a4a1e',
  'glazed-entrance': '#139fb5',
  window: '#5d9fd6',
};

/** El hueco `o` en planta: extremos `p0`, `p1` sobre la arista, su marco y el color. */
function openingGeom(poly, o) {
  const f = edgeFrame(poly, o.edge);
  const c = [f.a[0] + f.dir[0] * o.t * f.len, f.a[1] + f.dir[1] * o.t * f.len];
  const h = (o.width ?? 0) / 2;
  const p0 = [c[0] - f.dir[0] * h, c[1] - f.dir[1] * h];
  const p1 = [c[0] + f.dir[0] * h, c[1] + f.dir[1] * h];
  return { f, c, p0, p1, color: OPENING_COLOR[openingKind(o)] ?? '#555' };
}

function openingSVG(poly, o, { ghost = false } = {}) {
  if (!(o.edge >= 0 && o.edge < poly.length)) return '';
  const { f, p0, p1, color } = openingGeom(poly, o);
  const w = o.width ?? 1;
  const n = f.nIn;
  const out = [-n[0], -n[1]];
  const kind = openingKind(o);
  const cls = ghost ? ' class="ghost"' : '';
  let s = `<g${cls}><line x1="${N(p0[0])}" y1="${N(p0[1])}" x2="${N(p1[0])}" y2="${N(p1[1])}" class="gap"/>`;
  s += `<line x1="${N(p0[0])}" y1="${N(p0[1])}" x2="${N(p1[0])}" y2="${N(p1[1])}" stroke="${color}" class="op"/>`;
  const cross = (u, v) => u[0] * v[1] - u[1] * v[0];
  if (kind === 'pedestrian-door' || kind === 'emergency-exit' || kind === 'glazed-entrance') {
    // hoja y arco hacia dentro (la de emergencia, hacia fuera: abre en el sentido de la evacuación)
    const dirn = kind === 'emergency-exit' ? out : n;
    const r = kind === 'glazed-entrance' ? w / 2 : w;
    const q = [p0[0] + dirn[0] * r, p0[1] + dirn[1] * r];
    const end = kind === 'glazed-entrance' ? [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2] : p1;
    const sweep = cross(dirn, f.dir) > 0 ? 1 : 0;
    s += `<path d="M${N(p0[0])},${N(p0[1])} L${N(q[0])},${N(q[1])} A${N(r)},${N(r)} 0 0 ${sweep} ${N(end[0])},${N(end[1])}" stroke="${color}" class="leaf"/>`;
    if (kind === 'glazed-entrance') {
      const q2 = [p1[0] + dirn[0] * r, p1[1] + dirn[1] * r];
      s += `<path d="M${N(p1[0])},${N(p1[1])} L${N(q2[0])},${N(q2[1])} A${N(r)},${N(r)} 0 0 ${1 - sweep} ${N(end[0])},${N(end[1])}" stroke="${color}" class="leaf"/>`;
    }
  } else if (kind === 'sectional-door' || kind === 'roller') {
    const d = 0.35;
    const a = [p0[0] + n[0] * d, p0[1] + n[1] * d];
    const b = [p1[0] + n[0] * d, p1[1] + n[1] * d];
    s += `<polygon points="${pts([p0, p1, b, a])}" stroke="${color}" class="${kind === 'roller' ? 'roll' : 'sect'}"/>`;
  } else if (kind === 'tir-door') {
    const r = w / 2;
    const q0 = [p0[0] + out[0] * r, p0[1] + out[1] * r];
    const q1 = [p1[0] + out[0] * r, p1[1] + out[1] * r];
    const m = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2];
    const sw = cross(out, f.dir) > 0 ? 1 : 0;
    s += `<path d="M${N(p0[0])},${N(p0[1])} L${N(q0[0])},${N(q0[1])} A${N(r)},${N(r)} 0 0 ${sw} ${N(m[0])},${N(m[1])} M${N(p1[0])},${N(p1[1])} L${N(q1[0])},${N(q1[1])} A${N(r)},${N(r)} 0 0 ${1 - sw} ${N(m[0])},${N(m[1])}" stroke="${color}" class="leaf"/>`;
  } else if (kind === 'window') {
    const d = 0.12;
    const a = [p0[0] + n[0] * d, p0[1] + n[1] * d];
    const b = [p1[0] + n[0] * d, p1[1] + n[1] * d];
    s += `<line x1="${N(a[0])}" y1="${N(a[1])}" x2="${N(b[0])}" y2="${N(b[1])}" stroke="${color}" class="win"/>`;
  }
  return s + '</g>';
}

const rect = (r, attrs) => `<rect x="${N(r.x)}" y="${N(r.z)}" width="${N(r.w)}" height="${N(r.d)}" ${attrs}/>`;

function existingSVG(e) {
  if (![e.x, e.z, e.w, e.d].every(Number.isFinite)) return '';
  if (e.type === 'mezzanine')
    return (
      rect(e, 'class="mezz"') +
      (Array.isArray(e.columns) ? e.columns.map(c => rect({ w: 0.3, d: 0.3, ...c }, 'class="col mcol"')).join('') : '')
    );
  if (e.type === 'stairs-existing') {
    let s = rect(e, 'class="stairs"');
    const alongZ = e.dir ? /z$/.test(e.dir) : e.d >= e.w;
    const len = alongZ ? e.d : e.w;
    const steps = Math.min(80, Math.floor(len / 0.28));
    let d = '';
    for (let k = 1; k < steps; k++) {
      const v = k * (len / steps);
      d += alongZ ? `M${N(e.x)},${N(e.z + v)}h${N(e.w)}` : `M${N(e.x + v)},${N(e.z)}v${N(e.d)}`;
    }
    if (e.shape === 'U')
      d += alongZ ? `M${N(e.x + e.w / 2)},${N(e.z)}v${N(e.d)}` : `M${N(e.x)},${N(e.z + e.d / 2)}h${N(e.w)}`;
    s += `<path d="${d}" class="tread"/>`;
    // flecha de subida: del arranque (según dir) al otro extremo
    const neg = e.dir === '-z' || e.dir === '-x';
    const cx = e.x + e.w / 2;
    const cz = e.z + e.d / 2;
    const a = alongZ
      ? [cx, neg ? e.z + e.d * 0.85 : e.z + e.d * 0.15]
      : [neg ? e.x + e.w * 0.85 : e.x + e.w * 0.15, cz];
    const b = alongZ
      ? [cx, neg ? e.z + e.d * 0.15 : e.z + e.d * 0.85]
      : [neg ? e.x + e.w * 0.15 : e.x + e.w * 0.85, cz];
    const u = [(b[0] - a[0]) / (dist(a, b) || 1), (b[1] - a[1]) / (dist(a, b) || 1)];
    const hl = Math.min(0.5, (alongZ ? e.w : e.d) * 0.35);
    const p = [b[0] - u[0] * hl - u[1] * hl * 0.6, b[1] - u[1] * hl + u[0] * hl * 0.6];
    const q = [b[0] - u[0] * hl + u[1] * hl * 0.6, b[1] - u[1] * hl - u[0] * hl * 0.6];
    s += `<path d="M${N(a[0])},${N(a[1])}L${N(b[0])},${N(b[1])}M${N(p[0])},${N(p[1])}L${N(b[0])},${N(b[1])}L${N(q[0])},${N(q[1])}" class="arrow"/>`;
    return s;
  }
  return rect(e, 'class="block"');
}

/** El atributo `k` de `el` en `v`, si no lo tiene ya. */
const setOnce = (el, k, v) => {
  if (el.getAttribute(k) !== v) el.setAttribute(k, v);
};
/** Lo último que se puso en `--m-per-px`. */
let mPerPx = NaN;

function renderWorld() {
  const b = S.getBuilding();
  const s = b.shell;
  const poly = s.outline;
  const o = offOf(b);
  const k = view.scale;
  // la vista solo si cambió: volver a poner el mismo `transform` también le cuesta al cuadro (el navegador no lo compara)
  setOnce(
    L.world,
    'transform',
    `translate(${N(view.ox)},${N(view.oy)}) scale(${k}) translate(${N(-o[0])},${N(-o[1])})`,
  );
  setOnce(L.bg, 'transform', `translate(${N(view.ox)},${N(view.oy)}) scale(${k})`);
  if (mPerPx !== 1 / k) svg.style.setProperty('--m-per-px', String((mPerPx = 1 / k)));
  patchItems(L.floor, [poly.length >= 3 ? `<polygon points="${pts(poly)}" class="floor"/>` : '']);
  // una cosa por texto: en cada cuadro de un arrastre se vuelve a leer solo lo que cambió (svg-patch.js)
  const h = [];
  for (const p of s.platforms ?? [])
    if ([p.x, p.z, p.w, p.d].every(Number.isFinite)) h.push(rect(p, 'class="ro plat"'));
  for (const c of s.cranes ?? []) if ([c.x, c.z, c.w, c.d].every(Number.isFinite)) h.push(rect(c, 'class="ro crane"'));
  for (const e of (s.existing ?? []).filter(e => e.type === 'mezzanine')) h.push(existingSVG(e));
  for (const e of (s.existing ?? []).filter(e => e.type !== 'mezzanine')) h.push(existingSVG(e));
  if (poly.length >= 3) h.push(`<polygon points="${pts(poly)}" class="walls"/>`);
  else if (poly.length === 2) h.push(`<polyline points="${pts(poly)}" class="walls"/>`);
  const st = s.exterior?.streetEdge;
  if (poly.length >= 3 && Number.isInteger(st) && st >= 0 && st < poly.length) {
    const f = edgeFrame(poly, st);
    const d = 1.4;
    const a = [f.a[0] - f.nIn[0] * d, f.a[1] - f.nIn[1] * d];
    const z = [f.b[0] - f.nIn[0] * d, f.b[1] - f.nIn[1] * d];
    h.push(`<line x1="${N(a[0])}" y1="${N(a[1])}" x2="${N(z[0])}" y2="${N(z[1])}" class="street"/>`);
  }
  for (const op of s.openings ?? []) h.push(openingSVG(poly, op));
  if (ui.tool === 'opening' && ui.preview) h.push(openingSVG(poly, ui.preview, { ghost: true }));
  for (const c of s.structure?.columns ?? [])
    if ([c.x, c.z, c.w, c.d].every(Number.isFinite)) h.push(rect(c, 'class="col"'));
  patchItems(L.shell, h);
}

/**
 * El tamaño del plano en pantalla. Lo deja el ResizeObserver (abajo), que corre con el layout ya hecho: leerlo con
 * `getBoundingClientRect` en cada cuadro, después de escribir el SVG, forzaba un layout entero en medio del rAF (~3 ms
 * por cuadro de un arrastre, ~7 con el park encima). Hasta el primer aviso, el de siempre.
 */
let svgBox = null;
const svgSize = () => svgBox ?? svg.getBoundingClientRect();
/** Lo que dibujó la rejilla la última vez (la vista, el corrimiento y el tamaño): igual, no se rehace. */
let gridKey = '';

/** La rejilla, en píxeles: líneas finas cada `minor` y fuertes cada `major` metros, según el zoom. */
function renderGrid() {
  const r = svgSize();
  const o = offOf(S.getBuilding());
  // mover un vértice no la cambia: solo la vista, el corrimiento de la nave (normalize) o el tamaño del plano
  const key = `${view.scale} ${view.ox} ${view.oy} ${o[0]} ${o[1]} ${r.width} ${r.height}`;
  if (key === gridKey) return;
  gridKey = key;
  const steps = [0.1, 0.25, 0.5, 1, 2, 5, 10, 25, 50, 100];
  const minor = steps.find(s => s * view.scale >= 12) ?? 100;
  const major = steps.find(s => s >= minor * 4.9) ?? minor * 5;
  const [x0, z0] = toWorld(0, 0);
  const [x1, z1] = toWorld(r.width, r.height);
  let dm = '';
  let dM = '';
  const lines = (a0, a1, step, f) => {
    for (let v = Math.ceil(a0 / step) * step, i = 0; v <= a1 && i < 600; v += step, i++) f(v);
  };
  lines(x0 - o[0], x1 - o[0], minor, v => {
    const sx = N(view.ox + v * view.scale);
    const major_ = Math.abs(v / major - Math.round(v / major)) < 1e-6;
    (major_ ? s => (dM += s) : s => (dm += s))(`M${sx},0V${N(r.height)}`);
  });
  lines(z0 - o[1], z1 - o[1], minor, v => {
    const sy = N(view.oy + v * view.scale);
    const major_ = Math.abs(v / major - Math.round(v / major)) < 1e-6;
    (major_ ? s => (dM += s) : s => (dm += s))(`M0,${sy}H${N(r.width)}`);
  });
  L.grid.innerHTML = `<path d="${dm}" class="gminor"/><path d="${dM}" class="gmajor"/><text x="${N(r.width - 8)}" y="${N(r.height - 8)}" class="gscale">rejilla ${fmt(minor)} m · ${fmt(major)} m</text>`;
}

/** Texto a lo largo de una arista, del lado de afuera, derecho para leerlo. */
function edgeLabel(a, b, text, { off = 13, cls = 'elen', inside = false, nIn = null } = {}) {
  const sa = toScreen(a);
  const sb = toScreen(b);
  if (dist(sa, sb) < 46) return '';
  let deg = angleDeg(sa, sb);
  if (deg > 90.01 || deg < -89.99) deg += 180;
  const n = nIn ?? [0, -1];
  const sgn = inside ? 1 : -1;
  const m = [(sa[0] + sb[0]) / 2 + n[0] * off * sgn, (sa[1] + sb[1]) / 2 + n[1] * off * sgn];
  return `<text x="${N(m[0])}" y="${N(m[1])}" transform="rotate(${N(deg)} ${N(m[0])} ${N(m[1])})" class="${cls}">${esc(text)}</text>`;
}

const handle = (p, cls = 'vh') => {
  const [x, y] = toScreen(p);
  return `<rect x="${N(x - 4.5)}" y="${N(y - 4.5)}" width="9" height="9" class="${cls}"/>`;
};

/** Las esquinas de un rectángulo para cambiarle el tamaño: 0 = (x, z), 1 = (x + w, z), 2 = (x + w, z + d), 3 = (x, z + d). */
const corners = r => [
  [r.x, r.z],
  [r.x + r.w, r.z],
  [r.x + r.w, r.z + r.d],
  [r.x, r.z + r.d],
];

function selectedRect(sel = ui.sel) {
  const s = S.getBuilding().shell;
  if (sel?.kind === 'column') return s.structure?.columns?.[sel.i] ?? null;
  if (sel?.kind === 'existing') return s.existing?.[sel.i] ?? null;
  return null;
}

function renderUI() {
  const b = S.getBuilding();
  const s = b.shell;
  const poly = s.outline;
  const n = poly.length;
  const r = svgSize();
  // una cosa por texto, como en renderWorld
  const h = [];
  // guías de los ajustes
  for (const g of ui.guides) {
    if (g.x !== undefined) {
      const [sx] = toScreen([g.x, 0]);
      h.push(`<line x1="${N(sx)}" y1="0" x2="${N(sx)}" y2="${N(r.height)}" class="guide"/>`);
    } else {
      const [, sy] = toScreen([0, g.z]);
      h.push(`<line x1="0" y1="${N(sy)}" x2="${N(r.width)}" y2="${N(sy)}" class="guide"/>`);
    }
  }
  // largos de las aristas y su número
  if (n >= 2 && !(ui.tool === 'outline' && ui.draft?.points?.length))
    for (let k = 0; k < (n >= 3 ? n : 1); k++) {
      const f = edgeFrame(poly, k);
      const nIn = [f.nIn[0], f.nIn[1]];
      h.push(edgeLabel(f.a, f.b, `${fmt(f.len)} m`, { nIn }));
      h.push(
        edgeLabel(f.a, f.b, `arista ${k}${k === s.exterior?.streetEdge ? ' · calle' : ''}`, {
          nIn,
          inside: true,
          off: 11,
          cls: 'eidx',
        }),
      );
    }
  // selección
  const sel = ui.sel;
  if (sel?.kind === 'edge' && sel.i < n) {
    const a = toScreen(poly[sel.i]);
    const z = toScreen(poly[(sel.i + 1) % n]);
    h.push(`<line x1="${N(a[0])}" y1="${N(a[1])}" x2="${N(z[0])}" y2="${N(z[1])}" class="selline"/>`);
  }
  if (sel?.kind === 'opening' && s.openings?.[sel.i]) h.push(openingDims(poly, s.openings[sel.i], 'selline'));
  const rr = selectedRect();
  if (rr && [rr.x, rr.z, rr.w, rr.d].every(Number.isFinite)) {
    const [x, y] = toScreen([rr.x, rr.z]);
    h.push(
      `<rect x="${N(x)}" y="${N(y)}" width="${N(rr.w * view.scale)}" height="${N(rr.d * view.scale)}" class="selrect"/>`,
    );
    h.push(
      `<text x="${N(x + (rr.w * view.scale) / 2)}" y="${N(y - 7)}" class="dim">${fmt(rr.w)} × ${fmt(rr.d)} m</text>`,
    );
    for (const c of corners(rr)) h.push(handle(c, 'rh'));
  }
  // vértices
  if (ui.tool === 'select' || ui.tool === 'outline')
    for (let i = 0; i < n; i++) {
      const on = (sel?.kind === 'vertex' && sel.i === i) || (ui.hover?.kind === 'vertex' && ui.hover.i === i);
      h.push(handle(poly[i], on ? 'vh on' : 'vh'));
    }
  // etiquetas de altillos y escaleras
  for (const e of s.existing ?? []) {
    if (![e.x, e.z, e.w, e.d].every(Number.isFinite) || e.w * view.scale < 60) continue;
    const [cx, cy] = toScreen([e.x + e.w / 2, e.z + e.d / 2]);
    const t =
      e.type === 'mezzanine'
        ? `altillo · forjado ${fmt(e.floorHeight)} m${e.height ? ` · ${fmt(e.height)} m` : ''}`
        : e.type === 'stairs-existing'
          ? `escalera · ${fmt(e.rise)} m`
          : (e.label ?? 'bloque');
    h.push(`<text x="${N(cx)}" y="${N(cy)}" class="tag">${esc(t)}</text>`);
  }
  // herramientas
  h.push(toolUI(poly));
  patchItems(L.ui, h);
}

/** El hueco con sus cotas: del vértice k a la primera jamba, el ancho y de la segunda al vértice k + 1. */
function openingDims(poly, o, cls) {
  if (!(o.edge >= 0 && o.edge < poly.length)) return '';
  const { f, p0, p1 } = openingGeom(poly, o);
  const a = toScreen(p0);
  const z = toScreen(p1);
  let h = `<line x1="${N(a[0])}" y1="${N(a[1])}" x2="${N(z[0])}" y2="${N(z[1])}" class="${cls}"/>`;
  const d0 = dist(f.a, p0);
  const d1 = dist(p1, f.b);
  h += edgeLabel(f.a, p0, `${fmt(d0)}`, { nIn: f.nIn, inside: true, off: 26, cls: 'dim' });
  h += edgeLabel(p0, p1, `${fmt(o.width)}`, { nIn: f.nIn, inside: true, off: 26, cls: 'dim strong' });
  h += edgeLabel(p1, f.b, `${fmt(d1)}`, { nIn: f.nIn, inside: true, off: 26, cls: 'dim' });
  return h;
}

function toolUI(poly) {
  let h = '';
  const cur = ui.snapped;
  if (ui.tool === 'outline' && ui.draft) {
    const P = ui.draft.points;
    if (P.length) {
      const sp = P.map(toScreen);
      const tail = cur ? [...sp, toScreen(cur)] : sp;
      h += `<polyline points="${tail.map(p => `${N(p[0])},${N(p[1])}`).join(' ')}" class="draft"/>`;
      for (const [i, p] of sp.entries())
        h += `<circle cx="${N(p[0])}" cy="${N(p[1])}" r="${i === 0 && ui.closeHover ? 8 : 4}" class="${i === 0 ? 'dfirst' : 'dpt'}"/>`;
      if (cur) {
        const last = P[P.length - 1];
        const len = dist(last, cur);
        const m = toScreen([(last[0] + cur[0]) / 2, (last[1] + cur[1]) / 2]);
        h += `<text x="${N(m[0])}" y="${N(m[1] - 10)}" class="dim strong">${fmt(len)} m · ${fmt(-angleDeg(last, cur), 1)}°</text>`;
      }
    }
  }
  if (ui.tool === 'opening' && ui.preview) h += openingDims(poly, ui.preview, 'ghostline');
  if ((ui.tool === 'mezzanine' || ui.tool === 'stairs') && ui.draft?.a && ui.draft.b) {
    const a = toScreen(ui.draft.a);
    const z = toScreen(ui.draft.b);
    const x = Math.min(a[0], z[0]);
    const y = Math.min(a[1], z[1]);
    h += `<rect x="${N(x)}" y="${N(y)}" width="${N(Math.abs(z[0] - a[0]))}" height="${N(Math.abs(z[1] - a[1]))}" class="draftrect"/>`;
    const w = Math.abs(ui.draft.b[0] - ui.draft.a[0]);
    const d = Math.abs(ui.draft.b[1] - ui.draft.a[1]);
    h += `<text x="${N(x + Math.abs(z[0] - a[0]) / 2)}" y="${N(y - 7)}" class="dim strong">${fmt(w)} × ${fmt(d)} m</text>`;
  }
  if (ui.tool === 'calibrate' && ui.draft?.points) {
    const P = [...ui.draft.points, ...(cur && ui.draft.points.length === 1 ? [cur] : [])].map(toScreen);
    if (P.length === 2)
      h += `<line x1="${N(P[0][0])}" y1="${N(P[0][1])}" x2="${N(P[1][0])}" y2="${N(P[1][1])}" class="calib"/>`;
    for (const p of P) h += `<circle cx="${N(p[0])}" cy="${N(p[1])}" r="5" class="calibpt"/>`;
  }
  if (cur && ui.tool !== 'select') {
    const [x, y] = toScreen(cur);
    h += `<circle cx="${N(x)}" cy="${N(y)}" r="3" class="cursor"/>`;
  }
  return h;
}

let raf = 0;
function render() {
  if (raf) return;
  raf = requestAnimationFrame(() => {
    raf = 0;
    renderWorld();
    renderGrid();
    renderUI();
    bg.render();
    // con el plano de fondo a la vista, el suelo no lo tapa y el park se aclara (más con una herramienta de dibujo)
    svg.classList.toggle('bg-on', bg.shown);
    svg.classList.toggle('drawing', ui.tool !== 'select');
    bgToggle.hidden = !bg.has;
    bgShow.checked = bg.shown;
    const hint = nextStep();
    if (hintBox.textContent !== hint) hintBox.textContent = hint;
    svg.dispatchEvent(
      new CustomEvent('editorview', {
        detail: { scale: view.scale, ox: view.ox, oy: view.oy, off: offOf(S.getBuilding()) },
      }),
    );
  });
}

// ------------------------------------------------------------------------------------------------ ajustes

const vertexTargets = (exclude = -1) => {
  const s = S.getBuilding().shell;
  const out = s.outline.filter((_, i) => i !== exclude);
  if (ui.tool === 'outline' && ui.draft?.points) out.push(...ui.draft.points);
  return out;
};

/**
 * El punto `p` ajustado: a un vértice cercano, a 0/45/90° desde `from`, alineado en x o z con un vértice o un pilar,
 * y a la rejilla (o el largo a la rejilla, sobre un ángulo). Deja las guías en `ui.guides`.
 */
function snapPoint(p, { from = null, exclude = -1, extra = [] } = {}) {
  ui.guides = [];
  ui.closeHover = false;
  if (ui.alt) return [...p];
  const tol = 9 / view.scale;
  const targets = [...vertexTargets(exclude), ...extra];
  if (ui.snap.vertex) {
    let best = null;
    for (const v of targets) if (dist(v, p) < tol && (!best || dist(v, p) < dist(best, p))) best = v;
    if (best) return [...best];
  }
  const step = ui.snap.grid ? ui.snap.step : 0;
  if (from && (ui.snap.angle || ui.shift)) {
    const a = snapAngle(from, p, { force: ui.shift });
    if (a.snapped) {
      const r = (a.deg * Math.PI) / 180;
      const dir = [Math.cos(r), Math.sin(r)];
      let len = dist(from, a.point);
      let aligned = false;
      if (ui.snap.vertex)
        for (const v of targets) {
          for (const ax of [0, 1]) {
            if (Math.abs(dir[ax]) < 1e-6) continue;
            const t = (v[ax] - from[ax]) / dir[ax];
            if (t > 0 && Math.abs(t - len) < tol) {
              len = t;
              aligned = true;
              ui.guides.push(ax === 0 ? { x: v[0] } : { z: v[1] });
            }
          }
          if (aligned) break;
        }
      if (!aligned && step) len = Math.round(len / step) * step;
      return [from[0] + dir[0] * len, from[1] + dir[1] * len];
    }
  }
  const q = step ? snapToGrid(p, step) : [...p];
  if (ui.snap.vertex) {
    let bx = null;
    let bz = null;
    for (const v of targets) {
      if (Math.abs(v[0] - p[0]) < tol && (bx === null || Math.abs(v[0] - p[0]) < Math.abs(bx - p[0]))) bx = v[0];
      if (Math.abs(v[1] - p[1]) < tol && (bz === null || Math.abs(v[1] - p[1]) < Math.abs(bz - p[1]))) bz = v[1];
    }
    if (bx !== null) {
      q[0] = bx;
      ui.guides.push({ x: bx });
    }
    if (bz !== null) {
      q[1] = bz;
      ui.guides.push({ z: bz });
    }
  }
  return q;
}

/** Los centros de los pilares (para alinear uno nuevo con los demás). */
const columnCenters = () => (S.getBuilding().shell.structure?.columns ?? []).map(c => [c.x + c.w / 2, c.z + c.d / 2]);

// ------------------------------------------------------------------------------------------------ elegir

/** Qué hay bajo el puntero (en píxeles de pantalla). */
function hit(sx, sy) {
  const b = S.getBuilding();
  const s = b.shell;
  const poly = s.outline;
  const p = toWorld(sx, sy);
  const tol = 8 / view.scale;
  // tiradores del rectángulo elegido
  const rr = selectedRect();
  if (rr)
    for (const [ci, c] of corners(rr).entries()) if (dist(toScreen(c), [sx, sy]) < 8) return { ...ui.sel, corner: ci };
  for (let i = 0; i < poly.length; i++) if (dist(toScreen(poly[i]), [sx, sy]) < 8) return { kind: 'vertex', i };
  for (const [i, o] of (s.openings ?? []).entries()) {
    if (!(o.edge >= 0 && o.edge < poly.length)) continue;
    const { p0, p1 } = openingGeom(poly, o);
    if (projectOnSegment(p, p0, p1).d < tol) return { kind: 'opening', i };
  }
  const inR = (r, m = 0) => p[0] >= r.x - m && p[0] <= r.x + r.w + m && p[1] >= r.z - m && p[1] <= r.z + r.d + m;
  for (const [i, c] of (s.structure?.columns ?? []).entries()) if (inR(c, 3 / view.scale)) return { kind: 'column', i };
  const ex = s.existing ?? [];
  for (const [i, e] of ex.entries()) if (e.type !== 'mezzanine' && inR(e)) return { kind: 'existing', i };
  const ne = poly.length >= 2 ? nearestEdge(poly, p) : null;
  if (ne && ne.d < 6 / view.scale) return { kind: 'edge', i: ne.k };
  // los altillos, por el borde o por dentro (son grandes: debajo de todo lo demás)
  for (const [i, e] of ex.entries()) if (e.type === 'mezzanine' && inR(e)) return { kind: 'existing', i };
  if (poly.length >= 3 && pointInPoly(poly, p[0], p[1])) return { kind: 'building' };
  return null;
}

// ------------------------------------------------------------------------------------------------ puntero

/**
 * Dónde está el plano en la ventana, para pasar el puntero a coordenadas del SVG. Se lee una vez por gesto (al apretar)
 * y cuando cambia (el ResizeObserver de abajo, un desplazamiento, la ventana): leerlo en cada movida, después de lo que
 * se escribió en el DOM entre cuadros, forzaba un layout en el manejador del puntero (hasta 6 ms).
 */
let svgPos = null;
const local = e => {
  const r = (svgPos ??= svg.getBoundingClientRect());
  return [e.clientX - r.left, e.clientY - r.top];
};
const forgetPos = () => (svgPos = null);
window.addEventListener('scroll', forgetPos, { capture: true, passive: true });
window.addEventListener('resize', forgetPos, { passive: true });

svg.addEventListener('pointerdown', e => {
  svg.focus({ preventScroll: true });
  forgetPos();
  const [sx, sy] = local(e);
  ui.alt = e.altKey;
  ui.shift = e.shiftKey;
  if (e.button === 1 || e.button === 2 || ui.space) return startPan(e, sx, sy);
  if (e.button !== 0) return;
  const p = toWorld(sx, sy);
  const b = S.getBuilding();
  switch (ui.tool) {
    case 'select': {
      const h = hit(sx, sy);
      if (!h) {
        select(null);
        return startPan(e, sx, sy);
      }
      if (h.kind !== ui.sel?.kind || h.i !== ui.sel?.i) select({ kind: h.kind, i: h.i });
      if (h.kind !== 'building') {
        ui.drag = { h, start: p, orig: b, moved: false };
        svg.setPointerCapture(e.pointerId);
      }
      return;
    }
    case 'outline':
      return outlineClick(p);
    case 'column': {
      const c = snapPoint(p, { extra: columnCenters() });
      const [w, d] = ui.columnSize;
      const nb = clone(b);
      nb.shell.structure = { ...(nb.shell.structure ?? {}) };
      nb.shell.structure.columns = [
        ...(nb.shell.structure.columns ?? []),
        { x: round(c[0] - w / 2), z: round(c[1] - d / 2), w, d },
      ];
      commit(nb);
      ui.sel = { kind: 'column', i: nb.shell.structure.columns.length - 1 };
      panel.update(true);
      return;
    }
    case 'opening': {
      if (!ui.preview) return;
      const nb = clone(b);
      nb.shell.openings = [...(nb.shell.openings ?? []), ui.preview];
      commit(nb);
      ui.sel = { kind: 'opening', i: nb.shell.openings.length - 1 };
      panel.update(true);
      return;
    }
    case 'mezzanine':
    case 'stairs': {
      const a = snapPoint(p);
      ui.draft = { a, b: a };
      svg.setPointerCapture(e.pointerId);
      return;
    }
    case 'calibrate':
      if (bg.moving) {
        bg.startDrag(p);
        ui.bgDrag = true;
        svg.setPointerCapture(e.pointerId);
        return;
      }
      return bg.calibrateClick(snapPointFree(p));
  }
});

/** En la calibración solo se ajusta a los vértices (la imagen no está en la rejilla). */
const snapPointFree = p => {
  const tol = 9 / view.scale;
  for (const v of S.getBuilding().shell.outline) if (!ui.alt && dist(v, p) < tol) return [...v];
  return p;
};

function startPan(e, sx, sy) {
  ui.pan = { sx, sy, ox: view.ox, oy: view.oy };
  svg.classList.add('panning');
  svg.setPointerCapture(e.pointerId);
}

svg.addEventListener('contextmenu', e => e.preventDefault());

svg.addEventListener('pointermove', e => {
  const [sx, sy] = local(e);
  ui.alt = e.altKey;
  ui.shift = e.shiftKey;
  const p = toWorld(sx, sy);
  ui.cursor = p;
  $('#cursorPos').textContent = `x ${fmt(p[0])} · z ${fmt(p[1])} m`;
  if (ui.pan) {
    view.ox = ui.pan.ox + sx - ui.pan.sx;
    view.oy = ui.pan.oy + sy - ui.pan.sy;
    render();
    return;
  }
  if (ui.drag) return dragMove(p);
  if (ui.bgDrag) return bg.dragTo(p);
  const b = S.getBuilding();
  switch (ui.tool) {
    case 'select': {
      const h = hit(sx, sy);
      ui.hover = h;
      svg.classList.toggle('move', !!h && h.kind !== 'building');
      break;
    }
    case 'outline': {
      const P = ui.draft?.points ?? [];
      ui.snapped = snapPoint(p, { from: P[P.length - 1] ?? null });
      if (P.length >= 3 && dist(toScreen(P[0]), [sx, sy]) < 10) {
        ui.snapped = [...P[0]];
        ui.closeHover = true;
      }
      break;
    }
    case 'column':
      ui.snapped = snapPoint(p, { extra: columnCenters() });
      break;
    case 'opening':
      ui.preview = openingAt(b, p);
      ui.snapped = null;
      break;
    case 'mezzanine':
    case 'stairs':
      ui.snapped = snapPoint(p);
      if (ui.draft?.a) ui.draft.b = ui.snapped;
      break;
    case 'calibrate':
      ui.snapped = snapPointFree(p);
      break;
  }
  render();
});

svg.addEventListener('pointerup', e => {
  if (ui.pan) {
    ui.pan = null;
    svg.classList.remove('panning');
    return;
  }
  if (ui.bgDrag) {
    ui.bgDrag = false;
    bg.endDrag();
    return;
  }
  if (ui.drag) {
    const d = ui.drag;
    ui.drag = null;
    ui.guides = [];
    if (d.moved) commit(S.getBuilding(), { undoable: false });
    render();
    return;
  }
  if ((ui.tool === 'mezzanine' || ui.tool === 'stairs') && ui.draft?.a) {
    const { a, b: z } = ui.draft;
    ui.draft = null;
    const r = {
      x: round(Math.min(a[0], z[0])),
      z: round(Math.min(a[1], z[1])),
      w: round(Math.abs(z[0] - a[0])),
      d: round(Math.abs(z[1] - a[1])),
    };
    if (r.w < 0.3 || r.d < 0.3) {
      render();
      return;
    }
    addRect(ui.tool, r);
  }
  void e;
});

svg.addEventListener('dblclick', e => {
  if (ui.tool !== 'select') return;
  const [sx, sy] = local(e);
  const h = hit(sx, sy);
  if (h?.kind !== 'edge') return;
  const b = S.getBuilding();
  const poly = b.shell.outline;
  const p = snapPoint(toWorld(sx, sy));
  const pr = projectOnSegment(p, poly[h.i], poly[(h.i + 1) % poly.length]);
  if (pr.t < 0.01 || pr.t > 0.99) return;
  commit(insertVertex(b, h.i, pr.point));
  select({ kind: 'vertex', i: h.i + 1 });
});

svg.addEventListener(
  'wheel',
  e => {
    e.preventDefault();
    const [sx, sy] = local(e);
    if (e.ctrlKey || e.metaKey) zoomAt(sx, sy, Math.exp(-e.deltaY * (e.ctrlKey ? 0.012 : 0.002)));
    else {
      view.ox -= e.deltaX;
      view.oy -= e.deltaY;
      render();
    }
  },
  { passive: false },
);

svg.addEventListener('pointerleave', () => {
  ui.snapped = null;
  ui.preview = null;
  ui.hover = null;
  if (!ui.drag) ui.guides = [];
  render();
});

/** El hueco que pondría un clic en `p`: en el muro más cercano (a menos de 30 px), dentro de la arista. */
function openingAt(b, p) {
  const poly = b.shell.outline;
  if (poly.length < 3) return null;
  const ne = nearestEdge(poly, p);
  if (!ne || ne.d > 30 / view.scale) return null;
  const o = newOpening(ui.openingKind, ne.k, 0.5);
  const len = dist(poly[ne.k], poly[(ne.k + 1) % poly.length]);
  if (len < 0.3) return null;
  o.width = Math.min(o.width, round(len - 0.1, 2));
  o.t = round(placeAlong(len, ne.t * len, o.width) / len, 4);
  return o;
}

/** El centro de un hueco de ancho `w` a `c` m del vértice k: a la rejilla, al medio si está cerca, dentro de la arista. */
function placeAlong(len, c, w) {
  const step = ui.snap.grid && !ui.alt ? ui.snap.step : 0;
  let v = step ? Math.round(c / step) * step : c;
  if (!ui.alt && Math.abs(c - len / 2) < 9 / view.scale) v = len / 2;
  return Math.max(w / 2, Math.min(len - w / 2, v));
}

function outlineClick(p) {
  const b = S.getBuilding();
  ui.draft ??= { points: [] };
  const P = ui.draft.points;
  const q = ui.snapped ?? snapPoint(p, { from: P[P.length - 1] ?? null });
  if (P.length >= 3 && dist(q, P[0]) < 1e-6) return closeOutline();
  if (P.length && dist(q, P[P.length - 1]) < 1e-3) return;
  P.push([round(q[0]), round(q[1])]);
  ui.typed = '';
  showTyped();
  render();
  void b;
}

/** Cierra el contorno dibujado: reemplaza el de la nave (los huecos de antes se van: eran de otras aristas). */
function closeOutline() {
  const P = ui.draft?.points ?? [];
  if (P.length < 3) return;
  const b = clone(S.getBuilding());
  const had = (b.shell.openings?.length ?? 0) > 0;
  b.shell.outline = P.map(p => [...p]);
  b.shell.openings = [];
  b.shell.exterior = { ...(b.shell.exterior ?? {}), streetEdge: 0 };
  if (b.shell.walls)
    for (const k of ['plinthByEdge', 'colorByEdge', 'jointsByEdge', 'sections']) delete b.shell.walls[k];
  if (b.shell.structure?.bracing) delete b.shell.structure.bracing;
  ui.draft = null;
  commit(b, { origin: true });
  setTool('select');
  select({ kind: 'building' });
  const traced = !!bg.bounds();
  // calcado de un plano: las cotas que trae se escriben en las aristas (la imagen nunca está a escala exacta)
  if (traced) document.getElementById('edgesHead')?.scrollIntoView({ block: 'start' });
  toast(
    (had ? 'Contorno nuevo: los huecos del anterior se borraron (eran de otras aristas)' : 'Contorno cerrado') +
      (traced ? ' · escribí las cotas del plano en las aristas, a la izquierda' : ''),
    traced ? 6000 : 3200,
  );
}

function addRect(tool, r) {
  const b = clone(S.getBuilding());
  b.shell.existing = [...(b.shell.existing ?? [])];
  const mezz = b.shell.existing.filter(e => e.type === 'mezzanine');
  if (tool === 'mezzanine') {
    const clear = b.shell.clearHeight ?? 7;
    b.shell.existing.push({
      type: 'mezzanine',
      ...r,
      floorHeight: round(Math.min(3, clear * 0.45), 2),
      height: 2.5,
      label: 'Altillo existente',
    });
  } else {
    // sube a lo largo del lado largo, hasta el forjado del altillo que toca (o 3 m)
    const touch = mezz.find(
      m => r.x <= m.x + m.w + 0.3 && m.x <= r.x + r.w + 0.3 && r.z <= m.z + m.d + 0.3 && m.z <= r.z + r.d + 0.3,
    );
    b.shell.existing.push({
      type: 'stairs-existing',
      ...r,
      rise: touch?.floorHeight ?? 3,
      dir: r.d >= r.w ? '+z' : '+x',
      shape: 'straight',
      label: 'Escalera existente',
    });
  }
  commit(b);
  setTool('select');
  select({ kind: 'existing', i: b.shell.existing.length - 1 });
}

// ------------------------------------------------------------------------------------------------ arrastrar

function dragMove(p) {
  const d = ui.drag;
  const b0 = d.orig;
  const s0 = b0.shell;
  const h = d.h;
  let nb = null;
  if (h.kind === 'vertex') {
    const q = snapPoint(p, { exclude: h.i });
    nb = moveVertex(b0, h.i, q);
  } else if (h.kind === 'edge') {
    // el muro se corre paralelo a sí mismo (por su normal)
    const n = s0.outline.length;
    const f = edgeFrame(s0.outline, h.i);
    let t = (p[0] - d.start[0]) * f.nIn[0] + (p[1] - d.start[1]) * f.nIn[1];
    if (!ui.alt && ui.snap.grid) t = Math.round(t / ui.snap.step) * ui.snap.step;
    const mv = v => [v[0] + f.nIn[0] * t, v[1] + f.nIn[1] * t];
    nb = moveVertices(
      b0,
      new Map([
        [h.i, mv(s0.outline[h.i])],
        [(h.i + 1) % n, mv(s0.outline[(h.i + 1) % n])],
      ]),
    );
  } else if (h.kind === 'opening') {
    const o = s0.openings[h.i];
    const poly = s0.outline;
    const ne = nearestEdge(poly, p);
    const k = ne && ne.d < 40 / view.scale ? ne.k : o.edge;
    const pr = projectOnSegment(p, poly[k], poly[(k + 1) % poly.length]);
    const len = dist(poly[k], poly[(k + 1) % poly.length]);
    const c = placeAlong(len, pr.t * len, Math.min(o.width, len));
    nb = clone(b0);
    nb.shell.openings[h.i] = { ...o, edge: k, t: round(c / len, 4) };
  } else if (h.kind === 'column' || h.kind === 'existing') {
    const list = h.kind === 'column' ? s0.structure.columns : s0.existing;
    const r0 = list[h.i];
    let r;
    if (h.corner !== undefined) {
      // tirador: la esquina opuesta queda fija
      const cs = corners(r0);
      const fixed = cs[(h.corner + 2) % 4];
      const q = snapPoint(p);
      r = {
        ...r0,
        x: round(Math.min(fixed[0], q[0])),
        z: round(Math.min(fixed[1], q[1])),
        w: round(Math.max(0.1, Math.abs(q[0] - fixed[0]))),
        d: round(Math.max(0.1, Math.abs(q[1] - fixed[1]))),
      };
    } else {
      // un pilar se ajusta por su centro; un rectángulo, por la esquina más cercana al punto de donde se lo agarró
      const dx = p[0] - d.start[0];
      const dz = p[1] - d.start[1];
      const cs = corners(r0);
      let anchor = [r0.x + r0.w / 2, r0.z + r0.d / 2];
      if (h.kind !== 'column') anchor = cs.reduce((m, c) => (dist(c, d.start) < dist(m, d.start) ? c : m), cs[0]);
      const extra = h.kind === 'column' ? columnCenters().filter((_, i) => i !== h.i) : [];
      const q = snapPoint([anchor[0] + dx, anchor[1] + dz], { extra });
      const ddx = q[0] - anchor[0];
      const ddz = q[1] - anchor[1];
      r = { ...r0, x: round(r0.x + ddx), z: round(r0.z + ddz) };
      if (Array.isArray(r0.columns))
        r.columns = r0.columns.map(c => ({ ...c, x: round(c.x + ddx), z: round(c.z + ddz) }));
    }
    nb = clone(b0);
    if (h.kind === 'column') nb.shell.structure.columns[h.i] = r;
    else nb.shell.existing[h.i] = r;
  }
  if (!nb) return;
  commit(nb, { undoable: !d.moved, live: true });
  d.moved = true;
}

// ------------------------------------------------------------------------------------------------ teclado

const typing = () => {
  const a = document.activeElement;
  return !!a && (a.tagName === 'INPUT' || a.tagName === 'SELECT' || a.tagName === 'TEXTAREA') && a !== svg;
};

/** Si se está calibrando el fondo y faltan los metros: los dos puntos ya están. */
const calibrating = () => ui.tool === 'calibrate' && ui.draft?.points?.length === 2;

/** El recuadro de lo que se escribe: el largo del tramo del contorno, o la distancia real de la calibración. */
function showTyped() {
  const box = $('#typeBox');
  const cal = calibrating();
  if (!cal && (!ui.typed || ui.tool !== 'outline' || !ui.draft?.points?.length)) {
    box.hidden = true;
    return;
  }
  const last = ui.draft.points[ui.draft.points.length - 1];
  const [x, y] = toScreen(last);
  box.hidden = false;
  box.style.left = `${x + 14}px`;
  box.style.top = `${y + 14}px`;
  const v = parseNum(ui.typed);
  const bad = ui.typed && !Number.isFinite(v) ? ' ?' : '';
  box.textContent = cal
    ? `distancia real: ${ui.typed || '…'} m${bad} · Enter (en la imagen, ${fmt(bg.measured())} m)`
    : `${ui.typed} m${bad}`;
}

/** Enter en la calibración: la distancia real escrita escala la imagen; después, a calcar el contorno. */
function finishCalibration() {
  const msg = bg.applyCalibration(parseNum(ui.typed));
  if (!msg) return toast('Escribí la distancia real en metros (por ejemplo «13,45») y Enter');
  const empty = S.getBuilding().shell.outline.length < 3;
  setTool(empty ? 'outline' : 'select');
  fit({ withBg: true });
  toast(
    empty
      ? `Escala lista (${msg}). Ahora calcá el contorno: clic en cada esquina del plano`
      : `Escala lista (${msg}). P: calcar el contorno otra vez (reemplaza el de ahora)`,
    6000,
  );
}

/** Enter con un número escrito: el punto siguiente a ese largo, en la dirección del tramo de ahora (ya ajustada). */
function applyTyped() {
  const v = parseNum(ui.typed);
  const P = ui.draft?.points ?? [];
  if (!(v > 0) || !P.length) return false;
  const last = P[P.length - 1];
  const to = ui.snapped ?? ui.cursor;
  const deg = to && dist(last, to) > 1e-6 ? angleDeg(last, to) : 0;
  const q = polar(last, deg, v);
  P.push([round(q[0]), round(q[1])]);
  ui.typed = '';
  showTyped();
  ui.snapped = null;
  render();
  return true;
}

const TOOL_KEYS = { v: 'select', p: 'outline', d: 'opening', c: 'column', m: 'mezzanine', e: 'stairs', b: 'calibrate' };

window.addEventListener('keydown', e => {
  ui.alt = e.altKey;
  ui.shift = e.shiftKey;
  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.key.toLowerCase() === 'z') {
    if (typing()) return;
    e.preventDefault();
    if (e.shiftKey) S.redo();
    else S.undo();
    return;
  }
  if (mod && e.key.toLowerCase() === 'y') {
    if (typing()) return;
    e.preventDefault();
    S.redo();
    return;
  }
  if (mod && e.key.toLowerCase() === 's') {
    e.preventDefault();
    toast(S.save() ? 'Guardada en este navegador' : 'No se pudo guardar en este navegador');
    return;
  }
  if (typing() || mod) return;
  if (e.key === ' ') {
    ui.space = true;
    svg.classList.add('pan');
    e.preventDefault();
    return;
  }
  // mientras se dibuja el contorno o se calibra el fondo: un número y Enter
  if (
    ((ui.tool === 'outline' && ui.draft?.points?.length) || calibrating()) &&
    /^[\d.,+\-*/()x]$/.test(e.key) &&
    !(e.key === 'x' && !ui.typed)
  ) {
    ui.typed += e.key;
    showTyped();
    e.preventDefault();
    return;
  }
  if (e.key === 'Enter') {
    if (calibrating()) finishCalibration();
    else if (ui.tool === 'outline' && ui.typed) applyTyped();
    else if (ui.tool === 'outline' && (ui.draft?.points?.length ?? 0) >= 3) closeOutline();
    e.preventDefault();
    return;
  }
  if (e.key === 'Escape') {
    if (ui.typed) ui.typed = '';
    else if (ui.draft && (ui.draft.points?.length || ui.draft.a))
      ui.draft = ui.tool === 'outline' ? { points: [] } : null;
    else if (ui.tool !== 'select') setTool('select');
    else select(null);
    showTyped();
    render();
    return;
  }
  if (e.key === 'Backspace' || e.key === 'Delete') {
    e.preventDefault();
    if ((ui.tool === 'outline' || calibrating()) && ui.typed) {
      ui.typed = ui.typed.slice(0, -1);
      showTyped();
    } else if (ui.tool === 'outline' && ui.draft?.points?.length) {
      ui.draft.points.pop();
      render();
    } else deleteSelection();
    return;
  }
  if (e.key.startsWith('Arrow') && ui.sel) {
    e.preventDefault();
    const st = (ui.snap.step || 0.1) * (e.shiftKey ? 10 : 1);
    const [dx, dz] = { ArrowLeft: [-st, 0], ArrowRight: [st, 0], ArrowUp: [0, -st], ArrowDown: [0, st] }[e.key] ?? [
      0, 0,
    ];
    nudge(dx, dz);
    return;
  }
  const k = e.key.toLowerCase();
  if (TOOL_KEYS[k] && !e.altKey) {
    setTool(TOOL_KEYS[k]);
    return;
  }
  if (k === 'i') {
    if (bg.has) bg.setVisible(!bg.shown);
    else toast('Sin plano de fondo: Importar una imagen (o soltarla en el plano) para calcar');
  } else if (k === 'f') fit();
  else if (k === '+' || k === '=') zoomAt(svg.clientWidth / 2, svg.clientHeight / 2, 1.25);
  else if (k === '-') zoomAt(svg.clientWidth / 2, svg.clientHeight / 2, 0.8);
  else if (k === '?') /** @type {HTMLDialogElement} */ ($('#helpDialog')).showModal();
});

window.addEventListener('keyup', e => {
  ui.alt = e.altKey;
  ui.shift = e.shiftKey;
  if (e.key === ' ') {
    ui.space = false;
    svg.classList.remove('pan');
  }
});

/** Borra lo elegido (un vértice solo si quedan más de 3). */
function deleteSelection() {
  const sel = ui.sel;
  if (!sel) return;
  const b = S.getBuilding();
  const nb = clone(b);
  const s = nb.shell;
  switch (sel.kind) {
    case 'vertex':
      if (s.outline.length <= 3) return toast('El contorno necesita al menos 3 vértices');
      commit(deleteVertex(b, sel.i));
      break;
    case 'opening':
      s.openings.splice(sel.i, 1);
      commit(nb);
      break;
    case 'column':
      s.structure.columns.splice(sel.i, 1);
      commit(nb);
      break;
    case 'existing':
      s.existing.splice(sel.i, 1);
      commit(nb);
      break;
    default:
      return;
  }
  select(null);
}

/** Mueve lo elegido `(dx, dz)` (la nave entera si está elegida la nave). */
function nudge(dx, dz) {
  const sel = ui.sel;
  const b = S.getBuilding();
  const nb = clone(b);
  const s = nb.shell;
  if (sel.kind === 'vertex') return commit(moveVertex(b, sel.i, [s.outline[sel.i][0] + dx, s.outline[sel.i][1] + dz]));
  if (sel.kind === 'edge') {
    const n = s.outline.length;
    const j = (sel.i + 1) % n;
    return commit(
      moveVertices(
        b,
        new Map([
          [sel.i, [s.outline[sel.i][0] + dx, s.outline[sel.i][1] + dz]],
          [j, [s.outline[j][0] + dx, s.outline[j][1] + dz]],
        ]),
      ),
    );
  }
  if (sel.kind === 'column') {
    const c = s.structure.columns[sel.i];
    s.structure.columns[sel.i] = { ...c, x: round(c.x + dx), z: round(c.z + dz) };
    return commit(nb);
  }
  if (sel.kind === 'existing') {
    const e = s.existing[sel.i];
    s.existing[sel.i] = {
      ...e,
      x: round(e.x + dx),
      z: round(e.z + dz),
      ...(Array.isArray(e.columns)
        ? { columns: e.columns.map(c => ({ ...c, x: round(c.x + dx), z: round(c.z + dz) })) }
        : {}),
    };
    return commit(nb);
  }
  if (sel.kind === 'opening') {
    const o = s.openings[sel.i];
    const len = dist(s.outline[o.edge], s.outline[(o.edge + 1) % s.outline.length]);
    const f = edgeFrame(s.outline, o.edge);
    const along = dx * f.dir[0] + dz * f.dir[1];
    const c = Math.max(o.width / 2, Math.min(len - o.width / 2, o.t * len + along));
    s.openings[sel.i] = { ...o, t: round(c / len, 4) };
    return commit(nb);
  }
  if (sel.kind === 'building') commit(translateBuilding(b, dx, dz));
}

// ------------------------------------------------------------------------------------------------ varios

let toastTimer = 0;
function toast(msg, ms = 3200) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), ms);
}

for (const btn of document.querySelectorAll('#tools [data-tool]'))
  btn.addEventListener('click', () => setTool(/** @type {HTMLElement} */ (btn).dataset.tool));
$('#fitBtn').onclick = () => fit();
$('#helpBtn').onclick = () => /** @type {HTMLDialogElement} */ ($('#helpDialog')).showModal();
const snapGrid = /** @type {HTMLInputElement} */ ($('#snapGrid'));
const snapStep = /** @type {HTMLSelectElement} */ ($('#snapStep'));
const snapAngleBox = /** @type {HTMLInputElement} */ ($('#snapAngle'));
const snapVertex = /** @type {HTMLInputElement} */ ($('#snapVertex'));
const syncSnap = () => {
  ui.snap = {
    grid: snapGrid.checked,
    step: Number(snapStep.value) || 0.1,
    angle: snapAngleBox.checked,
    vertex: snapVertex.checked,
  };
};
for (const el of [snapGrid, snapStep, snapAngleBox, snapVertex]) el.addEventListener('change', syncSnap);
const bgToggle = $('#bgToggle');
const hintBox = $('#hint');
const bgShow = /** @type {HTMLInputElement} */ ($('#bgShow'));
bgShow.addEventListener('change', () => bg.setVisible(bgShow.checked));
syncSnap();
new ResizeObserver(() => {
  // acá el layout ya está hecho: leerlo no fuerza nada
  svgBox = svg.getBoundingClientRect();
  svgPos = svgBox;
  render();
}).observe(svg);

const bg = initBackground(ed);
ed.bg = bg;
const panel = initPanel(ed, { OPENING_KINDS });
ed.refreshPanel = () => panel.update(true);
initIO(ed);
initCheck(ed, () => panel.update(false));
ed.onIssues = () => panel.update(false);

setTool('select');
requestAnimationFrame(() => fit());
// para las pruebas en Chromium (scripts/editor-check.mjs): el estado y la vista
window.__editor = { state: S, ui, view, toScreen, toWorld, setTool, select, fit, ed };
window.__editorReady = true;
