// Lo que hacen los workers del editor (park-worker.js, el park exacto; park-walk-worker.js, lo que se camina) con
// cada pedido, sin Worker ni DOM: así lo prueban los tests en Node con el núcleo de dist/. `api` son las funciones del
// paquete que hacen falta (`autoLayout` y, si el paquete la trae, `createAutoLayoutSession` de la entrada principal;
// `walkabilityReport`; `slopeFrame` de `/plan`); el worker las carga de park3d/ y acá llegan como una promesa (el
// núcleo tarda en cargar y los mensajes llegan antes).
//
// Cada pedido y su respuesta llevan su etiqueta: `rev` (el cambio de la nave que lo pidió), `inputKey` (la nave y las
// opciones, `inputKeyOf` de park-session.js) y `layoutHash` (el park, `layoutHash` de abajo). Con eso la página sabe
// de qué nave es cada park y de qué park es cada medida de la circulación, aunque lleguen tarde (README, «Editor de
// plano»).

/** Las opciones de `autoLayout` que entiende el generador (`AutoLayoutOptions` de src/generated/core.ts). */
export const OPTION_KEYS = ['lanes', 'laneWidth', 'platformHeight', 'gymOnMezzanine', 'explain'];

/**
 * Las opciones de `autoLayout` que se pidieron, sin lo vacío (sin un número, el generador elige: «automático») ni lo
 * que no entiende. Los rangos los recorta el generador, con un aviso.
 */
export function cleanOptions(o = {}) {
  const out = {};
  for (const k of ['lanes', 'laneWidth', 'platformHeight']) {
    const v = o[k];
    if (v === '' || v == null) continue;
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) out[k] = n;
  }
  if (o.gymOnMezzanine === false) out.gymOnMezzanine = false;
  if (o.explain) out.explain = true;
  return out;
}

/**
 * La nave del editor como la lee `autoLayout`: el `shell` y lo que la nombra (id, nombre, ciudad). El park (pista,
 * zonas) lo pone el generador, así que lo que traiga el dibujo de eso no se manda.
 */
export function naveOf(building) {
  const b = building ?? {};
  const nave = {
    id: typeof b.id === 'string' && b.id ? b.id : 'editor',
    name: typeof b.name === 'string' && b.name ? b.name : 'Nave del editor',
    shell: b.shell,
  };
  if (typeof b.city === 'string' && b.city) nave.city = b.city;
  return nave;
}

/** Los cuatro vértices del rectángulo de la pista entre `s0` y `s1` a lo largo y `u0` y `u1` a lo ancho, en planta. */
function quad(sf, s0, s1, u0, u1) {
  return [sf.toWorld(s0, u0), sf.toWorld(s1, u0), sf.toWorld(s1, u1), sf.toWorld(s0, u1)].map(p => [
    round(p[0]),
    round(p[1]),
  ]);
}
const round = v => Math.round(v * 1000) / 1000;
const es = v => String(Math.round(v * 100) / 100).replace('.', ',');

/**
 * La pista en planta, lista para dibujar (polígonos en metros de la nave): sus tramos (plataforma, rampa, step down,
 * llano o terrazas), los finales de cada grupo de líneas, las rayas entre líneas y los módulos, con los mismos
 * cortes y rótulos que `planSVG` (crates/park3d-plan/src/svg.rs). `sf` es el `slopeFrame(slope)` de `/plan`.
 */
export function slopeShapes(slope, sf) {
  const sections = [];
  const add = (key, s0, s1, label) => {
    if (s1 - s0 >= 0.01) sections.push({ key, label, poly: quad(sf, s0, s1, 0, sf.W) });
  };
  add('platform', 0, sf.pd, `Plataforma +${es(sf.H)} m`);
  add('ramp', sf.pd, sf.pd + sf.R, `Rampa ${es(sf.R)} m`);
  if (sf.apron) add('step', sf.sRamp1, sf.sFlat0, 'Step down');
  const decks = sf.tpl?.decks.length ?? 0;
  add(
    'flat',
    sf.sFlat0,
    sf.sEnd0,
    decks ? `${decks} terraza${decks > 1 ? 's' : ''} · ${es(sf.F)} m` : `Llano ${es(sf.F)} m`,
  );
  const lw = sf.lw;
  const ends = (slope.ends ?? []).map(e => {
    const lanes = e.lanes?.length ? e.lanes : [1];
    const lo = Math.min(...lanes);
    const hi = Math.max(...lanes);
    const quarter = e.type === 'quarter';
    return {
      key: quarter ? 'quarter' : 'runout',
      label: quarter ? `Quarter ${es(e.height || 1.2)} m` : `Run-out ${es(e.length)} m`,
      poly: quad(sf, sf.sEnd0, sf.L, (lo - 1) * lw, hi * lw),
    };
  });
  const lanes = [];
  for (let i = 1; i < sf.lanes; i++) {
    const a = sf.toWorld(sf.sRamp0, i * lw);
    const b = sf.toWorld(sf.L, i * lw);
    lanes.push([
      [round(a[0]), round(a[1])],
      [round(b[0]), round(b[1])],
    ]);
  }
  const modules = (slope.modules ?? []).map(m => {
    const uc = (m.lane - 0.5) * lw + (m.offset || 0);
    const w = m.width || (m.type === 'rail' ? 0.12 : m.type === 'kicker' ? lw - 0.6 : 0.6);
    const s0 = sf.sFlat0 + (m.at ?? 0);
    return {
      type: m.type,
      label: m.label || m.type,
      poly: quad(sf, s0, s0 + (m.length ?? 0.5), uc - w / 2, uc + w / 2),
    };
  });
  return {
    sections,
    ends,
    lanes,
    modules,
    outline: quad(sf, 0, sf.L, 0, sf.W),
    length: sf.L,
    width: sf.W,
    height: sf.H,
    dir: sf.dir,
    label: `${es(sf.L)} m de pista · ${sf.lanes} × ${es(lw)} m`,
  };
}

/** El texto de un error del núcleo o de cualquier otra cosa. */
export function errorText(e) {
  return e instanceof Error ? e.message : String(e);
}

/** El error del núcleo después de un trap (src/core.ts): desde ahí ese núcleo no arma nada más. */
export const BROKEN_CORE = /^el núcleo WASM falló y quedó fuera de servicio/;

/**
 * Cómo es un error de autoLayout: `{ deterministic: true }` si es del generador (la nave no se puede armar: un
 * `CoreError` que no es el del núcleo roto; con la misma nave, siempre el mismo), `{ fatal: true }` si el núcleo de
 * este worker quedó fuera de servicio (hace falta otro worker), `{}` si es otra cosa (no se sabe si se repite). Solo
 * el primero queda en la caché de la página como el park de esa nave.
 */
export function errorKind(e) {
  const text = errorText(e);
  if (BROKEN_CORE.test(text)) return { fatal: true };
  return e instanceof Error && e.name === 'CoreError' ? { deterministic: true } : {};
}

const now = () => (typeof performance === 'undefined' ? Date.now() : performance.now());
const ms = t0 => Math.round((now() - t0) * 10) / 10;

/**
 * Un hash de 53 bits del texto (cyrb53), en base 36. Para etiquetar parks, no para seguridad: dos parks con el mismo
 * hash son el mismo JSON (salvo una colisión, ~2⁻⁵³).
 */
export function hashText(text) {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/**
 * La etiqueta de un park: el hash de su JSON (`JSON.stringify` del layout como llega del núcleo, en el worker o en la
 * página: los dos lo leen con el mismo `JSON.parse`, así el mismo park da el mismo texto). `null` sin park.
 */
export const layoutHash = layout => (layout ? hashText(JSON.stringify(layout)) : null);

/** La pista lista para dibujar (`slopeShapes`) o null si no hay o no se puede recorrer (eso lo dicen los avisos). */
export function shapesOf(api, layout) {
  if (!layout?.slope) return null;
  try {
    return slopeShapes(layout.slope, api.slopeFrame(layout.slope));
  } catch {
    return null;
  }
}

/** Sin contorno no hay qué armar: el aviso del panel. */
export const NO_OUTLINE = 'Dibujá el contorno de la nave (3 vértices o más) para armar el park.';

/** El camino de la pista que ganó (lo que usa el provisional de la página), de un exacto de la sesión. */
const planOf = e => (e?.key != null ? { key: e.key, order: e.order, fallbacks: e.fallbacks ?? [] } : null);

/**
 * El park exacto de la nave: `{ ok, layout, issues, shapes, explain, plan, exact, layoutHash, ms }`, o `{ ok: false,
 * error, deterministic: true }` si la nave no se puede armar (sin contorno, más de 6.000 m², sin altura para una
 * plataforma, sin sitio para una pista: el mensaje del generador lo dice; otro error, sin `deterministic`: `errorKind`). Con `createAutoLayoutSession` en el paquete (`api.session`), el park
 * sale de `session.exact`: el de `autoLayout` sin medir lo que se camina (eso lo completa `finish`, en el worker de lo
 * que se camina: `runWalk`), con el camino de la pista que ganó (`plan`, para el park provisional de los cambios
 * siguientes), el exacto entero (`exact`, lo que necesita `finish`) y el hash del núcleo. Sin ella, de `autoLayout`.
 */
export function runLayout(api, building, options) {
  const t0 = now();
  const nave = naveOf(building);
  if (!Array.isArray(nave.shell?.outline) || nave.shell.outline.length < 3)
    return { ok: false, error: NO_OUTLINE, deterministic: true, ms: 0 };
  const opts = cleanOptions(options);
  try {
    if (typeof api.session?.exact !== 'function') return layoutOf(api, null, api.autoLayout(nave, opts), t0);
    const exact = api.session.exact(nave, opts);
    return layoutOf(api, exact, exact.result, t0);
  } catch (e) {
    return { ok: false, error: errorText(e), ...errorKind(e), ms: ms(t0) };
  }
}

/**
 * `runLayout` con E en paralelo (park-fanout.js) si el worker tiene ayudantes (`api.fanout`) y el paquete la sesión: el
 * mismo exacto, armado entre varios workers (`fanout` en la respuesta: rondas, programas y lo que tardó). Si no se
 * reparte (`explain`, una nave que no se puede armar, un ayudante que falló), `runLayout`, que da lo mismo.
 */
export async function runLayoutAsync(api, building, options) {
  // «Cómo decide» lee cada programa entero: no se reparte
  if (!api.fanout || typeof api.session?.fanout?.step !== 'function' || cleanOptions(options).explain)
    return runLayout(api, building, options);
  const t0 = now();
  const nave = naveOf(building);
  if (!Array.isArray(nave.shell?.outline) || nave.shell.outline.length < 3)
    return { ok: false, error: NO_OUTLINE, deterministic: true, ms: 0 };
  const opts = cleanOptions(options);
  // los mismos textos que `session.exact` (JSON.stringify de la nave y de las opciones): el mismo `inputHash`
  const exact = await api.fanout.exact(api.session, JSON.stringify(nave), JSON.stringify(opts));
  const stats = api.fanout.stats;
  if (!exact) return { ...runLayout(api, building, options), fanout: stats };
  return { ...layoutOf(api, exact, exact.result, t0), fanout: stats };
}

/** La respuesta de un park armado: `r` (el resultado de autoLayout) y, con la sesión, su exacto. */
function layoutOf(api, exact, r, t0) {
  const t = ms(t0);
  return {
    ok: true,
    layout: r.layout,
    issues: r.issues,
    shapes: shapesOf(api, r.layout),
    explain: r.explain ?? null,
    plan: planOf(exact),
    exact,
    layoutHash: exact?.layoutHash ?? layoutHash(r.layout),
    // el de la sesión es el de antes de medir lo que se camina: el de autoLayout sale de `finish` (`runWalk`)
    ...(exact ? { final: false } : {}),
    ms: t,
  };
}

/**
 * Lo que se camina en un park armado (`walkabilityReport`, ~1 s), o `{ ok: false, error }`. Con la sesión del paquete
 * y el exacto de la nave (`msg.exact`, de `runLayout`), `session.finish`: lo que `autoLayout` hace después de armar el
 * park (medirlo y lo que sale de eso: una salida propuesta, el gym en planta baja, los avisos de obra) y el informe de
 * esa medición. Entonces la respuesta trae también el park final (`final`: el de `autoLayout`, byte a byte) y su
 * `layoutHash`, que es el del park medido.
 */
export function runWalk(api, msg) {
  const t0 = now();
  const layout = msg?.layout ?? msg?.exact?.result?.layout;
  if (!layout) return { ok: false, error: 'no hay park armado para medir', ms: 0 };
  try {
    if (typeof api.session?.finish === 'function' && msg.exact && msg.building) {
      const f = api.session.finish(naveOf(msg.building), cleanOptions(msg.options), msg.exact);
      const result = f.result;
      return {
        // `walk: null` si park3d-walk no lee el layout (lo que lanzaría `walkabilityReport` va en `walkError`): el park
        // final es el de autoLayout igual, sin informe
        ok: f.walk != null,
        walk: f.walk,
        ...(f.walk == null ? { error: f.walkError ?? 'park3d-walk no lee el layout' } : {}),
        layoutHash: f.layoutHash ?? layoutHash(result.layout),
        final: {
          ok: true,
          layout: result.layout,
          issues: result.issues,
          shapes: shapesOf(api, result.layout),
          explain: result.explain ?? null,
          plan: planOf(f) ?? planOf(msg.exact),
          exact: f,
          layoutHash: f.layoutHash ?? layoutHash(result.layout),
        },
        ms: ms(t0),
      };
    }
    return { ok: true, walk: api.walkabilityReport(layout), ms: ms(t0) };
  } catch (e) {
    return { ok: false, error: errorText(e), ...(BROKEN_CORE.test(errorText(e)) ? { fatal: true } : {}), ms: ms(t0) };
  }
}

/** La etiqueta de un pedido, que vuelve en su respuesta. */
const tagOf = msg => ({ type: msg?.type, rev: msg?.rev, inputKey: msg?.inputKey, layoutHash: msg?.layoutHash ?? null });

/**
 * El que atiende los mensajes de un worker: `{ type: 'layout', rev, inputKey, building, options }` arma el park exacto
 * y `{ type: 'walk', rev, inputKey, layoutHash, layout }` mide lo que se camina en ese park. Cada respuesta lleva la
 * etiqueta del pedido (`type`, `rev`, `inputKey`, `layoutHash`; la de `layout`, la del park que armó).
 */
export function createHandler(apiP) {
  return async msg => {
    const tag = tagOf(msg);
    let api;
    try {
      api = await apiP;
    } catch (e) {
      // el worker no tiene núcleo: otro worker lo vuelve a cargar
      return { ...tag, ok: false, error: `no se pudo cargar el núcleo de park3d: ${errorText(e)}`, fatal: true, ms: 0 };
    }
    if (tag.type === 'layout') return { ...tag, ...(await runLayoutAsync(api, msg.building, msg.options)) };
    if (tag.type === 'walk') return { ...tag, ...runWalk(api, msg) };
    return { ...tag, ok: false, error: `pedido desconocido: ${String(tag.type)}`, ms: 0 };
  };
}
