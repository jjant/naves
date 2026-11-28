// El lado del park del editor (editor.html): cada cambio de la nave que se dibuja tiene su park en el plano en el mismo
// cuadro (README, «Editor de plano»), y el panel de la derecha: las opciones del generador, lo que dice el núcleo con
// su sitio en el plano (park-issues.js), «Cómo decide» (park-explain.js), «Ver en 3D» y «Abrir en el visor»
// (park-3d.js).
//
// Tres parks, de más rápido a más exacto, cada uno etiquetado con `{ rev, inputKey, layoutHash }` (park-run.js):
//
// - **En el cuadro del cambio** (el rAF de la entrada, en el hilo de la página): el park exacto de la caché si esa
//   misma nave con esas opciones ya se armó (deshacer, rehacer, volver a una posición); si no, el provisional (P) del
//   núcleo de la página cuando el paquete lo trae (park-session.js); si no, el de antes, marcado como de otro plano.
// - **El exacto (E)**, en park-worker.js: uno a la vez y gana el último cambio (park-client.js), sin esperar a que el
//   dibujo se calme. Llega unos cuadros después y queda en la caché.
// - **Lo que se camina (W)**, en park-walk-worker.js, sobre el último park exacto: sus hallazgos se muestran como los de
//   ahora solo si su `layoutHash` es el del park que está en el plano; si no, la circulación queda «midiendo…».
//
// Mientras se arrastra solo se redibuja el park en el plano: la lista, el resumen, «Cómo decide» y el 3D se arman
// cuando la página está quieta, después de que llega el exacto o lo que se camina. En el arrastre el plano muestra el
// park más nuevo que terminó (E o P) de una posición de ese mismo dibujo, **«siguiendo»** (un poco más tenue que el de
// ahora, con un solo aspecto en todo el gesto: no titila), y al soltar sigue así hasta que llega el de la posición
// final; si es su P, **«sin confirmar»** (casi como el de ahora) hasta que llega su exacto, que con el mismo park solo
// cambia la clase y si no, el park. El de otras opciones o de deshacer, que no se está siguiendo, se ve como «de un
// plano anterior» (más tenue).
//
// Del editor usa solo el store de state.js (`getBuilding()` y `subscribe(fn)`, que avisa con `{ live }` en medio de un
// arrastre) y, si lo hay, el grupo del plano en metros de la nave donde dibujar el park (`layer`, o el elemento con
// `data-park-layer`). Sin ese grupo, el park se ve en el plano propio del panel (que está siempre: es donde «Cómo
// decide» muestra las pistas que probó). «Ver en el plano» marca el sitio en los dos y avisa al editor con el evento
// `park:locate` de `window` (`detail`: `{ at: [x, z], rect?, key? }`), por si quiere centrar la vista ahí.
import { createWorkerQueue } from './park-client.js';
import { ARROW_DEFS, candidateHTML, candidatesSVG, explainHTML, rankedPlans } from './park-explain.js';
import { issueRows, summary } from './park-issues.js';
import { HATCH_DEFS, OVERLAY_OPEN, esc, overlayNodes, overlaySVG, shellSVG, viewBoxOf } from './park-overlay.js';
import { patchKeyed } from './svg-patch.js';
import { NO_OUTLINE, cleanOptions } from './park-run.js';
import { createLRU, createProvisional, inputKeyOf } from './park-session.js';
import { createPerf } from './park-perf.js';
import { open3D, openInViewer } from './park-3d.js';

/** Donde se guardan las opciones del panel entre visitas. */
export const OPTIONS_KEY = 'snowpark.editor.park.options';

/** Las opciones guardadas (o las de siempre: todo automático, el gym en el altillo, sin «Cómo decide»). */
export function loadOptions(storage = globalThis.localStorage) {
  try {
    const o = JSON.parse(storage?.getItem(OPTIONS_KEY) ?? '{}');
    return { overlay: true, ...o };
  } catch {
    return { overlay: true };
  }
}

const PANEL = `
<header class="park-head">
  <h2>Park automático</h2>
  <span class="park-status" data-park="status">Esperando la nave…</span>
</header>
<form class="park-options" data-park="options">
  <label>Líneas <select name="lanes"><option value="">auto</option><option>2</option><option>3</option><option>4</option></select></label>
  <label>Ancho de línea <select name="laneWidth"><option value="">auto</option><option value="3">3,0 m</option><option value="3.1">3,1 m</option><option value="3.2">3,2 m</option><option value="3.3">3,3 m</option></select></label>
  <label>Plataforma <input name="platformHeight" type="number" min="1" max="5" step="0.05" placeholder="auto" inputmode="decimal"> m</label>
  <label class="park-check"><input name="gymOnMezzanine" type="checkbox" checked> Gym en el altillo (si hay)</label>
  <label class="park-check"><input name="overlay" type="checkbox" checked> Park sobre el plano</label>
  <label class="park-check"><input name="explain" type="checkbox"> Cómo decide</label>
</form>
<p class="park-summary" data-park="summary"></p>
<div class="park-actions">
  <button type="button" data-park="3d" disabled>Ver en 3D</button>
  <button type="button" data-park="viewer" disabled>Abrir en el visor</button>
  <button type="button" data-park="download" disabled>Descargar layout</button>
</div>
<svg class="park-plan" data-park="plan" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" preserveAspectRatio="xMidYMid meet"><defs>${HATCH_DEFS}${ARROW_DEFS}</defs><g data-park="plan-shell"></g><g data-park="plan-park"></g><g data-park="plan-ghost"></g><g data-park="plan-mark"></g></svg>
<section class="park-explain" data-park="explain" hidden></section>
<h3 class="park-h3">Lo que dice el núcleo <small data-park="count"></small></h3>
<ol class="park-issues" data-park="issues"></ol>
`;

/** Las opciones que cambian el park que arma el generador (las de `cleanOptions` menos `explain`). */
const genKey = o => {
  const c = cleanOptions(o);
  delete c.explain;
  return JSON.stringify(c);
};

/**
 * Si un cambio de opciones pide otro park: solo si cambia lo que arma el generador (líneas, ancho, plataforma, gym) o
 * si se prende «Cómo decide» y el park que hay no trae la explicación. «Park sobre el plano» y apagar «Cómo decide»
 * solo cambian lo que se dibuja (lo que se veía antes: volver a armarlo todo, ~1,5 s, en cada clic de la casilla).
 */
export function needsLayout(before, after, result) {
  if (!result) return true;
  if (genKey(before) !== genKey(after)) return true;
  return !!after.explain && !!result.ok && !result.explain;
}

/** El paso a paso de las candidatas en el plano (arriba de «Cómo decide», fijo al desplazar el panel). */
const STEPPER =
  '<div class="park-stepper"><button type="button" data-step="-1" title="La de mejor puntaje que esta">◀</button>' +
  '<span data-park="cand-head"></span>' +
  '<button type="button" data-step="1" title="La de peor puntaje que esta">▶</button>' +
  '<button type="button" data-step="win" title="Volver a la que ganó">★</button></div>' +
  '<div class="park-cand" data-park="cand"></div>';

/** Una fila de la lista: el nivel, el texto y, si está en el plano, el botón para ir. */
function rowHTML(r, i) {
  const icon = r.level === 'error' ? '✖' : '▲';
  const where = r.where
    ? ` <button type="button" class="park-go" data-row="${i}" title="Ver en el plano">ver</button>`
    : '';
  const tag =
    r.origin === 'walk' ? `<span class="park-tag">circulación${r.rule ? ` · ${esc(r.rule)}` : ''}</span> ` : '';
  return `<li class="park-${r.level}" data-row="${i}"><span class="park-icon" aria-hidden="true">${icon}</span><span>${tag}${esc(r.text)}</span>${where}</li>`;
}

/** La marca de «ver en el plano»: un círculo que late en el punto y el borde del rectángulo, en metros. */
export function markSVG(where) {
  if (!where?.at) return '';
  const [x, z] = where.at;
  const rects = where.rects?.length ? where.rects : where.rect ? [where.rect] : [];
  const box = rects
    .map(
      r =>
        `<rect x="${r.x}" y="${r.z}" width="${r.w}" height="${r.d}" fill="none" stroke="#DF0763" stroke-width="0.18"/>`,
    )
    .join('');
  return `<g class="park-mark">${box}<circle cx="${x}" cy="${z}" r="1.2" fill="none" stroke="#DF0763" stroke-width="0.22"/><circle cx="${x}" cy="${z}" r="0.22" fill="#DF0763"/></g>`;
}

/**
 * Arma el panel en `panel` y lo engancha al store. `layer`: el grupo SVG del plano del editor en metros (o una función
 * que lo devuelve: el editor puede rehacer su SVG), por defecto `[data-park-layer]`. `worker` y `walkWorker`: los
 * workers del park exacto y de lo que se camina (los tests pasan otros). `core`: una promesa con
 * `{ createAutoLayoutSession, slopeFrame }` del paquete en la página, para el park provisional (sin ella, o si el
 * paquete no lo trae, el cuadro dibuja lo de la caché o el park de antes). `perf`: el medidor de `?perf=1`
 * (park-perf.js). `frame` e `idle`: para los tests (por defecto, `requestAnimationFrame` y `requestIdleCallback`).
 * `hz`: el refresco de la pantalla para el presupuesto de P (`?perf=1&hz=120`; por defecto, el del rAF medido).
 * `pMode`: cuándo va P en el cuadro de un cambio. `adaptive` (por defecto): solo si lo que tarda P en esta nave (`pEst`,
 * medido la primera vez fuera del cuadro, con la página quieta) entra en lo que le queda al cuadro; si no, el cuadro
 * dibuja el park de antes (tenue o «siguiendo») y, sin gesto y sin el worker que sigue el dibujo, P se arma después del
 * cuadro y se dibuja al terminar. `always` (`?p=1`): en el cuadro de cada cambio sin gesto y, en un arrastre, si el
 * último P entra (lo de antes).
 * `followWorker`: el worker del park que sigue el dibujo (park-follow-worker.js: P de la posición más nueva fuera del
 * hilo de la página), o una función que lo crea; sin él (los tests), el arrastre sigue solo con el exacto y P de la
 * página. Devuelve `{ dispose, client, walkClient, followClient, state, cache, walks, renderPanels, locate, showGhost }`.
 */
export function mountPark({
  store,
  panel,
  layer,
  worker,
  walkWorker,
  core,
  perf = createPerf(),
  storage = globalThis.localStorage,
  frame = cb => requestAnimationFrame(cb),
  idle = cb =>
    typeof requestIdleCallback === 'function' ? requestIdleCallback(cb, { timeout: 300 }) : setTimeout(cb, 0),
  cacheSize = 64,
  hz = 0,
  followWorker = null,
  pMode = 'adaptive',
}) {
  panel.classList.add('park-panel');
  panel.innerHTML = PANEL;
  const $ = k => /** @type {HTMLElement} */ (panel.querySelector(`[data-park="${k}"]`));
  const form = /** @type {HTMLFormElement} */ ($('options'));
  const layerOf = () =>
    (typeof layer === 'function' ? layer() : layer) ?? document.querySelector('[data-park-layer]') ?? null;
  /**
   * `result`: el park que está en el plano (o el error). `shown`: de qué es (`rev`: el cambio para el que se dibujó;
   * `tier`: `cache`/`E` (el exacto de esa nave), `P` (el provisional) o `stale` (de un plano anterior); `exact`; la
   * nave, `inputKey`). `walk`: lo que se camina en ese mismo park (mismo `layoutHash`), o null mientras se mide.
   */
  const state = {
    result: null,
    shown: null,
    walk: null,
    rows: [],
    options: loadOptions(storage),
    building: null,
    inputKey: null,
    rev: 0,
    live: false,
    busy: null,
    provisional: false,
    pEst: null,
    pageMs: null,
    pOverruns: 0,
  };
  // las opciones guardadas, en el formulario
  for (const [k, v] of Object.entries(state.options)) {
    const el = form.elements.namedItem(k);
    if (!el) continue;
    if (el.type === 'checkbox') el.checked = v !== false;
    else el.value = v ?? '';
  }
  form.elements.namedItem('explain').checked = !!state.options.explain;
  const readOptions = () => {
    const f = form.elements;
    return {
      lanes: f.namedItem('lanes').value,
      laneWidth: f.namedItem('laneWidth').value,
      platformHeight: f.namedItem('platformHeight').value,
      gymOnMezzanine: f.namedItem('gymOnMezzanine').checked,
      overlay: f.namedItem('overlay').checked,
      explain: f.namedItem('explain').checked,
    };
  };

  let lastStatus = '';
  const status = (text, kind = '') => {
    if (lastStatus === `${kind}|${text}`) return;
    lastStatus = `${kind}|${text}`;
    const el = $('status');
    el.textContent = text;
    el.dataset.kind = kind;
  };
  const secs = ms => `${(ms / 1000).toFixed(1).replace('.', ',')} s`;

  // ------- los parks exactos (caché), el provisional y los workers -------
  /** inputKey → la respuesta de E (el park exacto o el error del generador: los dos son siempre los mismos). */
  const cache = createLRU(cacheSize);
  /**
   * inputKey → el último error de E que no es del generador (el worker se cayó, el núcleo quedó fuera de servicio): se
   * muestra mientras sea la nave de ahora, pero no cuenta como su park (volver a esa nave lo pide de nuevo).
   */
  const failed = createLRU(8);
  /** Los parks (`layoutHash`) cuya medición se cortó porque se cayó el worker: se miden otra vez, una sola. */
  const walkFailed = createLRU(8);
  /** layoutHash → lo que se camina en ese park. */
  const walks = createLRU(Math.max(8, cacheSize >> 1));
  /**
   * Las naves (`inputKey`) cuyo `finish` ya contestó (con su park final o sin él) para el exacto de la sesión que está en
   * la caché: un exacto nuevo de esa nave lo borra (`onExact`).
   */
  const finished = createLRU(Math.max(8, cacheSize >> 1));
  /** El camino de la pista que ganó en el último exacto (lo que el provisional arma sobre la nave nueva). */
  let plan = null;
  /** El exacto más nuevo que llegó (de cualquier nave): el que se muestra si la de ahora no tiene ni P. */
  let newest = null;
  /**
   * Desde qué cambio la nave es otra (una plantilla, una del sitio, un JSON): lo que llegue tarde de la de antes queda
   * en la caché, pero no se muestra encima de esta ni da el camino de la pista del provisional.
   */
  let loadRev = 0;
  /** Lo que tardaron el último exacto y la última medición en su worker (para saber si conviene cortar uno). */
  let eMs = null;
  let wMs = null;
  /** Si el worker del exacto reparte entre ayudantes (lo dice su respuesta, `fanout`): entonces se le avisa el gesto. */
  let eFanout = false;
  /** Desde qué cambio la nave es la de ahora (los cuadros de un arrastre que no la cambian tienen la misma). */
  let keySince = 0;
  /**
   * Si el park del plano sigue el dibujo («siguiendo»): desde la primera movida de un arrastre hasta que, ya suelto,
   * está en el plano el park de la nave de ahora (P, E o la caché). Otro cambio que no es el de soltar (una opción,
   * deshacer, otra nave) lo corta: lo que quede de antes es de un plano anterior.
   */
  let follow = false;
  let prov = null;
  if (core)
    void Promise.resolve(core)
      .then(api => {
        prov = createProvisional(api);
        state.provisional = !!prov;
        // si el exacto ya llegó, lo que tarda P en esta nave se mide ya (fuera del cuadro)
        if (plan) wantIdleP(true);
      })
      .catch(() => {});

  const busyNow = () => (eQueue.busy ? 'layout' : wQueue.busy ? 'walk' : null);
  const onBusy = () => {
    state.busy = busyNow();
    panel.dataset.busy = state.busy ?? '';
    schedule();
  };
  // los workers (o cómo crearlos: así un worker caído se reemplaza y el pedido en curso se puede cortar)
  // (cada `new URL` con el nombre del archivo escrito tal cual: así lo encuentra editor-build.mjs y copia el worker)
  const spawnOf = (w, make) => (typeof w === 'function' ? w : w ? null : make);
  const workerOf = w => (w && typeof w !== 'function' ? w : undefined);
  const eQueue = createWorkerQueue({
    worker: workerOf(worker),
    spawn: spawnOf(worker, () => new Worker(exactWorkerUrl(), { type: 'module' })),
    name: 'park',
    onBusy,
    onResult: (r, job) => onExact(r, job),
  });
  // el que sigue el dibujo: P de la posición más nueva en su worker, solo si el editor lo trae (no para los tests)
  const fQueue = followWorker
    ? createWorkerQueue({
        worker: workerOf(followWorker),
        spawn: typeof followWorker === 'function' ? followWorker : null,
        name: 'park que sigue el dibujo',
        onResult: r => onFollow(r),
      })
    : null;
  /** El P más nuevo del worker que sigue el dibujo (no va a la caché: no es el exacto). */
  let newestP = null;
  const wQueue = createWorkerQueue({
    worker: workerOf(walkWorker),
    spawn: spawnOf(walkWorker, () => new Worker(new URL('./park-walk-worker.js', import.meta.url), { type: 'module' })),
    name: 'chequeo de circulación',
    onBusy,
    onResult: (r, job) => onWalk(r, job),
  });

  /** Pide el exacto de la nave de ahora, si no está en la caché (con «Cómo decide» si hace falta) ni en camino. */
  const wantExact = ({ retry = false } = {}) => {
    const key = state.inputKey;
    const needExplain = !!state.options.explain;
    const hit = key ? cache.peek(key) : null;
    // un park sirve si trae la explicación cuando hace falta (un error no tiene qué explicar); un pedido en camino, si
    // la pidió
    const covers = r => !!r && (!needExplain || !r.ok || !!r.explain);
    const jobCovers = j => !!j && (!needExplain || !!j.options?.explain);
    if (!key || covers(hit)) return eQueue.drop();
    const f = eQueue.inFlight;
    if (f?.inputKey === key && jobCovers(f)) return eQueue.drop();
    eQueue.want({
      type: 'layout',
      rev: state.rev,
      inputKey: key,
      building: state.building,
      options: cleanOptions(state.options),
      ...(retry ? { retry: true } : {}),
    });
  };
  /**
   * Pide lo que se camina en el park exacto que está en el plano, si no se midió ya ni está en camino. Con la sesión
   * del paquete el worker corre `finish` sobre el exacto (`r.exact`): por eso van también la nave y las opciones.
   */
  const wantWalk = () => {
    const r = state.result;
    const h = r?.layoutHash;
    // en medio de un arrastre no se mide (lo que se camina llega ~1 s después, de una posición que ya pasó, y el worker
    // le quita núcleos a la página): al soltar
    // el park exacto de la nave de ahora, o el de la sesión antes de `finish` (que da el exacto)
    const measurable = state.shown?.exact || (r?.final === false && state.shown?.inputKey === state.inputKey);
    // el exacto de la sesión de esta nave espera a `finish` para el park final aunque lo que se camina en ese mismo
    // park ya se sepa (otras opciones que dan el mismo park: «2 líneas» en una nave que ya tenía 2): sin pedirlo, se
    // quedaba «provisional» para siempre. Una vez por nave (si `finish` contesta sin el final, no se insiste)
    const key = state.shown?.inputKey;
    const needFinal = r?.final === false && !!r.exact && !!key && !finished.has(key);
    const f = wQueue.inFlight;
    if (
      state.live ||
      !measurable ||
      !r?.ok ||
      !h ||
      (walks.has(h) && !needFinal) ||
      (f?.layoutHash === h && (!needFinal || f.inputKey === key))
    )
      return wQueue.drop();
    wQueue.want({
      type: 'walk',
      rev: state.rev,
      inputKey: state.shown.inputKey,
      layoutHash: h,
      layout: r.layout,
      ...(r.exact ? { exact: r.exact, building: state.building, options: cleanOptions(state.options) } : {}),
      ...(walkFailed.has(h) ? { retry: true } : {}),
    });
    // lo que se mide de otro park (uno de en medio, ya sin mostrar) no se espera
    if (wQueue.inFlight && wQueue.inFlight.layoutHash !== h && worthCutting(wQueue, wMs)) wQueue.preempt();
  };
  const onExact = (r, job) => {
    if (!r?.inputKey) return;
    // el worker reparte el exacto entre ayudantes (E en paralelo): desde ahí sabe del gesto (`live`)
    if (r.fanout) eFanout = true;
    if (!r.ok && !r.deterministic) {
      // no es lo que da el generador con esa nave: no queda como su park. La nave de ahora se pide otra vez (una sola:
      // si vuelve a fallar, se muestra el error hasta el próximo cambio)
      failed.set(r.inputKey, r);
      if (r.inputKey === state.inputKey && !job?.retry) wantExact({ retry: true });
      schedule(true);
      return;
    }
    failed.delete(r.inputKey);
    if (r.ok && Number.isFinite(r.ms)) eMs = r.ms;
    const old = cache.peek(r.inputKey);
    // el mismo park, con o sin «Cómo decide»: se queda con la explicación si ya la tenía. El final de esa nave (el de
    // `finish`) no lo reemplaza el exacto de la sesión, que es el de antes de medir lo que se camina: solo le da la
    // explicación que le faltaba
    const entry =
      old?.final === true && r.final === false
        ? { ...old, explain: old.explain ?? r.explain ?? null }
        : { ...r, explain: r.explain ?? old?.explain ?? null };
    cache.set(r.inputKey, entry);
    // un exacto de la sesión nuevo (el final salió de la caché o nunca llegó): lo que contestó `finish` era de la
    // entrada de antes, así que se le pide otra vez (si no, volver a esa nave la dejaba «provisional» para siempre)
    if (entry.final === false) finished.delete(r.inputKey);
    const sameNave = r.rev >= loadRev;
    if (sameNave && r.plan?.key != null) plan = r.plan;
    // lo que tarda P en esta nave, fuera del cuadro: la primera vez, y con la página quieta si la última medida no entraba
    // en un cuadro con lo que tarda la página (la nave cambió: puede entrar ahora)
    if (sameNave && pMode === 'adaptive' && (pEst == null || (!state.live && pEst + pageMs() > interval)))
      wantIdleP(true);
    if (sameNave && r.ok && (!newest || r.rev > newest.rev)) newest = entry;
    if (entry.final !== false)
      perf.exactKnown({ inputKey: r.inputKey, layoutHash: entry.layoutHash, ms: r.ms, ok: r.ok });
    // «Cómo decide» se prendió con este pedido ya en camino (sin la explicación): ahora sale el que la pide
    if (state.options.explain && r.ok && !entry.explain && r.inputKey === state.inputKey && !job?.options?.explain)
      wantExact();
    // si es la nave de ahora, el cuadro lo pone (también el mismo park con la explicación que faltaba)
    schedule(true);
  };
  /** Llegó el P del worker que sigue el dibujo: queda si es de esta nave y más nuevo que el último que llegó. */
  const onFollow = r => {
    if (!r?.ok || !r.layout || !(r.rev >= loadRev) || (newestP && r.rev <= newestP.rev)) return;
    newestP = { ...r, issues: r.issues ?? [], explain: null };
    schedule();
  };
  /**
   * Pide al worker que sigue el dibujo el P de la nave de ahora (en un cuadro que no la tiene: P no entró o no hay P en
   * la página), si no lo tiene ya ni está en camino.
   */
  const wantFollow = () => {
    const key = state.inputKey;
    if (!fQueue || !key || !plan || !state.options.overlay || newestP?.inputKey === key) return;
    if (fQueue.inFlight?.inputKey === key || fQueue.pending?.inputKey === key) return;
    fQueue.want({
      type: 'provisional',
      rev: state.rev,
      inputKey: key,
      building: state.building,
      options: state.options,
      plan,
    });
  };
  const onWalk = (r, job) => {
    if (!r?.layoutHash) return;
    // el worker se cayó o su núcleo quedó fuera de servicio (no es lo que mide ese park): una vez más, en otro worker
    if (!r.ok && r.fatal && !job?.retry) {
      walkFailed.set(r.layoutHash, true);
      schedule();
      return;
    }
    // con `finish`, el park final de esa nave (el de autoLayout): reemplaza al exacto en la caché y en el plano (también
    // si park3d-walk no lee su layout: entonces llega sin informe, `ok: false`)
    if (r.final?.ok && r.inputKey) {
      const old = cache.peek(r.inputKey);
      const fin = {
        ...r.final,
        type: 'layout',
        rev: r.rev,
        inputKey: r.inputKey,
        ms: old?.ms ?? r.ms,
        explain: r.final.explain ?? old?.explain ?? null,
        final: true,
      };
      cache.set(r.inputKey, fin);
      if (r.rev >= loadRev && fin.plan?.key != null) plan = fin.plan;
      if (newest?.inputKey === r.inputKey) newest = fin;
      perf.exactKnown({ inputKey: r.inputKey, layoutHash: fin.layoutHash, ms: fin.ms });
    }
    if (r.ok && Number.isFinite(r.ms)) wMs = r.ms;
    if (job?.exact && r.inputKey) finished.set(r.inputKey, true);
    walks.set(r.layoutHash, r);
    if (state.result?.layoutHash === r.layoutHash) attachWalk();
    schedule(true);
  };
  /** Lo que se camina en el park del plano, si ya se midió (el mismo `layoutHash`). */
  const attachWalk = () => {
    const h = state.result?.layoutHash;
    const w = h ? (walks.peek(h) ?? null) : null;
    if (w === state.walk) return;
    state.walk = w;
    panelsDirty = true;
    if (w && state.shown) shownWalk = true;
  };
  let shownWalk = false;

  // ------- lo que se dibuja en cada cuadro -------
  let rafId = 0;
  let panelsDirty = true;
  let idleId = 0;
  /** Pide un cuadro (y, con `panels`, que el panel se rearme cuando la página esté quieta). */
  const schedule = (panels = false) => {
    if (panels) panelsDirty = true;
    if (!rafId) rafId = frame(onFrame) || 1;
  };
  /**
   * Lo que tardó el último P (`ms`) y el cuadro en que se dibujó (`at`). En medio de un gesto, P va solo en un cuadro al
   * que le queda ese tiempo (`fitsP`): si no, se dibuja el de antes y se prueba en el que sigue. Un P más largo que un
   * cuadro no traba el arrastre (tampoco uno de cada dos o tres cuadros). Sin gesto (un clic, una opción) va igual: es un
   * cuadro, el del cambio, y así se vuelve a medir.
   */
  let pCost = { ms: 0, at: -Infinity };
  /**
   * Lo que dura un cuadro de la pantalla: de todos los cuadros seguidos (no de una pausa de más de 100 ms), cada uno
   * acotado entre 240 Hz y 60 Hz. Un cuadro lento (el de un P largo, el de otra tarea) cuenta como uno de 60 Hz: no
   * agranda el presupuesto más que eso (si no, un P lento se haría lugar solo). Con `hz` (`?perf=1&hz=120`), el de esa
   * pantalla (8,33 ms a 120 Hz) aunque el rAF vaya a otro paso (sin pantalla, Chromium da 60 Hz): así el banco mide lo
   * que P puede tardar en un ProMotion.
   */
  let interval = 1000 / (hz > 0 ? hz : 60);
  /** Lo mismo, de la pantalla de verdad también con `hz` (para ver si un cuadro se pasó: `pOverruns`). */
  let vsync = 1000 / 60;
  let lastTs = 0;
  /** Lo que hace la página en el cuadro además del P (el plano, el park, el estado), hasta medirlo (`pageMs`). */
  const PAGE_MS = 3;
  /** Cuánto se sigue viendo como el de ahora un P de un cuadro anterior mientras los cuadros no tienen lugar para otro. */
  const P_GRACE_MS = 50;
  /** ¿Entra un P en lo que le queda al cuadro que empezó en `frameAt`? (`?p=1`, lo de antes: con los 3 ms fijos) */
  const fitsP = frameAt => pCost.ms <= interval - (performance.now() - frameAt) - PAGE_MS;
  /**
   * Lo que le cuesta a la página un cuadro que dibuja un park nuevo después de armarlo (o de elegirlo): de ahí hasta
   * que el cuadro termina de pintar (un mensaje que se manda desde el rAF llega después del estilo, el layout y la
   * pintura de ese cuadro: lo que cuesta el park nuevo en el plano, que no corre en el rAF). Los últimos 7 cuadros con un
   * park nuevo, de P o de otro (el del worker que sigue el dibujo, el exacto): dibujar uno cuesta lo mismo. Hasta tener
   * tres, `PAGE_MS` (en Chromium de acá cuesta más: docs/TIEMPO-REAL.md, «rt2-p-fast»).
   */
  const pageAfter = [];
  const pageMs = () => (pageAfter.length >= 3 ? median(pageAfter) : PAGE_MS);
  /** Los cuadros con un park nuevo que esperan su fin (el mensaje de `frameEnd`). */
  const frameEnds = [];
  const frameEnd = typeof MessageChannel === 'function' ? new MessageChannel() : null;
  if (frameEnd)
    frameEnd.port1.onmessage = () => {
      const f = frameEnds.shift();
      if (!f || disposed) return;
      const t = performance.now();
      remember(pageAfter, t - f.after, 7);
      state.pageMs = pageMs();
    };
  /**
   * Los cuadros con P en el cuadro de una movida que se pasaron (`pOverruns`: de que empezó uno a que empezó el
   * siguiente, más de 1,5 veces lo que dura un cuadro de la pantalla: el contorno perdió un cuadro; con el reloj de la
   * página, no con el del rAF, que en un cuadro atrasado es el de cuando debía empezar) y cuándo empezó el último
   * (`pFrameAt`: después de él se pide el cuadro siguiente, para medirlo aunque no haya otra movida). Con dos en un
   * gesto, hasta soltar P va solo en el worker que sigue el dibujo (el freno de los parks que siguen el dibujo,
   * `parkRoom`, no alcanza: P va en el cuadro de cada movida). Uno solo puede ser la máquina.
   */
  let pOverruns = 0;
  let pFrameAt = -1;
  const P_OVERRUNS = 2;
  /**
   * Con `adaptive`: lo que tarda P en la nave de ahora (ms), o null si todavía no se midió (otra nave, la primera vez).
   * Sube enseguida con un P más lento y baja de a poco: un P que no entró una vez no vuelve hasta medirlo otra vez.
   */
  let pEst = null;
  const noteP = ms => {
    if (!Number.isFinite(ms)) return;
    pEst = pEst == null || ms > pEst ? ms : pEst * 0.7 + ms * 0.3;
    state.pEst = pEst;
  };
  /**
   * ¿Entra P, por lo que tarda en esta nave y lo que la página tardó en dibujar los últimos parks nuevos (`pageMs`), en
   * lo que le queda al cuadro que empezó en `frameAt`? En un gesto en que ya se pasó de un cuadro, no.
   */
  const fitsEst = frameAt =>
    pEst != null &&
    !(state.live && pOverruns >= P_OVERRUNS) &&
    pEst + pageMs() <= interval - (performance.now() - frameAt);
  /** Si P va en el cuadro de este cambio. */
  const pInFrame = frameAt => (pMode === 'always' ? !state.live || fitsP(frameAt) : fitsEst(frameAt));
  /** El P de después del cuadro (con `adaptive`), si hay uno pedido. */
  let pIdleId = 0;
  /**
   * P fuera del cuadro, con la página quieta (`idle`): para medir lo que tarda en esta nave (`measure`: aunque el plano
   * ya tenga el park de ahora) y, si el plano todavía no tiene un park de la nave de ahora, para dibujarlo en el cuadro
   * siguiente (sin el worker que sigue el dibujo, que lo arma fuera del hilo de la página). En medio de un arrastre solo
   * mide (una vez por nave): no se arma P por cada movida fuera del cuadro.
   */
  const wantIdleP = (measure = false) => {
    if (pMode !== 'adaptive' || pIdleId || !prov || !plan) return;
    pIdleId =
      idle(() => {
        pIdleId = 0;
        if (disposed || !prov || !plan || !state.options.overlay || !state.inputKey) return;
        const key = state.inputKey;
        const shownNow = state.shown?.inputKey === key && (state.shown.exact || state.shown.tier === 'P');
        const draw = !fQueue && !shownNow && !state.live && !cache.peek(key);
        if (!draw && !(measure || pEst == null)) return;
        if (state.live && pEst != null) return;
        const rev = state.rev;
        const p = prov.run(state.building, state.options, plan);
        if (p?.ms != null) noteP(p.ms);
        // lo que llegó mientras tanto (el exacto de esta nave) va antes
        if (draw && p && state.inputKey === key && state.rev === rev && !cache.peek(key)) {
          show(p, { rev, tier: 'P', exact: false, inputKey: key, guess: true });
          schedule();
        }
      }) || 1;
  };
  /**
   * Si el park del plano es de un plano anterior (otra nave u otras opciones): se dibuja más tenue y el estado lo dice.
   * Sale de la clave, no solo de la marca: un park de otra nave nunca pasa por el de ahora. La excepción es un P de hace
   * unos cuadros mientras no entra otro en el cuadro (ya se ve como provisional: marcarlo lo haría titilar).
   */
  const isStale = () => {
    const sh = state.shown;
    if (!sh) return false;
    if (sh.stale || sh.tier === 'stale') return true;
    return sh.inputKey !== state.inputKey && sh.tier !== 'P';
  };
  /**
   * Cómo se ve el park del plano: `follow` («siguiendo»: en medio de un arrastre, el que sea, y al soltar, uno de una
   * posición de ese arrastre mientras no llega el de la final), `stale` (de un plano anterior que no se sigue: más
   * tenue), `unconfirmed` (el P de la nave de ahora, del worker que sigue el dibujo o de la página, hasta que llega su
   * exacto: un poco más tenue que el de ahora, porque a veces el exacto es otro park), `current` (el de la nave de ahora:
   * el exacto o el de la sesión antes de `finish`) o `none` (sin park).
   */
  const lookOf = () => {
    const sh = state.shown;
    if (!sh) return 'none';
    const mine = sh.inputKey === state.inputKey && !isStale();
    if (follow && (state.live || !mine)) return 'follow';
    if (!mine && isStale()) return 'stale';
    return sh.guess ? 'unconfirmed' : 'current';
  };
  const show = (result, shown) => {
    const before = state.result;
    state.result = result;
    state.shown = shown;
    if (before !== result || shown.tier === 'P') panelsDirty = true;
    attachWalk();
  };
  let disposed = false;
  /**
   * Lo que un park nuevo le agrega a su cuadro en un arrastre (`parkCost`) y cuándo empezó el último. Se mide de su rAF
   * al siguiente (también lo que tarda en pintarse y rasterizarse, que no corre en el hilo de la página), contra lo que
   * va de un rAF al siguiente sin park nuevo en el medio: la mediana de los últimos cuadros con park menos la de los
   * últimos sin park. Así un cuadro que se perdió por otra cosa (la máquina, un mensaje, el GC) no frena, y con la página
   * a 30 cuadros por segundo un park que entra en el cuadro tampoco: frena solo lo que cuesta dibujarlo. En un arrastre,
   * un park nuevo que sigue el dibujo (el exacto de una posición de en medio, el P del worker) va si desde el último
   * pasaron `PARK_SHARE` veces eso (`parkRoom`). Como el rAF va de a cuadros enteros, un park que no entra en el suyo le
   * hace perder uno (o más) al contorno, y el próximo espera cinco veces lo que costó: a lo sumo un cuadro perdido de
   * cada cinco y el contorno sigue al puntero. Con un park que se dibuja dentro del cuadro, en cada cuadro.
   */
  let parkCost = 0;
  let lastParkAt = -Infinity;
  let drawnResult = null;
  let drewAt = 0;
  /** De su rAF al siguiente: los últimos cuadros que dibujaron un park nuevo en un arrastre y los últimos sin. */
  const gapsAfterPark = [];
  const gapsQuiet = [];
  const remember = (list, v, n) => {
    list.push(v);
    if (list.length > n) list.shift();
  };
  const median = list => [...list].sort((a, b) => a - b)[list.length >> 1];
  const parkRoom = at => at - lastParkAt >= PARK_SHARE * parkCost;
  /** El park y el aspecto que la sonda de `?perf=1` ya contó como dibujados. */
  let seen = { result: null, look: 'none' };
  const onFrame = ts => {
    rafId = 0;
    // un cuadro pedido antes de `dispose` (el panel ya no está)
    if (disposed) return;
    const startAt = performance.now();
    const prevTs = lastTs;
    const gap = typeof ts === 'number' && prevTs && ts > prevTs ? ts - prevTs : null;
    if (gap != null && gap <= 100) {
      vsync = vsync * 0.8 + Math.min(Math.max(gap, 1000 / 240), 1000 / 60) * 0.2;
      if (!(hz > 0)) interval = vsync;
    }
    if (typeof ts === 'number') lastTs = ts;
    // si el cuadro anterior dibujó un park nuevo en un arrastre, lo que duró; si no, lo que dura un cuadro acá sin park
    if (gap != null && drewAt && drewAt === prevTs && gap < 250) remember(gapsAfterPark, gap, 5);
    else if (gap != null && gap <= 100) remember(gapsQuiet, gap, 9);
    if (gapsAfterPark.length)
      parkCost = Math.max(0, median(gapsAfterPark) - (gapsQuiet.length ? median(gapsQuiet) : 1000 / 60));
    // el cuadro anterior armó P en el cuadro de una movida: si se pasó, cuenta (`pOverruns`)
    if (pFrameAt >= 0 && state.live && startAt - pFrameAt > 1.5 * vsync) {
      pOverruns += 1;
      state.pOverruns = pOverruns;
    }
    pFrameAt = -1;
    drewAt = 0;
    const frameAt = typeof ts === 'number' ? ts : performance.now();
    const rev = state.rev;
    const key = state.inputKey;
    let tier = null;
    let pMs = null;
    // P está prendido pero este cuadro no tiene lugar para él
    let waitingP = false;
    if (!state.building) {
      // todavía sin nave
    } else if (!key) {
      if (state.result?.error !== NO_OUTLINE)
        show(
          { ok: false, error: NO_OUTLINE, ms: 0, layoutHash: null },
          { rev, tier: 'cache', exact: true, inputKey: null },
        );
      tier = 'cache';
    } else if (
      state.shown?.inputKey === key &&
      state.shown.exact &&
      // el mismo de la caché (o uno que ya salió de ella): si cambió (el final de `finish`), se pone el nuevo
      [undefined, state.result].includes(cache.peek(key))
    ) {
      if (state.shown.stale) state.shown = { ...state.shown, stale: false };
      tier = 'cache';
    } else {
      const hit = cache.get(key);
      const fail = hit ? null : failed.peek(key);
      if (hit?.final === false) {
        // el exacto de la sesión, antes de medir lo que se camina (el de autoLayout lo da `finish`): provisional
        if (state.result !== hit) show(hit, { rev, tier: 'P', exact: false, inputKey: key });
        tier = 'P';
      } else if (hit) {
        show(hit, { rev, tier: 'cache', exact: true, inputKey: key });
        tier = 'cache';
      } else if (fail && !eQueue.busy) {
        // el worker falló con esta nave y no hay otro pedido en camino: el error, como lo de ahora (no es su park)
        if (state.result !== fail) show(fail, { rev, tier: 'E', exact: true, inputKey: key });
        tier = 'cache';
      } else if (state.shown?.inputKey === key && state.shown.tier === 'P') {
        tier = 'P'; // la misma nave que el P de antes (el aviso de soltar): ya está
      } else if (prov && plan && state.options.overlay && pInFrame(frameAt)) {
        const p = prov.run(state.building, state.options, plan);
        pMs = p?.ms ?? null;
        if (pMs != null) {
          pCost = { ms: pMs, at: frameAt };
          noteP(pMs);
        }
        if (p) {
          show(p, { rev, tier: 'P', exact: false, inputKey: key, guess: true });
          tier = 'P';
        } else tier = 'stale';
      } else {
        waitingP = !!(prov && plan && state.options.overlay);
        tier = 'stale';
        // sin lugar en el cuadro: sin gesto, P después del cuadro; la primera vez en esta nave, para medirlo
        if (waitingP && pMode === 'adaptive' && (!state.live || pEst == null)) wantIdleP();
      }
      if (tier === 'stale') {
        // el de antes, o el más nuevo que terminó mientras tanto: un exacto de una posición de en medio o el P del
        // worker que sigue el dibujo (de otra nave: también de otro plano). En un arrastre, un park nuevo de otra
        // posición va solo si al cuadro le queda lugar para dibujarlo (`parkRoom`): el contorno no se traba
        const fp = newestP && (follow || newestP.inputKey === key) ? newestP : null;
        const pick = fp && (!newest || fp.rev > newest.rev) ? fp : newest;
        const mine = !!pick && pick.inputKey === key;
        if (
          pick &&
          (!state.shown || pick.rev > state.shown.rev) &&
          pick !== state.result &&
          (!state.live || parkRoom(frameAt))
        ) {
          if (mine) {
            show(pick, { rev: pick.rev, tier: 'P', exact: false, inputKey: key, guess: pick === fp });
            tier = 'P';
          } else show(pick, { rev: pick.rev, tier: 'stale', exact: false, stale: true, inputKey: pick.inputKey });
        }
        // (un P de hace unos cuadros, mientras no entra otro en el cuadro, no se marca: se vería titilar)
        else if (
          state.shown &&
          !state.shown.stale &&
          state.shown.inputKey !== key &&
          !(waitingP && state.shown.tier === 'P' && frameAt - pCost.at <= P_GRACE_MS)
        )
          state.shown = { ...state.shown, stale: true };
      }
    }
    // lo que hace la página de acá al fin del cuadro (`pageAfter`): después de P, o de elegir el park sin P
    const afterAt = performance.now();
    // ya suelto, el park de la nave de ahora llegó al plano: deja de seguir
    if (follow && !state.live && key && state.shown?.inputKey === key && !isStale()) follow = false;
    // sin un park de la nave de ahora en el plano: su P, al worker que sigue el dibujo
    if (key && state.shown?.inputKey !== key) wantFollow();
    drawLayer();
    markPanel();
    // (el mismo park con otra respuesta, su exacto que confirma el P, no se vuelve a dibujar: no cuenta)
    if (!samePark(state.result, drawnResult)) {
      lastParkAt = frameAt;
      // lo que dura el cuadro con un park nuevo se sabe en el rAF siguiente (`parkRoom`)
      drewAt = state.live && typeof ts === 'number' ? ts : 0;
      // y lo que le costó a la página, cuando termine de pintarlo (`pageAfter`; si fue P en el cuadro de una movida, si
      // se pasó del cuadro)
      if (frameEnd && state.result?.ok) {
        frameEnds.push({ after: afterAt });
        frameEnd.port2.postMessage(0);
      }
    }
    // P en el cuadro de una movida: el cuadro siguiente dice si este se pasó (aunque no llegue otra movida)
    if (pMs != null && tier === 'P' && state.live) {
      pFrameAt = startAt;
      schedule();
    }
    drawnResult = state.result;
    if (tier) perf.drawn({ rev, tier, pMs, layoutHash: tier === 'P' ? state.result?.layoutHash : null });
    if (key && state.shown?.inputKey === key && state.result?.final === false) wantWalk();
    // la sonda de ?perf=1 (la misma regla que editor-park-check): un park que no es el exacto de la nave de ahora tiene
    // que ser P o verse más tenue (la capa `park-stale` o `park-following`, lo que se pinta)
    if (perf.on) {
      const sh = state.shown;
      const current = !!(sh?.exact && sh.inputKey === key);
      const cls = layerOf()?.classList;
      const dimmed = !!(cls?.contains('park-stale') || cls?.contains('park-following'));
      perf.frameState?.({ unmarked: !!(key && sh && !current && sh.tier !== 'P' && !dimmed) });
      // lo que ve quien dibuja: cada park nuevo en el plano (y cada cambio de aspecto), de qué cambio es y si es el de
      // la nave de ahora (`current`) y el exacto (`exact`)
      const look = lookOf();
      if (state.result !== seen.result || look !== seen.look) {
        perf.parkDrawn?.({
          rev: sh?.rev ?? null,
          current: !!(key && sh?.inputKey === key && !isStale()),
          exact: !!sh?.exact,
          look,
          changed: state.result !== seen.result,
          layoutHash: state.result?.layoutHash ?? null,
          inputKey: sh?.inputKey ?? null,
        });
        seen = { result: state.result, look };
      }
    }
    if (state.shown?.exact && state.shown.inputKey === key && key) {
      perf.exactShown({ rev, inputKey: key, since: keySince });
      wantWalk();
      if (shownWalk && state.walk) {
        perf.walkShown({ rev, inputKey: key, since: keySince, ms: state.walk.ms });
        shownWalk = false;
      }
    }
    updateStatus();
    // el panel, con la página quieta: no en medio de un arrastre
    if (panelsDirty && !state.live && !idleId)
      idleId =
        idle(() => {
          idleId = 0;
          if (disposed) return;
          if (state.live) return;
          renderPanels();
        }) || 1;
  };
  const updateStatus = () => {
    const r = state.result;
    const sh = state.shown;
    if (!r) return status(state.busy ? 'Armando el park…' : 'Esperando la nave…', state.busy ? 'busy' : '');
    const stale = isStale();
    // «siguiendo»: el park de una posición del arrastre (o el de esta, en medio del gesto), nunca como el de ahora
    if (lookOf() === 'follow') {
      if (!r.ok && !stale) return status('Siguiendo el dibujo · acá no se puede armar', 'error');
      return status(
        state.live ? 'Siguiendo el dibujo…' : 'Siguiendo el dibujo · armando el de la posición final…',
        'busy',
      );
    }
    if (!r.ok && !stale) return status('No se pudo armar', 'error');
    if (sh?.tier === 'P') return status('Park provisional · armando el exacto…', 'busy');
    if (stale) return status('Park de un plano anterior · armando el de ahora…', 'busy');
    const done = `Park armado en ${secs(r.ms)}`;
    if (state.walk?.ok) return status(`${done} · circulación en ${secs(state.walk.ms)}`, 'ok');
    if (state.walk) return status(`${done} · sin circulación: ${state.walk.error}`, 'ok');
    return status(`${done} · midiendo lo que se camina…`, 'busy');
  };

  // ------- dibujo -------
  const planShell = $('plan-shell');
  const planPark = $('plan-park');
  const planGhost = $('plan-ghost');
  const planMark = $('plan-mark');
  const plan_ = $('plan');
  let ghostAt = null;
  /** La explicación que se muestra: con «Cómo decide» y el park exacto que la trae, o null. */
  const explained = () =>
    state.options.explain && state.result?.ok && state.shown?.exact && !isStale()
      ? (state.result.explain ?? null)
      : null;
  /** La pista que gana en `ex` (el número de su candidata). */
  const winnerOf = ex => ex?.packs[ex.winner]?.plan ?? rankedPlans(ex)[0]?.index ?? null;
  /** Con «Cómo decide»: todas las candidatas en el plano, coloreadas por puntaje, y la que se mira (`ghostAt`). */
  const ghost = () => {
    const ex = explained();
    return ex ? candidatesSVG(ex, ghostAt) : '';
  };
  /** La marca de «ver» en el plano del editor, mientras siga el mismo park: `{ where, result }`. */
  let mark = null;
  /**
   * Las piezas del park en el plano para lo de ahora (los elementos descritos de `overlayNodes`; se arman de nuevo solo
   * si cambió el park o lo que se ve).
   */
  let memo = {};
  const layerParts = () => {
    const r = state.result;
    const overlay = !!state.options.overlay;
    const ex = explained();
    const m = mark?.result === r ? mark.where : null;
    // el mismo park con otra respuesta (su exacto que confirma el P, el final de `finish` igual al exacto): las mismas
    // piezas, así lo único que cambia en el plano es el aspecto (una clase)
    const parts =
      samePark(memo.r, r) && memo.overlay === overlay
        ? memo.parts
        : overlay && r?.ok
          ? overlayNodes(r.layout, r.shapes)
          : [];
    const extra =
      memo.r === r && memo.ex === ex && memo.ghostAt === ghostAt && memo.mark === m
        ? memo.extra
        : ghost() + (m ? markSVG(m) : '');
    memo = { r, overlay, ex, ghostAt, mark: m, parts, extra };
    return memo;
  };
  /**
   * Lo que hay en el plano del editor: el grupo del park (una pieza por hijo: `parts`, sus elementos descritos, y
   * `nodes`, los del DOM) y el de las candidatas y la marca.
   */
  let dom = null;
  /**
   * El park en el plano del editor: lo único que se redibuja en cada cuadro de un arrastre, y de cada pieza (la pista,
   * cada zona, cada hueco) solo los atributos y los textos que cambiaron desde el cuadro anterior (svg-patch.js).
   */
  const drawLayer = () => {
    const el = layerOf();
    if (!el) return;
    const ex = explained();
    if (ex && !ex.plans.some(q => q.index === ghostAt)) ghostAt = winnerOf(ex);
    const { parts, extra } = layerParts();
    if (!dom || dom.el !== el || !el.contains(dom.overlay) || dom.overlay.childNodes.length !== dom.nodes.length) {
      el.innerHTML = `${OVERLAY_OPEN}</g><g class="park-extra"></g>`;
      dom = { el, overlay: el.firstElementChild, extra: el.lastElementChild, parts: [], nodes: [], extraText: '' };
    }
    if (parts !== dom.parts) {
      dom.nodes = patchKeyed(dom.overlay, dom.parts, dom.nodes, parts);
      dom.parts = parts;
    }
    if (extra !== dom.extraText) {
      dom.extra.innerHTML = extra;
      dom.extraText = extra;
    }
    el.classList.toggle('park-explaining', !!ex);
    const look = lookOf();
    el.classList.toggle('park-stale', look === 'stale');
    el.classList.toggle('park-following', look === 'follow');
    el.classList.toggle('park-unconfirmed', look === 'unconfirmed');
    el.classList.toggle('park-provisional', state.shown?.tier === 'P');
  };
  /** La candidata que se mira: la línea del paso a paso y su puntaje término a término contra la que ganó. */
  const drawCandidate = () => {
    const ex = explained();
    const box = panel.querySelector('[data-park="cand"]');
    const head = panel.querySelector('[data-park="cand-head"]');
    if (!ex || !box || !head) return;
    const c = candidateHTML(ex, ghostAt);
    head.textContent = c.head;
    box.innerHTML = c.html;
  };
  /** Lo que se dibujó en el panel la última vez (si no cambió, no se rehace). */
  const drawn = { plan: null, rows: null, explain: null, view3d: null };
  /**
   * En cada cuadro, sin rearmar el panel: si la lista es la del park que está en el plano (`data-stale`) y si lo que se
   * camina que muestra es el de ese mismo park (`data-walk="current"`) o no (`pending`: la de un park anterior, o
   * todavía sin medir). Así lo que se camina de otro park nunca queda como lo de ahora, ni en medio de un arrastre.
   */
  const markPanel = () => {
    const r = state.result;
    const listed = drawn.rows;
    const walk = state.walk && state.walk.layoutHash === r?.layoutHash ? state.walk : null;
    const fresh = !!listed && listed[0] === r;
    const mode = !r?.ok ? '' : fresh && walk && listed[1] === walk ? 'current' : 'pending';
    if (panel.dataset.walk !== mode) panel.dataset.walk = mode;
    const stale = r && (!fresh || isStale()) ? '1' : '';
    if ((panel.dataset.stale ?? '') !== stale) panel.dataset.stale = stale;
  };
  /**
   * El panel: el plano propio, el resumen, la lista y «Cómo decide» del park del plano; cada parte solo si cambió lo
   * que muestra. Lo llama el cuadro cuando la página está quieta (y los tests).
   */
  const renderPanels = ({ force = false } = {}) => {
    panelsDirty = false;
    if (force) for (const k of Object.keys(drawn)) drawn[k] = undefined;
    // el provisional no trae avisos ni «Cómo decide»: el panel sigue con lo del último exacto (marcado) hasta que llegue
    if (state.shown && !state.shown.exact) {
      markPanel();
      return;
    }
    const r = state.result;
    const shell = r?.ok ? r.layout.shell : state.building?.shell;
    const ex0 = explained();
    if (!ex0) ghostAt = null;
    else if (!ex0.plans.some(q => q.index === ghostAt)) ghostAt = winnerOf(ex0);
    // el plano propio repite lo que ya está en el del editor: solo cuando el park no se ve encima del dibujo
    const hidePlan = !!layerOf() && (!!state.options.overlay || !!ex0);
    plan_.toggleAttribute('hidden', hidePlan);
    // escondido también se arma (con la página quieta): al apagar «Park sobre el plano» ya está
    const planKey = [r, shell, ex0, ghostAt];
    if (!same(drawn.plan, planKey)) {
      drawn.plan = planKey;
      plan_.setAttribute('viewBox', viewBoxOf(shell));
      planShell.innerHTML = shellSVG(shell);
      planPark.innerHTML = r?.ok ? overlaySVG(r.layout, r.shapes) : '';
      planGhost.innerHTML = ghost();
      planMark.innerHTML = '';
    }
    // lo que se camina va solo si es de este mismo park
    const walk = state.walk && state.walk.layoutHash === r?.layoutHash ? state.walk : null;
    const pending = !!r?.ok && !walk;
    const rowsKey = [r, walk, state.shown?.tier];
    if (!same(drawn.rows, rowsKey)) {
      drawn.rows = rowsKey;
      state.rows = issueRows(r, walk);
      const sum = r?.ok ? summary(r, walk) : (r?.error ?? '');
      $('summary').textContent = sum + (pending && state.shown?.exact ? ' · circulación: midiendo…' : '');
      $('summary').dataset.kind = r && !r.ok ? 'error' : '';
      $('count').textContent = r?.ok ? `(${state.rows.length}${pending ? ' · circulación pendiente' : ''})` : '';
      $('issues').innerHTML = r?.ok
        ? state.rows.map(rowHTML).join('') || '<li class="park-ok">Sin errores ni avisos.</li>'
        : '';
      for (const k of ['3d', 'viewer', 'download'])
        /** @type {HTMLButtonElement} */ ($(k)).disabled = !(r?.ok && state.shown?.exact);
    }
    const exKey = [state.options.explain && r?.ok ? r : null, ex0];
    const exEl = $('explain');
    exEl.hidden = !(state.options.explain && r?.ok);
    if (!same(drawn.explain, exKey)) {
      drawn.explain = exKey;
      exEl.innerHTML = state.options.explain && r?.ok ? (ex0 ? STEPPER : '') + explainHTML(ex0) : '';
    }
    drawCandidate();
    markCandidate();
    drawLayer();
    markPanel();
    const exactLayout = r?.ok && state.shown?.exact && !isStale() ? r.layout : null;
    if (drawn.view3d !== exactLayout) {
      drawn.view3d = exactLayout;
      view3d?.update(exactLayout);
    }
  };
  /** Marca `where` en los dos planos y le avisa al editor (`park:locate`), por si quiere centrar la vista ahí. */
  const locate = where => {
    planMark.innerHTML = markSVG(where);
    // en el plano del editor queda mientras siga el mismo park
    mark = where ? { where, result: state.result } : null;
    drawLayer();
    if (where) window.dispatchEvent(new CustomEvent('park:locate', { detail: where }));
  };
  /** La fila de la candidata que se ve, marcada en las tablas de «Cómo decide» (también si va junto con otras). */
  const markCandidate = () => {
    for (const tr of panel.querySelectorAll('.park-explain tr[data-cand]')) {
      const same_ = (tr.getAttribute('data-same') ?? '').split(',').filter(Boolean).map(Number);
      tr.classList.toggle('park-shown', Number(tr.getAttribute('data-cand')) === ghostAt || same_.includes(ghostAt));
    }
  };
  /** La candidata `i` de «Cómo decide» encima del plano propio y del editor (`null`: la que ganó). */
  const showGhost = i => {
    const ex = explained();
    ghostAt = i ?? winnerOf(ex);
    planGhost.innerHTML = ghost();
    drawLayer();
    drawCandidate();
    markCandidate();
  };
  /** La anterior o la siguiente por puntaje (`step`: −1 / +1), dando la vuelta. */
  const stepGhost = step => {
    const ranked = rankedPlans(explained());
    if (!ranked.length) return;
    const k = ranked.findIndex(p => p.index === ghostAt);
    showGhost(ranked[(k + step + ranked.length) % ranked.length].index);
  };

  // ------- los cambios -------
  /** Un cambio de la nave o de las opciones: el park de la nueva va en el próximo cuadro y su exacto, al worker. */
  const edit = kind => {
    state.rev += 1;
    const key = state.building && isDrawn(state.building) ? inputKeyOf(state.building, state.options) : null;
    if (key !== state.inputKey) keySince = state.rev;
    state.inputKey = key;
    if (perf.on) perf.edit({ rev: state.rev, kind, inputKey: key });
    wantExact();
    if (!state.live) settle();
    schedule();
  };
  /**
   * Con la nave quieta (soltar, una opción, deshacer, otra nave): el exacto de una posición de en medio del arrastre no
   * se espera. Se corta (otro worker, que vuelve a cargar el núcleo) y sale ya el de la nave de ahora.
   */
  const settle = () => {
    const f = eQueue.inFlight;
    if (f && f.inputKey !== state.inputKey && eQueue.pending?.inputKey === state.inputKey && worthCutting(eQueue, eMs))
      eQueue.preempt();
  };
  form.addEventListener('change', () => {
    const before = state.options;
    state.options = readOptions();
    try {
      storage?.setItem(OPTIONS_KEY, JSON.stringify(state.options));
    } catch {
      // sin localStorage (modo privado): las opciones duran lo que la página
    }
    if (!state.options.explain) ghostAt = null;
    if (needsLayout(before, state.options, state.result)) {
      // otras opciones: el park que quede hasta que llegue el nuevo no sigue el dibujo, es de un plano anterior
      follow = false;
      edit('option');
    } else schedule(true);
  });
  form.addEventListener('submit', e => e.preventDefault());
  panel.addEventListener('click', e => {
    const t = /** @type {HTMLElement} */ (e.target);
    const row = t.closest('[data-row]');
    if (row && panel.querySelector('[data-park="issues"]')?.contains(row)) {
      const r = state.rows[Number(row.getAttribute('data-row'))];
      if (r?.where) locate(r.where);
      return;
    }
    const stepBtn = t.closest('[data-step]');
    if (stepBtn) {
      const k = stepBtn.getAttribute('data-step');
      if (k === 'win') showGhost(null);
      else stepGhost(Number(k));
      return;
    }
    const cand = t.closest('[data-cand]');
    if (cand) {
      showGhost(Number(cand.getAttribute('data-cand')));
      return;
    }
    const r = state.result;
    if (!r?.ok || !state.shown?.exact) return;
    if (t.closest('[data-park="3d"]')) {
      // la misma ventana cada vez: al cerrarla el motor queda en pausa, no se suelta
      view3d ??= open3D();
      view3d.update(r.layout);
      drawn.view3d = r.layout;
      view3d.show();
    } else if (t.closest('[data-park="viewer"]'))
      void openInViewer(r.layout).then(blocked => {
        if (blocked) status('El navegador no dejó abrir la pestaña: permití las ventanas emergentes', 'error');
      });
    else if (t.closest('[data-park="download"]')) download(r.layout);
  });
  let view3d = null;

  /** Qué cambió de la nave, para `?perf=1` (`vertex`, `opening`, `column`, `existing` o `set`). */
  let prevBuilding = null;
  const kindOf = (b, info) => {
    if (info?.reason && info.reason !== 'set') return info.reason;
    const a = prevBuilding?.shell;
    const s = b?.shell;
    if (!a || !s) return 'set';
    const j = v => JSON.stringify(v ?? null);
    if (a.outline !== s.outline && j(a.outline) !== j(s.outline)) return 'vertex';
    if (a.openings !== s.openings && j(a.openings) !== j(s.openings)) return 'opening';
    if (j(a.structure?.columns) !== j(s.structure?.columns)) return 'column';
    if (a.existing !== s.existing && j(a.existing) !== j(s.existing)) return 'existing';
    return 'set';
  };
  // cada aviso del store, también en medio de un gesto (`live`): el park de ese cuadro va en ese cuadro
  const onBuilding = (_b, info) => {
    const b = store.getBuilding();
    const wasLive = state.live;
    state.live = !!info?.live;
    if (b === state.building && !wasLive === !state.live) return;
    // el gesto: la primera movida empieza a seguir el dibujo; soltar no lo corta (sigue hasta que llega el de la
    // posición final), y otro cambio sin gesto (una opción, deshacer, otra nave) sí
    // (y P en el cuadro vuelve a probarse: lo que se pasó de un cuadro en el gesto de antes no cuenta para este)
    if (state.live && !wasLive) {
      follow = true;
      pOverruns = 0;
      state.pOverruns = 0;
    } else if (!state.live && !wasLive) follow = false;
    if (state.live !== wasLive) perf.gesture?.({ live: state.live, rev: state.rev });
    // con E en paralelo, en medio del gesto el worker del exacto usa menos ayudantes y al soltar todos (park-fanout.js)
    if (state.live !== wasLive && eFanout) eQueue.signal({ type: 'live', live: state.live });
    if (b === state.building) {
      // el aviso de soltar con la misma nave: el panel ya puede rearmarse, y el exacto de en medio no se espera
      settle();
      schedule(true);
      return;
    }
    const kind = perf.on ? kindOf(b, info) : 'set';
    prevBuilding = b;
    state.building = b;
    // otra nave (una plantilla, una del sitio, un JSON): el park de la de antes no se muestra encima de esta
    if (info?.reason === 'load') {
      // lo lento que fue el P de la otra nave no cuenta para esta (ni lo que costó dibujar sus parks)
      pCost = { ms: 0, at: -Infinity };
      pEst = null;
      state.pEst = null;
      pageAfter.length = 0;
      state.pageMs = null;
      loadRev = state.rev + 1;
      newest = null;
      newestP = null;
      // ni el camino de la pista de la de antes: P (en la página y en el worker que sigue el dibujo) espera al primer
      // exacto de esta (sobre otra nave casi nunca entra y, si entra, casi nunca es su park: cambiaría otra vez)
      plan = null;
      if (state.result) {
        state.result = null;
        state.shown = null;
        state.walk = null;
        panelsDirty = true;
      }
    }
    edit(kind);
  };
  const unsubscribe = store.subscribe(onBuilding);
  onBuilding(null, {});
  return {
    client: eQueue,
    walkClient: wQueue,
    followClient: fQueue,
    state,
    cache,
    walks,
    locate,
    showGhost,
    renderPanels,
    /** Si no queda nada por dibujar (ni el cuadro ni el panel). */
    get idle() {
      return !rafId && !idleId && !panelsDirty;
    },
    dispose() {
      disposed = true;
      unsubscribe?.();
      eQueue.dispose();
      wQueue.dispose();
      fQueue?.dispose();
      frameEnd?.port1.close();
      view3d?.close();
      perf.dispose?.();
      const el = layerOf();
      if (el) el.innerHTML = '';
      panel.innerHTML = '';
    },
  };
}

/**
 * Cuánto le tiene que faltar a un pedido para cortarlo (`preempt`): el worker nuevo vuelve a cargar el núcleo y arranca
 * con el código del `.wasm` sin optimizar, así que con un exacto corto esperar sale igual o más barato. Lo que falta se
 * estima con lo que tardó el último pedido de ese worker menos lo que lleva el de ahora.
 */
export const PREEMPT_MIN_MS = 2000;

/** Si conviene cortar el pedido en curso de `queue` (`lastMs`: lo que tardó el último que contestó). */
export function worthCutting(queue, lastMs) {
  return lastMs != null && lastMs - queue.inFlightMs > PREEMPT_MIN_MS;
}

/**
 * El worker del exacto, con los ayudantes de E en paralelo que pida la página (`editor.html?ew=N`; sin eso, según los
 * núcleos: park-fanout.js).
 */
function exactWorkerUrl() {
  const u = new URL('./park-worker.js', import.meta.url);
  const ew = typeof location === 'undefined' ? null : new URLSearchParams(location.search).get('ew');
  if (ew != null) u.searchParams.set('ew', ew);
  return u;
}

/**
 * Cuántas veces lo que le agregó a su cuadro el último park dibujado en un arrastre espera el próximo (`parkRoom`): un
 * cuadro perdido de cada cinco, a lo sumo (con 3 era uno de cada tres: el contorno se trababa a la vista).
 */
export const PARK_SHARE = 5;

/** Si `a` y `b` son el mismo park: la misma respuesta o el mismo `layoutHash` (el hash del JSON del layout). */
const samePark = (a, b) => a === b || (!!a?.ok && !!b?.ok && a.layoutHash != null && a.layoutHash === b.layoutHash);

/** Si el contorno ya está cerrado (3 vértices o más): recién ahí hay una nave que armar (`isDrawn` de state.js). */
const isDrawn = b => (b?.shell?.outline?.length ?? 0) >= 3;

/** Si dos listas de lo que se dibujó son lo mismo (cada cosa, la misma: el panel no se rehace). */
function same(a, b) {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}

/** Baja el layout armado como `<id>.json` (para `data/layouts/` o para pegarlo en otra herramienta). */
function download(layout) {
  const blob = new Blob([JSON.stringify(layout, null, 2) + '\n'], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${layout.id || 'nave'}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}
