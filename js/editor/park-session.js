// El park en el cuadro del cambio, en el hilo de la página (README, «Editor de plano»): la clave de cada pedido, la
// caché de los parks exactos ya armados y el park provisional.
//
// - `inputKeyOf(nave, opciones)`: la nave como la lee autoLayout y las opciones que cambian el park, en un texto.
//   Misma clave, mismo park (autoLayout es determinista): así deshacer, rehacer, volver a una posición o a una opción
//   de antes dibuja el park exacto en el mismo cuadro, de la caché (`createLRU`).
// - `createProvisional(api)`: el park provisional (P) de `createAutoLayoutSession().provisional` del paquete, si lo
//   trae: el camino de la pista que ganó la última vez (`plan`, del park exacto) armado sobre la nave nueva, sincrónico
//   y en pocos ms. Sin esa función (el paquete de antes), `null`: el cuadro dibuja lo de la caché o el último park,
//   marcado como de un plano anterior, hasta que llega el exacto del worker.
import { cleanOptions, layoutHash, naveOf, shapesOf } from './park-run.js';

/** Las opciones que cambian el park (las de `cleanOptions` menos `explain`, que solo agrega «Cómo decide»). */
export function parkOptions(options) {
  const o = cleanOptions(options);
  delete o.explain;
  return o;
}

const naveKeys = new WeakMap();
/**
 * La clave del pedido: la nave (lo que lee autoLayout: `naveOf` de park-run.js) y las opciones que cambian el park. Las
 * naves del store están congeladas y cada cambio es otro objeto, así que su texto se arma una vez por nave.
 */
export function inputKeyOf(building, options) {
  let nave = building && typeof building === 'object' ? naveKeys.get(building) : undefined;
  if (nave === undefined) {
    nave = JSON.stringify(naveOf(building));
    if (building && typeof building === 'object') naveKeys.set(building, nave);
  }
  return `${nave}\n${JSON.stringify(parkOptions(options))}`;
}

/** Un mapa con los `max` usados más recientes (`get` y `set` cuentan como uso). */
export function createLRU(max = 64) {
  const m = new Map();
  return {
    get(k) {
      const v = m.get(k);
      if (v !== undefined) {
        m.delete(k);
        m.set(k, v);
      }
      return v;
    },
    peek: k => m.get(k),
    has: k => m.has(k),
    set(k, v) {
      m.delete(k);
      m.set(k, v);
      while (m.size > max) m.delete(m.keys().next().value);
      return v;
    },
    delete: k => m.delete(k),
    clear: () => m.clear(),
    get size() {
      return m.size;
    },
  };
}

const now = () => (typeof performance === 'undefined' ? Date.now() : performance.now());

/**
 * El park provisional con el núcleo de la página: `api` = `{ createAutoLayoutSession, slopeFrame }` (de la entrada
 * principal y de `/plan`). `null` si el paquete no trae `createAutoLayoutSession` (o no tiene `provisional`). Si no,
 * `{ run(nave, opciones, plan) }` → `{ ok: true, layout, shapes, layoutHash, keyUsed, ms }` (o `{ ok: false, error }` si
 * la nave no se puede armar: el mismo texto que daría el exacto), o `null` si no entró ninguna pista (ni con las de
 * repuesto del plan) o si el núcleo falló: un error no vuelve a probar (`broken`).
 */
export function createProvisional(api) {
  if (typeof api?.createAutoLayoutSession !== 'function') return null;
  let session;
  try {
    // la pista para dibujar se arma adentro (cuenta en lo que tarda el provisional)
    session = api.createAutoLayoutSession({ shapes: layout => shapesOf(api, layout) });
  } catch {
    return null;
  }
  if (typeof session?.provisional !== 'function') return null;
  const state = { broken: null };
  return {
    get broken() {
      return state.broken;
    },
    run(building, options, plan) {
      if (state.broken || !plan) return null;
      const t0 = now();
      let p;
      try {
        p = session.provisional(naveOf(building), parkOptions(options), plan);
      } catch (e) {
        // un pánico deja el núcleo de la página fuera de servicio: no se insiste (el exacto sigue en el worker)
        state.broken = e instanceof Error ? e.message : String(e);
        return null;
      }
      const ms = Math.round((now() - t0) * 100) / 100;
      if (!p?.layout) {
        if (typeof p?.error === 'string') return { ok: false, error: p.error, layoutHash: null, ms };
        return null;
      }
      return {
        ok: true,
        layout: p.layout,
        issues: [],
        shapes: p.shapes === undefined ? shapesOf(api, p.layout) : p.shapes,
        explain: null,
        // el hash del núcleo (el mismo que el del exacto con el mismo park), o el de la página
        layoutHash: p.layoutHash ?? layoutHash(p.layout),
        keyUsed: p.keyUsed ?? null,
        ms,
      };
    },
  };
}
