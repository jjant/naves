// El worker de lo que se camina del editor (editor.html): `walkabilityReport` del núcleo Rust (~1 s) sobre el park
// exacto que se muestra, fuera del hilo de la página y aparte del worker del park (park-worker.js), así medir un park
// no frena el siguiente. Con `createAutoLayoutSession` en el paquete, `finish`: lo que autoLayout hace después de armar
// el park (medirlo y lo que sale de eso) y el informe de esa medición, con el park final (park-run.js, `runWalk`).
// Cada respuesta lleva el `layoutHash` del park que midió: la página la muestra como la de ahora solo si es la del park
// que está en el plano (park-panel.js). Lo demás, como park-worker.js.
import { createHandler } from './park-run.js';

const api = Promise.all([
  import('../../park3d/autolayout.js'),
  import('../../park3d/validate.js'),
  import('../../park3d/plan.js'),
]).then(([a, v, p]) => ({
  session: typeof a.createAutoLayoutSession === 'function' ? a.createAutoLayoutSession() : null,
  walkabilityReport: v.walkabilityReport,
  slopeFrame: p.slopeFrame,
}));
api.catch(() => {}); // el error lo contesta cada pedido
const handle = createHandler(api);

self.onmessage = async ({ data }) => {
  self.postMessage(await handle(data));
};
