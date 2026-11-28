/**
 * createPark(canvas, options): el `Park` de src/park.ts sobre el motor Rust (Bevy 0.20 + wgpu sobre WebGPU,
 * `crates/park3d-web`), el único desde el 23/11 (el de three.js se borró; lo que le falta se cierra después:
 * docs/PORTING.md).
 *
 * Carga el módulo de wasm-bindgen con import() dinámico: por defecto el del paquete (`dist/web/park3d_web.js` y su
 * `.wasm`, que `pnpm build` copia de `scripts/web-build.sh`; los dos se nombran con `new URL(…, import.meta.url)`
 * literales, así Vite, webpack y Turbopack los copian solos al build), o `options.wasm` (la URL de `park3d_web.js`; el
 * `.wasm` va al lado). Traduce la API del `.wasm` (tipos en src/generated/park3d-web.d.ts) a
 * la de `Park`: vistas, órbita, a pie, recorrido y joystick (la cámara de `park3d-engine/src/camera`), el cine
 * (`park3d-engine/src/cinema`; la capa con las bandas, la mosca y el rótulo es la de src/cinema-overlay.ts, en
 * `overlay`, con su atajo C, Esc, →), `labels`, `project()`, `cameraState`, `pause()`, `resize()`, `setLayout()`,
 * `exportGLB()` (el GLB para Cycles de `park3d-engine/src/export`, sin imágenes: render.py pone las texturas por el
 * nombre de cada material), `textures`, eventos, `dispose()` y `destroy()`. El teclado (`keyboard`,
 * por defecto sí) se escucha en `window`: winit solo lo ve con el canvas enfocado. Los assets para Bevy salen de
 * `assets` (`assets-bevy/`; por defecto `DEFAULT_ASSETS`; `rustAssets`, su nombre de antes, también); `people: false`
 * saca los riders; `exposure` y `exposureBias` van al medidor del motor (`PostSettings`), también después con
 * `setExposure`, y `cameraState` dice la exposición del cuadro y la última lectura del medidor. Lo que el motor Rust
 * todavía no tiene:
 * - `scene`, `camera`, `renderer` y `controls` (los objetos de three.js del motor JS) no existen: leerlos tira un
 *   error que lo dice; los datos de la cámara, la exposición incluida, están en `cameraState`.
 * - Opciones que no usa: `pixelRatio` (winit usa el devicePixelRatio entero, sin el tope de 2). `lightmaps` es una
 *   carpeta dentro de `assets` (los bakes de `bake.py --plan`) y `light`, la luz para comparar con Cycles.
 * - `resize(ancho, alto)` y `autoResize` como en el motor JS (`renderer.setSize(w, h, false)`): cambian el tamaño de
 *   la imagen y la proyección, nunca el CSS del canvas; `resize()` vuelve a medir el CSS. El tamaño nuevo se ve en el
 *   cuadro siguiente (no en el mismo llamado).
 *
 * El plazo (`timeoutMs`) cuenta el tiempo con la página visible sin que el motor avance (`Park.heartbeat()` del
 * `.wasm`: sube con cada cuadro y cada textura): una máquina lenta que sigue dibujando no vence, uno trabado sí. Si
 * vence en createPark, cancela el `create` del `.wasm` con su `signal`, como la de las opciones: el motor sale y suelta
 * la GPU (o no arranca) y la instancia queda para el próximo park.
 *
 * Los errores salen como `ParkError` con el `code` que les pone el `.wasm` (o `timeout`, de acá); los de `signal`, con
 * su `reason`.
 *
 * Instancias del `.wasm`: winit admite un solo event loop vivo por instancia, y uno nuevo cuando el anterior terminó.
 * Un park nuevo reusa la instancia del anterior si ya se liberó (`dispose`, o un createPark cancelado con `signal` o
 * vencido: el `create` del `.wasm` espera solo a que se suelte la App vieja), así create → dispose → create y el doble
 * montaje de React StrictMode no piden memoria nueva. Solo dos parks vivos a la vez cargan otra instancia del módulo
 * (la misma URL con `?park3d=N`: otro módulo para el navegador; el `.wasm` sale de la caché HTTP, pero su memoria queda
 * tomada hasta recargar la página).
 */
import { ASSETS_MANIFEST_SHA256 } from './assets-pin.js';
import { cinemaKeys, createCinemaOverlay } from './cinema-overlay.js';
import { checkExposure, checkUpscaler, DEFAULT_ASSETS, ParkError, } from './park.js';
/**
 * El motor del paquete (`dist/web/`: lo copia `pnpm build` de lo que arma `scripts/web-build.sh`). Literales, para que
 * los bundlers los vean y los copien con su hash; el `.wasm` se le pasa a `init()` (al lado del glue copiado no está).
 */
const PACKAGED = {
    glue: new URL('./web/park3d_web.js', import.meta.url),
    wasm: new URL('./web/park3d_web_bg.wasm', import.meta.url),
};
/**
 * Plazo sin avances del motor para que la imagen llegue a pantalla con la página visible; `timeoutMs` de las opciones
 * lo cambia (las herramientas sin pantalla: SwiftShader con la máquina cargada tarda más de un minuto en un cuadro).
 */
const TIMEOUT_MS = 60_000;
const pools = new Map();
let instances = 0;
/** @internal Lo llama createPark (src/park.ts) con el layout ya resuelto y las opciones ya comprobadas. */
export async function createRustPark(canvas, options, layout, issues, progress) {
    const signal = options.signal;
    const timeoutMs = options.timeoutMs ?? TIMEOUT_MS;
    // la carpeta de los assets para Bevy: `rustAssets` es el nombre de antes
    const assets = options.rustAssets ?? options.assets ?? DEFAULT_ASSETS;
    checkAssetsVersion(assetsURL(assets));
    // ya cancelado: sin tomar una instancia (la tomaría otro park que se crea enseguida, como en StrictMode)
    if (signal?.aborted)
        throw abortReason(signal);
    progress('renderer', 'Preparando WebGPU…');
    const inst = instanceFor(options.wasm ?? null, downloadProgress(progress, options.wasmBytes ?? 0));
    let mod;
    try {
        mod = await inst.mod;
    }
    catch (e) {
        // el módulo no cargó (la red, un .wasm roto): el próximo createPark lo vuelve a pedir
        inst.state = 'dead';
        throw toParkError(e);
    }
    if (signal?.aborted) {
        inst.state = 'idle';
        throw abortReason(signal);
    }
    const heartbeat = beatOf(mod);
    // el avance de las texturas: mientras se espera la imagen (createPark, setLayout) y, si el park se entregó con
    // texturas cargando (8 s), cada una que llega, hasta la última (con el mensaje vacío)
    let waiting = true;
    let trailing = false;
    let textures = NO_TEXTURES;
    const onTextures = (t) => {
        textures = Object.freeze({ ...t });
        if (waiting)
            progress('textures', texturesMessage(textures), textures);
        else if (trailing) {
            trailing = !textures.done;
            progress('textures', textures.done ? '' : texturesMessage(textures), textures);
        }
    };
    // terminó una espera (el park se ve): si faltan texturas, se sigue avisando
    const shown = () => {
        waiting = false;
        trailing = !textures.done && textures !== NO_TEXTURES;
    };
    progress('scene', 'Construyendo la nave…');
    // la señal del create del .wasm: la de las opciones o el plazo, lo que llegue antes
    const cancel = new AbortController();
    const onAbort = () => {
        cancel.abort(abortReason(signal));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    const stop = deadline(timeoutMs, heartbeat, () => {
        cancel.abort(timeoutError(timeoutMs));
    });
    let raw;
    try {
        const createOptions = {
            view: options.view ?? 'maqueta',
            autoResize: options.autoResize !== false,
            people: options.people !== false,
            assets: assetsURL(assets),
            // vacía, sin bakes
            ...(options.lightmaps ? { lightmaps: lightmapsDir(options.lightmaps, assets) } : {}),
            ...(options.light == null ? {} : { light: options.light }),
            ...(options.exposure == null ? {} : { exposure: options.exposure }),
            ...(options.exposureBias ? { exposureBias: options.exposureBias } : {}),
            ...(options.renderScale == null ? {} : { renderScale: options.renderScale }),
            ...(options.upscaler == null ? {} : { upscaler: options.upscaler }),
            ...(options.still ? { still: true } : {}),
            ...(options.ready === 'near' ? { ready: 'near' } : {}),
            signal: cancel.signal,
            onTextures,
        };
        // el .wasm rechaza solo con la señal cancelada; si llega igual (un motor de antes, sin `signal`), se libera
        raw = await untilAbort(mod.Park.create(canvas, layout, createOptions), cancel.signal, p => {
            void p.dispose();
        });
    }
    catch (e) {
        if (cancel.signal.aborted) {
            // cancelado o vencido: el .wasm no deja nada vivo y el próximo create de esta instancia espera solo a que se
            // suelte la App
            inst.state = 'idle';
            throw abortReason(cancel.signal);
        }
        const error = toParkError(e);
        // tras un pánico la instancia no sirve; si no (sin WebGPU, layout inválido), no quedó nada vivo
        inst.state = error instanceof ParkError && error.code === 'crashed' ? 'dead' : 'idle';
        throw error;
    }
    finally {
        stop();
        signal?.removeEventListener('abort', onAbort);
    }
    inst.state = 'busy';
    shown();
    progress('ready', '');
    const listeners = new Set();
    const emit = (type, event) => {
        for (const l of listeners)
            if (l.type === type)
                try {
                    l.fn(event);
                }
                catch (e) {
                    console.error(e);
                }
    };
    // el cine: la capa (bandas, mosca, rótulo, salir) la dibuja la página; con `overlay: false`, quien usa el park
    const host = options.overlay === false ? null : (options.overlay ?? canvas.parentElement);
    const overlay = host ? createCinemaOverlay(host, layout.name, () => raw.cinema(false)) : null;
    let views = viewsOf(raw.views);
    const viewOf = (v) => views.find(x => x.name === v.name) ?? toView(v);
    let current = { layout, issues };
    let disposed = false;
    /** El motor entró en pánico: la instancia no se vuelve a usar. */
    let crashed = false;
    /**
     * La promesa de `destroy()`: el motor soltó la App y su dispositivo de la GPU (como mucho 30 s: `DRAIN_MS` de
     * crates/park3d-web/src/web.rs).
     */
    let released = null;
    let building = 0;
    // un setLayout que ya no cuenta: lo reemplazó otro o el park se liberó mientras esperaba
    const stale = (token) => disposed || token !== building;
    /** Lo que no se armó del park que se acaba de ver, como un evento `error` con `code: 'build'`. */
    const reportFailures = () => {
        const failures = raw.failures.map(toFailure);
        if (failures.length)
            emit('error', { error: buildError(failures) });
    };
    const offs = [
        raw.on('view', ({ view }) => {
            emit('view', { view: viewOf(view) });
        }),
        raw.on('mode', ({ mode }) => {
            overlay?.show(mode === 'cinema');
            emit('mode', { mode });
        }),
        raw.on('caption', ({ title, subtitle }) => {
            overlay?.caption(title, subtitle);
            emit('caption', { title, subtitle });
        }),
        raw.on('error', ({ error }) => {
            // lo que no se armó lo avisa `reportFailures`, también con el park de createPark (que no tenía oyentes)
            const code = error.code;
            if (code === 'build')
                return;
            if (code === 'crashed')
                crashed = true;
            console.error('park3d:', error);
            emit('error', { error: asParkError(error) });
        }),
    ];
    // el teclado de la página para caminar, como el motor JS (en `window`, salvo en campos de texto): lo que llega al
    // canvas ya lo ve winit
    if (options.keyboard !== false) {
        const typing = (t) => t instanceof Element && t.closest('input,select,textarea,[contenteditable]') != null;
        const key = (down) => (e) => {
            if (!disposed && !(down && typing(e.target)) && e.target !== canvas)
                raw.key(e.code, down);
        };
        const onDown = key(true), onUp = key(false);
        const onBlur = () => {
            if (!disposed)
                raw.blur();
        };
        addEventListener('keydown', onDown);
        addEventListener('keyup', onUp);
        addEventListener('blur', onBlur);
        offs.push(() => {
            removeEventListener('keydown', onDown);
            removeEventListener('keyup', onUp);
            removeEventListener('blur', onBlur);
        });
    }
    if (options.keyboard !== false)
        offs.push(cinemaKeys(() => raw.mode === 'cinema', on => raw.cinema(on), () => raw.cinemaNext()));
    if (overlay)
        offs.push(() => {
            overlay.dispose();
        });
    // lo que no se armó del park de createPark: después de resolver, para que lo vea quien se suscribe con el park en la
    // mano (`await createPark(…)` y enseguida `park.on('error', …)`)
    if (raw.failures.length)
        setTimeout(() => {
            if (!disposed)
                reportFailures();
        }, 0);
    const park = {
        get layout() {
            return current.layout;
        },
        get issues() {
            return current.issues;
        },
        get views() {
            return views;
        },
        get view() {
            const v = raw.view;
            return v ? viewOf(v) : null;
        },
        get mode() {
            return raw.mode;
        },
        get labels() {
            return raw.labels.map(toLabel);
        },
        get failures() {
            return raw.failures.map(toFailure);
        },
        get cameraState() {
            const c = raw.camera;
            return c && Object.freeze({ ...c });
        },
        get textures() {
            return textures;
        },
        stats() {
            return raw.stats();
        },
        pause(on) {
            if (!disposed)
                raw.pause(on);
        },
        setExposure(o) {
            checkExposure('setExposure', o);
            if (!disposed)
                raw.setExposure({
                    exposure: o.exposure ?? null,
                    ...(o.exposureBias ? { exposureBias: o.exposureBias } : {}),
                });
        },
        setWhiteBalance(k) {
            if (!disposed)
                raw.setWhiteBalance(k);
        },
        goTo(view, o = {}) {
            raw.goTo(typeof view === 'string' ? view : view.name, { animate: o.animate ?? true });
        },
        walk(on) {
            raw.walk(on);
        },
        tour(on) {
            raw.tour(on);
        },
        cinema(on) {
            raw.cinema(on);
        },
        cinemaLens(dof, motionBlur) {
            if (!disposed)
                raw.cinemaLens(dof, motionBlur);
        },
        setJoystick(x, y) {
            raw.setJoystick(x, y);
        },
        photo(camera) {
            // el .wasm la lee como JSON: los `readonly` de Vec3 no cambian nada
            raw.photo(camera);
        },
        async setLayout(next) {
            if (disposed)
                throw disposedError();
            const token = ++building;
            waiting = true;
            // el plazo sin avances, como en createPark (acá no cancela: el park anterior ya no está)
            const timer = new AbortController();
            const stopTimer = deadline(timeoutMs, heartbeat, () => {
                timer.abort(timeoutError(timeoutMs));
            });
            try {
                await untilAbort(raw.setLayout(next), timer.signal, () => { });
            }
            catch (e) {
                // reemplazado por otro setLayout o liberado mientras tanto: como el motor JS, no es un error
                if (stale(token))
                    return;
                shown();
                const error = toParkError(e);
                // el .wasm ya avisó `error` de un layout inválido o un pánico; el plazo vencido, acá
                if (error instanceof ParkError && error.code === 'timeout')
                    emit('error', { error });
                throw error;
            }
            finally {
                stopTimer();
            }
            if (stale(token))
                return;
            current = { layout: next, issues: [] };
            views = viewsOf(raw.views);
            overlay?.rename(next.name);
            shown();
            progress('ready', '');
            reportFailures();
            emit('ready', { layout: next });
        },
        exportGLB(o = {}) {
            // el .wasm contesta siempre: con el GLB, o rechaza (instante que no existe, dispose, pánico)
            if (disposed)
                return Promise.reject(disposedError());
            return raw.exportGLB(o).catch((e) => {
                throw toParkError(e);
            });
        },
        project(p) {
            return raw.project(p);
        },
        resize(width, height) {
            // como el motor JS, después de dispose no tira (un ResizeObserver de la página puede llegar tarde)
            if (!disposed)
                raw.resize(width, height);
        },
        setRenderScale(scale) {
            if (!disposed)
                raw.setRenderScale(scale);
        },
        setUpscaler(upscaler) {
            checkUpscaler('setUpscaler', upscaler);
            if (!disposed)
                raw.setUpscaler(upscaler);
        },
        still(on) {
            if (!disposed)
                raw.still(on);
        },
        on(type, fn) {
            const l = { type, fn: fn };
            listeners.add(l);
            return () => {
                listeners.delete(l);
            };
        },
        dispose() {
            if (disposed)
                return;
            disposed = true;
            waiting = trailing = false;
            for (const off of offs)
                off();
            offs.length = 0;
            listeners.clear();
            // el próximo create de esta instancia espera solo a que winit suelte la App (y la GPU)
            released = raw.dispose().then(() => { }, () => { });
            inst.state = crashed ? 'dead' : 'idle';
        },
        destroy() {
            park.dispose();
            return released ?? Promise.resolve();
        },
    };
    // los objetos de three.js del motor JS ya no existen: getters que lo dicen a quien los siga leyendo desde JS (no
    // enumerables, para que copiar o inspeccionar el park no tire)
    for (const k of THREE_ONLY)
        Object.defineProperty(park, k, {
            enumerable: false,
            get() {
                throw new TypeError(`park3d: \`${k}\` era un objeto de three.js del motor JS, que se borró: no existe`);
            },
        });
    return park;
}
const THREE_ONLY = ['scene', 'camera', 'renderer', 'controls'];
/** Antes del primer aviso del motor: nada pedido todavía. */
const NO_TEXTURES = Object.freeze({
    done: false,
    ready: 0,
    loading: 0,
    failed: 0,
    format: null,
    queued: 0,
    near: 0,
    nearReady: 0,
    bytes: 0,
    bytesReady: 0,
});
/** Megabytes con una cifra decimal y coma («12,4»). */
const mb = (bytes) => (bytes / 1e6).toFixed(1).replace('.', ',');
/** El texto del avance de las texturas («Cargando texturas… 45 de 180 (12,4 de 26,0 MB)»). */
function texturesMessage(t) {
    const total = t.ready + t.loading + t.failed;
    const size = t.bytes ? ` (${mb(t.bytesReady)} de ${mb(t.bytes)} MB)` : '';
    if (t.done)
        return total ? `Texturas: ${t.ready} de ${total}` : '';
    return total ? `Cargando texturas… ${t.ready} de ${total}${size}` : 'Cargando texturas…';
}
/**
 * El avance de la descarga del motor como `progress('renderer', …)`, a lo sumo uno por punto porcentual (o por MB, sin
 * el total).
 */
function downloadProgress(progress, hint) {
    let last = -1;
    return (loaded, header) => {
        // con gzip, Content-Length (si se ve) es lo comprimido y el cuerpo llega descomprimido: no sirve de total
        const total = hint > 0 ? hint : header >= loaded ? header : 0;
        const step = total ? Math.floor((100 * loaded) / total) : Math.floor(loaded / 1e6);
        if (step === last)
            return;
        last = step;
        const done = total && loaded >= total;
        const message = done
            ? 'Preparando WebGPU…'
            : total
                ? `Descargando el motor… ${Math.min(99, step)} % (${mb(loaded)} de ${mb(total)} MB)`
                : `Descargando el motor… ${mb(loaded)} MB`;
        progress('renderer', message, undefined, [loaded, total]);
    };
}
/**
 * La instancia del módulo para un park nuevo: una libre de esta URL (la de un park ya liberado, aunque su App todavía
 * se esté soltando: el `create` del `.wasm` la espera), o una nueva si todas tienen un park vivo. La deja tomada.
 */
function instanceFor(url, onDownload) {
    const key = new URL(String(url ?? PACKAGED.glue), document.baseURI).href;
    const pool = (pools.get(key) ?? []).filter(i => i.state !== 'dead');
    pools.set(key, pool);
    const free = pool.find(i => i.state === 'idle');
    if (free) {
        free.state = 'busy';
        return free;
    }
    const inst = { mod: loadModule(key, url == null ? PACKAGED.wasm : null, onDownload), state: 'busy' };
    pool.push(inst);
    return inst;
}
/**
 * Carga otra instancia del módulo de wasm-bindgen y su `.wasm`: la URL con `?park3d=N` es otro módulo para el
 * navegador (y nunca el mismo que importe la página por su cuenta). El `.wasm` (el del paquete, o el que está al lado
 * del glue: la misma URL que pide wasm-bindgen solo) se pide a la vez que el glue, no después de importarlo, y se
 * cuentan sus bytes para `onDownload`; la compilación sigue siendo en streaming (`instantiateStreaming`).
 */
async function loadModule(url, wasm, onDownload) {
    const u = new URL(url);
    u.searchParams.set('park3d', String(++instances));
    const response = fetchCounting(wasm ?? new URL('park3d_web_bg.wasm', u), onDownload);
    // si el import falla, la descarga ya pedida no queda como una promesa rechazada sin atender
    response.catch(() => { });
    const loaded = await import(/* @vite-ignore */ /* webpackIgnore: true */ u.href);
    const mod = loaded;
    await mod.default({ module_or_path: response });
    return mod;
}
/** `fetch` del `.wasm` con los bytes que van llegando (descomprimidos) y el `Content-Length` (0 si no viene). */
async function fetchCounting(url, onDownload) {
    const res = await fetch(url);
    if (!onDownload || !res.ok || !res.body)
        return res;
    const total = Number(res.headers.get('content-length') ?? 0) || 0;
    let loaded = 0;
    const counted = res.body.pipeThrough(new TransformStream({
        transform(chunk, ctl) {
            loaded += chunk.byteLength;
            onDownload(loaded, total);
            ctl.enqueue(chunk);
        },
    }));
    // los mismos encabezados (`application/wasm`: lo que pide instantiateStreaming)
    return new Response(counted, { status: res.status, statusText: res.statusText, headers: res.headers });
}
/** Cuánto avanzó el motor de esta instancia (`Park.heartbeat()`; un motor de antes no lo tiene: el plazo es fijo). */
function beatOf(mod) {
    const park = mod.Park;
    return typeof park.heartbeat === 'function' ? () => park.heartbeat() : () => 0;
}
/**
 * El plazo sin avances: cuenta los ms con la página visible desde el último avance del motor (`heartbeat` cambia) y
 * llama a `expired` cuando llegan a `ms`. Devuelve la función que lo para.
 */
function deadline(ms, heartbeat, expired) {
    const STEP = 250;
    let idle = 0;
    let beat = heartbeat();
    const timer = setInterval(() => {
        const now = heartbeat();
        if (now !== beat) {
            beat = now;
            idle = 0;
            return;
        }
        if (typeof document !== 'undefined' && document.visibilityState === 'hidden')
            return;
        idle += STEP;
        if (idle >= ms) {
            clearInterval(timer);
            expired();
        }
    }, STEP);
    return () => {
        clearInterval(timer);
    };
}
/**
 * La promesa del `.wasm` o el motivo de `signal`, lo que llegue antes. Si la promesa llega después (cancelada), `late`
 * recibe lo que dio (para liberar el park que ya no quiere nadie).
 */
function untilAbort(p, signal, late) {
    return new Promise((resolve, reject) => {
        let done = false;
        const onAbort = () => {
            if (done)
                return;
            done = true;
            reject(abortReason(signal));
        };
        if (signal.aborted)
            onAbort();
        else
            signal.addEventListener('abort', onAbort, { once: true });
        p.then(v => {
            if (done) {
                late(v);
                return;
            }
            done = true;
            signal.removeEventListener('abort', onAbort);
            resolve(v);
        }, (e) => {
            if (done)
                return;
            done = true;
            signal.removeEventListener('abort', onAbort);
            reject(e instanceof Error ? e : new Error(String(e)));
        });
    });
}
function timeoutError(ms) {
    return new ParkError('timeout', `park3d: la imagen no llegó a pantalla: el motor no avanzó en ${String(+(ms / 1000).toFixed(2)).replace('.', ',')} s (con la página visible)`);
}
function disposedError() {
    return new ParkError('disposed', 'park3d: el park ya se liberó');
}
const CODES = new Set([
    'timeout',
    'webgpu',
    'layout',
    'build',
    'crashed',
    'disposed',
    'export',
    'argument',
    'busy',
    'engine',
]);
/** Un error del `.wasm` como `ParkError`, con su `code` (y sus `failures`, si las trae). */
function asParkError(e) {
    if (e instanceof ParkError)
        return e;
    const o = e;
    const code = typeof o.code === 'string' && CODES.has(o.code) ? o.code : 'engine';
    const failures = Array.isArray(o.failures) ? o.failures.map(toFailure) : [];
    return new ParkError(code, e.message, { cause: e, failures });
}
/**
 * Lo que rechaza el motor, para quien usa el park: un `ParkError` con su motivo. Quedan como están los de la señal
 * (`AbortError`, el motivo que se le dio) y los de un argumento mal pasado (`TypeError`, `RangeError`).
 */
function toParkError(e) {
    if (e instanceof ParkError || e instanceof TypeError || e instanceof RangeError)
        return e;
    if (e instanceof DOMException && e.name === 'AbortError')
        return e;
    return asParkError(e instanceof Error ? e : new Error(String(e)));
}
/** Lo que no se armó (`failures` del park), como el `ParkError` `build` del evento `error`. */
function buildError(failures) {
    const what = (f) => {
        switch (f.part) {
            case 'shell':
                return 'la nave (la del primer corte, sin zonas, calle ni puertas)';
            case 'slope':
                return 'la pista (la del primer corte)';
            case 'street':
                return 'la calle';
            case 'zones':
                return 'las zonas';
            case 'zone':
                return `la zona «${f.id}»`;
            case 'module':
                return `el módulo ${f.index} de la pista`;
        }
    };
    const list = failures.map(f => `${what(f)}: ${f.reason}`).join('; ');
    return new ParkError('build', `park3d: no se armó ${list}`, { failures });
}
/**
 * La carpeta de los assets para Bevy (`AssetPlugin::file_path`: el prefijo de cada pedido, que resuelve el navegador
 * contra la página), con barra final.
 */
/**
 * `lightmaps` para Bevy: una carpeta de sus assets, con «/» al final. El cargador de Bevy no sale de su carpeta (ni
 * URL absolutas ni `..`): una URL que cae dentro de `rustAssets` pasa a relativa, y otra cualquiera es un error.
 */
function lightmapsDir(dir, rustAssets) {
    const d = assetsURL(dir);
    if (!/^[a-z][a-z0-9+.-]*:|^\//i.test(d) && !d.split('/').includes('..'))
        return d;
    const root = new URL(assetsURL(rustAssets), document.baseURI).href;
    const abs = new URL(d, document.baseURI).href;
    if (abs.startsWith(root))
        return abs.slice(root.length);
    throw new TypeError(`createPark: \`lightmaps\` es una carpeta dentro de \`assets\` (${root}); es ${dir}`);
}
const checkedAssets = new Set();
/**
 * Avisa una vez por carpeta (por consola, sin frenar nada) si los assets son de otra versión del motor: su
 * `manifest.json` no viene del `assets/manifest.json` del paquete (`ASSETS_MANIFEST_SHA256`, src/assets-pin.ts). Con
 * assets de otra versión, lo que falte o se haya renombrado cae a colores planos sin un error. El motor pide el mismo
 * `manifest.json` (la caché HTTP lo sirve una vez); si no llega, lo dice el motor.
 */
function checkAssetsVersion(dir) {
    const want = ASSETS_MANIFEST_SHA256;
    if (!want || typeof fetch !== 'function')
        return;
    let url;
    try {
        url = new URL('manifest.json', new URL(dir, document.baseURI));
    }
    catch {
        return;
    }
    if (checkedAssets.has(url.href))
        return;
    checkedAssets.add(url.href);
    void fetch(url)
        .then(r => (r.ok ? r.json() : null))
        .then(m => {
        const got = m?.from?.sha256;
        if (typeof got === 'string' && got !== want)
            console.warn(`park3d: los assets de ${dir} son de otra versión del motor (su manifest.json viene de assets/manifest.json ` +
                `${got.slice(0, 12)}…; este paquete espera ${want.slice(0, 12)}…): puede faltar alguna textura o verse ` +
                'distinta. Servir los de esta versión (npx park3d-assets, README «Instalar y usar») y pasarlos en `assets`.');
    })
        .catch(() => {
        // sin red o sin CORS: lo que no llegue lo cuenta el motor (park.textures)
    });
}
function assetsURL(dir) {
    const s = typeof dir === 'string' ? dir : dir.href;
    return s.endsWith('/') ? s : s + '/';
}
function toView(v) {
    return Object.freeze({
        name: v.name,
        title: v.title,
        kind: v.kind,
        position: v.position,
        target: v.target,
        fov: v.fov,
    });
}
function viewsOf(vs) {
    return Object.freeze(vs.map(toView));
}
/** Lo que no se armó, con la forma de `ParkFailure` según la parte (el `.wasm` da los campos opcionales). */
function toFailure(f) {
    const reason = f.reason;
    switch (f.part) {
        case 'zone':
            return Object.freeze({ part: f.part, id: f.id ?? '', type: f.type, reason });
        case 'module':
            return Object.freeze({
                part: f.part,
                index: f.index ?? -1,
                type: f.type,
                lane: f.lane ?? 0,
                reason,
            });
        default:
            return Object.freeze({ part: f.part, reason });
    }
}
function toLabel(l) {
    return Object.freeze({ text: l.text, ...(l.sub ? { sub: l.sub } : {}), kind: l.kind, position: l.position });
}
function abortReason(signal) {
    return signal.reason instanceof Error ? signal.reason : new DOMException('createPark cancelado', 'AbortError');
}
//# sourceMappingURL=park-rust.js.map