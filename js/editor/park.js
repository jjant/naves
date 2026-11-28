// La entrada del lado del park de editor.html: engancha el panel de la derecha (#parkPanel) al store de la nave
// (state.js) y dibuja el park en el grupo del plano del editor (#parkLayer, en metros de la nave). Todo lo demás está en
// park-panel.js. Con `?perf=1`, el medidor de park-perf.js (`window.__parkPerf` y el recuadro del plano).
import * as store from './state.js';
import { mountPark } from './park-panel.js';
import { createPerf } from './park-perf.js';

const panel = document.getElementById('parkPanel');
if (panel) {
  // el núcleo en la página, para el park provisional del cuadro (si el paquete lo trae: park-session.js); es el mismo
  // módulo (la misma URL) que ya carga el validador del inspector (draw-check.js) y el que importa el worker.
  // Por defecto P va en el cuadro de un cambio solo si lo que tarda en la nave de ahora entra en lo que le queda al cuadro
  // (medido la primera vez fuera del cuadro: una nave lenta no traba ninguno; park-panel.js, `pMode`); `?p=1` lo arma
  // como antes (en cada cambio sin gesto y en un arrastre si el último entró) y `?p=0` lo apaga: el cuadro dibuja el
  // park de la caché o el de antes (tenue) y el exacto sigue llegando del worker.
  const params = new URLSearchParams(location.search);
  const p = params.get('p');
  const core =
    p !== '0'
      ? Promise.all([import('../../park3d/autolayout.js'), import('@snowpark-bcn/park3d/plan')]).then(([a, pl]) => ({
          createAutoLayoutSession: a.createAutoLayoutSession,
          slopeFrame: pl.slopeFrame,
        }))
      : null;
  const q = params.get('perf');
  const perf = createPerf({ on: q != null && q !== '0' });
  // `?perf=1&hz=120`: el presupuesto de P de una pantalla de 120 Hz (sin pantalla el rAF va a 60)
  const hz = perf.on ? Number(params.get('hz')) || 0 : 0;
  // el park que sigue el dibujo en un arrastre: P de la posición más nueva en su worker, sin quitarle el cuadro a la
  // página (`?follow=0` lo apaga: el arrastre sigue solo con el exacto, como antes)
  const f = params.get('follow');
  const followWorker =
    f == null || f !== '0'
      ? () => new Worker(new URL('./park-follow-worker.js', import.meta.url), { type: 'module' })
      : null;
  const pMode = p != null && p !== '0' ? 'always' : 'adaptive';
  const park = mountPark({
    store,
    panel,
    layer: () => document.getElementById('parkLayer'),
    core,
    perf,
    hz,
    followWorker,
    pMode,
  });
  // para las pruebas en Chromium (scripts/editor-park-check.mjs) y la consola: el estado del panel
  window.__park = park;
}
