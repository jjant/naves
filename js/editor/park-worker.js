// El worker del park exacto del editor (editor.html): arma el park de la nave que se dibuja con el núcleo Rust, fuera
// del hilo de la página (autoLayout, que mide con park3d-walk el park que arma para elegir, tarda de ≈ 0,8 a 14 s en
// el `.wasm`, ≈ 3,5 s la mediana de las 51 entradas de tests/autolayout_walk.rs, y el dibujo no se tiene que trabar).
// Lo que se camina lo mide otro worker (park-walk-worker.js), así las dos cosas corren a la vez. Lo que hace está en park-run.js; acá solo
// se carga el paquete y se contestan los mensajes, de a uno (park-client.js manda uno por vez).
//
// E en paralelo (park-fanout.js, docs/TIEMPO-REAL.md): este worker reparte el exacto entre ayudantes, que son este
// mismo archivo con `?helper` (cuántos: `?ew=N` en la URL de este worker, que la página copia de la suya; por defecto
// según los núcleos, y con `?ew=0` ninguno: el exacto sale de acá, como antes). Un ayudante solo contesta las partes
// de los candidatos de pista y los programas que le pide el coordinador, con el núcleo del coordinador: el `.wasm` que
// él compiló (un `WebAssembly.Module`, el primer mensaje que recibe), no el que se baje al crearlo (el sitio se publica
// solo: sería quizás otra versión del generador).
//
// El paquete se importa con rutas relativas a park3d/ (lo que copia build.mjs de dist/): un worker no ve el import map
// de la página. Y se espera adentro del handler: con un `import` estático (el núcleo carga con `await` al nivel del
// módulo) el worker perdería los mensajes que llegan mientras carga (README, «En un Web Worker»).
import { compileCore, createFanout, defaultHelpers, helperReply } from './park-fanout.js';
import { createHandler } from './park-run.js';

const query = new URLSearchParams(self.location?.search ?? '');
const helper = query.has('helper');

/** El paquete, con el núcleo cargado de `module` (el `.wasm` compilado del coordinador) si viene. */
const load = async module => {
  // `loadCore` carga una vez: autolayout.js (que lo llama al importarse) recibe esta misma instancia
  if (module) await (await import('../../park3d/core.js')).loadCore({ wasm: module });
  const [a, p] = await Promise.all([import('../../park3d/autolayout.js'), import('../../park3d/plan.js')]);
  return {
    autoLayout: a.autoLayout,
    // el núcleo con el park provisional (rt-anytime-core): `exact` da el mismo park y el camino de la pista que ganó
    session: typeof a.createAutoLayoutSession === 'function' ? a.createAutoLayoutSession() : null,
    slopeFrame: p.slopeFrame,
  };
};

if (helper) {
  let api = null;
  let build = null;
  self.onmessage = async ({ data }) => {
    if (data?.kind === 'core') {
      build = data.build ?? null;
      api = load(data.module);
      api.catch(() => {}); // el error lo contesta cada pedido
      return;
    }
    if (!api) {
      self.postMessage({ id: data?.id, error: 'el ayudante no recibió el núcleo del coordinador' });
      return;
    }
    let a;
    try {
      a = await api;
    } catch (e) {
      self.postMessage({ id: data?.id, error: `no se pudo cargar el núcleo de park3d: ${String(e)}` });
      return;
    }
    self.postMessage(helperReply(a.session, data, build));
  };
} else {
  const ew = query.get('ew');
  const size =
    ew != null && ew !== ''
      ? Math.max(0, Math.min(16, Math.floor(Number(ew)) || 0))
      : defaultHelpers(navigator.hardwareConcurrency);
  // con ayudantes, el núcleo de este worker y el de ellos es el mismo `.wasm` compilado acá (si no se puede, sin
  // ayudantes: el exacto sale de este worker, como con `?ew=0`)
  const core =
    size >= 2 ? compileCore(new URL('../../pkg/park3d_core_bg.wasm', import.meta.url)).catch(() => null) : null;
  const api = (core ?? Promise.resolve(null)).then(c => load(c?.module));
  api.catch(() => {}); // el error lo contesta cada pedido
  const fanout =
    size >= 2
      ? createFanout({
          size,
          core,
          spawn: () => {
            const u = new URL('./park-worker.js', import.meta.url);
            u.searchParams.set('helper', '1');
            return new Worker(u, { type: 'module' });
          },
        })
      : null;
  const handle = createHandler(api.then(a => ({ ...a, fanout })));
  self.onmessage = async ({ data }) => {
    // el gesto de la página (`live`, sin respuesta): en medio, menos ayudantes; al soltar, todos, también para el
    // exacto en curso (este worker espera a sus ayudantes sin bloquearse: el aviso llega entre sus respuestas)
    if (data?.type === 'live') {
      if (fanout) fanout.live = !!data.live;
      return;
    }
    self.postMessage(await handle(data));
  };
}
