/**
 * createPark(): la nave y el park en 3D sobre un <canvas>, con WebGPU: el motor Rust (Bevy 0.20 + wgpu,
 * `crates/park3d-web`), solo calidad ultra. El motor JS (three.js) se borró el 23/11 (tag `js-engine-final`,
 * docs/PORTING.md §4); lo que todavía le falta al de Rust se cierra después.
 *
 * Es la lógica del visor de las naves sin su interfaz: nada de botones, ficha, etiquetas en el DOM ni medidor. Lo que
 * el visor resolvía con la URL (?view=…, ?people=0…) acá son opciones, y lo que resolvía con el DOM (botones de
 * vistas, joystick, etiquetas) lo arma la página que lo usa con `views`, `goTo()`, `setJoystick()`, `labels` y
 * `project()`.
 *
 * El motor (`dist/web/park3d_web.js` y su `.wasm`) se carga con import() dinámico al llamar a createPark: importar
 * este paquete en el servidor (SSR) o solo por el validador no lo baja (sí el núcleo, ~1,2 MB, que da `autoLayout`).
 */
import { autoLayout } from './autolayout.js';
/**
 * Un error de `createPark` o del park, con su motivo tipado (`code`). Los rechazos por `signal` no lo son: rechazan con
 * `signal.reason` (un `AbortError`, como `fetch`), y lo que se llama mal (tipos, rangos) sigue siendo `TypeError` o
 * `RangeError`.
 */
export class ParkError extends Error {
    name = 'ParkError';
    code;
    /** Con `code: 'build'`: lo que no se armó (lo mismo que `park.failures` en ese momento). */
    failures;
    constructor(code, message, options = {}) {
        super(message, options.cause === undefined ? undefined : { cause: options.cause });
        this.code = code;
        this.failures = Object.freeze([...(options.failures ?? [])]);
    }
}
// ============================================================================ createPark
/**
 * Los assets del motor si no se pasa `assets`: la copia pública que publica el sitio de las naves
 * (jjant.github.io/naves, `rust/assets`: lo que arma `pnpm assets:bevy`, con `Access-Control-Allow-Origin: *`).
 */
export const DEFAULT_ASSETS = 'https://jjant.github.io/naves/rust/assets/';
export async function createPark(canvas, options) {
    if (typeof HTMLCanvasElement === 'undefined')
        throw new TypeError('createPark corre en el navegador (en el servidor no hay WebGPU ni <canvas>)');
    if (!(canvas instanceof HTMLCanvasElement))
        throw new TypeError('createPark: el primer argumento tiene que ser un <canvas>');
    checkOptions(options);
    const signal = options.signal;
    const abortIf = () => {
        if (signal?.aborted)
            throw abortReason(signal);
    };
    // StrictMode de React monta, cancela y vuelve a montar: con la señal ya cancelada no se pide ningún dispositivo
    abortIf();
    const progress = (stage, message, textures, bytes) => {
        try {
            options.onProgress?.(Object.freeze({
                stage,
                message,
                ...(textures ? { textures } : {}),
                ...(bytes ? { loaded: bytes[0], total: bytes[1] } : {}),
            }));
        }
        catch (e) {
            console.error(e);
        }
    };
    // autoLayout() tarda de 0,25 a 1,6 s por nave y corre en este hilo: primero se avisa y se deja pintar el aviso
    // (landing lo corre en un worker y pasa `layout`, que no bloquea)
    if (options.nave) {
        progress('layout', 'Armando el park…');
        await nextPaint();
        abortIf();
    }
    const { layout, issues } = resolveSource(options);
    const { createRustPark } = await import('./park-rust.js');
    // cancelado mientras se cargaba el adaptador (el doble montaje de StrictMode): sin tomar ninguna instancia del motor
    abortIf();
    return createRustPark(canvas, options, layout, issues, progress);
}
function abortReason(signal) {
    return signal.reason instanceof Error ? signal.reason : new DOMException('createPark cancelado', 'AbortError');
}
function checkOptions(o) {
    checkSource(o);
    // JavaScript puede pasar cualquier cosa: el tipo solo admite 'rust'
    const engine = o.engine;
    if (engine === 'js')
        throw new TypeError("createPark: el motor JS (engine: 'js', three.js) se borró; el único es el de Rust (sacá `engine` o pasá 'rust'). " +
            'Para leer el JS: el tag js-engine-final');
    if (engine != null && engine !== 'rust')
        throw new TypeError(`createPark: \`engine\` solo puede ser 'rust' (es ${JSON.stringify(engine)})`);
    if (o.exposure != null && !(Number.isFinite(o.exposure) && o.exposure > 0))
        throw new TypeError(`createPark: \`exposure\` tiene que ser un número mayor que 0 (es ${o.exposure})`);
    if (o.exposureBias != null && !Number.isFinite(o.exposureBias))
        throw new TypeError(`createPark: \`exposureBias\` tiene que ser un número finito (es ${o.exposureBias})`);
    if (o.timeoutMs != null && !(Number.isFinite(o.timeoutMs) && o.timeoutMs > 0))
        throw new TypeError(`createPark: \`timeoutMs\` tiene que ser un número mayor que 0 (es ${o.timeoutMs})`);
    if (o.renderScale != null && o.renderScale !== 'auto' && !(o.renderScale >= 0.25 && o.renderScale <= 1))
        throw new TypeError(`createPark: \`renderScale\` es 'auto' o un número de 0,25 a 1 (es ${String(o.renderScale)})`);
    checkUpscaler('createPark', o.upscaler);
    checkExposure('createPark', o);
    if (o.light?.ev100 != null && !Number.isFinite(o.light.ev100))
        throw new TypeError(`createPark: \`light.ev100\` tiene que ser un número finito (es ${o.light.ev100})`);
}
/** @internal `upscaler` de `createPark` y de `setUpscaler`: lo que no es `'fsr'` ni `'browser'` es un `TypeError`. */
export function checkUpscaler(who, upscaler) {
    if (upscaler != null && upscaler !== 'fsr' && upscaler !== 'browser')
        throw new TypeError(`${who}: \`upscaler\` es 'fsr' o 'browser' (es ${JSON.stringify(upscaler)})`);
}
/** @internal `exposure` y `exposureBias` de `createPark` y de `setExposure`: lo que no sirve es un `TypeError`. */
export function checkExposure(who, o) {
    if (o.exposure != null && !(Number.isFinite(o.exposure) && o.exposure > 0))
        throw new TypeError(`${who}: \`exposure\` tiene que ser un número mayor que 0 (es ${o.exposure})`);
    if (o.exposureBias != null && !Number.isFinite(o.exposureBias))
        throw new TypeError(`${who}: \`exposureBias\` tiene que ser un número finito (es ${o.exposureBias})`);
}
function checkSource(o) {
    if (o.layout && o.nave)
        throw new TypeError('createPark: pasar `layout` o `nave`, no los dos');
    if (!o.layout && !o.nave)
        throw new TypeError('createPark: falta `layout` (un park armado) o `nave` (se arma con autoLayout)');
}
/** Layout desde las opciones (o desde la nave con autoLayout, que bloquea el hilo hasta 1,6 s). */
function resolveSource(o) {
    checkSource(o);
    return o.layout ? { layout: o.layout, issues: [] } : autoLayout(o.nave, o.autoLayoutOptions ?? {});
}
/** Espera a que se pinte un cuadro (en una pestaña oculta no hay cuadros: como mucho 100 ms). */
function nextPaint() {
    return new Promise(res => {
        const t = setTimeout(res, 100);
        if (typeof requestAnimationFrame === 'function')
            requestAnimationFrame(() => setTimeout(() => {
                clearTimeout(t);
                res();
            }, 0));
    });
}
//# sourceMappingURL=park.js.map