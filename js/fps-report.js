// Las cuentas del medidor de `?fps=1` (fps.js) y del informe de «Grabar 30 s», sin DOM ni WebGPU: percentiles, los
// tramos de la GPU por pase (las marcas de `timestamp-query` que fps.js pone en cada pase), el redondeo de las marcas y
// el informe en JSON. Las prueba apps/naves/test/fps-report.test.mjs.

/**
 * Un cuadro de la página: lo que pasó entre dos `requestAnimationFrame` (Bevy corre su `App::update` y arma los
 * comandos de la GPU en el suyo).
 * @typedef {{
 *   t: number,
 *   at: number,
 *   dt: number,
 *   dur: number,
 *   cpu: number,
 *   drawn: boolean,
 *   draws: number,
 *   tris: number,
 *   passes: number,
 *   shadow: number,
 *   shadowDraws: number,
 *   shadowTris: number,
 *   cams: number,
 *   pipes: number,
 *   texUp: number,
 *   texBytes: number,
 *   bufBytes: number,
 *   list: PassRec[],
 *   gpu: GpuFrame | null,
 *   scale?: number,
 * }} Frame
 * `t`: el instante del rAF (el del vsync); `at`: `performance.now()` al empezar; `dt`: ms desde el cuadro dibujado
 * anterior; `dur`: ms hasta el siguiente dibujado, lo que tardó este (0 mientras no llega; ver [`linkDrawn`]); `cpu`:
 * ms de los callbacks de rAF del cuadro; `drawn`: si llegó a pantalla (`getCurrentTexture`);
 * `draws`/`tris`: draw calls y triángulos contados en `GPURenderPassEncoder.draw*` (los indirectos cuentan como draw
 * sin triángulos); `passes`: pases de render y de cómputo; `shadow`: pases de sombra (una vista de sombra cada uno);
 * `cams`: pases principales opacos (uno por cámara 3D: la del park y la del reflejo de los espejos); `pipes`:
 * pipelines creados; `texUp`/`texBytes`: subidas de texturas (`writeTexture`, `copyExternalImageToTexture`);
 * `bufBytes`: bytes escritos con `writeBuffer`; `list`: los pases, en orden; `gpu`: los ms de la GPU (llegan unos
 * cuadros después, o `null` si el cuadro no se midió).
 */

/** @typedef {{ l: string, d: number, c: number, q: number }} PassRec  etiqueta, draw calls, dispatches y par de marcas (−1: sin medir) */
/**
 * Un cuadro medido: `span`, de la primera marca a la última; `busy`, la suma de los pases; `passes`, cada uno con
 * `[etiqueta, ms del pase, ms sin solapes]` (ver [`exclusive`]); `dropped`, los pases descartados, y `drops`, cuáles y
 * por qué (`[etiqueta, motivo]`: ver [`decodePasses`]).
 * @typedef {{ span: number, busy: number, passes: [string, number, number][], dropped: number, drops: [string, Drop][] }} GpuFrame
 */
/** @typedef {'unwritten' | 'reversed' | 'stale' | 'outlier' | 'outside'} Drop */

/**
 * Enlaza el cuadro `f`, que acaba de llegar a pantalla, con el dibujado anterior `prev` (`null` si no hay): `f.dt` y
 * `prev.dur` son los ms entre el comienzo de los dos. El intervalo es de `prev`: el rAF de `f` no llega hasta que
 * terminan los callbacks de `prev` (su CPU: `App::update`, la codificación, los pipelines que se compilan al ver un
 * material por primera vez) y, si la GPU va atrasada, hasta que la GPU lo suelta. Un tirón alarga el intervalo que
 * sigue al cuadro que lo causó, no el de antes: los peores cuadros del informe van por `dur`, con las cuentas del mismo
 * cuadro.
 */
export function linkDrawn(/** @type {Frame} */ f, /** @type {Frame | null} */ prev) {
  if (!prev) return;
  f.dt = f.t - prev.t;
  prev.dur = f.dt;
}

/** Los grupos de pases de Bevy y del motor, por la etiqueta del pase, en el orden del cuadro. */
export const GROUPS = /** @type {const} */ ([
  ['sombras', /shadow/i],
  ['ssao', /ssao/i],
  ['prepasada', /prepass|deferred/i],
  ['principal', /main_|opaque|transmissive|transparent|alpha_mask/i],
  ['niebla', /volumetric|fog/i],
  ['taa', /taa|temporal/i],
  ['bloom', /bloom/i],
  ['post', /tonemap|upscal|post|grain|fxaa|smaa|cas\b|sharpen|dof|depth of field|motion|meter|exposure|vignette/i],
  ['cómputo', /preprocess|indirect|culling|occlusion|reset|clear/i],
]);

/** El grupo de un pase por su etiqueta (`otros` si no es de ninguno). */
export function groupOf(/** @type {string} */ label) {
  for (const [name, re] of GROUPS) if (re.test(label)) return name;
  return 'otros';
}

/** ¿Es un pase de sombra (una vista de sombra)? */
export const isShadow = (/** @type {string} */ label) => /shadow/i.test(label) && !/cache_copy/i.test(label);

/** ¿Es el pase principal opaco de una cámara (uno por cámara 3D)? */
export const isMainOpaque = (/** @type {string} */ label) => /main_opaque/i.test(label);

/** Redondeo para el JSON: `d` decimales (sin `-0` ni `NaN`: `null`). */
export function r(/** @type {number} */ x, d = 1) {
  if (!Number.isFinite(x)) return null;
  const k = 10 ** d;
  const v = Math.round(x * k) / k;
  return v === 0 ? 0 : v;
}

/** Percentil `q` (0–1) de valores ya ordenados, por rango (el de `ceil(q·n)`). */
export function quantile(/** @type {number[]} */ sorted, /** @type {number} */ q) {
  if (!sorted.length) return NaN;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1));
  return /** @type {number} */ (sorted[i]);
}

/** p50, p95, p99, máximo y media (ms, con un decimal), y cuántos. */
export function summary(/** @type {number[]} */ values, d = 1) {
  const v = values.filter(Number.isFinite).sort((a, b) => a - b);
  const mean = v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN;
  return {
    n: v.length,
    p50: r(quantile(v, 0.5), d),
    p95: r(quantile(v, 0.95), d),
    p99: r(quantile(v, 0.99), d),
    max: r(v.length ? /** @type {number} */ (v[v.length - 1]) : NaN, d),
    mean: r(mean, d),
  };
}

/** Máximo común divisor de dos marcas (BigInt, ns). */
export function gcd(/** @type {bigint} */ a, /** @type {bigint} */ b) {
  while (b) [a, b] = [b, a % b];
  return a < 0n ? -a : a;
}

/** Debajo de esto (ns) las marcas no están redondeadas: el reloj de la GPU, exacto. */
export const EXACT_NS = 1000n;

/**
 * El redondeo de las marcas: el máximo común divisor de todas las que llegaron (`prev`, el de antes; 0n al empezar).
 * Chrome redondea `timestamp-query` a 100 µs (salvo con `chrome://flags/#enable-webgpu-developer-features`): entonces
 * todas son múltiplos de 100 000 ns y el divisor queda ahí; con el reloj exacto cae enseguida a unos pocos ns. Una vez
 * debajo de [`EXACT_NS`] no se sigue (no puede volver a subir).
 */
export function quantum(/** @type {ArrayLike<bigint>} */ ticks, prev = 0n, max = 12) {
  let g = prev;
  if (g && g < EXACT_NS) return g;
  for (let i = 0, n = 0; i < ticks.length && n < max; i++) {
    const t = /** @type {bigint} */ (ticks[i]);
    if (t <= 0n) continue;
    g = gcd(g, t);
    n++;
  }
  return g;
}

/** El redondeo en µs para el informe: `0` si es exacto (o todavía no se sabe: `null`). */
export const quantumUs = (/** @type {bigint} */ g) => (g === 0n ? null : g < EXACT_NS ? 0 : Number(g) / 1000);

/** Un cuadro de GPU de más que esto (ms) es una lectura sin sentido. */
export const MAX_FRAME_MS = 60000;

/**
 * Holgura (ns) contra el fin del cuadro anterior: en una GPU por mosaicos el primer pase de un cuadro puede empezar un
 * poco antes de que termine el último del anterior.
 */
export const OVERLAP_NS = 2_000_000n;

/**
 * Los ms **sin solapes** de cada intervalo `[b, e]` (ns): en una GPU por mosaicos (los Apple M) los pases se solapan
 * (la marca de comienzo es la del vértice y la de fin la del fragmento: el pase siguiente empieza sus vértices mientras
 * el anterior termina sus fragmentos), así que los ms de cada pase suman más que el cuadro y uno largo puede ser solo
 * espera. Cada instante del cuadro va al pase que corre y termina primero (el que el resto espera para seguir): por
 * orden de fin, cada pase se queda con lo que todavía no es de otro. Con los pases en fila es `e_i − max(b_i,
 * e_{i−1})`. Suman lo que la GPU estuvo ocupada: el cuadro (`span`) menos los huecos.
 * @param {[bigint, bigint][]} spans
 * @returns {number[]} en el orden de `spans`
 */
export function exclusive(spans) {
  const order = spans.map((_, i) => i);
  order.sort((i, j) => {
    const a = /** @type {[bigint, bigint]} */ (spans[i]),
      b = /** @type {[bigint, bigint]} */ (spans[j]);
    return a[1] !== b[1] ? (a[1] < b[1] ? -1 : 1) : a[0] !== b[0] ? (a[0] < b[0] ? -1 : 1) : i - j;
  });
  /** @type {number[]} */
  const out = spans.map(() => 0);
  // lo ya repartido: intervalos disjuntos y en orden (por orden de fin, lo que toca a un pase es siempre el final)
  /** @type {[bigint, bigint][]} */
  const taken = [];
  for (const i of order) {
    const [b, e] = /** @type {[bigint, bigint]} */ (spans[i]);
    let covered = 0n,
      start = b;
    for (let last = taken.at(-1); last && last[1] >= b; last = taken.at(-1)) {
      taken.pop();
      covered += last[1] - (last[0] > b ? last[0] : b);
      if (last[0] < start) start = last[0];
    }
    taken.push([start, e]);
    out[i] = Number(e - b - covered) / 1e6;
  }
  return out;
}

/**
 * Los ms de la GPU de un cuadro con las marcas de sus pases: `ticks[2k]` y `ticks[2k+1]`, el comienzo y el fin del pase
 * con `q = k` (en ns); `after`, el fin del cuadro leído antes (`end`; 0n si no hay). Un pase medido cuyas marcas no
 * sirven no cuenta (`drops` dice cuáles y por qué) y el resto del cuadro sí:
 * - `unwritten`, sin las dos marcas (0: la GPU no las escribió); `reversed`, al revés;
 * - `stale`, viejas: empieza antes del fin del cuadro anterior (con [`OVERLAP_NS`] de holgura). El `GPUQuerySet` es el
 *   mismo en cada cuadro, así que un pase que la GPU se saltea deja en su lugar las marcas del último cuadro que las
 *   escribió;
 * - `outlier`, sin sentido: a [`MAX_FRAME_MS`] o más de la mediana de los comienzos;
 * - `outside`: un pase vacío (sin draws ni dispatches) fuera del tramo de los que tienen trabajo (con [`OVERLAP_NS`] de
 *   holgura a cada lado: uno vacío al final del cuadro empieza cuando termina el último con trabajo).
 * `span` va de la primera marca a la última **de los pases con trabajo**: el Metal de Dawn en los Apple M puede
 * saltearse un pase vacío (por eso cada marca del motor lleva un dispatch: `stats/gpu.rs`), y sus marcas viejas
 * estirarían el cuadro. Los vacíos dentro del tramo se listan. `busy`: la suma de los pases (en una GPU por mosaicos
 * se solapan y puede pasar a `span`); cada pase con trabajo lleva también sus ms sin solapes ([`exclusive`], que suman
 * `span` menos los huecos; los vacíos, 0). `null` si no queda ningún pase con trabajo o el cuadro dura más de
 * [`MAX_FRAME_MS`]. Con el cuadro (`gpu`) van su fin (`end`, el `after` del siguiente) y las marcas usadas (`marks`,
 * para `quantum`).
 * @param {ArrayLike<bigint>} ticks
 * @param {PassRec[]} list
 * @returns {{ gpu: GpuFrame, end: bigint, marks: bigint[] } | null}
 */
export function decodePasses(ticks, list, after = 0n) {
  const far = BigInt(MAX_FRAME_MS) * 1_000_000n;
  /** @type {{ p: PassRec, b: bigint, e: bigint }[]} */
  const written = [];
  /** @type {[string, Drop][]} */
  const drops = [];
  for (const p of list) {
    if (p.q < 0) continue;
    const b = ticks[2 * p.q],
      e = ticks[2 * p.q + 1];
    if (b == null || e == null || b <= 0n || e <= 0n) drops.push([p.l, 'unwritten']);
    else if (e < b) drops.push([p.l, 'reversed']);
    else written.push({ p, b, e });
  }
  const work = written.filter(x => x.p.d + x.p.c > 0);
  // sin ningún pase con trabajo después del fin del anterior, el reloj empezó de nuevo (otro dispositivo): sin piso
  let floor = after > 0n ? after - OVERLAP_NS : 0n;
  if (!work.some(x => x.b >= floor)) floor = 0n;
  const begins = work
    .filter(x => x.b >= floor)
    .map(x => x.b)
    .sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));
  if (!begins.length) return null;
  const mid = /** @type {bigint} */ (begins[(begins.length - 1) >> 1]);
  const near = (/** @type {bigint} */ t) => (t > mid ? t - mid : mid - t) < far;
  /** @type {typeof written} */
  const sane = [];
  for (const x of written)
    if (x.b < floor) drops.push([x.p.l, 'stale']);
    else if (!near(x.b) || !near(x.e)) drops.push([x.p.l, 'outlier']);
    else sane.push(x);
  let lo = 0n,
    hi = 0n;
  for (const { p, b, e } of sane)
    if (p.d + p.c > 0) {
      if (!lo || b < lo) lo = b;
      if (e > hi) hi = e;
    }
  if (!lo) return null;
  /** @type {typeof written} */
  const kept = [];
  for (const x of sane)
    if (x.p.d + x.p.c > 0 || (x.b >= lo - OVERLAP_NS && x.e <= hi + OVERLAP_NS)) kept.push(x);
    else drops.push([x.p.l, 'outside']);
  const withWork = kept.filter(x => x.p.d + x.p.c > 0);
  const excl = exclusive(withWork.map(x => [x.b, x.e]));
  /** @type {[string, number, number][]} */
  const passes = [];
  /** @type {bigint[]} */
  const marks = [];
  let busy = 0;
  for (const x of kept) {
    const ms = Number(x.e - x.b) / 1e6;
    const i = withWork.indexOf(x);
    passes.push([x.p.l, ms, i < 0 ? 0 : /** @type {number} */ (excl[i])]);
    busy += ms;
    marks.push(x.b, x.e);
  }
  const span = Number(hi - lo) / 1e6;
  // SwiftShader tarda segundos por cuadro con la máquina cargada: el tope es para lo que no tiene sentido
  if (!(span >= 0 && span < MAX_FRAME_MS)) return null;
  return { gpu: { span, busy, passes, dropped: drops.length, drops }, end: hi, marks };
}

/**
 * Ms de GPU por grupo de un cuadro medido (los grupos en el orden de [`GROUPS`], `otros` al final): los de cada pase o,
 * con `excl`, los sin solapes (suman el cuadro menos los huecos).
 */
export function groupsOf(/** @type {GpuFrame} */ g, excl = false) {
  /** @type {Record<string, number>} */
  const out = {};
  for (const [label, ms, ex] of g.passes) {
    const k = groupOf(label);
    out[k] = (out[k] ?? 0) + (excl ? ex : ms);
  }
  return out;
}

/**
 * Los pases de un cuadro medido agrupados por etiqueta (el reflejo y el park repiten etiquetas: se suman): `[ms del
 * pase, ms sin solapes]`.
 */
export function byLabel(/** @type {GpuFrame} */ g) {
  /** @type {Map<string, [number, number]>} */
  const m = new Map();
  for (const [label, ms, ex] of g.passes) {
    const v = m.get(label) ?? [0, 0];
    m.set(label, [v[0] + ms, v[1] + ex]);
  }
  return m;
}

/**
 * Los pases descartados de unos cuadros medidos: cuántos, en cuántos cuadros, cuántos por motivo (`why`) y los 6 que
 * más se descartaron (`top`: `[etiqueta, motivo, veces]`).
 */
export function droppedSummary(/** @type {GpuFrame[]} */ gs) {
  /** @type {Record<string, number>} */
  const why = {};
  /** @type {Map<string, [string, Drop, number]>} */
  const by = new Map();
  for (const g of gs)
    for (const [l, k] of g.drops ?? []) {
      why[k] = (why[k] ?? 0) + 1;
      const v = by.get(`${k} ${l}`) ?? [l, k, 0];
      v[2]++;
      by.set(`${k} ${l}`, v);
    }
  return {
    passes: gs.reduce((a, g) => a + g.dropped, 0),
    frames: gs.filter(g => g.dropped > 0).length,
    why,
    top: [...by.values()].sort((a, b) => b[2] - a[2]).slice(0, 6),
  };
}

/** Draw calls por grupo de un cuadro (de su lista de pases). */
export function drawsByGroup(/** @type {PassRec[]} */ list) {
  /** @type {Record<string, number>} */
  const out = {};
  for (const p of list) if (p.d) out[groupOf(p.l)] = (out[groupOf(p.l)] ?? 0) + p.d;
  return out;
}

/** Lo compacto de `park.stats()` para el informe (los mismos nombres; ms con un decimal). */
export function engineBrief(/** @type {any} */ s) {
  if (!s || typeof s !== 'object') return null;
  const gpu = s.gpu ? { totalMs: r(s.gpu.totalMs), passes: (s.gpu.passes ?? []).map(p => [p.name, r(p.ms, 2)]) } : null;
  return {
    fps: r(s.fps),
    frameMs: r(s.frameMs),
    frameMsMax: r(s.frameMsMax),
    cpuMs: s.cpuMs ? { main: r(s.cpuMs.main), render: r(s.cpuMs.render), stats: r(s.cpuMs.stats, 2) } : null,
    drawCalls: s.drawCalls,
    drawCallsCached: s.drawCallsCached,
    triangles: s.triangles,
    trianglesCached: s.trianglesCached,
    drawsMain: s.drawsMain,
    drawsShadow: s.drawsShadow,
    gpu,
    gpuTimestamps: s.gpuTimestamps,
    gpuReadings: s.gpuReadings,
    gpuRejected: s.gpuRejected,
    renderScale: r(s.renderScale, 4),
    renderScaleAuto: s.renderScaleAuto,
    renderPx: s.renderPx,
    upscaler: s.upscaler ?? null,
    lights: s.lights ?? null,
    shadowCache: s.shadowCache ?? null,
    // la parte de la gente (docs/PERF.md, «La gente en el navegador»): personas, mallas, huesos y sus lotes
    people: s.people ?? null,
  };
}

/** Columnas de la línea de tiempo (una fila por medio segundo) y de la serie por cuadro (solo en el archivo). */
export const TIMELINE = /** @type {const} */ ([
  't',
  'fps',
  'p95',
  'max',
  'cpu',
  'gpu',
  'draws',
  'tris',
  'sv',
  'cams',
  'pipes',
  'texKB',
  'scale',
  'x',
  'y',
  'z',
  'view',
]);
export const SERIES = /** @type {const} */ ([
  't',
  'dt',
  'dur',
  'cpu',
  'gpu',
  'draws',
  'tris',
  'passes',
  'sv',
  'cams',
  'pipes',
  'texKB',
]);

/**
 * Una muestra del medio segundo: `park.stats()` y la cámara, al momento.
 * @typedef {{ t: number, stats: any, pos: number[] | null, view: string | null, mode: string | null }} Snapshot
 */

/**
 * El informe de una grabación. `frames`: los cuadros de la grabación (en orden); `snaps`: las muestras de cada medio
 * segundo; `env`: lo de la página (navegador, GPU, pantalla, nave); `timer`: el estado de las marcas por pase. Da
 * `{ brief, full }`: `brief` va al portapapeles (sin la serie por cuadro, unos KB); `full`, al archivo (con todo).
 * @param {{ frames: Frame[], snaps: Snapshot[], env: Record<string, unknown>, timer: Record<string, unknown>,
 *   startedAt: number, durationMs: number, worst?: number }} o
 */
export function buildReport({ frames, snaps, env, timer, startedAt, durationMs, worst = 8 }) {
  // el tiempo de cada cuadro es su `dur` (hasta el siguiente: ver linkDrawn); el último, si el siguiente no llegó, no
  // cuenta
  const drawn = frames.filter(f => f.drawn && f.dur > 0);
  const dts = drawn.map(f => f.dur);
  const timed = drawn.filter(f => f.gpu);
  // los cuadros por segundo de lo grabado: cuadros / tiempo que cubren sus intervalos
  const spanMs = dts.reduce((a, b) => a + b, 0);
  const fps = drawn.length && spanMs > 0 ? (drawn.length * 1000) / spanMs : NaN;
  // la escala de cada cuadro: la última muestra de park.stats() antes de él
  const scaleAt = (/** @type {number} */ at) => {
    let s = null;
    for (const x of snaps) if (x.t <= at && typeof x.stats?.renderScale === 'number') s = x.stats.renderScale;
    return s;
  };
  // la cámara y la vista de un cuadro: la primera muestra después de que empezó (la cámara de la muestra es la del
  // último cuadro dibujado), o la última si no hay
  /** @returns {any} */
  const after = (/** @type {number} */ at, /** @type {'pos' | 'view'} */ key) => {
    let v = null;
    for (const x of snaps) {
      if (x[key] == null) continue;
      v = x[key];
      if (x.t >= at) break;
    }
    return v;
  };
  const posAt = (/** @type {number} */ at) => after(at, 'pos');
  const viewAt = (/** @type {number} */ at) => after(at, 'view');

  // ms de GPU por grupo y por etiqueta, en los cuadros medidos: los de cada pase y los sin solapes (exclusive)
  /** @type {Map<string, [number[], number[]]>} */
  const groupMs = new Map();
  /** @type {Map<string, [number[], number[]]>} */
  const labelMs = new Map();
  for (const f of timed) {
    const g = /** @type {GpuFrame} */ (f.gpu);
    const inc = groupsOf(g),
      exc = groupsOf(g, true);
    for (const [k] of [...GROUPS, ['otros']]) {
      if (!groupMs.has(k)) groupMs.set(k, [[], []]);
      const [a, b] = /** @type {[number[], number[]]} */ (groupMs.get(k));
      a.push(inc[k] ?? 0);
      b.push(exc[k] ?? 0);
    }
    for (const [l, [ms, ex]] of byLabel(g)) {
      if (!labelMs.has(l)) labelMs.set(l, [[], []]);
      const [a, b] = /** @type {[number[], number[]]} */ (labelMs.get(l));
      a.push(ms);
      b.push(ex);
    }
  }
  const stat3 = (/** @type {number[]} */ v) => {
    const s = summary(v, 2);
    return { mean: s.mean, p95: s.p95, max: s.max };
  };
  /** @type {Record<string, {mean: number|null, p95: number|null, max: number|null, excl: object}>} */
  const groups = {};
  for (const [k, [v, ex]] of groupMs) if (summary(v, 2).max) groups[k] = { ...stat3(v), excl: stat3(ex) };
  // los pases que no corren en cada cuadro (las marcas del motor, una caché que se guarda) promedian sobre los cuadros
  // medidos; van por sus ms sin solapes (lo que suma al cuadro)
  const perFrame = (/** @type {number[]} */ v) => r(v.reduce((a, b) => a + b, 0) / Math.max(1, timed.length), 2);
  const labels = [...labelMs]
    .map(([l, [v, ex]]) => {
      const s = summary(v, 2);
      return { l, n: v.length, excl: perFrame(ex), mean: perFrame(v), p95: s.p95, max: s.max };
    })
    .sort((a, b) => (b.excl ?? 0) - (a.excl ?? 0) || (b.mean ?? 0) - (a.mean ?? 0));

  const rounded = (/** @type {Record<string, number>} */ o) =>
    Object.fromEntries(Object.entries(o).map(([k, v]) => [k, r(v, 2)]));
  // el cuadro dibujado de antes: con la GPU atrasada, la espera que causa un cuadro cae en el intervalo del siguiente
  // (Chrome no da otro rAF mientras la GPU no suelta los cuadros de antes)
  const prevOf = new Map(drawn.map((f, i) => [f, i > 0 ? /** @type {Frame} */ (drawn[i - 1]) : null]));
  const one = (/** @type {Frame} */ f) => {
    const g = f.gpu;
    const p = prevOf.get(f);
    // los pases que más pesan en el cuadro (sin solapes), con sus ms de pase al lado
    const top = g
      ? [...byLabel(g)]
          .sort((a, b) => b[1][1] - a[1][1] || b[1][0] - a[1][0])
          .slice(0, 6)
          .map(([l, [ms, ex]]) => [l, r(ms, 2), r(ex, 2)])
      : null;
    const exSum = g ? g.passes.reduce((a, p) => a + p[2], 0) : 0;
    return {
      t: r(f.at - startedAt, 0),
      dur: r(f.dur),
      cpu: r(f.cpu),
      gpu: g ? r(g.span) : null,
      busy: g ? r(g.busy) : null,
      // el tiempo en que la GPU no hizo nada entre la primera marca y la última (el cuadro menos los ms sin solapes)
      idle: g ? r(g.span - exSum) : null,
      dropped: g ? g.dropped : null,
      groups: g ? rounded(groupsOf(g)) : null,
      excl: g ? rounded(groupsOf(g, true)) : null,
      top,
      draws: f.draws,
      drawsBy: drawsByGroup(f.list),
      tris: f.tris,
      passes: f.passes,
      sv: f.shadow,
      cams: f.cams,
      pipes: f.pipes,
      texUp: f.texUp,
      texKB: r(f.texBytes / 1024, 0),
      bufKB: r(f.bufBytes / 1024, 0),
      scale: scaleAt(f.at),
      pos: posAt(f.at),
      view: viewAt(f.at),
      prev: p ? { dur: r(p.dur), cpu: r(p.cpu), gpu: p.gpu ? r(p.gpu.span) : null, pipes: p.pipes } : null,
    };
  };
  const worstFrames = [...drawn]
    .sort((a, b) => b.dur - a.dur)
    .slice(0, worst)
    .map(one);

  // la línea de tiempo: de a medio segundo desde que empezó
  const rows = [];
  for (let w = 0; w < durationMs; w += 500) {
    const fr = drawn.filter(f => f.at - startedAt >= w && f.at - startedAt < w + 500);
    if (!fr.length) continue;
    const d = fr.map(f => f.dur).sort((a, b) => a - b);
    const mean = (/** @type {(f: Frame) => number} */ k) => fr.reduce((a, f) => a + k(f), 0) / fr.length;
    const gp = fr.filter(f => f.gpu).map(f => /** @type {GpuFrame} */ (f.gpu).span);
    const mid = startedAt + w + 250;
    const pos = posAt(mid);
    rows.push([
      w,
      r(1000 / mean(f => f.dur)),
      r(quantile(d, 0.95)),
      r(/** @type {number} */ (d[d.length - 1])),
      r(mean(f => f.cpu)),
      gp.length ? r(gp.reduce((a, b) => a + b, 0) / gp.length) : null,
      Math.round(mean(f => f.draws)),
      r(mean(f => f.tris) / 1e6, 2),
      r(mean(f => f.shadow)),
      Math.max(...fr.map(f => f.cams)),
      fr.reduce((a, f) => a + f.pipes, 0),
      r(fr.reduce((a, f) => a + f.texBytes, 0) / 1024, 0),
      scaleAt(mid),
      pos ? r(/** @type {number} */ (pos[0])) : null,
      pos ? r(/** @type {number} */ (pos[1])) : null,
      pos ? r(/** @type {number} */ (pos[2])) : null,
      viewAt(mid),
    ]);
  }

  // la escala de render a lo largo de la grabación (la elige el gobernador del motor)
  const scales = snaps.filter(s => typeof s.stats?.renderScale === 'number');
  /** @type {[number, number][]} */
  const changes = [];
  for (const s of scales)
    if (!changes.length || changes[changes.length - 1][1] !== s.stats.renderScale)
      changes.push([r(s.t - startedAt, 0) ?? 0, s.stats.renderScale]);
  const sMin = scales.length ? Math.min(...scales.map(s => s.stats.renderScale)) : null;
  // con qué se subió la imagen mientras la escala estuvo por debajo de 1 (`'fsr'` o `'browser'`; `'none'` si no bajó)
  const below = scales.filter(s => s.stats.renderScale < 1);
  const upscaler = below.length ? (below[below.length - 1].stats.upscaler ?? null) : 'none';
  const eng = snaps.map(s => s.stats).filter(s => s && typeof s === 'object');
  const avg = (/** @type {(s: any) => number | undefined} */ k) => {
    const v = eng.map(k).filter(x => typeof x === 'number' && Number.isFinite(x));
    return v.length ? r(v.reduce((a, b) => a + b, 0) / v.length) : null;
  };
  const sum = (/** @type {(f: Frame) => number} */ k) => frames.reduce((a, f) => a + k(f), 0);
  const brief = {
    kind: 'park3d-fps',
    v: 1,
    ...env,
    timer,
    durationMs: r(durationMs, 0),
    frames: drawn.length,
    fps: r(fps),
    frameMs: summary(dts),
    over20ms: dts.filter(d => d > 20).length,
    over33ms: dts.filter(d => d > 100 / 3).length,
    cpuMs: summary(drawn.map(f => f.cpu)),
    gpuMs: timed.length ? summary(timed.map(f => /** @type {GpuFrame} */ (f.gpu).span)) : null,
    gpuBusyMs: timed.length ? summary(timed.map(f => /** @type {GpuFrame} */ (f.gpu).busy)) : null,
    // los pases medidos cuyas marcas no sirvieron (decodePasses): cuántos, en cuántos cuadros, por qué y los que más
    gpuDropped: timed.length ? droppedSummary(timed.map(f => /** @type {GpuFrame} */ (f.gpu))) : null,
    gpuGroups: timed.length ? groups : null,
    gpuPasses: timed.length ? labels.slice(0, 16) : null,
    counts: {
      draws: summary(
        drawn.map(f => f.draws),
        0,
      ),
      tris: summary(
        drawn.map(f => f.tris),
        0,
      ),
      passes: summary(
        drawn.map(f => f.passes),
        0,
      ),
      shadowViews: summary(
        drawn.map(f => f.shadow),
        0,
      ),
      cams: summary(
        drawn.map(f => f.cams),
        0,
      ),
      pipelines: sum(f => f.pipes),
      texUploads: sum(f => f.texUp),
      texKB: r(sum(f => f.texBytes) / 1024, 0),
      bufMB: r(sum(f => f.bufBytes) / 1048576, 1),
    },
    renderScale: scales.length
      ? {
          start: scales[0].stats.renderScale,
          end: scales[scales.length - 1].stats.renderScale,
          min: sMin,
          changes,
          upscaler,
        }
      : null,
    engine: {
      cpuMain: avg(s => s.cpuMs?.main),
      cpuRender: avg(s => s.cpuMs?.render),
      gpuTotal: avg(s => s.gpu?.totalMs),
      drawCalls: avg(s => s.drawCalls),
      drawCallsCached: avg(s => s.drawCallsCached),
      last: engineBrief(eng[eng.length - 1]),
    },
    worst: worstFrames,
    timeline: { cols: TIMELINE, rows },
  };
  const full = {
    ...brief,
    gpuPasses: timed.length ? labels : null,
    series: {
      cols: SERIES,
      rows: frames.map(f => [
        r(f.at - startedAt, 1),
        r(f.dt),
        r(f.dur),
        r(f.cpu),
        f.gpu ? r(f.gpu.span) : null,
        f.draws,
        f.tris,
        f.passes,
        f.shadow,
        f.cams,
        f.pipes,
        r(f.texBytes / 1024, 0),
      ]),
    },
    snapshots: snaps.map(s => ({
      t: r(s.t - startedAt, 0),
      pos: s.pos,
      view: s.view,
      mode: s.mode,
      stats: engineBrief(s.stats),
    })),
  };
  return { brief, full };
}
