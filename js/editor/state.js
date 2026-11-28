// El estado del editor de naves (editor.html): la nave que se dibuja, solo el edificio (`{ id, name, city?, shell }`,
// una `Nave` de docs/ESQUEMA.md, sin pista ni zonas), con deshacer/rehacer y su copia en localStorage. Lo comparten el
// dibujo (js/editor/draw*.js, que lo escribe) y el panel del park (js/editor/park*.js, que le pasa la nave a
// `autoLayout` cada vez que cambia). Contrato:
//
// - `getBuilding()`: la nave de ahora, congelada (no se toca: para cambiarla, una copia y `setBuilding`). Siempre es
//   una `Nave` del esquema; el contorno puede tener menos de 3 vértices solo mientras se dibuja de cero
//   (`isDrawn(b)`): ahí `autoLayout` no tiene qué armar.
// - `setBuilding(b, { undoable = true, live = false })`: la reemplaza y avisa. `undoable: false` no deja un paso para
//   deshacer (los cuadros de un arrastre después del primero); `live: true` = en medio de un gesto (arrastrando un
//   vértice): vienen más, conviene no correr nada caro hasta el aviso sin `live`, que llega al soltar.
// - `subscribe(fn)` → `unsubscribe`: `fn(building, { reason, live })` en cada cambio, con `reason` = `set`, `undo`,
//   `redo` o `load`.
// - `undo()`, `redo()`, `canUndo()`, `canRedo()`.
// - `save()` / `loadSaved()` / `clearSaved()`: la copia en localStorage (se guarda sola, sin `live`, ~0,3 s después de
//   cada cambio); `onSave(fn)` → `fn(building)` justo después de cada guardado, para lo que se guarda aparte y tiene
//   que ir con esa misma nave (dónde cae la imagen de fondo, en sus coordenadas); `exportJSON()` /
//   `parseBuilding(text)`: el JSON de la nave (importa también un layout entero: se queda con su nave).
import { clone, naveOf, rectangleBuilding } from './draw-model.js';

const KEY = 'naves-editor:building:v1';
const LIMIT = 200;

/** Congela el objeto entero (así un `b.shell.x = …` de quien lo lee falla en vez de cambiar la nave sin avisar). */
function deepFreeze(v) {
  if (v && typeof v === 'object' && !Object.isFrozen(v)) {
    Object.freeze(v);
    for (const k of Object.keys(v)) deepFreeze(v[k]);
  }
  return v;
}

const storage = (() => {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null; // sin almacenamiento (Safari privado, sandbox)
  }
})();

/** La nave guardada en localStorage, o null. */
export function loadSaved() {
  try {
    const t = storage?.getItem(KEY);
    return t ? naveOf(JSON.parse(t)) : null;
  } catch (e) {
    console.warn('editor: no se pudo leer la nave guardada', e);
    return null;
  }
}

let building = deepFreeze(loadSaved() ?? rectangleBuilding(15, 40));
const past = [];
const future = [];
const subs = new Set();
let saveTimer = 0;

/** Si el contorno ya está cerrado (3 vértices o más): recién ahí hay una nave que armar. */
export const isDrawn = b => (b?.shell?.outline?.length ?? 0) >= 3;

export const getBuilding = () => building;

function emit(reason, live) {
  for (const fn of subs)
    try {
      fn(building, { reason, live });
    } catch (e) {
      console.error('editor: un suscriptor falló', e);
    }
  if (!live) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 300);
  }
}

export function setBuilding(b, { undoable = true, live = false, reason = 'set' } = {}) {
  // la misma nave otra vez (un campo que se aplica con Enter y al salir) no deja un paso para deshacer
  if (b !== building && (live || JSON.stringify(b) !== JSON.stringify(building))) {
    if (undoable) {
      past.push(building);
      if (past.length > LIMIT) past.shift();
      future.length = 0;
    }
    building = deepFreeze(Object.isFrozen(b) ? b : clone(b));
  }
  emit(reason, live);
}

export function subscribe(fn) {
  subs.add(fn);
  return () => subs.delete(fn);
}

export const canUndo = () => past.length > 0;
export const canRedo = () => future.length > 0;

export function undo() {
  if (!past.length) return false;
  future.push(building);
  building = /** @type {any} */ (past.pop());
  emit('undo', false);
  return true;
}

export function redo() {
  if (!future.length) return false;
  past.push(building);
  building = /** @type {any} */ (future.pop());
  emit('redo', false);
  return true;
}

const saveHooks = new Set();
export function onSave(fn) {
  saveHooks.add(fn);
  return () => saveHooks.delete(fn);
}

/** Guarda la nave en localStorage (y lo de `onSave`, en el mismo momento); dice si pudo. */
export function save() {
  try {
    storage?.setItem(KEY, JSON.stringify(building));
  } catch (e) {
    console.warn('editor: no se pudo guardar la nave', e);
    return false;
  }
  for (const fn of saveHooks)
    try {
      fn(building);
    } catch (e) {
      console.warn('editor: no se pudo guardar lo que va con la nave', e);
    }
  return !!storage;
}

export function clearSaved() {
  storage?.removeItem(KEY);
}

/** Reemplaza la nave por otra (una plantilla, una nave del sitio, un JSON importado): se puede deshacer. */
export function loadBuilding(b) {
  setBuilding(naveOf(b), { reason: 'load' });
}

/** El JSON de la nave, para exportar (con sangría: se lee y se corrige a mano). */
export const exportJSON = (b = building) => JSON.stringify(b, null, 2) + '\n';

/** La nave de un JSON (una nave o un layout entero, del que se queda con la nave). Lanza si no es una. */
export function parseBuilding(text) {
  let v;
  try {
    v = JSON.parse(text);
  } catch (e) {
    throw new Error(`no es JSON: ${e instanceof Error ? e.message : String(e)}`, { cause: e });
  }
  return naveOf(v);
}
