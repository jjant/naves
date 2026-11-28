// `editor.html?perf=1`: lo que tarda cada cambio del plano en verse en el park (README, «Editor de plano»). Lleva la
// cuenta de los cuadros (los rAF y lo que tarda la tarea de cada uno en el hilo de la página) y de cada cambio: en qué
// cuadro llegó, qué park se dibujó en ese cuadro (P, el provisional; `cache`, el exacto de la caché; `stale`, el de
// antes) y cuándo llegaron el exacto (E) y lo que se camina (W). Lo deja en `window.__parkPerf` (lo lee
// apps/naves/scripts/editor-park-check.mjs y rt-bench) y lo muestra en un recuadro abajo a la izquierda del plano.
// Sin `?perf=1` no corre nada: `createPerf({ on: false })` da un objeto que no hace nada.
//
// `__parkPerf` (el contrato de docs/TIEMPO-REAL.md): `{ frameMs, taskMs, longTasks, longTaskAt, loafs, edits, parks,
// drags, stats(n), reset() }`. `longTasks[i]` es lo que duró una tarea larga (> 50 ms, de cualquier cosa del hilo de la página: un
// mensaje de un worker, el panel con la página quieta, no solo los cuadros) y `longTaskAt[i]`, cuándo empezó; `loafs`,
// los cuadros largos (Long Animation Frames: `{ t, ms, blocking, forced, script }`, `forced` el layout forzado de sus
// scripts y `script` el que más tardó).
// `unmarked`: los cuadros (índices de `frameMs`) que se pintaron con un park que no es el exacto de la nave de ahora sin
// que sea P ni se vea más tenue (la capa `park-stale`): tiene que quedar vacío (rt-bench falla si no).
// `frameMs[i]` es el instante (`performance.now()`) del rAF número `i` desde que se empezó a medir y `taskMs[i]`, lo que
// tardó la tarea de ese cuadro en el hilo de la página. Cada cambio: `{ rev, kind, key, tInput, inputFrame, outlineFrame,
// pFrame, pTier, pMs, eMs, eFrame, eqExact, wMs, wFrame, tDrawn, tExact, tWalk }`, con los cuadros como índices de
// `frameMs` (`outlineFrame`: el del dibujo de la nave en el plano, el evento `editorview` de draw.js) y los `t…` en el
// reloj de `performance.now()` (`tDrawn`, `tExact`, `tWalk`: cuando terminó el cuadro que dibujó P, el exacto y lo que
// se camina). `key`: un número por nave con sus opciones (la misma `inputKey`, el mismo número). `eOk`: si el exacto
// armó un park (`false`: el generador dio un error; rt-bench deja esos arrastres fuera del resumen). `tSeen`: cuando
// terminó el primer cuadro con un park de ese cambio o de uno posterior en el plano (lo que ve quien dibuja: entrada →
// park, también el que sigue el dibujo).
// Lo que se ve: `parks`, cada park nuevo en el plano (`{ t, rev, look, current, exact }`: `t` el fin de su cuadro,
// `look` `follow`/`stale`/`unconfirmed`/`current`), y `drags`, cada gesto (`{ t0, rev0, tRelease, revRelease, parks,
// tPark, tSettled, tFinal, tWalk }`: cuántos parks nuevos se dibujaron mientras duró, y cuando, ya suelto, quedaron en
// el plano el park de la posición final (`tPark`: su P, o su exacto si llegó antes), el park que ya no cambia más
// (`tSettled`: el último park de otro `layoutHash` de esa nave; hasta que llegan el exacto y lo que se camina puede
// moverse), el exacto y lo que se camina en él).

const KEEP = 5000;
const NOOP = {
  on: false,
  edit() {},
  drawn() {},
  frameState() {},
  exactKnown() {},
  exactShown() {},
  walkShown() {},
  gesture() {},
  parkDrawn() {},
  dispose() {},
};

/** El cuantil `p` (0–1) de `a`, o null. */
export function quantile(a, p) {
  const s = a.filter(Number.isFinite).sort((x, y) => x - y);
  return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : null;
}

/**
 * Las tandas de cambios con la misma nave (`key`) seguidos: de cada una, el último cambio (desde ahí se espera el
 * exacto de esa nave), si su park salió de la caché y si el exacto llegó a mostrarse antes de que la nave cambiara.
 */
export function keyRuns(edits) {
  const runs = [];
  for (const e of edits) {
    const run = runs.at(-1);
    if (run && e.key != null && run.key === e.key) run.last = e;
    else runs.push({ key: e.key, first: e, last: e });
  }
  return runs.map(r => ({
    key: r.key,
    last: r.last,
    cache: r.first.pTier === 'cache',
    shown: r.last.tExact != null || r.last.eFrame != null,
  }));
}

/**
 * Los cuadros que perdió la página entre `t0` y `t1` (los rAF de `frameMs`, en orden): cada intervalo de más de 1,5
 * veces el nominal (la mediana de los del tramo) pierde los cuadros que le caben de más. `{ frames, dropped, perSec }`.
 */
export function droppedFrames(frameMs, t0, t1) {
  let lo = 0;
  let hi = frameMs.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (frameMs[mid] < t0) lo = mid + 1;
    else hi = mid;
  }
  const ts = [];
  for (let i = lo; i < frameMs.length && frameMs[i] <= t1; i++) if (Number.isFinite(frameMs[i])) ts.push(frameMs[i]);
  const gaps = ts.slice(1).map((t, i) => t - ts[i]);
  const nominal = quantile(gaps, 0.5);
  if (!nominal || !(t1 > t0)) return { frames: ts.length, dropped: 0, perSec: null };
  const dropped = gaps.reduce((n, g) => n + (g > 1.5 * nominal ? Math.round(g / nominal) - 1 : 0), 0);
  return { frames: ts.length, dropped, perSec: (1000 * dropped) / (t1 - t0) };
}

/**
 * Lo que se vio en cada gesto de `drags` (los que ya se soltaron): parks nuevos por segundo mientras duró (`hz`), los
 * cuadros perdidos por segundo mientras duró (`dropHz`, de los rAF de `frameMs`: sin lo que tarda en asentarse) y los
 * ms de soltar al park de la posición final (`park`), al park que ya no cambia (`settled`), al exacto (`final`) y a lo
 * que se camina en él (`walk`).
 */
export function dragStats(drags, frameMs = []) {
  return drags
    .filter(d => d.tRelease != null)
    .map(d => ({
      rev0: d.rev0,
      ms: d.tRelease - d.t0,
      parks: d.parks,
      hz: d.tRelease > d.t0 ? (1000 * d.parks) / (d.tRelease - d.t0) : null,
      dropHz: frameMs.length ? droppedFrames(frameMs, d.t0, d.tRelease).perSec : null,
      park: d.tPark != null ? d.tPark - d.tRelease : null,
      settled: d.tSettled != null ? d.tSettled - d.tRelease : null,
      final: d.tFinal != null ? d.tFinal - d.tRelease : null,
      walk: d.tWalk != null ? d.tWalk - d.tRelease : null,
    }));
}

/**
 * Las cuentas de los últimos `n` cambios de `edits`: cuántos dibujaron su propio park en el cuadro de su entrada (P o
 * el de la caché) y cuántos el de un plano anterior (`staleShare`), cuántos cuadros tarde, y los ms (p50, p95) de la
 * entrada al dibujo de su propio park (`drawnMs`), al exacto y a lo que se camina. El exacto se cuenta por tanda de
 * la misma nave, desde su último cambio (`exactMs`, sin los de la caché: `cacheMs`), y las tandas que cambiaron antes
 * de que llegara, aparte (`superseded`). Lo que se ve al arrastrar (con `drags`, los gestos de esos cambios): la
 * entrada a un park de ese cambio o de uno posterior en el plano (`seenMs`, también el que sigue el dibujo), los parks
 * nuevos por segundo de cada gesto (`followHz`: la mediana y el último), los cuadros perdidos por segundo mientras
 * duró (`dropHz`: la mediana y el peor; con `frameMs`, los rAF) y de soltar al park de la posición final
 * (`releaseParkMs`), al park que ya no cambia (`releaseSettledMs`), al exacto (`releaseFinalMs`) y a lo que se camina
 * (`releaseWalkMs`).
 */
export function editStats(edits, n = 120, drags = [], frameMs = []) {
  const last = edits.slice(-n);
  const gestures = dragStats(
    drags.filter(d => last.length && d.rev0 >= last[0].rev),
    frameMs,
  );
  const drawn = last.filter(e => e.pFrame != null && e.inputFrame != null);
  const own = drawn.filter(e => e.pTier === 'P' || e.pTier === 'cache');
  const inFrame = own.filter(e => e.pFrame === e.inputFrame);
  const lag = (e, t) => (e[t] != null ? e[t] - e.tInput : NaN);
  const pair = list => [quantile(list, 0.5), quantile(list, 0.95)];
  const outlined = last.filter(e => e.outlineFrame != null && e.inputFrame != null);
  const runs = keyRuns(last);
  // la última tanda puede estar esperando todavía: no cuenta como reemplazada
  const done = runs.slice(0, -1);
  return {
    edits: last.length,
    inFrame: drawn.length ? inFrame.length / drawn.length : null,
    staleShare: drawn.length ? (drawn.length - own.length) / drawn.length : null,
    outlineInFrame: outlined.length
      ? outlined.filter(e => e.outlineFrame === e.inputFrame).length / outlined.length
      : null,
    late: pair(drawn.map(e => e.pFrame - e.inputFrame)),
    drawnMs: pair(own.map(e => lag(e, 'tDrawn'))),
    pMs: pair(last.filter(e => e.pTier === 'P').map(e => e.pMs)),
    exactMs: pair(runs.filter(r => r.shown && !r.cache).map(r => lag(r.last, 'tExact'))),
    cacheMs: pair(runs.filter(r => r.shown && r.cache).map(r => lag(r.last, 'tExact'))),
    runs: runs.length,
    superseded: done.filter(r => !r.shown).length,
    walkMs: pair(last.map(e => lag(e, 'tWalk'))),
    eMs: pair(last.map(e => e.eMs)),
    wMs: pair(last.map(e => e.wMs)),
    eqExact: (() => {
      const known = last.filter(e => e.pTier === 'P' && e.eqExact != null);
      return known.length ? known.filter(e => e.eqExact).length / known.length : null;
    })(),
    tiers: Object.fromEntries(['P', 'cache', 'stale'].map(t => [t, last.filter(e => e.pTier === t).length])),
    seenMs: pair(last.map(e => lag(e, 'tSeen'))),
    drags: gestures.length,
    followHz: [
      quantile(
        gestures.map(d => d.hz),
        0.5,
      ),
      gestures.at(-1)?.hz ?? null,
    ],
    dropHz: [
      quantile(
        gestures.map(d => d.dropHz),
        0.5,
      ),
      quantile(
        gestures.map(d => d.dropHz),
        1,
      ),
    ],
    releaseParkMs: pair(gestures.map(d => d.park)),
    releaseSettledMs: pair(gestures.map(d => d.settled)),
    releaseFinalMs: pair(gestures.map(d => d.final)),
    releaseWalkMs: pair(gestures.map(d => d.walk)),
  };
}

const ms = v =>
  v == null || !Number.isFinite(v) ? '—' : v >= 1000 ? `${(v / 1000).toFixed(2)} s` : `${v.toFixed(1)} ms`;
const pct = v => (v == null ? '—' : `${Math.round(v * 100)} %`);
const hz = v => (v == null || !Number.isFinite(v) ? '—' : `${v.toFixed(1)} Hz`);
const perSec = v => (v == null || !Number.isFinite(v) ? '—' : `${v.toFixed(1)}/s`);

/** El texto del recuadro de `?perf=1` (lo mismo que `__parkPerf`, en pocas líneas). */
export function readoutText(perf) {
  const e = perf.edits.at(-1);
  const s = editStats(perf.edits, 120, perf.drags ?? [], perf.frameMs ?? []);
  const tier = { P: 'P (provisional)', cache: 'exacto de la caché', stale: 'el de antes' };
  const ts = perf.frameMs.slice(-121).filter(Number.isFinite);
  const frames = ts.slice(1).map((t, i) => t - ts[i]);
  const tasks = perf.taskMs.slice(-120).filter(Number.isFinite);
  // lo que cuesta dibujar un park nuevo: la tarea de los cuadros que dibujaron uno (los últimos 60)
  const parkTasks = (perf.parks ?? [])
    .slice(-60)
    .map(p => (p.frame != null ? perf.taskMs[p.frame] : null))
    .filter(Number.isFinite);
  const lines = ['park en vivo (?perf=1)'];
  if (e) {
    const late = e.pFrame != null && e.inputFrame != null ? e.pFrame - e.inputFrame : null;
    lines.push(
      `último cambio (${e.kind}): ${e.pTier ? tier[e.pTier] : '…'}` +
        (late != null ? ` · ${late ? `${late} cuadro${late > 1 ? 's' : ''} tarde` : 'en su cuadro'}` : '') +
        ` · P ${ms(e.pMs)} · E ${ms(e.eMs)} · W ${ms(e.wMs)}`,
    );
  }
  lines.push(
    `últimos ${s.edits}: su park en su cuadro ${pct(s.inFrame)} · park de otro plano ${pct(s.staleShare)} · ` +
      `entrada→su park p50 ${ms(s.drawnMs[0])} p95 ${ms(s.drawnMs[1])}`,
    `exacto p50 ${ms(s.exactMs[0])} p95 ${ms(s.exactMs[1])} (${s.runs} naves, ${s.superseded} sin llegar) · ` +
      `caché p50 ${ms(s.cacheMs[0])} · circulación p50 ${ms(s.walkMs[0])} p95 ${ms(s.walkMs[1])}`,
    `rAF ${ms(quantile(frames, 0.5))} · tarea del cuadro p50 ${ms(quantile(tasks, 0.5))} p95 ${ms(quantile(tasks, 0.95))}` +
      ` · con park nuevo p50 ${ms(quantile(parkTasks, 0.5))} p95 ${ms(quantile(parkTasks, 0.95))}` +
      ` · largas ${perf.longTasks.length}`,
  );
  // lo que se ve al arrastrar: cuántas veces por segundo cambia el park mientras sigue el dibujo, cuánto atrasa y lo que
  // tarda, suelto, en quedar el de la posición final
  if (s.drags)
    lines.push(
      `siguiendo ${hz(s.followHz[1])} (mediana de ${s.drags} gestos ${hz(s.followHz[0])}) · cuadros perdidos en el ` +
        `arrastre ${perSec(s.dropHz[0])} (peor ${perSec(s.dropHz[1])}) · entrada→park en el plano p50 ` +
        `${ms(s.seenMs[0])} p95 ${ms(s.seenMs[1])} · soltar→su park p50 ${ms(s.releaseParkMs[0])} · soltar→park que ` +
        `queda p50 ${ms(s.releaseSettledMs[0])} p95 ${ms(s.releaseSettledMs[1])} · soltar→exacto p50 ` +
        `${ms(s.releaseFinalMs[0])} · soltar→circulación p50 ${ms(s.releaseWalkMs[0])}`,
    );
  return lines.join('\n');
}

/**
 * El medidor. `on`: si medir (en la página, `?perf=1`). Devuelve `{ on, edit, drawn, exactKnown, exactShown,
 * walkShown, dispose }`; con `on`, también `data` (lo de `__parkPerf`).
 */
export function createPerf({ on = false, win = globalThis, doc = globalThis.document, readout = true } = {}) {
  if (!on) return NOOP;
  const now = () => win.performance.now();
  const data = {
    frameMs: [],
    taskMs: [],
    longTasks: [],
    longTaskAt: [],
    loafs: [],
    unmarked: [],
    edits: [],
    parks: [],
    drags: [],
  };
  // el gesto en curso (desde la primera movida hasta que, suelto, queda el exacto y lo que se camina en él), la nave de
  // su posición final (la del primer park de la nave de ahora después de soltar) y el `layoutHash` de su último park
  let drag = null;
  let dragKey = null;
  let dragHash = null;
  const keyIds = new Map(); // inputKey → su número (`key` de cada cambio)
  let nextKey = 0;
  // si el park que quedó en el plano al final del último cuadro del panel es de otro plano y no está marcado
  let unmarkedNow = false;
  const byRev = new Map(); // rev → { edit, inputKey, pHash }
  const byKey = new Map(); // inputKey → los de byRev con esa nave
  const forKey = k => byKey.get(k) ?? [];
  let frame = -1;
  let firstInput = null;
  let disposed = false;
  const toDate = []; // los cambios que esperan su primer cuadro
  const push = (a, v) => {
    a.push(v);
    if (a.length > KEEP) a.splice(0, a.length - KEEP);
  };
  // lo que tarda la tarea de cada cuadro: de la primera entrada (que con la entrada alineada al rAF corre en la misma
  // tarea) hasta que termina el cuadro (el mensaje que se manda en el rAF llega cuando terminó de pintar)
  for (const t of ['pointermove', 'pointerdown', 'pointerup', 'keydown', 'change', 'input', 'click'])
    win.addEventListener(
      t,
      () => {
        firstInput ??= now();
      },
      { capture: true, passive: true },
    );
  const channel = new win.MessageChannel();
  const frameEnds = [];
  channel.port1.onmessage = () => {
    const f = frameEnds.shift();
    if (!f) return;
    const t = now();
    data.taskMs[f.frame] = t - f.t0;
    // lo que se pintó en este cuadro: lo que dejó el último cuadro del panel (en este o en uno anterior)
    if (unmarkedNow) push(data.unmarked, f.frame);
    for (const e of f.edits) if (e.pFrame === f.frame && e.tDrawn == null) e.tDrawn = t;
    for (const [k, list] of [
      ['tExact', f.exact],
      ['tWalk', f.walk],
      ['tSeen', f.seen],
    ])
      for (const e of list) if (e[k] == null) e[k] = t;
    for (const p of f.parks) p.t = t;
    for (const [d, k] of f.drags) if (d[k] == null) d[k] = t;
  };
  let current = null; // lo que se dibujó en este cuadro: { frame, edits, exact, walk }
  const loop = ts => {
    if (disposed) return;
    frame += 1;
    data.frameMs[frame] = ts;
    const t0 = Math.min(firstInput ?? Infinity, now());
    firstInput = null;
    for (const e of toDate.splice(0)) e.inputFrame = frame;
    current = { frame, t0, edits: [], exact: [], walk: [], seen: [], parks: [], drags: [] };
    frameEnds.push(current);
    channel.port2.postMessage(0);
    win.requestAnimationFrame(loop);
  };
  win.requestAnimationFrame(loop);
  let observer = null;
  try {
    observer = new win.PerformanceObserver(list => {
      for (const e of list.getEntries()) {
        push(data.longTasks, Math.round(e.duration));
        push(data.longTaskAt, Math.round(e.startTime));
      }
    });
    observer.observe({ type: 'longtask', buffered: false });
  } catch {
    // sin longtask (otro navegador): la tarea de cada cuadro igual está en taskMs
  }
  let loafObserver = null;
  try {
    loafObserver = new win.PerformanceObserver(list => {
      for (const e of list.getEntries()) {
        const scripts = e.scripts ?? [];
        const top = scripts.reduce((m, x) => (!m || x.duration > m.duration ? x : m), null);
        push(data.loafs, {
          t: Math.round(e.startTime),
          ms: Math.round(e.duration),
          blocking: Math.round(e.blockingDuration ?? 0),
          forced: Math.round(scripts.reduce((n, x) => n + (x.forcedStyleAndLayoutDuration ?? 0), 0) * 10) / 10,
          script: top ? `${top.invoker ?? ''} ${String(top.sourceURL ?? '').replace(/^.*\//, '')}`.trim() : null,
        });
      }
    });
    loafObserver.observe({ type: 'long-animation-frame', buffered: false });
  } catch {
    // sin LoAF (otro navegador): quedan las tareas largas
  }
  const frameOf = () => current ?? { frame, edits: [], exact: [], walk: [], seen: [], parks: [], drags: [] };
  /** El instante de la entrada que se está atendiendo (`event.timeStamp`, el reloj de `performance.now()`), o ahora. */
  const inputTime = () => {
    const ev = win.event;
    return typeof ev?.timeStamp === 'number' && ev.timeStamp > 0 ? ev.timeStamp : now();
  };
  // el dibujo de la nave (draw.js avisa con `editorview` al final de cada rAF en que la dibuja)
  const plan = doc?.getElementById?.('plan');
  const onOutline = () => {
    for (let i = data.edits.length - 1; i >= 0 && i >= data.edits.length - 50; i--) {
      const e = data.edits[i];
      if (e.outlineFrame == null && e.inputFrame != null && e.inputFrame <= frame) e.outlineFrame = frame;
    }
  };
  plan?.addEventListener('editorview', onOutline);
  const perf = {
    on: true,
    data,
    get frame() {
      return frame;
    },
    /** Un cambio de la nave o de las opciones (`kind`: vertex, opening, column, existing, option, undo, redo…). */
    edit({ rev, kind, inputKey }) {
      const tInput = inputTime();
      if (!keyIds.has(inputKey)) {
        keyIds.set(inputKey, nextKey++);
        if (keyIds.size > KEEP) keyIds.delete(keyIds.keys().next().value);
      }
      const e = {
        rev,
        kind,
        key: keyIds.get(inputKey),
        tInput,
        inputFrame: null,
        outlineFrame: null,
        pFrame: null,
        pTier: null,
        pMs: null,
        eMs: null,
        eFrame: null,
        eOk: null,
        eqExact: null,
        wMs: null,
        wFrame: null,
        tDrawn: null,
        tExact: null,
        tWalk: null,
        tSeen: null,
      };
      push(data.edits, e);
      toDate.push(e);
      const r = { edit: e, inputKey, pHash: null };
      byRev.set(rev, r);
      if (!byKey.has(inputKey)) byKey.set(inputKey, []);
      byKey.get(inputKey).push(r);
      if (byRev.size > KEEP) {
        const [old, o] = byRev.entries().next().value;
        byRev.delete(old);
        const list = byKey.get(o.inputKey);
        list?.splice(list.indexOf(o), 1);
        if (list && !list.length) byKey.delete(o.inputKey);
      }
    },
    /** Lo que se dibujó para el cambio `rev` en este cuadro (la primera vez es el del cuadro de su entrada). */
    drawn({ rev, tier, pMs = null, layoutHash = null }) {
      const r = byRev.get(rev);
      if (!r || r.edit.pFrame != null) return;
      const f = frameOf();
      Object.assign(r.edit, { pFrame: f.frame, pTier: tier, pMs });
      if (r.edit.inputFrame == null) r.edit.inputFrame = f.frame;
      f.edits.push(r.edit);
      if (tier === 'P') r.pHash = layoutHash;
      if (tier === 'cache') r.edit.eqExact = true;
    },
    /**
     * Al final de cada cuadro del panel: `unmarked`, si el park que queda en el plano no es el exacto de la nave de
     * ahora y no se ve como tal (ni P ni más tenue). Se cuenta en cada cuadro pintado hasta el próximo (`data.unmarked`).
     */
    frameState({ unmarked = false } = {}) {
      unmarkedNow = !!unmarked;
    },
    /**
     * Empieza un gesto (`live`: la primera movida de un arrastre, antes de su cambio `rev + 1`) o se suelta (`live:
     * false`, en el evento de soltar: su `timeStamp`).
     */
    gesture({ live, rev }) {
      const t = inputTime();
      if (live) {
        drag = {
          t0: t,
          rev0: rev + 1,
          tRelease: null,
          revRelease: null,
          parks: 0,
          tPark: null,
          tSettled: null,
          tFinal: null,
          tWalk: null,
        };
        dragKey = null;
        dragHash = null;
        push(data.drags, drag);
      } else if (drag && drag.tRelease == null) Object.assign(drag, { tRelease: t, revRelease: rev });
    },
    /**
     * Quedó en el plano otro park (`changed`) o el mismo con otro aspecto (`look`: `follow`, `stale`, `current`):
     * `rev`, el cambio del que es; `current`, si es el de la nave de ahora; `exact`, si es el exacto. Los cambios hasta
     * `rev` que todavía no tenían un park en el plano lo tienen desde el fin de este cuadro (`tSeen`). `layoutHash` e
     * `inputKey`, el park y la nave (para `tSettled`: el último park de otro hash de la nave de la posición final).
     */
    parkDrawn({
      rev,
      current = false,
      exact = false,
      look = 'current',
      changed = true,
      layoutHash = null,
      inputKey = null,
    }) {
      const f = frameOf();
      if (changed && rev != null) {
        const p = { t: null, frame: f.frame, rev, look, current, exact };
        push(data.parks, p);
        f.parks.push(p);
        for (let i = data.edits.length - 1; i >= 0 && i >= data.edits.length - 400; i--) {
          const e = data.edits[i];
          if (e.rev <= rev && e.tSeen == null && !f.seen.includes(e)) f.seen.push(e);
        }
        if (drag && drag.tRelease == null && rev >= drag.rev0) drag.parks += 1;
      }
      // suelto: el park de la posición final, el exacto y desde cuándo el park de esa nave ya no cambia (otra nave,
      // deshacer o la que sigue, ya no es de este gesto)
      if (drag && drag.tRelease != null && current) {
        if (drag.tPark == null) f.drags.push([drag, 'tPark']);
        if (exact && drag.tFinal == null) f.drags.push([drag, 'tFinal']);
        dragKey ??= inputKey;
        if (inputKey === dragKey && layoutHash !== dragHash) {
          dragHash = layoutHash;
          drag.tSettled = null;
          f.drags.push([drag, 'tSettled']);
        }
      }
    },
    /** Llegó (o estaba) el park exacto de `inputKey`: si el P de esos cambios era el mismo park, y cuánto tardó E. */
    exactKnown({ inputKey, layoutHash, ms: eMs = null, ok = null }) {
      for (const r of forKey(inputKey)) {
        if (eMs != null && r.edit.eMs == null) r.edit.eMs = eMs;
        if (ok != null && r.edit.eOk == null) r.edit.eOk = !!ok;
        if (r.edit.pTier === 'P' && r.edit.eqExact == null) r.edit.eqExact = r.pHash === layoutHash;
      }
    },
    /**
     * El park exacto de `rev` quedó en el plano en este cuadro: también el de los cambios desde `since` con la misma
     * nave (los cuadros de un arrastre que no la cambiaron), no el de los de antes de otra nave en el medio.
     */
    exactShown({ rev, inputKey, since = rev }) {
      const f = frameOf();
      for (const r of forKey(inputKey))
        if (r.edit.rev >= since && r.edit.rev <= rev && r.edit.eFrame == null) {
          r.edit.eFrame = f.frame;
          f.exact.push(r.edit);
        }
      refreshSoon();
    },
    /** Lo que se camina en el park exacto de `inputKey` quedó en el panel como lo de ahora (`since`: como arriba). */
    walkShown({ rev, inputKey, since = rev, ms: wMs = null }) {
      const f = frameOf();
      if (drag && drag.tRelease != null && drag.tWalk == null && rev >= drag.revRelease) f.drags.push([drag, 'tWalk']);
      for (const r of forKey(inputKey))
        if (r.edit.rev >= since && r.edit.rev <= rev && r.edit.wFrame == null) {
          r.edit.wFrame = f.frame;
          r.edit.wMs = wMs;
          f.walk.push(r.edit);
        }
      refreshSoon();
    },
    dispose() {
      disposed = true;
      plan?.removeEventListener('editorview', onOutline);
      observer?.disconnect();
      loafObserver?.disconnect();
      clearInterval(timer);
      box?.remove();
    },
  };
  const api = {
    frameMs: data.frameMs,
    taskMs: data.taskMs,
    longTasks: data.longTasks,
    longTaskAt: data.longTaskAt,
    loafs: data.loafs,
    unmarked: data.unmarked,
    edits: data.edits,
    parks: data.parks,
    drags: data.drags,
    stats: (n = 120) => editStats(data.edits, n, data.drags, data.frameMs),
    /** Empieza de nuevo: los cuadros se cuentan desde el próximo rAF. */
    reset() {
      for (const a of [
        data.frameMs,
        data.taskMs,
        data.longTasks,
        data.longTaskAt,
        data.loafs,
        data.unmarked,
        data.edits,
        data.parks,
        data.drags,
      ])
        a.length = 0;
      drag = null;
      dragKey = null;
      dragHash = null;
      byRev.clear();
      byKey.clear();
      keyIds.clear();
      toDate.length = 0;
      frameEnds.length = 0;
      current = null;
      frame = -1;
    },
  };
  win.__parkPerf = api;
  let box = null;
  let timer = 0;
  let soon = 0;
  const refresh = () => {
    soon = 0;
    if (!box) return;
    const t = readoutText(data);
    if (box.textContent !== t) box.textContent = t;
  };
  /** Cuando llega un exacto o lo que se camina, el recuadro no espera al próximo medio segundo (ni corre en el cuadro). */
  function refreshSoon() {
    if (box && !soon) soon = win.setTimeout(refresh, 0);
  }
  if (readout && doc) {
    box = doc.createElement('pre');
    box.id = 'parkPerf';
    box.className = 'park-perf';
    box.setAttribute('aria-live', 'off');
    (doc.getElementById('canvas') ?? doc.body).append(box);
    // dos veces por segundo, no en cada cuadro: el recuadro no tiene que pesar en lo que mide
    timer = win.setInterval(refresh, 500);
  }
  return perf;
}
