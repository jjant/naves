// «Ver en 3D» y «Abrir en el visor» del panel del park (park-panel.js).
//
// - `open3D()`: el park armado en el motor Rust (createPark, como sim.html con js/app.js), en una ventana al lado del
//   plano que no lo bloquea (se sigue dibujando). Con «Seguir el dibujo», cada park nuevo se carga con `park.setLayout`
//   (sin rehacer el motor); si no, con «Actualizar». El motor (~23 MB) se baja recién al abrirla la primera vez y al
//   cerrarla queda en pausa, no se suelta: volver a abrirla no lo vuelve a cargar.
// - `openInViewer(layout)`: el visor del sitio en otra pestaña, con el layout comprimido en la URL
//   (`sim.html?id=editor#layout=…`, js/layout-link.js): el enlace vale solo, aunque el editor se cierre.
//
// El paquete se importa por su ruta del sitio (park3d/, lo que copia build.mjs), la misma que da el import map de las
// páginas: es el mismo módulo, con el mismo núcleo.

import { HASH_KEY, encodeLayout } from '../layout-link.js';

const SITE = new URL('../../', import.meta.url);
const WASM = new URL('rust/pkg/park3d_web.js', SITE);
const RUST_ASSETS = new URL('rust/assets/', SITE).href;

/**
 * La URL del visor del sitio con `layout` adentro (comprimido en el `#`, js/layout-link.js), sin la luz horneada ni las
 * fotos de una nave: vale sola, también con el editor cerrado o en otra máquina.
 */
export async function viewerURL(layout) {
  const sim = new URL('sim.html', SITE);
  // `editor`: un id que no es de ninguna nave (sin bake, fotos ni renders de otra)
  sim.search = new URLSearchParams({ id: 'editor', baked: '0' }).toString();
  sim.hash = `${HASH_KEY}=${await encodeLayout(layout)}`;
  return sim.href;
}

/**
 * Abre el visor del sitio con `layout` en otra pestaña. Comprimir tarda unos ms, dentro del permiso del clic para abrir
 * una pestaña; si el navegador la bloquea igual, devuelve la URL para mostrarla (null si se abrió).
 */
export async function openInViewer(layout) {
  const url = await viewerURL(layout);
  return window.open(url, '_blank') ? null : url;
}

/**
 * La ventana del 3D, al lado del plano y sin taparlo entero (un `<dialog>` no modal: se sigue dibujando con ella
 * abierta, y con «Seguir el dibujo» cada park nuevo llega solo). `update(layout)` le pasa el último park armado (null si
 * no hay); `show()` la abre (la primera vez arma el motor: ~23 MB, unos segundos) y `hide()` la esconde y pausa el
 * motor sin soltarlo, así volver a abrirla es instantáneo y con el mismo park (o el nuevo, con `park.setLayout`, que no
 * rehace el motor). `close()` sí lo suelta (al desmontar el panel). `onHide` se llama al esconderla.
 */
export function open3D({ onHide = () => {} } = {}) {
  const dlg = document.createElement('dialog');
  dlg.className = 'park-3d';
  dlg.innerHTML = `
<div class="park-3d-bar">
  <b>Park en 3D</b>
  <span data-3d="status">Cargando el motor…</span>
  <label title="Cada park nuevo del dibujo se carga solo (sin rehacer el motor)"><input type="checkbox" data-3d="follow" checked> Seguir el dibujo</label>
  <button type="button" data-3d="refresh">Actualizar</button>
  <button type="button" data-3d="views">Vistas</button>
  <button type="button" data-3d="size" title="Agrandar a todo el plano o volver al costado">Agrandar</button>
  <button type="button" data-3d="close" title="Esconder el 3D (el motor queda en pausa: volver a abrirlo es instantáneo)">Cerrar</button>
</div>
<div class="park-3d-views" data-3d="viewlist" hidden></div>
<div class="park-3d-stage"><canvas data-3d="canvas" tabindex="0"></canvas></div>`;
  document.body.append(dlg);
  const q = k => /** @type {HTMLElement} */ (dlg.querySelector(`[data-3d="${k}"]`));
  const setStatus = t => (q('status').textContent = t);
  let park = null;
  let latest = null;
  let shown = null;
  let running = null;
  let closed = false;
  const follow = () => /** @type {HTMLInputElement} */ (q('follow')).checked;
  const visible = () => dlg.open;

  const fillViews = () => {
    const list = q('viewlist');
    list.replaceChildren();
    for (const v of park?.views ?? []) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = v.title;
      b.onclick = () => park?.goTo(v);
      list.append(b);
    }
  };
  /** Pone en pantalla el último layout (de a uno: si llega otro mientras tanto, se pone después). */
  const apply = async () => {
    if (running || closed || !latest || latest === shown) return;
    const layout = latest;
    running = (async () => {
      try {
        if (!park) {
          const { createPark } = await import('../../park3d/index.js');
          setStatus('Armando la nave en 3D…');
          park = await createPark(/** @type {HTMLCanvasElement} */ (q('canvas')), {
            layout,
            engine: 'rust',
            wasm: WASM,
            assets: RUST_ASSETS,
            rustAssets: RUST_ASSETS,
            view: 'maqueta',
            people: false,
            ready: 'near',
            // el teclado de la página es del editor (V, P, D, C… y las flechas): el 3D solo ve el que le llega al canvas
            keyboard: false,
            onProgress: p => {
              if (!shown) setStatus(p.message);
            },
          });
          if (closed) {
            park.dispose();
            return;
          }
          park.on('error', ({ error }) => setStatus(`Error en el 3D: ${error.message}`));
          window.__park3d = park;
        } else {
          setStatus('Cargando el park nuevo…');
          await park.setLayout(layout);
        }
        shown = layout;
        fillViews();
        // `setLayout` lo vuelve a poner en marcha: si mientras tanto se escondió, otra vez en pausa
        if (!visible()) park.pause(true);
        setStatus(latest === shown ? 'Al día con el dibujo' : 'Hay un park más nuevo: «Actualizar»');
      } catch (e) {
        setStatus(`No se pudo mostrar en 3D: ${e instanceof Error ? e.message : String(e)}`);
        shown = layout; // no reintentar el mismo
      } finally {
        running = null;
      }
      if (follow() && visible() && latest !== shown) void apply();
    })();
    await running;
  };
  const show = () => {
    if (closed) return;
    if (!dlg.open) dlg.show();
    park?.pause(false);
    if (!park || follow()) void apply();
    else if (latest && latest !== shown) setStatus('Hay un park más nuevo: «Actualizar»');
  };
  const hide = () => {
    if (closed || !dlg.open) return;
    dlg.close();
    park?.pause(true);
    onHide();
  };
  const close = () => {
    if (closed) return;
    closed = true;
    try {
      park?.dispose();
    } catch {
      // el motor ya se había caído: no hay nada que soltar
    }
    park = null;
    if (window.__park3d) window.__park3d = undefined;
    if (dlg.open) dlg.close();
    dlg.remove();
  };
  q('close').onclick = hide;
  q('refresh').onclick = () => void apply();
  q('views').onclick = () => (q('viewlist').hidden = !q('viewlist').hidden);
  q('size').onclick = () => {
    const big = dlg.classList.toggle('park-3d-big');
    q('size').textContent = big ? 'Achicar' : 'Agrandar';
  };
  return {
    update(layout) {
      latest = layout;
      if (!layout || !visible()) return; // escondida: se pone al día al volver a abrirla
      if (!park || follow()) void apply();
      else setStatus('Hay un park más nuevo: «Actualizar»');
    },
    show,
    hide,
    close,
    /** Si está a la vista. */
    get open() {
      return visible();
    },
    /** El park del motor (null hasta que se arma la primera vez). */
    get park() {
      return park;
    },
  };
}
