// Los pedidos de la página del editor a uno de sus workers (park-worker.js, el park exacto; park-walk-worker.js, lo
// que se camina): uno a la vez y gana el más nuevo. El worker corre el núcleo en sincrónico y no se lo puede
// interrumpir, así que mientras trabaja en un pedido el siguiente espera, y si llega otro más nuevo reemplaza al que
// esperaba (arrastrar un vértice no encola un park por cuadro: sale el del último cuadro apenas se libera). Sin
// esperas fijas: un pedido con el worker libre sale en el acto.
//
// Con `spawn` (cómo crear el worker), además: `preempt()` corta el pedido en curso (termina el worker y arranca otro)
// para que el que espera salga ya, y un worker que se cayó (`onerror`) o cuyo núcleo quedó fuera de servicio (la
// respuesta trae `fatal`) se reemplaza por uno nuevo antes del pedido siguiente.

/**
 * `worker`: un `Worker` (o lo que tenga `postMessage`, `onmessage` y `terminate`, para los tests); `spawn`: una función
 * que crea uno (sin `worker`, el primero sale de ahí). Cada pedido es un objeto con su `rev` (la respuesta trae el
 * mismo; así se reconoce la del pedido en curso). `onResult(respuesta, pedido)` recibe cada respuesta (o el error del
 * worker como `{ ok: false, error, fatal: true }` con la etiqueta del pedido) y `onBusy(ocupado)` cuándo empieza y
 * termina de trabajar.
 */
export function createWorkerQueue({ worker, spawn, onResult = () => {}, onBusy = () => {}, name = 'park' }) {
  let inFlight = null;
  let pending = null;
  let disposed = false;
  let posted = 0;
  let spawned = 0;
  let preempted = 0;
  let w = null;
  let since = 0;
  const clock = () => (typeof performance === 'undefined' ? Date.now() : performance.now());
  const post = () => {
    if (inFlight || !pending || disposed) return;
    inFlight = pending;
    since = clock();
    pending = null;
    posted += 1;
    onBusy(true);
    w.postMessage(inFlight);
  };
  const done = (data, job) => {
    inFlight = null;
    // un worker caído o con el núcleo roto no contesta bien nada más: el pedido siguiente va a uno nuevo
    if (data?.fatal && spawn) replace();
    try {
      onResult(data, job);
    } finally {
      if (!pending) onBusy(false);
      post();
    }
  };
  const attach = next => {
    w = next;
    w.onmessage = ({ data }) => {
      // la respuesta es la del pedido en curso (hay uno solo): otra cosa es de un worker que se reemplazó
      if (disposed || w !== next || !inFlight || data?.rev !== inFlight.rev) return;
      done(data, inFlight);
    };
    w.onerror = e => {
      e?.preventDefault?.();
      if (disposed || w !== next || !inFlight) return;
      const job = inFlight;
      const tag = { type: job.type, rev: job.rev, inputKey: job.inputKey, layoutHash: job.layoutHash ?? null };
      const error = `el worker del ${name} falló: ${e?.message ?? String(e)}`;
      done({ ...tag, ok: false, error, fatal: true, ms: 0 }, job);
    };
  };
  const replace = () => {
    w.onmessage = null;
    w.onerror = null;
    w.terminate?.();
    spawned += 1;
    attach(spawn());
  };
  attach(worker ?? spawn());
  return {
    /** Pide `job`: sale ya si el worker está libre; si no, reemplaza al que esperaba. */
    want(job) {
      pending = job;
      post();
    },
    /** Olvida el pedido que esperaba (lo que pedía ya no hace falta). */
    drop() {
      pending = null;
    },
    /** Un aviso al worker que no tiene respuesta (`{ type: 'live' }`): sale ya, aunque haya un pedido en curso. */
    signal(msg) {
      if (!disposed) w.postMessage(msg);
    },
    /**
     * Corta el pedido en curso (su respuesta no llega: termina el worker y arranca otro, que vuelve a cargar el núcleo)
     * y manda el que esperaba. Solo con `spawn` y con algo esperando; devuelve si lo cortó.
     */
    preempt() {
      if (!spawn || !inFlight || !pending || disposed) return false;
      inFlight = null;
      preempted += 1;
      replace();
      post();
      return true;
    },
    /** El pedido en curso, o null. */
    get inFlight() {
      return inFlight;
    },
    /** Hace cuántos ms salió el pedido en curso (0 sin pedido). */
    get inFlightMs() {
      return inFlight ? clock() - since : 0;
    },
    /** El que espera su turno, o null. */
    get pending() {
      return pending;
    },
    get busy() {
      return inFlight != null;
    },
    /** Cuántos pedidos le llegaron al worker. */
    get posted() {
      return posted;
    },
    /** Cuántas veces se reemplazó el worker (por `preempt` o porque se cayó) y cuántos pedidos se cortaron. */
    get spawned() {
      return spawned;
    },
    get preempted() {
      return preempted;
    },
    dispose() {
      disposed = true;
      pending = null;
      w.terminate?.();
    },
  };
}
