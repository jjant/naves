// Los chequeos de la nave del editor: los del dibujo (`checkBuilding`, al instante) y los del núcleo del paquete, que se
// carga aparte (~1,2 MB): `planSVG` lee la nave con el esquema de crates/park3d-model (un campo de otro tipo, un valor
// que no existe: lo dice con su ruta) y `validateLayout` sobre la nave sin pista ni zonas da lo que el validador dice
// del edificio (lo que sale del contorno, lo que se pisa, las aristas que no existen…). Lo de la pista y el programa
// (que acá no están) no se muestra; las salidas que faltan van como aviso: autoLayout agrega las de emergencia.
import * as S from './state.js';
import { checkBuilding } from './draw-model.js';

/** Lo del validador que habla de la pista o del programa: con la nave sola no dice nada. */
const NOT_HERE = /^falta "slope"|^programa:|^taquillas:|^trampolines:|^zonas:|^pista:|^la escalera no llega/;

/** La ruta del objeto que nombra un mensaje del validador (o la de la nave). */
function pathOf(msg, b) {
  const m = /shell\.(outline|openings|existing|structure\.columns)\[(\d+)\]/.exec(msg);
  if (m) return `shell.${m[1]}[${m[2]}]`;
  const ex = /^existente (.+) sale del contorno$/.exec(msg);
  const solape = /^solape: (.+) ↔ (.+)$/.exec(msg);
  const names = ex ? [ex[1]] : solape ? [solape[1], solape[2]] : [];
  for (const name of names) {
    const i = (b.shell.existing ?? []).findIndex(e => (e.label ?? e.type) === name);
    if (i >= 0) return `shell.existing[${i}]`;
  }
  return 'shell';
}

export function initCheck(ed, changed) {
  let core = null;
  let timer = 0;
  function run() {
    const b = S.getBuilding();
    const out = checkBuilding(b);
    const blocking = out.some(i => i.level === 'error' && /^shell\.outline/.test(i.path));
    if (core && b.shell.outline.length >= 3 && !blocking) {
      try {
        core.planSVG(b);
      } catch (e) {
        out.push({
          level: 'error',
          path: 'shell',
          msg: `esquema (núcleo): ${e instanceof Error ? e.message : String(e)}`,
        });
      }
      try {
        const v = core.validateLayout({ ...b, zones: [] });
        const mine = new Set(out.filter(i => i.level === 'error').map(i => i.path));
        for (const [level, list] of [
          ['error', v.errors],
          ['warning', v.warnings],
        ])
          for (const msg of list) {
            if (NOT_HERE.test(msg)) continue;
            const path = pathOf(msg, b);
            if (mine.has(path) && path !== 'shell') continue; // ya lo dice el dibujo, con sus palabras
            const soft = /^salidas: |^recorrido de evacuación/.test(msg);
            out.push({
              level: soft ? 'warning' : level,
              path,
              msg: `validador: ${msg}${soft ? ' (autoLayout agrega las salidas de emergencia que falten)' : ''}`,
            });
          }
      } catch (e) {
        out.push({ level: 'error', path: 'shell', msg: `validador: ${e instanceof Error ? e.message : String(e)}` });
      }
    }
    out.sort((a, z) => (a.level === z.level ? 0 : a.level === 'error' ? -1 : z.level === 'error' ? 1 : 0));
    ed.issues = out;
    changed();
  }
  // en medio de un arrastre no: el validador (7–16 ms en el hilo de la página) y el inspector que rearma (con su layout
  // forzado) se comían el cuadro de las movidas que llegaban después de una pausa. Al soltar llega otro aviso, sin `live`
  S.subscribe((_, { live }) => {
    clearTimeout(timer);
    if (!live) timer = setTimeout(run, 60);
  });
  ed.coreNote = 'Cargando el validador del paquete…';
  Promise.all([import('@snowpark-bcn/park3d'), import('@snowpark-bcn/park3d/plan')])
    .then(([main, plan]) => {
      core = { validateLayout: main.validateLayout, planSVG: plan.planSVG };
      ed.coreNote = '';
      window.__editorCore = true;
      run();
    })
    .catch(e => {
      ed.coreNote = `Sin el validador del paquete (${e instanceof Error ? e.message : String(e)}): solo los chequeos del dibujo.`;
      run();
    });
  run();
  return { run };
}
