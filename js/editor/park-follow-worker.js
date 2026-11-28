// El worker del park que sigue el dibujo (editor.html): el provisional (P, `createAutoLayoutSession().provisional`
// del núcleo, park-session.js) de la posición más nueva de un arrastre, fuera del hilo de la página. Arma el camino de
// la pista que ganó en el último exacto (`plan`, lo que manda la página) sobre la nave de ese pedido: tarda lo que P en
// la página (de 8 a 76 ms en Chromium, docs/TIEMPO-REAL.md) pero no le quita el cuadro al dibujo, así que el park
// sigue al arrastre muchas veces por segundo aunque P no entre en un cuadro y mientras el exacto (park-worker.js, de
// 38 ms a 1,3 s) llega de una posición de antes. Uno a la vez y gana el más nuevo (park-client.js).
//
// Cada pedido es `{ type: 'provisional', rev, inputKey, building, options, plan }` y la respuesta trae esa etiqueta y
// lo que da `createProvisional(…).run` (`{ ok, layout, shapes, layoutHash, keyUsed, ms }`, `{ ok: false, error }` si la
// nave no se puede armar) o `{ ok: false, stale: true }` si ninguna pista del camino entra. Si el núcleo quedó fuera
// de servicio (un pánico) contesta `fatal`: la página lo reemplaza por otro. Las rutas, como en park-worker.js.
import { createProvisional } from './park-session.js';

const prov = Promise.all([import('../../park3d/autolayout.js'), import('../../park3d/plan.js')]).then(([a, p]) =>
  createProvisional({ createAutoLayoutSession: a.createAutoLayoutSession, slopeFrame: p.slopeFrame }),
);
prov.catch(() => {}); // el error lo contesta cada pedido

self.onmessage = async ({ data: m }) => {
  const tag = { type: m?.type, rev: m?.rev, inputKey: m?.inputKey };
  let p;
  try {
    p = await prov;
  } catch (e) {
    self.postMessage({ ...tag, ok: false, error: `no se pudo cargar el núcleo de park3d: ${String(e)}`, fatal: true });
    return;
  }
  if (!p) {
    self.postMessage({ ...tag, ok: false, error: 'el paquete no trae el park provisional', stale: true });
    return;
  }
  const r = p.run(m.building, m.options, m.plan);
  if (p.broken) self.postMessage({ ...tag, ok: false, error: p.broken, fatal: true });
  else self.postMessage(r ? { ...tag, ...r } : { ...tag, ok: false, stale: true });
};
