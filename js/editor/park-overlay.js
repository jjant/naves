// El park armado dibujado sobre el plano del editor: la pista (tramos, finales, rayas entre líneas, módulos), las
// zonas y los recintos con sus nombres, la escalera, los pasillos de retorno y la seguridad (extintores, BIE). En
// **metros de la nave** (x a la derecha, z hacia abajo: el `x`/`y` del SVG), para meter dentro del grupo del plano que ya
// está en esas coordenadas, sea el del editor o el plano propio del panel. Sin DOM: lo prueban los tests en Node.
//
// Cada pieza sale como un elemento descrito (`{ t, a, c }`: la etiqueta, los atributos en orden y sin escapar, y lo de
// adentro: otros elementos o un texto). `svgOf` lo escribe como texto SVG (el plano chico del panel, los tests) y
// svg-patch.js lo pone en el plano del editor o, de un cuadro al siguiente, cambia en el DOM solo los atributos y los
// textos que cambiaron: el DOM que queda es el mismo que da leer ese texto.
//
// Los colores de las zonas son los de `planSVG` (crates/park3d-plan/src/svg.rs), así el editor y la ficha del sitio
// se leen igual. Cada pieza lleva `data-key` (`slope`, `zone:<id>`): con eso el panel la encuentra para resaltarla.

/** Color de relleno de cada tipo de zona (`zone_color` de svg.rs). */
export const ZONE_COLORS = {
  reception: '#f6c9da',
  rental: '#fde2b0',
  lockers: '#d9dee4',
  changing: '#cfe0f3',
  wc: '#cfe0f3',
  'wc-accessible': '#b9d3f5',
  gym: '#c9ccd1',
  trampolines: '#c4d4ee',
  'beginner-pad': '#d3ebb7',
  'mini-ramp': '#b8dba0',
  lounge: '#f0e2c8',
  cafe: '#ead2b2',
  vending: '#f4c4c8',
  workshop: '#e2d6c6',
  office: '#e6e4de',
  storage: '#e2dfd8',
  'first-aid': '#cde9da',
  'boot-bench': '#ead7bd',
  stairs: '#d4d4d4',
  return: '#ecebe4',
  airbag: '#c9d3e6',
  partition: '#bbbbbb',
};
/** Los tramos de la pista (`sec` de svg.rs) y sus finales. */
export const SLOPE_COLORS = {
  platform: '#9aa3ab',
  ramp: '#3d7a3a',
  step: '#4b8a43',
  flat: '#5d9a4c',
  runout: '#a9cf73',
  quarter: '#2f6a32',
};
/** Lo que va como un punto en la pared, no como un recinto. */
const POINTS = new Set(['extinguisher', 'bie', 'logo-wall', 'hvls-fan']);

/** Texto para meter en SVG (los nombres de las zonas vienen del layout, que puede venir pegado a mano). */
export function esc(s) {
  return String(s).replace(
    /[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  );
}
const n = v => String(Math.round(v * 1000) / 1000);
const pts = poly => poly.map(p => `${n(p[0])},${n(p[1])}`).join(' ');

/**
 * Un elemento descrito: `t` la etiqueta, `a` los atributos (`[nombre, valor, nombre, valor, …]`, en el orden en que se
 * escriben, sin escapar) y `c` lo de adentro (una lista de elementos, un texto o nada).
 */
const el = (t, a, c) => ({ t, a, c });

/** El texto SVG de un elemento descrito (el que escribían a mano las funciones de abajo, byte a byte). */
export function svgOf(e) {
  let s = `<${e.t}`;
  const a = e.a;
  for (let i = 0; i < a.length; i += 2) s += ` ${a[i]}="${esc(a[i + 1])}"`;
  const c = e.c;
  if (c == null) return `${s}/>`;
  if (!Array.isArray(c)) return `${s}>${esc(c)}</${e.t}>`;
  s += '>';
  for (const k of c) s += svgOf(k);
  return `${s}</${e.t}>`;
}

/** El nombre corto de una zona: hasta el primer paréntesis, « · », «;» o «:» (como `short_name` de text.rs). */
export function shortName(label) {
  const s = String(label ?? '');
  const cut = s.search(/ \(| · |;|: |, /);
  return (cut > 0 ? s.slice(0, cut) : s).trim();
}

/** `text` recortado a lo que entra en `width` m con letra de `size` m (≈ 0,56 de alto por carácter), o ''. */
export function fit(text, width, size) {
  const max = Math.floor(width / (size * 0.56));
  if (max < 3) return '';
  return text.length <= max ? text : text.slice(0, max - 1).trimEnd() + '…';
}

/** El tamaño de letra del plano (m), como `fs` de svg.rs: según lo grande que es la nave. */
export function fontSize(layout) {
  const o = layout?.shell?.outline ?? [];
  if (!o.length) return 0.5;
  const xs = o.map(p => p[0]);
  const zs = o.map(p => p[1]);
  const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs)) + 4.8;
  return Math.max(0.42, Math.min(0.62, span / 70));
}

/** Un rótulo con halo (se lee sobre cualquier color), o null sin texto. */
function label(x, y, text, size, { cls = '', halo = '#fff', rotate = false } = {}) {
  if (!text) return null;
  const a = ['x', n(x), 'y', n(y), 'font-size', n(size)];
  if (rotate) a.push('transform', `rotate(-90 ${n(x)} ${n(y)})`);
  a.push('class', cls, 'stroke', halo, 'stroke-width', n(size * 0.28), 'stroke-linejoin', 'round');
  a.push('paint-order', 'stroke');
  return el('text', a, String(text));
}

/** Centro y caja de un polígono. */
function box(poly) {
  const xs = poly.map(p => p[0]);
  const zs = poly.map(p => p[1]);
  const x0 = Math.min(...xs);
  const z0 = Math.min(...zs);
  const w = Math.max(...xs) - x0;
  const d = Math.max(...zs) - z0;
  return { x0, z0, w, d, cx: x0 + w / 2, cz: z0 + d / 2 };
}

/** El rótulo dentro de un rectángulo: a lo ancho si entra, si no a lo largo (girado), si no recortado. */
function boxLabel(b, text, size, opts = {}) {
  const wide = text.length * size * 0.56;
  const turn = wide > b.w - 0.2 && b.d > b.w;
  const t = fit(text, (turn ? b.d : b.w) - 0.2, size);
  return label(b.cx, b.cz, t, size, { ...opts, rotate: turn });
}

/** La pista (las `shapes` de `slopeShapes`, park-run.js): tramos, finales, rayas, módulos y rótulos, o null. */
export function slopeNode(shapes, fs) {
  if (!shapes) return null;
  const out = [el('title', [], String(shapes.label))];
  const labels = [];
  for (const s of [...shapes.sections, ...shapes.ends]) {
    const color = SLOPE_COLORS[s.key] ?? '#5d9a4c';
    out.push(el('polygon', ['points', pts(s.poly), 'fill', color, 'data-part', s.key]));
    const l = boxLabel(box(s.poly), s.label, fs * (s.key === 'runout' ? 0.85 : 0.95), { cls: 'w', halo: color });
    if (l) labels.push(l);
  }
  for (const [a, b] of shapes.lanes)
    out.push(
      el('line', [
        ...['x1', n(a[0]), 'y1', n(a[1]), 'x2', n(b[0]), 'y2', n(b[1])],
        ...['stroke', '#fff', 'stroke-width', '0.06', 'stroke-dasharray', '0.5 0.35'],
      ]),
    );
  for (const m of shapes.modules)
    out.push(
      el(
        'polygon',
        ['points', pts(m.poly), 'fill', '#ffe53d', 'stroke', '#1d2a36', 'stroke-width', '0.04', 'data-part', 'module'],
        [el('title', [], String(m.label))],
      ),
    );
  const b = box(shapes.outline);
  out.push(
    el('polygon', [
      ...['points', pts(shapes.outline), 'fill', 'none', 'stroke', '#1d2a36', 'stroke-width', '0.08'],
      ...['class', 'park-edge'],
    ]),
  );
  out.push(...labels);
  out.push(
    el('rect', ['x', n(b.x0), 'y', n(b.z0), 'width', n(b.w), 'height', n(b.d), 'fill', 'none', 'class', 'park-hit']),
  );
  return el('g', ['data-key', 'slope', 'class', 'park-slope'], out);
}

/** Lo mismo en texto SVG ('' sin pista). */
export function slopeSVG(shapes, fs) {
  const e = slopeNode(shapes, fs);
  return e ? svgOf(e) : '';
}

/** Una zona: el rectángulo con su color y su nombre (la de un altillo, con trazo discontinuo y la cota). */
export function zoneNode(z, fs) {
  const key = `zone:${z.id}`;
  const title = el('title', [], String(z.label || z.type));
  if (POINTS.has(z.type)) {
    const color = z.type === 'bie' ? '#9e1a1f' : z.type === 'logo-wall' ? '#DF0763' : '#d4262d';
    return el(
      'g',
      ['data-key', key, 'class', 'park-point', 'data-type', z.type],
      [title, el('circle', ['cx', n(z.x + z.w / 2), 'cy', n(z.z + z.d / 2), 'r', '0.28', 'fill', color])],
    );
  }
  const up = typeof z.y === 'number' && z.y > 0;
  const color = ZONE_COLORS[z.type] ?? '#e7e4dc';
  const b = { x0: z.x, z0: z.z, w: z.w, d: z.d, cx: z.x + z.w / 2, cz: z.z + z.d / 2 };
  const big = Math.min(z.w, z.d) > 1.6;
  const size = fs * (big ? 0.95 : 0.7);
  const name = shortName(z.label || z.type) + (up ? ` · +${String(z.y).replace('.', ',')} m` : '');
  const text = z.w * z.d > 2.5 ? boxLabel(b, name, size, { halo: color }) : null;
  const rect = ['x', n(z.x), 'y', n(z.z), 'width', n(z.w), 'height', n(z.d), 'fill', color];
  rect.push('fill-opacity', up ? '0.55' : '0.92', 'stroke', '#4f5965', 'stroke-width', '0.06');
  if (up) rect.push('stroke-dasharray', '0.35 0.2');
  return el(
    'g',
    ['data-key', key, 'class', `park-zone${up ? ' park-up' : ''}`, 'data-type', z.type],
    text ? [title, el('rect', rect), text] : [title, el('rect', rect)],
  );
}

/** Lo mismo en texto SVG. */
export const zoneSVG = (z, fs) => svgOf(zoneNode(z, fs));

/**
 * Lo que pone `autoLayout` en el `src` de un hueco que propone él (nave.rs, safety.rs, output.rs): la obra
 * («obra necesaria: …») y la marca del generador. Los huecos que ya traía la nave como propuesta (`proposed` de los
 * replanteos) no la llevan.
 */
export const PROPOSED = '(autoLayout)';

/** Si el hueco lo propuso el generador (no está así en la nave que se dibujó: uno nuevo o el portón de la entrada). */
export const isProposed = op => typeof op?.src === 'string' && op.src.includes(PROPOSED);

/** El tramo de muro de un hueco: sus dos puntas y la normal hacia adentro de la nave, o null. */
export function openingSegment(outline, op) {
  const o = outline ?? [];
  const a = o[op?.edge];
  const b = o[(op?.edge + 1) % o.length];
  if (!a || !b || o.length < 3) return null;
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (!len) return null;
  const dir = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
  const c = op.t * len;
  const w = op.width || 1;
  const p = [a[0] + dir[0] * (c - w / 2), a[1] + dir[1] * (c - w / 2)];
  const q = [a[0] + dir[0] * (c + w / 2), a[1] + dir[1] * (c + w / 2)];
  const mid = [a[0] + dir[0] * c, a[1] + dir[1] * c];
  let nrm = [-dir[1], dir[0]];
  if (!inside(o, [mid[0] + nrm[0] * 0.5, mid[1] + nrm[1] * 0.5])) nrm = [dir[1], -dir[0]];
  return { p, q, mid, nrm };
}

/** Si el punto está dentro del polígono (par-impar). */
function inside(poly, [x, z]) {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i];
    const [xj, zj] = poly[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) hit = !hit;
  }
  return hit;
}

/** Cómo se llama cada hueco que propone el generador, en el plano. */
const PROPOSED_NAMES = { 'emergency-exit': 'salida nueva', 'pedestrian-door': 'puerta nueva' };

/**
 * Los huecos que agregó `autoLayout` (la puerta que supone si el plano no trae ninguna, la segunda salida, la de
 * emergencia por recorrido): no son de la nave dibujada, así que el plano del editor no los tiene, pero el park entero
 * se arma alrededor de ellos. Van en el muro, rayados («nuevo») y con su nombre hacia adentro; `data-key="door:<i>"`
 * con su índice en `layout.shell.openings` (el de los avisos «hueco i»). Uno descrito por hueco.
 */
export function proposedNodes(shell, fs) {
  const outline = shell?.outline ?? [];
  const out = [];
  (shell?.openings ?? []).forEach((op, i) => {
    if (!isProposed(op)) return;
    const seg = openingSegment(outline, op);
    if (!seg) return;
    const exit = op.type === 'emergency-exit';
    const color = exit ? '#13a34b' : '#DF0763';
    const { p, q, mid, nrm } = seg;
    const line = (stroke, width, dash = false) =>
      el('line', [
        ...['x1', n(p[0]), 'y1', n(p[1]), 'x2', n(q[0]), 'y2', n(q[1]), 'stroke', stroke, 'stroke-width', width],
        ...(dash ? ['stroke-dasharray', '0.25 0.25'] : []),
      ]);
    const tip = [mid[0] + nrm[0] * 1.1, mid[1] + nrm[1] * 1.1];
    const name = PROPOSED_NAMES[op.type] ?? 'hueco nuevo';
    // el rótulo entero dentro de la nave: en un muro a lo largo, corrido medio rótulo hacia adentro
    const size = fs * 0.85;
    const half = (Math.abs(nrm[0]) * name.length * size * 0.56) / 2 + Math.abs(nrm[1]) * size * 0.6;
    const at = [mid[0] + nrm[0] * (1.3 + half), mid[1] + nrm[1] * (1.3 + half)];
    const kids = [
      el('title', [], `${name} (${op.src})`),
      line(color, '0.6'),
      line('#fff', '0.6', true),
      el('line', [
        ...['x1', n(mid[0]), 'y1', n(mid[1]), 'x2', n(tip[0]), 'y2', n(tip[1]), 'stroke', color],
        ...['stroke-width', '0.12', 'stroke-dasharray', '0.2 0.12'],
      ]),
    ];
    const l = label(at[0], at[1], name, size, { cls: 'park-proposed-label' });
    if (l) kids.push(l);
    out.push(el('g', ['data-key', `door:${i}`, 'class', 'park-proposed', 'data-type', op.type], kids));
  });
  return out;
}

/** Lo mismo en texto SVG, un grupo por hueco. */
export const proposedParts = (shell, fs) => proposedNodes(shell, fs).map(svgOf);

/** Lo mismo en un texto (los grupos de `proposedParts`, uno detrás de otro). */
export const proposedSVG = (shell, fs) => proposedParts(shell, fs).join('');

/**
 * Todo el park sobre el plano: la pista (de `shapes`), las zonas del layout, en ese orden (las zonas del altillo,
 * encima de todo, semitransparentes), y los huecos que agregó el generador. `<g class="park-overlay">`, en metros de la
 * nave.
 */
export function overlaySVG(layout, shapes, { fs = fontSize(layout) } = {}) {
  if (!layout) return '';
  return `${OVERLAY_OPEN}${overlayParts(layout, shapes, { fs }).join('')}</g>`;
}

/** El grupo que envuelve el park en el plano (`overlaySVG`). */
export const OVERLAY_OPEN = '<g class="park-overlay" font-family="system-ui,sans-serif">';

/**
 * Lo de adentro de `overlaySVG`, una pieza por elemento descrito (la pista, cada zona, cada hueco propuesto), en el mismo
 * orden, cada una con su `data-key`: así el plano del editor cambia de un cuadro al siguiente solo lo que cambió de cada
 * pieza (svg-patch.js, `patchKeyed`).
 */
export function overlayNodes(layout, shapes, { fs = fontSize(layout) } = {}) {
  if (!layout) return [];
  const zones = layout.zones ?? [];
  const floor = zones.filter(z => !(typeof z.y === 'number' && z.y > 0) && !POINTS.has(z.type));
  const up = zones.filter(z => typeof z.y === 'number' && z.y > 0 && !POINTS.has(z.type));
  const points = zones.filter(z => POINTS.has(z.type));
  const slope = slopeNode(shapes, fs);
  // una zona que quedó igual que en el park anterior (la mayoría, de un cuadro de un arrastre al siguiente) es el mismo
  // elemento descrito: svg-patch.js no la mira
  const seen = new Map();
  const zone = z => {
    const old = lastZones.get(z.id);
    const node = old && sameZone(old.z, z) && old.fs === fs ? old.node : zoneNode(z, fs);
    seen.set(z.id, { z, fs, node });
    return node;
  };
  const out = [
    ...(slope ? [slope] : []),
    ...[...floor, ...up, ...points].map(zone),
    ...proposedNodes(layout.shell, fs),
  ];
  lastZones = seen;
  return out;
}

/** Las zonas del último `overlayNodes` (id → `{ z, fs, node }`): solo las de ese park, para el siguiente. */
let lastZones = new Map();
/** Si `zoneNode` da lo mismo con las dos zonas (lo que lee). */
const sameZone = (a, b) =>
  a === b ||
  (a.id === b.id &&
    a.type === b.type &&
    a.label === b.label &&
    a.x === b.x &&
    a.z === b.z &&
    a.w === b.w &&
    a.d === b.d &&
    a.y === b.y);

/** Lo mismo en texto SVG, un texto por pieza. */
export const overlayParts = (layout, shapes, opts) => overlayNodes(layout, shapes, opts).map(svgOf);

/**
 * La nave sola, para el plano propio del panel (cuando no hay plano del editor donde dibujar): contorno, pilares,
 * lo existente (altillos rayados) y las aberturas en sus aristas. En metros de la nave, como el park.
 */
export function shellSVG(shell) {
  const o = shell?.outline ?? [];
  if (o.length < 3) return '';
  const out = [`<polygon points="${pts(o)}" fill="#fbfaf6" stroke="#1d2a36" stroke-width="0.25"/>`];
  for (const e of shell.existing ?? []) {
    if (![e.x, e.z, e.w, e.d].every(Number.isFinite)) continue;
    const m = e.type === 'mezzanine';
    out.push(
      `<rect x="${n(e.x)}" y="${n(e.z)}" width="${n(e.w)}" height="${n(e.d)}" fill="${m ? 'url(#park-hatch)' : '#cfcfcf'}" ` +
        `stroke="#1d2a36" stroke-width="0.06"${m ? ' stroke-dasharray="0.4 0.25"' : ''}><title>${esc(e.label || e.type)}</title></rect>`,
    );
  }
  for (const c of shell.structure?.columns ?? [])
    out.push(`<rect x="${n(c.x)}" y="${n(c.z)}" width="${n(c.w)}" height="${n(c.d)}" fill="#1d2a36"/>`);
  for (const op of shell.openings ?? []) {
    const a = o[op.edge];
    const b = o[(op.edge + 1) % o.length];
    if (!a || !b) continue;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (!len) continue;
    const dir = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
    const c = op.t * len;
    const p = [a[0] + dir[0] * (c - op.width / 2), a[1] + dir[1] * (c - op.width / 2)];
    const q = [a[0] + dir[0] * (c + op.width / 2), a[1] + dir[1] * (c + op.width / 2)];
    const color = op.type === 'emergency-exit' ? '#13a34b' : op.type === 'window' ? '#5aa9e6' : '#DF0763';
    out.push(
      `<line x1="${n(p[0])}" y1="${n(p[1])}" x2="${n(q[0])}" y2="${n(q[1])}" stroke="${color}" stroke-width="0.45"><title>${esc(op.type)}</title></line>`,
    );
  }
  return `<g class="park-shell">${out.join('')}</g>`;
}

/** La caja de la nave con un margen (m): el `viewBox` del plano propio del panel. */
export function viewBoxOf(shell, pad = 2) {
  const o = shell?.outline ?? [];
  if (!o.length) return '0 0 10 10';
  const xs = o.map(p => p[0]);
  const zs = o.map(p => p[1]);
  const x0 = Math.min(...xs) - pad;
  const z0 = Math.min(...zs) - pad;
  return `${n(x0)} ${n(z0)} ${n(Math.max(...xs) + pad - x0)} ${n(Math.max(...zs) + pad - z0)}`;
}

/** El trazado rayado de los altillos (para el `<defs>` del plano propio). */
export const HATCH_DEFS =
  '<pattern id="park-hatch" width="0.6" height="0.6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">' +
  '<line x1="0" y1="0" x2="0" y2="0.6" stroke="#9aa3ad" stroke-width="0.07"/></pattern>';
