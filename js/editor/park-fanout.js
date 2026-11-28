// E en paralelo (docs/TIEMPO-REAL.md, «E en paralelo»): el worker del park exacto (park-worker.js) reparte el exacto
// entre varios workers ayudantes (el mismo park-worker.js con `?helper`), sin memoria compartida (GitHub Pages no da
// `SharedArrayBuffer`): cada pedido y cada respuesta son texto, y lo que junta el núcleo (`session.fanout.step`) da el
// mismo exacto que `session.exact`, byte a byte (crates/park3d-core/src/autolayout/fanout.rs).
//
// 1. Las partes de los candidatos de pista (`fanout.plans`): el doble de partes que ayudantes, a cada ayudante la
//    siguiente al quedar libre (así una parte cara no frena a las demás).
// 2. Rondas: el coordinador (`fanout.step`, en este worker) corre las decisiones del generador con lo armado hasta
//    ahora y da los programas que faltan; cada uno va al primer ayudante libre (antes al que enumeró su plan, que no lo
//    tiene que volver a armar), y con lo que vuelve, otra ronda. Cada ayudante manda también el layout de cada programa
//    que puede ganar: el del ganador se lo da al coordinador (`winner`), que así no lo vuelve a armar. Hasta que da el
//    exacto (o `fallback`: entonces `session.exact`, que da lo mismo).
// 3. El núcleo es uno solo: el coordinador compila el `.wasm` (un `WebAssembly.Module`) y se lo pasa a cada ayudante
//    al crearlo (`core`), que arranca de ese y no del que se baje entonces (el sitio se publica solo cada 30 min: un
//    ayudante creado después de una publicación armaría con otro generador, y el exacto juntado no sería el de ninguna
//    versión). Cada respuesta trae la huella de ese `.wasm` (`build`, un SHA-256 de sus bytes): si no es la del
//    coordinador, no se reparte más en esta página (`fallback` «versión»: el exacto sale de `session.exact`).

/**
 * Cuántos ayudantes trabajan en medio de un gesto (`live`, lo avisa la página): el exacto de una posición de en medio
 * casi solo renueva el camino de P, y los demás núcleos los usan la página y el worker que sigue el dibujo. Al soltar,
 * todos (también en el exacto en curso).
 */
export const LIVE_HELPERS = 2;

/** Cuántos ayudantes por defecto: los núcleos menos la página, este worker y el de lo que se camina, hasta 6. */
export function defaultHelpers(cores) {
  const n = Number.isFinite(cores) && cores > 0 ? cores : 4;
  return Math.max(0, Math.min(6, n - 3));
}

/**
 * Los ayudantes de E en paralelo: `spawn()` crea uno (un `Worker`, o lo que tenga `postMessage`, `onmessage`,
 * `onerror` y `terminate`, para los tests) y `size` cuántos (se crean al primer pedido). `core`: la promesa del núcleo
 * del coordinador, `{ module, build }` (lo primero que recibe cada ayudante: arranca de ese `module`, y `build` es la
 * huella que tiene que volver en cada respuesta; si da `null` o falla, no se reparte); sin `core`, sin ese chequeo
 * (los tests). `exact(session, naveJson, optionsJson)` da el exacto (el objeto de `session.exact`) o `null` si no se
 * reparte (`fallback`) o si un ayudante falló (entonces se vuelven a crear antes del pedido siguiente) o corre otro
 * núcleo (entonces no se reparte más). `stats` cuenta lo del último: rondas, programas y ms.
 */
export function createFanout({ spawn, size, core }) {
  /** @type {{ w: any, busy: boolean, parts: Set<number>, onDone: ((r: any) => void) | null }[]} */
  let helpers = [];
  let seq = 0;
  let broken = false;
  // la huella del núcleo del coordinador, y el motivo si un ayudante contestó con otra (desde ahí no se reparte)
  let build = null;
  let stale = null;
  // en medio de un gesto (`live`) trabajan los primeros `LIVE_HELPERS`; `kick` despierta a los demás al soltar
  let live = false;
  let kick = null;
  const cap = () => (live ? Math.min(size, LIVE_HELPERS) : size);
  const last = { rounds: 0, jobs: 0, parts: 0, ms: 0, fallback: null };
  const start = c => {
    if (helpers.length && !broken) return;
    for (const h of helpers) h.w.terminate?.();
    broken = false;
    helpers = Array.from({ length: size }, () => {
      const h = { w: spawn(), busy: false, parts: new Set(), onDone: null };
      h.w.onmessage = ({ data }) => {
        const f = h.onDone;
        h.onDone = null;
        f?.(data);
      };
      h.w.onerror = e => {
        e?.preventDefault?.();
        broken = true;
        const f = h.onDone;
        h.onDone = null;
        f?.({ error: `el ayudante falló: ${e?.message ?? String(e)}` });
      };
      // lo primero: el núcleo del coordinador (los mensajes llegan en orden: antes que cualquier pedido)
      if (c) h.w.postMessage({ kind: 'core', module: c.module, build: c.build });
      return h;
    });
  };
  /**
   * Corre `tasks` (`{ msg, part }`: `part`, la parte cuyo ayudante conviene) en los ayudantes, cada uno al primero
   * libre; da los textos en el orden de `tasks`, o lanza si un ayudante falló. `owns`: el ayudante se queda con esa
   * parte (sus planes quedan en él).
   */
  const run = (tasks, { owns = false } = {}) =>
    new Promise((resolve, reject) => {
      const out = new Array(tasks.length);
      const left = tasks.map((t, i) => i);
      let pending = tasks.length;
      let failed = false;
      if (!pending) return resolve(out);
      const next = h => {
        if (failed || !left.length || helpers.indexOf(h) >= cap()) return;
        // antes lo de una parte que este ayudante enumeró
        let at = left.findIndex(i => tasks[i].part != null && h.parts.has(tasks[i].part));
        if (at < 0) at = 0;
        const i = left.splice(at, 1)[0];
        const t = tasks[i];
        const id = ++seq;
        h.busy = true;
        if (owns && t.part != null) h.parts.add(t.part);
        h.onDone = data => {
          h.busy = false;
          if (failed) return;
          if (!data || data.id !== id || data.error != null) {
            failed = true;
            broken = true;
            kick = null;
            reject(new Error(data?.error ?? 'el ayudante contestó otro pedido'));
            return;
          }
          if (build != null && data.build !== build) {
            // otro `.wasm` (otra versión del generador): lo que arma no se junta con lo de este
            failed = true;
            broken = true;
            stale = `versión: el ayudante corre otro núcleo (${data.build ?? 'sin huella'}; el del coordinador, ${build})`;
            kick = null;
            reject(new Error(stale));
            return;
          }
          out[i] = data.text;
          pending -= 1;
          if (!pending) {
            kick = null;
            resolve(out);
          } else next(h);
        };
        h.w.postMessage({ ...t.msg, id });
      };
      kick = () => {
        for (const h of helpers) if (!h.busy) next(h);
      };
      kick();
    });
  return {
    size,
    get stats() {
      return { ...last };
    },
    /** Si la página está en medio de un gesto: menos ayudantes (`LIVE_HELPERS`); al soltar, todos, ya. */
    get live() {
      return live;
    },
    set live(v) {
      const was = live;
      live = !!v;
      if (was && !live) kick?.();
    },
    async exact(session, naveJson, optionsJson) {
      const t0 = typeof performance === 'undefined' ? Date.now() : performance.now();
      Object.assign(last, { rounds: 0, jobs: 0, parts: 0, ms: 0, fallback: null });
      if (!size || typeof session?.fanout?.step !== 'function') return null;
      if (stale) {
        last.fallback = stale;
        return null;
      }
      let c = null;
      if (core !== undefined) {
        try {
          c = await core;
        } catch {
          c = null;
        }
        if (!c?.build) {
          last.fallback = 'sin el núcleo compilado del coordinador';
          return null;
        }
        build = c.build;
      }
      start(c);
      for (const h of helpers) h.parts.clear();
      const nParts = 2 * cap();
      const base = { nave: naveJson, options: optionsJson };
      try {
        const parts = await run(
          Array.from({ length: nParts }, (_, part) => ({ msg: { ...base, kind: 'plans', part, parts: nParts }, part })),
          { owns: true },
        );
        last.parts = nParts;
        const done = [];
        // el layout de cada programa que puede ganar, por la clave de su pedido (`k|pi|orden`)
        const layouts = new Map();
        let winner = '';
        for (let round = 0, first = true; round < 64; round++, first = false) {
          // las partes van en la primera ronda: el coordinador las guarda
          const s = session.fanout.step(naveJson, optionsJson, first ? parts : [], done, cap(), winner);
          if (s.exact) {
            last.ms = (typeof performance === 'undefined' ? Date.now() : performance.now()) - t0;
            return s.exact;
          }
          if (s.winner != null) {
            const l = layouts.get(s.winner);
            winner = l != null ? `${s.winner}\n${l}` : 'rebuild';
            continue;
          }
          if (!s.jobs) {
            last.fallback = s.fallback ?? 'sin pedidos';
            return null;
          }
          last.rounds += 1;
          last.jobs += s.jobs.length;
          const texts = await run(
            s.jobs.map(j => ({ msg: { ...base, kind: 'jobs', jobs: JSON.stringify([j]) }, part: j.part })),
          );
          for (const t of texts) {
            // la lista de lo armado y, una por línea, el layout de los que traen `l`
            const [list, ...ls] = t.split('\n');
            let k = 0;
            for (const d of JSON.parse(list).done ?? [])
              if (d.l) layouts.set(`${d.k}|${d.pi}|${d.order.join(',')}`, ls[k++]);
            done.push(list);
          }
        }
        last.fallback = 'demasiadas rondas';
        return null;
      } catch (e) {
        last.fallback = e instanceof Error ? e.message : String(e);
        return null;
      }
    },
    dispose() {
      for (const h of helpers) h.w.terminate?.();
      helpers = [];
    },
  };
}

/**
 * Lo que contesta un ayudante (park-worker.js con `?helper`): `{ id, text, build }`, o `{ id, error, build }` si el
 * núcleo lanzó; `build`, la huella del núcleo con el que arrancó (la que le pasó el coordinador con su `module`).
 */
export function helperReply(session, msg, build = null) {
  try {
    if (msg?.kind === 'plans')
      return { id: msg.id, build, text: session.fanout.plans(msg.nave, msg.options, msg.part, msg.parts) };
    if (msg?.kind === 'jobs') return { id: msg.id, build, text: session.fanout.jobs(msg.nave, msg.options, msg.jobs) };
    return { id: msg?.id, build, error: `pedido desconocido: ${String(msg?.kind)}` };
  } catch (e) {
    return { id: msg?.id, build, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * El núcleo del coordinador para sus ayudantes: el `.wasm` de `url` compilado (`module`) y su huella (`build`, los
 * primeros 8 bytes del SHA-256 de sus bytes, en hexadecimal). El coordinador carga su propio núcleo de ese mismo
 * `module` (`loadCore({ wasm: module })`): así todos corren el mismo generador.
 */
export async function compileCore(url, { fetch: get = globalThis.fetch } = {}) {
  const res = await get(url);
  if (!res.ok) throw new Error(`el .wasm del núcleo: HTTP ${res.status}`);
  const bytes = await res.arrayBuffer();
  const [module, digest] = await Promise.all([WebAssembly.compile(bytes), crypto.subtle.digest('SHA-256', bytes)]);
  const build = Array.from(new Uint8Array(digest).slice(0, 8), b => b.toString(16).padStart(2, '0')).join('');
  return { module, build };
}
