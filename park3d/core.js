/**
 * Núcleo Rust → WebAssembly (`crates/park3d-core`), con tipos.
 *
 * `loadCore()` carga el `.wasm` una sola vez y devuelve funciones síncronas. En el navegador lo pide
 * con `fetch` y lo compila en streaming (los bundlers ven el `new URL(…, import.meta.url)` y copian el
 * archivo solos); en Node lo lee del disco.
 *
 * ```ts
 * import { loadCore } from '@snowpark-bcn/park3d/core';
 * const core = await loadCore();
 * const { errors, warnings, info } = core.validateLayout(layout); // lo mismo que validateLayout(layout)
 * const { layout: park, issues } = core.autoLayout(nave, { lanes: 3 }); // lo mismo que autoLayout(nave, …)
 * ```
 *
 * El `.wasm` viene compilado en `pkg/` (versionado): quien usa el paquete no necesita Rust. `validateLayout`,
 * `layoutIssues` y `autoLayout` de la entrada principal son este mismo núcleo (la entrada lo carga al importarse).
 */
import init, { SlopeFrameHandle, autoLayoutExactJson as wasmAutoLayoutExactJson, autoLayoutFanoutJobsJson as wasmAutoLayoutFanoutJobsJson, autoLayoutFanoutPlansJson as wasmAutoLayoutFanoutPlansJson, autoLayoutFanoutStepJson as wasmAutoLayoutFanoutStepJson, autoLayoutFinishJson as wasmAutoLayoutFinishJson, autoLayoutJson as wasmAutoLayoutJson, autoLayoutProvisionalJson as wasmAutoLayoutProvisionalJson, edgeFrameFlat as wasmEdgeFrameFlat, evacuationWalkJson as wasmEvacuationWalkJson, insidePolyFlat as wasmInsidePolyFlat, layoutIssuesJson as wasmLayoutIssuesJson, maxPlatformHeight as wasmMaxPlatformHeight, planSvgJson as wasmPlanSvgJson, preconditionErrorsJson as wasmPreconditionErrorsJson, programChecksJson as wasmProgramChecksJson, programJson as wasmProgramJson, roofModelJson as wasmRoofModelJson, validateLayoutJson as wasmValidateLayoutJson, version as wasmVersion, walkabilityReportJson as wasmWalkabilityReportJson, } from '../pkg/park3d_core.js';
/** Error del núcleo: layout sin la estructura del esquema, `.wasm` que no se pudo cargar o que falló. */
export class CoreError extends Error {
    name = 'CoreError';
}
let pending;
/** Puesto si el `.wasm` hizo trap: desde ahí el núcleo no se usa más (ver `validateLayoutJson`). */
let broken;
/**
 * Carga el núcleo (una sola vez: las llamadas siguientes devuelven la misma promesa). Si el `.wasm`
 * falló por dentro (trap), rechaza: hay que recargar la página.
 */
export function loadCore(options = {}) {
    if (broken)
        return Promise.reject(broken);
    pending ??= instantiate(options).catch((e) => {
        pending = undefined; // que se pueda reintentar
        throw e instanceof CoreError ? e : new CoreError(`no se pudo cargar el núcleo WASM: ${String(e)}`, { cause: e });
    });
    return pending;
}
/** `validateLayout` en WASM, cargando el núcleo si hace falta. */
export async function validateLayoutWasm(layout) {
    return (await loadCore()).validateLayout(layout);
}
/** `autoLayout` en WASM, cargando el núcleo si hace falta. */
export async function autoLayoutWasm(nave, options) {
    return (await loadCore()).autoLayout(nave, options);
}
async function instantiate({ wasm }) {
    await init({ module_or_path: (await wasm) ?? (await defaultSource()) });
    /** Una llamada al `.wasm`: errores como `CoreError`, y un trap deja el núcleo fuera de servicio. */
    const call = (fn) => {
        if (broken)
            throw broken;
        try {
            return fn();
        }
        catch (e) {
            if (e instanceof WebAssembly.RuntimeError) {
                // Un trap (un pánico de Rust, memoria agotada) corta la llamada a la mitad: la pila de Rust
                // queda corrida y el heap puede quedar a medias. El glue de wasm-bindgen tiene una sola
                // instancia y su `init()` devuelve esa misma, así que no se puede empezar de cero: mejor
                // lanzar siempre que seguir con la memoria rota.
                broken = new CoreError(`el núcleo WASM falló y quedó fuera de servicio (recargá la página): ${e.message}`, {
                    cause: e,
                });
                pending = undefined;
                throw broken;
            }
            throw new CoreError(e instanceof Error ? e.message : String(e), { cause: e });
        }
    };
    const validateLayoutJson = (json) => JSON.parse(call(() => wasmValidateLayoutJson(json)));
    const onLayout = (fn) => (layout) => JSON.parse(call(() => fn(JSON.stringify(layout))));
    const autoLayoutJson = (json, options = {}) => JSON.parse(call(() => wasmAutoLayoutJson(json, JSON.stringify(options))));
    const autoLayoutExact = (nave, options = {}, walk = false) => JSON.parse(call(() => wasmAutoLayoutExactJson(JSON.stringify(nave), JSON.stringify(options), walk)));
    const autoLayoutFinish = (nave, options, exact) => {
        // del exacto, solo lo que se mide y lo que se vuelve a poner
        const e = JSON.stringify({
            key: exact.key,
            order: exact.order,
            ownIssues: exact.ownIssues,
            layout: exact.result.layout,
            // el núcleo lo compara con el de `nave` y `options`: el exacto de otra entrada no es su park
            inputHash: exact.inputHash,
        });
        return JSON.parse(call(() => wasmAutoLayoutFinishJson(JSON.stringify(nave), JSON.stringify(options), e)));
    };
    const autoLayoutProvisional = (nave, options, hint, packs = 1, maxSteps = 0) => JSON.parse(call(() => wasmAutoLayoutProvisionalJson(JSON.stringify(nave), JSON.stringify(options), JSON.stringify(hint), packs, maxSteps)));
    const pair = (v, i) => [v[i], v[i + 1]];
    const slopeFrame = (slope) => {
        // el marco vive en el .wasm (lo libera el FinalizationRegistry de wasm-bindgen cuando se suelta el objeto)
        const h = call(() => new SlopeFrameHandle(JSON.stringify(slope)));
        const data = JSON.parse(call(() => h.dataJson()));
        return {
            ...data,
            toWorld: (sa, u) => pair(call(() => h.toWorld(sa, u)), 0),
            toLocal: (x, z) => pair(call(() => h.toLocal(x, z)), 0),
            profile: (sa, lane) => call(() => h.profile(sa, lane)),
            surfaceAt: (sa, u) => call(() => h.surfaceAt(sa, u)),
            wallAt: k => call(() => h.wallAt(k)),
        };
    };
    return Object.freeze({
        version: wasmVersion(),
        validateLayoutJson,
        validateLayout: (layout) => validateLayoutJson(JSON.stringify(layout)),
        layoutIssues: onLayout(wasmLayoutIssuesJson),
        programChecks: onLayout(wasmProgramChecksJson),
        evacuationWalk: onLayout(wasmEvacuationWalkJson),
        preconditionErrors: onLayout(wasmPreconditionErrorsJson),
        walkabilityReport: onLayout(wasmWalkabilityReportJson),
        autoLayoutJson,
        autoLayout: (nave, options) => autoLayoutJson(JSON.stringify(nave), options),
        autoLayoutExact,
        autoLayoutFinish,
        autoLayoutProvisional,
        autoLayoutFanout: Object.freeze({
            plans: (nave, options, part, parts) => call(() => wasmAutoLayoutFanoutPlansJson(nave, options, part, parts)),
            jobs: (nave, options, jobs) => call(() => wasmAutoLayoutFanoutJobsJson(nave, options, jobs)),
            step: (nave, options, parts, done, workers, winner = '') => call(() => wasmAutoLayoutFanoutStepJson(nave, options, parts, done, workers, winner)),
        }),
        planSVG: (layout, options = {}) => call(() => wasmPlanSvgJson(JSON.stringify(layout), options.width ?? 760)),
        roofModel: (shell) => JSON.parse(call(() => wasmRoofModelJson(JSON.stringify(shell)))),
        slopeFrame,
        edgeFrame: (outline, k) => {
            const v = call(() => wasmEdgeFrameFlat(outline.flat(), k));
            return { A: pair(v, 0), B: pair(v, 2), len: v[4], dir: pair(v, 5), nIn: pair(v, 7) };
        },
        insidePoly: (outline, x, z) => call(() => wasmInsidePolyFlat(outline.flat(), x, z)),
        program: () => JSON.parse(call(() => wasmProgramJson())),
        maxPlatformHeight: (clearHeight) => call(() => wasmMaxPlatformHeight(clearHeight)),
    });
}
/** El `.wasm` del paquete: la URL en el navegador; los bytes en Node, que no hace `fetch` de `file:`. */
async function defaultSource() {
    const url = new URL('../pkg/park3d_core_bg.wasm', import.meta.url);
    // getBuiltinModule y no `import('node:fs')`: así ningún bundler intenta empaquetar fs para el navegador
    // sin los tipos de Node: quien usa el paquete en una página no los tiene (tsconfig con `types: []`)
    const node = globalThis.process;
    if (url.protocol !== 'file:') {
        // En el servidor de un bundler (Next con Turbopack) el `new URL` apunta a la copia para el navegador
        // (`/_next/static/media/…`), que Node no puede pedir: mejor decir cómo se arregla que el «Failed to parse URL» de fetch
        if (typeof document === 'undefined' && node?.versions?.node && !/^(https?|data|blob):$/.test(url.protocol))
            throw new CoreError(`el .wasm del núcleo no está en el disco (el bundler lo dejó en ${String(url)}): en el servidor de Next, ` +
                "`serverExternalPackages: ['@snowpark-bcn/park3d']` en next.config; si no, loadCore({ wasm }) con sus bytes");
        return url;
    }
    const fs = node?.getBuiltinModule?.('node:fs/promises');
    if (!fs)
        throw new CoreError(`no se puede leer ${url.href}: pasá el .wasm con loadCore({ wasm })`);
    return fs.readFile(url);
}
//# sourceMappingURL=core.js.map