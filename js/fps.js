// Medidor de `sim.html?fps=1`: para comprobar en el Mac que el visor pasa los 50 cuadros por segundo (calidad ultra) y,
// si no, saber por qué. Dos veces por segundo, sobre los últimos 2 s:
// - cuadros por segundo del motor y ms entre cuadros (p50, p95, máximo): un cuadro que llega a pantalla pide una vez
//   la textura del lienzo (`GPUCanvasContext.getCurrentTexture`); el intervalo es el de los instantes de su
//   `requestAnimationFrame` (el del vsync);
// - CPU del hilo principal por cuadro (media y máximo): lo que tardan los callbacks de `requestAnimationFrame`,
//   sumados por cuadro. El motor (Bevy sobre winit) corre su `App::update` y arma los comandos de la GPU dentro del
//   suyo, así que es su cuadro de CPU más lo poco de la página (las etiquetas);
// - la GPU **por pase y en cada cuadro**: si el dispositivo tiene `timestamp-query`, a cada pase de render y de cómputo
//   que arma el motor se le agregan marcas de comienzo y fin (`timestampWrites`, con un QuerySet propio); al empezar el
//   cuadro siguiente se resuelven y se leen sin esperar a la GPU. Dice si Chrome las redondea (a 100 µs salvo con
//   `chrome://flags/#enable-webgpu-developer-features`: el máximo común divisor de las marcas) o si no las hay
//   (entonces quedan los tramos del motor, `park.stats().gpu`, de un cuadro de cada 15). `?fps=1&gpuPasses=0` no
//   agrega marcas;
// - lo que se manda a la GPU, contado en las llamadas de WebGPU (después del recorte por la vista): draw calls y
//   triángulos, pases, vistas de sombra (un pase de sombra cada una), cámaras 3D (un pase principal opaco cada una: la
//   del park y la del reflejo de los espejos), pipelines creados y texturas subidas; y lo que dice el motor
//   (`park.stats()`): su CPU por mundo, la cuenta de draw calls antes del recorte, las luces del cúmulo, la caché de
//   sombras y la escala de render (la resolución interna que elige el gobernador para sostener los 50 fps).
// «Grabar 30 s» junta cada cuadro (intervalo, CPU, GPU por pase, cuentas) y una muestra de `park.stats()` y de la
// cámara cada medio segundo, y al terminar copia al portapapeles un informe en JSON (fps-report.js: p50/p95/p99 del
// cuadro, los peores cuadros con sus pases, la línea de tiempo) y ofrece el archivo entero (con la serie por cuadro).
// `instrument()` va antes de createPark (envuelve lo que el motor llama desde que arranca); `showFps(park)`, después.
// `window.__fps` tiene los últimos números, `window.__fpsRecord(ms)` graba (y resuelve con el informe) y
// `window.__fpsReport` es el último informe (para ui-check, fps-check y la consola).
import {
  EXACT_NS,
  GROUPS,
  buildReport,
  decodePasses,
  engineBrief,
  groupsOf,
  isMainOpaque,
  linkDrawn,
  isShadow,
  quantum,
  quantumUs,
} from './fps-report.js';

/** @typedef {import('./fps-report.js').Frame} Frame */
/** @typedef {import('./fps-report.js').PassRec} PassRec */

const now = () => performance.now();
const q = new URLSearchParams(location.search);
/** La ventana de los números (ms). */
const WINDOW = 2000;
/**
 * Lo que dura «Grabar»: 30 s, lo que lleva entrar a pie desde `calle` (la puerta queda a ~10 m: 6–8 s a 1,6 m/s, con
 * el clic en «A pie») y ver al gobernador bajar (1 s de ventanas lentas y 1,5 s de espera por cambio) y empezar a
 * subir (de ×0,5 a ×1 son 8 pasos de ≥ 3,5 s: ≥ 28 s). `?fpsRec=<s>` otro: 60 para verlo volver entero; con
 * SwiftShader, que da un cuadro cada varios segundos, más.
 */
const REC_MS = Math.max(1, Math.min(600, Number(q.get('fpsRec')) || 30)) * 1000;
/** Marcas por pase (`?gpuPasses=0`: no). */
const PASS_TIMING = q.get('gpuPasses') !== '0';
const frames = { gpu: 0, raf: 0 };

/** @returns {Frame & { k: number, buf: GPUBuffer | null, newTex: number, newBuf: number }} */
const newFrame = (/** @type {number} */ t) => ({
  t,
  at: now(),
  dt: 0,
  dur: 0,
  cpu: 0,
  drawn: false,
  draws: 0,
  tris: 0,
  passes: 0,
  shadow: 0,
  shadowDraws: 0,
  shadowTris: 0,
  cams: 0,
  pipes: 0,
  texUp: 0,
  texBytes: 0,
  bufBytes: 0,
  newTex: 0,
  newBuf: 0,
  list: [],
  gpu: null,
  k: 0,
  buf: null,
});
/** El cuadro abierto (el del último rAF) y los cerrados de los últimos segundos. */
let cur = /** @type {ReturnType<typeof newFrame> | null} */ (null);
/** @type {Frame[]} */
const recent = [];
let frameT = -1;
/** El último cuadro que llegó a pantalla. */
let lastDrawn = /** @type {Frame | null} */ (null);
/** El pase abierto (los de un encoder no se cruzan: se arman de a uno en el hilo de wasm). */
let pass = /** @type {PassRec | null} */ (null),
  inShadow = false;
/** La grabación en curso. */
let rec =
  /** @type {null | { start: number, until: number, ms: number, frames: Frame[], snaps: import('./fps-report.js').Snapshot[], done: (r: unknown) => void, promise: Promise<unknown> }} */ (
    null
  );

/** El reloj por pase: el QuerySet, el búfer donde se resuelve y los de lectura libres. */
const T = {
  dev: /** @type {GPUDevice | null} */ (null),
  qs: /** @type {GPUQuerySet | null} */ (null),
  res: /** @type {GPUBuffer | null} */ (null),
  /** @type {GPUBuffer[]} */
  pool: [],
  /** Pases medidos por cuadro como mucho (el resto, sin marcas). */
  cap: 160,
  ready: false,
  why: '',
  /** El redondeo de las marcas (`quantum`), las lecturas usadas y descartadas, las que faltan y los errores. */
  q: 0n,
  readings: 0,
  rejected: 0,
  pending: 0,
  errors: 0,
  /** Los pases descartados de las lecturas usadas (`decodePasses`) y por qué, y el fin y el rAF de la última lectura. */
  dropped: 0,
  /** @type {Record<string, number>} */
  dropWhy: {},
  lastEnd: 0n,
  lastT: -1,
};
/** Las funciones de WebGPU originales (para lo que llama el medidor sin contarse a sí mismo). */
const W = /** @type {Record<string, Function>} */ ({});

/** Crea el reloj por pase con el dispositivo del motor (el primero que arma un encoder). */
function timerFor(/** @type {GPUDevice} */ dev) {
  if (T.dev) return;
  T.dev = dev;
  if (!PASS_TIMING) return void (T.why = 'apagado con ?gpuPasses=0');
  if (!dev.features?.has('timestamp-query')) return void (T.why = 'el dispositivo no tiene timestamp-query');
  try {
    const usage = GPUBufferUsage;
    T.qs = dev.createQuerySet({ label: 'fps.js', type: 'timestamp', count: 2 * T.cap });
    const mk = (/** @type {number} */ u) => W.createBuffer.call(dev, { label: 'fps.js', size: 16 * T.cap, usage: u });
    T.res = mk(usage.QUERY_RESOLVE | usage.COPY_SRC);
    for (let i = 0; i < 8; i++) T.pool.push(mk(usage.MAP_READ | usage.COPY_DST));
    // una marca mal puesta es un error de validación: entonces no se ponen más (el motor sigue como siempre)
    dev.addEventListener('uncapturederror', e => {
      const msg = String(/** @type {GPUUncapturedErrorEvent} */ (e).error?.message ?? '');
      if (/fps\.js|timestamp|query ?set/i.test(msg)) {
        T.errors++;
        T.ready = false;
        T.why = `apagado: WebGPU rechazó las marcas (${msg.slice(0, 120)})`;
      }
    });
    T.ready = true;
  } catch (e) {
    T.why = `no se pudo armar (${String(/** @type {Error} */ (e)?.message ?? e)})`;
  }
}

/** Resuelve las marcas del cuadro `f` (ya entregado) y las lee cuando el mapeo termine. */
function resolveTimes(/** @type {ReturnType<typeof newFrame>} */ f) {
  const buf = f.buf;
  f.buf = null;
  if (!buf) return;
  if (!f.k || !T.ready || !T.dev || !T.qs || !T.res) return void T.pool.push(buf);
  const bytes = 16 * f.k;
  try {
    const enc = W.createCommandEncoder.call(T.dev, { label: 'fps.js' });
    enc.resolveQuerySet(T.qs, 0, 2 * f.k, T.res, 0);
    enc.copyBufferToBuffer(T.res, 0, buf, 0, bytes);
    T.dev.queue.submit([enc.finish()]);
  } catch {
    T.rejected++;
    return void T.pool.push(buf);
  }
  T.pending++;
  buf
    .mapAsync(GPUMapMode.READ, 0, bytes)
    .then(() => {
      const ticks = new BigInt64Array(buf.getMappedRange(0, bytes).slice(0));
      // las lecturas llegan en el orden de los cuadros; si una llegara antes que la de un cuadro anterior, ese va sin
      // el fin del anterior (las marcas viejas igual quedan fuera del tramo de los pases con trabajo)
      const newer = f.t > T.lastT;
      const d = decodePasses(ticks, f.list, newer ? T.lastEnd : 0n);
      if (d) {
        f.gpu = d.gpu;
        T.q = quantum(d.marks, T.q);
        T.dropped += d.gpu.dropped;
        for (const [, k] of d.gpu.drops) T.dropWhy[k] = (T.dropWhy[k] ?? 0) + 1;
        if (newer) [T.lastEnd, T.lastT] = [d.end, f.t];
        T.readings++;
      } else T.rejected++;
    })
    .catch(() => T.rejected++)
    .finally(() => {
      if (buf.mapState === 'mapped') buf.unmap();
      T.pool.push(buf);
      T.pending--;
    });
}

/**
 * El cuadro `f` llega a pantalla (su primer `getCurrentTexture`): su intervalo desde el dibujado anterior y el de aquel
 * hasta este (`dur`, lo que tardó: [`linkDrawn`]). Pasa durante los callbacks de `f`, así el último cuadro de una
 * grabación tiene su `dur` apenas empieza el siguiente.
 */
function markDrawn(/** @type {Frame} */ f) {
  if (f.drawn) return;
  f.drawn = true;
  linkDrawn(f, lastDrawn);
  lastDrawn = f;
}

/** Cierra el cuadro abierto: a la ventana y a la grabación, y sus marcas a resolver. */
function closeFrame(/** @type {ReturnType<typeof newFrame>} */ f) {
  recent.push(f);
  const old = now() - WINDOW - 1000;
  while (recent.length > 2 && (/** @type {Frame} */ (recent[0]).at < old || recent.length > 1500)) recent.shift();
  if (rec && f.at >= rec.start && f.at < rec.until) rec.frames.push(f);
  resolveTimes(f);
}

/** Envuelve `name` de `proto` (si existe) con `make(original)` y guarda la original. */
function wrap(/** @type {any} */ proto, /** @type {string} */ name, /** @type {(f: Function) => Function} */ make) {
  const f = proto?.[name];
  if (typeof f !== 'function') return;
  W[name] ??= f;
  proto[name] = make(f);
}

/** Lo que cuenta de cada llamada de WebGPU (ver arriba). Sin WebGPU, nada. */
function instrumentGpu() {
  if (!globalThis.GPUDevice) return;
  const dev = GPUDevice.prototype,
    enc = GPUCommandEncoder.prototype,
    rp = GPURenderPassEncoder.prototype,
    cp = GPUComputePassEncoder.prototype,
    queue = GPUQueue.prototype;
  wrap(
    dev,
    'createCommandEncoder',
    f =>
      function (/** @type {any} */ d) {
        if (!T.dev) timerFor(this);
        return f.call(this, d);
      },
  );
  /** Un pase nuevo: lo anota y, si este cuadro se mide, le agrega sus marcas. */
  const begin = (/** @type {Function} */ f, /** @type {boolean} */ render) =>
    function (/** @type {any} */ d) {
      const label = String(d?.label || (render ? '(pase sin etiqueta)' : '(cómputo sin etiqueta)'));
      /** @type {PassRec} */
      const p = { l: label, d: 0, c: 0, q: -1 };
      let desc = d;
      if (cur?.buf && T.ready && d?.timestampWrites == null && cur.k < T.cap) {
        p.q = cur.k++;
        desc = Object.assign({}, d, {
          timestampWrites: { querySet: T.qs, beginningOfPassWriteIndex: 2 * p.q, endOfPassWriteIndex: 2 * p.q + 1 },
        });
      }
      const out = f.call(this, desc);
      if (cur) {
        cur.list.push(p);
        cur.passes++;
        if (isShadow(label)) cur.shadow++;
        if (isMainOpaque(label)) cur.cams++;
      }
      pass = p;
      inShadow = render && isShadow(label);
      return out;
    };
  wrap(enc, 'beginRenderPass', f => begin(f, true));
  wrap(enc, 'beginComputePass', f => begin(f, false));
  const end = (/** @type {Function} */ f) =>
    function () {
      pass = null;
      inShadow = false;
      return f.call(this);
    };
  wrap(rp, 'end', end);
  wrap(cp, 'end', end);
  // los draw directos (triángulos de una lista: la topología de las mallas de Bevy) y los indirectos (sin triángulos)
  const draw = (/** @type {Function} */ f) =>
    function (
      /** @type {number} */ n,
      /** @type {number | undefined} */ i,
      /** @type {any} */ a,
      /** @type {any} */ b,
      /** @type {any} */ c,
    ) {
      if (cur) {
        const t = (n / 3) * (i ?? 1);
        cur.draws++;
        cur.tris += t;
        if (pass) pass.d++;
        if (inShadow) {
          cur.shadowDraws++;
          cur.shadowTris += t;
        }
      }
      return f.call(this, n, i, a, b, c);
    };
  wrap(rp, 'draw', draw);
  wrap(rp, 'drawIndexed', draw);
  const indirect = (/** @type {Function} */ f) =>
    function (/** @type {any} */ b, /** @type {number} */ o) {
      if (cur) {
        cur.draws++;
        if (pass) pass.d++;
        if (inShadow) cur.shadowDraws++;
      }
      return f.call(this, b, o);
    };
  wrap(rp, 'drawIndirect', indirect);
  wrap(rp, 'drawIndexedIndirect', indirect);
  // los dispatch: un pase de cómputo con trabajo (uno vacío puede no llegar a la GPU y quedarse con marcas viejas)
  const dispatch = (/** @type {Function} */ f) =>
    function (/** @type {any} */ a, /** @type {any} */ b, /** @type {any} */ c) {
      if (pass) pass.c++;
      return f.call(this, a, b, c);
    };
  wrap(cp, 'dispatchWorkgroups', dispatch);
  wrap(cp, 'dispatchWorkgroupsIndirect', dispatch);
  for (const name of [
    'createRenderPipeline',
    'createRenderPipelineAsync',
    'createComputePipeline',
    'createComputePipelineAsync',
  ])
    wrap(
      dev,
      name,
      f =>
        function (/** @type {any} */ d) {
          if (cur) cur.pipes++;
          return f.call(this, d);
        },
    );
  wrap(
    dev,
    'createTexture',
    f =>
      function (/** @type {any} */ d) {
        if (cur) cur.newTex++;
        return f.call(this, d);
      },
  );
  wrap(
    dev,
    'createBuffer',
    f =>
      function (/** @type {any} */ d) {
        if (cur) cur.newBuf++;
        return f.call(this, d);
      },
  );
  wrap(
    queue,
    'writeTexture',
    f =>
      function (/** @type {any} */ dst, /** @type {any} */ data, /** @type {any} */ layout, /** @type {any} */ size) {
        if (cur) {
          cur.texUp++;
          cur.texBytes += data?.byteLength ?? 0;
        }
        return f.call(this, dst, data, layout, size);
      },
  );
  wrap(
    queue,
    'copyExternalImageToTexture',
    f =>
      function (/** @type {any} */ src, /** @type {any} */ dst, /** @type {any} */ size) {
        if (cur) {
          cur.texUp++;
          const [w, h] = Array.isArray(size) ? size : [size?.width ?? 0, size?.height ?? 1];
          cur.texBytes += 4 * w * h;
        }
        return f.call(this, src, dst, size);
      },
  );
  wrap(
    queue,
    'writeBuffer',
    f =>
      function (
        /** @type {any} */ b,
        /** @type {number} */ o,
        /** @type {any} */ data,
        /** @type {any} */ off,
        /** @type {any} */ size,
      ) {
        if (cur) cur.bufBytes += size != null ? size * (data?.BYTES_PER_ELEMENT ?? 1) : (data?.byteLength ?? 0);
        return f.call(this, b, o, data, off, size);
      },
  );
}

/** Envuelve getCurrentTexture, requestAnimationFrame y WebGPU. Llamar una vez, antes de crear el park. */
export function instrument() {
  const ctx = globalThis.GPUCanvasContext?.prototype;
  const get = ctx?.getCurrentTexture;
  if (ctx && get)
    ctx.getCurrentTexture = function () {
      frames.gpu++;
      if (cur) markDrawn(cur);
      return get.call(this);
    };
  instrumentGpu();
  const raf = window.requestAnimationFrame.bind(window);
  // los callbacks de un mismo cuadro reciben el mismo instante: el primero de un instante nuevo cierra el cuadro
  // anterior (ya entregado a la GPU) y abre otro; cada uno suma su CPU
  window.requestAnimationFrame = cb =>
    raf(t => {
      if (t !== frameT) {
        if (cur) closeFrame(cur);
        frameT = t;
        cur = newFrame(t);
        frames.raf++;
        if (!ctx || !get) markDrawn(cur); // sin getCurrentTexture envuelto (otro navegador), los cuadros de la página
        if (T.ready) cur.buf = T.pool.pop() ?? null;
      }
      const f = cur;
      const s = now();
      try {
        cb(t);
      } finally {
        f.cpu += now() - s;
      }
    });
}

const fmt = (/** @type {number} */ n, d = 1) => (Number.isFinite(n) ? n.toFixed(d) : '–');
const mean = (/** @type {number[]} */ v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
const pct = (/** @type {number[]} */ v, /** @type {number} */ p) => {
  const s = [...v].sort((a, b) => a - b);
  return s.length ? /** @type {number} */ (s[Math.min(s.length - 1, Math.ceil(p * s.length) - 1)]) : NaN;
};
const mega = (/** @type {number} */ n) =>
  n >= 1e6 ? `${fmt(n / 1e6, 2)} M` : n >= 1e3 ? `${fmt(n / 1e3, 0)} k` : fmt(n, 0);

/** El redondeo de las marcas, en palabras (`g`: el de `quantum`). */
const rounding = (/** @type {bigint} */ g) =>
  g === 0n ? '' : g < EXACT_NS ? 'exactas' : `redondeadas a ${fmt(Number(g) / 1000, 0)} µs`;

/** El recuadro con los números, arriba a la izquierda (sigue visible en el cine), y «Grabar 30 s». */
export function showFps(/** @type {any} */ park, /** @type {HTMLCanvasElement} */ canvas) {
  const box = document.createElement('div');
  box.id = 'fps';
  const text = document.createElement('pre');
  const bar = document.createElement('div');
  bar.className = 'fps-bar';
  const recBtn = Object.assign(document.createElement('button'), {
    id: 'fpsRec',
    type: 'button',
    textContent: `Grabar ${REC_MS / 1000} s`,
  });
  const msg = Object.assign(document.createElement('span'), { id: 'fpsMsg' });
  const copyBtn = Object.assign(document.createElement('button'), {
    id: 'fpsCopy',
    type: 'button',
    textContent: 'Copiar',
    hidden: true,
  });
  const dl = Object.assign(document.createElement('a'), { id: 'fpsDl', textContent: 'Descargar', hidden: true });
  bar.append(recBtn, msg, copyBtn, dl);
  box.append(text, bar);
  document.body.appendChild(box);

  /** @type {null | Record<string, unknown>} */
  let adapter = null;
  let tsq = /** @type {boolean | null} */ (null);
  navigator.gpu
    ?.requestAdapter()
    .then(a => {
      tsq = !!a?.features.has('timestamp-query');
      const i = /** @type {any} */ (a)?.info;
      if (i) adapter = { vendor: i.vendor, architecture: i.architecture, device: i.device, description: i.description };
    })
    .catch(() => {});
  let engine = /** @type {any} */ (null); // lo último de park.stats(), si existe
  let engineQ = 0n; // el redondeo de los tramos del motor (sin marcas propias)
  let engineReadings = -1;
  const read = () => {
    if (typeof park.stats !== 'function') return;
    try {
      const r = park.stats();
      if (r && typeof r.then === 'function')
        r.then(
          (/** @type {any} */ v) => (engine = v),
          () => {},
        );
      else engine = r;
    } catch (e) {
      engine = { error: String(/** @type {Error} */ (e)?.message ?? e) };
    }
    if (engine?.gpu?.passes && engine.gpuReadings !== engineReadings) {
      engineReadings = engine.gpuReadings;
      engineQ = quantum(
        engine.gpu.passes.map((/** @type {{ms: number}} */ p) => BigInt(Math.round(p.ms * 1e6))),
        engineQ,
      );
    }
  };
  const camera = () => {
    const p = park.cameraState?.position;
    return p ? [0, 1, 2].map(i => Math.round(p[i] * 100) / 100) : null;
  };
  const snap = () => {
    if (!rec) return;
    rec.snaps.push({ t: now(), stats: engine, pos: camera(), view: park.view?.name ?? null, mode: park.mode ?? null });
  };
  const env = () => ({
    at: new Date().toISOString(),
    nave: q.get('id'),
    url: location.pathname + location.search,
    ua: navigator.userAgent,
    adapter,
    dpr: devicePixelRatio,
    css: [innerWidth, innerHeight],
    canvas: [canvas.width, canvas.height],
    screen: [screen.width, screen.height],
  });
  const timer = () => ({
    timestampQuery: tsq,
    perPass: T.ready,
    why: T.why || null,
    quantumUs: quantumUs(T.q),
    readings: T.readings,
    rejected: T.rejected,
    dropped: T.dropped,
    droppedWhy: { ...T.dropWhy },
    errors: T.errors,
    engineQuantumUs: quantumUs(engineQ),
    engineTimestamps: engine?.gpuTimestamps ?? null,
  });

  /** @type {null | { brief: object, full: object, text: string, url: string, name: string }} */
  let last = null;
  const copy = async () => {
    if (!last) return false;
    try {
      await navigator.clipboard.writeText(last.text);
      msg.textContent = `informe copiado (${fmt(last.text.length / 1024, 1)} KB)`;
      return true;
    } catch {
      msg.textContent = 'no se pudo copiar solo: «Copiar»';
      return false;
    }
  };
  copyBtn.onclick = () => void copy();

  /** Graba `ms` (por defecto [`REC_MS`]) y resuelve con el informe. */
  const record = (ms = REC_MS) => {
    if (rec) return rec.promise;
    const start = now();
    /** @type {(r: unknown) => void} */
    let done = () => {};
    const promise = new Promise(r => (done = r));
    rec = { start, until: start + ms, ms, frames: [], snaps: [], done, promise };
    read();
    snap();
    recBtn.disabled = true;
    copyBtn.hidden = dl.hidden = true;
    return promise;
  };
  const finish = async () => {
    const r0 = /** @type {NonNullable<typeof rec>} */ (rec);
    snap();
    rec = null;
    msg.textContent = 'armando el informe…';
    // las marcas de los últimos cuadros todavía se están leyendo
    for (const t0 = now(); T.pending > 0 && now() - t0 < 2000;) await new Promise(res => setTimeout(res, 50));
    const { brief, full } = buildReport({
      frames: r0.frames,
      snaps: r0.snaps,
      env: env(),
      timer: timer(),
      startedAt: r0.start,
      durationMs: r0.ms,
    });
    const text = JSON.stringify(brief);
    const name = `fps-${q.get('id') || 'nave'}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
    if (last) URL.revokeObjectURL(last.url);
    const url = URL.createObjectURL(new Blob([JSON.stringify(full)], { type: 'application/json' }));
    last = { brief, full, text, url, name };
    Object.assign(dl, { href: url, download: name, hidden: false });
    copyBtn.hidden = false;
    recBtn.disabled = false;
    window.__fpsReport = last;
    await copy();
    r0.done(last);
  };
  recBtn.onclick = () => void record();
  window.__fpsRecord = record;

  const tick = () => {
    const t = now();
    read();
    if (rec) {
      snap();
      // un cuadro que empezó antes del final se cierra con el rAF siguiente: se espera (en el Mac, un cuadro; en
      // SwiftShader, segundos)
      const over = t >= rec.until;
      if (over && (!cur || cur.at >= rec.until || t - rec.until > 30000)) void finish();
      else msg.textContent = over ? 'grabando… el último cuadro' : `grabando… ${fmt((rec.until - t) / 1000, 0)} s`;
    }
    // con menos de dos cuadros en la ventana (SwiftShader: un cuadro cada varios segundos), los últimos tres
    let win = recent.filter(f => f.at >= t - WINDOW);
    if (win.filter(f => f.drawn).length < 2) {
      let i = recent.length;
      for (let n = 0; i > 0 && n < 3;) if (/** @type {Frame} */ (recent[--i]).drawn) n++;
      win = recent.slice(i);
    }
    const drawn = win.filter(f => f.drawn && f.dt > 0);
    const dts = drawn.map(f => f.dt);
    // si hace rato que no llega ningún cuadro, baja hacia 0
    const lastAt = drawn.length ? /** @type {Frame} */ (drawn[drawn.length - 1]).at : -1;
    const fps = drawn.length ? Math.min(1000 / mean(dts), 1000 / Math.max(t - lastAt, 1)) : 0;
    const cpus = win.map(f => f.cpu);
    const ms = mean(cpus);
    const max = cpus.length ? Math.max(...cpus) : NaN;
    const scale = typeof engine?.renderScale === 'number' ? engine.renderScale : null;
    const lines = [
      `${fmt(fps)} fps · CPU ${fmt(ms)} ms (máx ${fmt(max)}) · cuadro p50 ${fmt(pct(dts, 0.5))} · p95 ${fmt(pct(dts, 0.95))} · máx ${fmt(dts.length ? Math.max(...dts) : NaN)} ms`,
      `${canvas.width}×${canvas.height} px · ×${fmt(devicePixelRatio, 2)}` +
        (scale == null
          ? ''
          : ` · escala de render ×${fmt(scale, 3)} ${engine.renderScaleAuto ? '(auto)' : '(fija)'} · ×${fmt(devicePixelRatio * scale, 2)} píxeles por CSS`),
    ];
    // con qué se sube a la pantalla una escala < 1 (FSR 1: EASU + RCAS; docs/PERF.md, «El escalador»; el gobernador no
    // baja de 0,75) y la imagen que dibuja la cámara (con FSR el búfer del canvas no cambia: la escalada es otra)
    if (scale != null && engine?.upscaler) {
      const up = { fsr: 'FSR 1 (EASU + RCAS)', browser: 'el navegador (bilineal)', none: 'sin escalar' }[
        engine.upscaler
      ];
      const px = Array.isArray(engine.renderPx) ? ` · dibuja ${engine.renderPx.join('×')}` : '';
      lines.push(`escalador: ${up ?? engine.upscaler}${px}`);
    }
    if (engine?.cpuMs)
      lines.push(
        `motor: CPU main ${fmt(engine.cpuMs.main)} + render ${fmt(engine.cpuMs.render)} ms · cuadro ${fmt(engine.frameMs)} ms (máx ${fmt(engine.frameMsMax)})`,
      );
    // la GPU: por pase (marcas propias, cada cuadro) o los tramos del motor (un cuadro de cada 15). Por grupo, los ms
    // sin solapes (fps-report.js, exclusive): en los Apple M los pases se solapan y sus ms suman más que el cuadro
    const timed = drawn.filter(f => f.gpu);
    if (timed.length) {
      /** @type {Record<string, number>} */
      const g = {};
      for (const f of timed)
        for (const [k, v] of Object.entries(groupsOf(/** @type {NonNullable<Frame['gpu']>} */ (f.gpu), true)))
          g[k] = (g[k] ?? 0) + v / timed.length;
      const span = mean(timed.map(f => /** @type {NonNullable<Frame['gpu']>} */ (f.gpu).span));
      const busy = mean(timed.map(f => /** @type {NonNullable<Frame['gpu']>} */ (f.gpu).busy));
      // los pases con marcas que no sirven (los vacíos fuera del cuadro, `outside`, no son un error: no se cuentan acá)
      const dropped = timed.reduce(
        (a, f) => a + /** @type {NonNullable<Frame['gpu']>} */ (f.gpu).drops.filter(([, k]) => k !== 'outside').length,
        0,
      );
      lines.push(
        `GPU ${fmt(span)} ms por cuadro (suma de pases ${fmt(busy)}) · timestamp-query por pase en ${timed.length} de ${drawn.length} cuadros${T.q ? ', ' + rounding(T.q) : ''}${dropped ? ` · ${fmt(dropped / timed.length)} pases descartados por cuadro` : ''}`,
        '  sin solapes: ' +
          [...GROUPS.map(([k]) => k), 'otros']
            .filter(k => (g[k] ?? 0) >= 0.05)
            .map(k => `${k} ${fmt(/** @type {number} */ (g[k]))}`)
            .join(' · '),
      );
    } else if (engine?.gpu) {
      lines.push(
        `GPU ${fmt(engine.gpu.totalMs)} ms (tramos del motor, 1 cuadro de cada 15${engineQ ? ', ' + rounding(engineQ) : ''}; sin marcas por pase: ${T.why || 'esperando la primera lectura'})`,
        '  ' +
          engine.gpu.passes.map((/** @type {{name: string, ms: number}} */ p) => `${p.name} ${fmt(p.ms)}`).join(' · '),
      );
    } else
      lines.push(
        `GPU sin medir: ${T.why || (tsq === false ? 'el adaptador no da timestamp-query' : T.readings ? `las marcas de los últimos cuadros todavía no se leyeron (${T.readings} lecturas hasta ahora)` : 'esperando la primera lectura')}${engine?.gpuRejected ? ` (el motor descartó ${engine.gpuRejected} lecturas)` : ''}`,
      );
    if (win.length) {
      const m = (/** @type {(f: Frame) => number} */ k) => mean(drawn.length ? drawn.map(k) : win.map(k));
      const sum = (/** @type {(f: any) => number} */ k) => win.reduce((a, f) => a + k(f), 0);
      lines.push(
        `draws ${fmt(
          m(f => f.draws),
          0,
        )} (sombra ${fmt(
          m(f => f.shadowDraws),
          0,
        )}) · triángulos ${mega(m(f => f.tris))} (sombra ${mega(m(f => f.shadowTris))}) · pases ${fmt(
          m(f => f.passes),
          0,
        )} · vistas de sombra ${fmt(
          m(f => f.shadow),
          0,
        )} · cámaras ${Math.max(...win.map(f => f.cams))}`,
        `en 2 s: pipelines nuevos ${sum(f => f.pipes)} · texturas subidas ${sum(f => f.texUp)} (${fmt(sum(f => f.texBytes) / 1048576, 1)} MB) · creadas ${sum(f => f.newTex)} · búferes escritos ${fmt(sum(f => f.bufBytes) / 1048576, 1)} MB`,
      );
    }
    if (engine?.drawCalls != null)
      lines.push(
        `motor, antes del recorte: draw calls ${engine.drawCalls} (con la caché ${engine.drawCallsCached ?? '–'}) · triángulos ${mega(engine.triangles)} (${mega(engine.trianglesCached ?? NaN)})`,
      );
    if (engine?.lights) {
      const l = engine.lights;
      lines.push(
        `luces: ${l.spot} focos + ${l.point} puntos (${l.shadowed} con sombra, ${l.idle} apagadas) · por punto ${fmt(l.perPointMean)} (máx ${l.perPointMax}) · vistas de sombra ${l.shadowViews}`,
      );
    }
    if (engine?.shadowCache) {
      const c = engine.shadowCache;
      lines.push(
        `caché de sombras: ${c.hits} vistas de lo guardado, ${c.builds} guardadas este cuadro (${c.buildsTotal} en total) · dinámicas ${c.dynamic} · cambios ${c.epoch}`,
      );
    }
    if (engine?.error) lines.push(`park.stats(): ${engine.error}`);
    else if (typeof park.stats !== 'function') lines.push('falta park.stats() en el paquete');
    text.textContent = lines.join('\n');
    box.classList.toggle('slow', fps < 50);
    window.__fps = {
      fps,
      cpuMs: ms,
      cpuMaxMs: max,
      frames: frames.gpu,
      stats: engine,
      brief: engineBrief(engine),
      timer: timer(),
      recording: !!rec,
    };
  };
  setInterval(tick, 500);
  tick();
}
