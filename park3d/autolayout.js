/**
 * `autoLayout(nave)`: del plano de una nave (solo el `shell`) a un `Layout` completo: la pista dimensionada según la
 * altura libre, el programa de PROGRAMA.md (recepción, alquiler, taquillas, vestuarios, aseo adaptado, gym,
 * trampolines…) y la seguridad (salidas, extintores, BIE). Es el núcleo Rust (`crates/park3d-core/src/autolayout`, en
 * el `.wasm` de `pkg/`): esta función es una envoltura fina y los tipos (`AutoLayoutOptions`, `AutoLayoutResult`,
 * `Issue`) salen del crate con ts-rs (`src/generated/core.ts`). La implementación de TS que había acá se borró; para
 * leerla, el tag `js-engine-final` (docs/PORTING.md §4).
 *
 * Importar este módulo carga el `.wasm` del núcleo (`loadCore()`, con `await` al nivel del módulo), así que
 * `autoLayout` es síncrona: tarda de 0,25 a 1,6 s por nave, así que en una página interactiva conviene correrla en un
 * Web Worker.
 *
 * Con `explain: true`, el resultado trae también `explain` («Cómo decide»: las pistas candidatas con su puntaje término
 * a término, los programas que se armaron sobre las mejores y cuál ganó); el park es el mismo que sin la opción.
 *
 * Para un editor que rearma el park con cada movimiento, `createAutoLayoutSession()` (docs/TIEMPO-REAL.md): el exacto
 * con el camino del programa que ganó y, en el cuadro de la edición, un park provisional que rearma solo ese camino.
 */
import { loadCore } from './core.js';
/**
 * Más que esto (m² de planta) no es una nave para este snowpark (PROGRAMA apunta a 900 m²; las candidatas tienen de
 * 400 a 1.000 m²): `autoLayout` lo rechaza. Es `MAX_AREA` de `crates/park3d-core/src/autolayout.rs`.
 */
export const MAX_AREA = 6000;
// el núcleo WASM, una vez (la misma instancia que `loadCore()` de /core y que /plan)
const core = await loadCore();
/**
 * El park completo para la nave: el layout (con el `shell` de la entrada tal cual: lo que no lee el generador, también)
 * y los `issues` (opciones fuera de rango, piezas que no entraron…). Determinista: la misma nave da el mismo JSON.
 * Lanza `CoreError` si la nave no se puede armar (más de `MAX_AREA` m², sin altura, sin sitio para una pista).
 */
export function autoLayout(nave, options = {}) {
    return core.autoLayout(nave, options);
}
const now = () => performance.now();
/** Una sesión del editor en tiempo real (`AutoLayoutSession`), sobre el mismo núcleo que `autoLayout`. */
export function createAutoLayoutSession(opts = {}) {
    const { shapes } = opts;
    return Object.freeze({
        exact: (nave, options = {}, settings = {}) => core.autoLayoutExact(nave, options, settings.walk === true),
        provisional: (nave, options = {}, hint, settings = {}) => {
            const t0 = now();
            // solo el camino: si llega el exacto entero, su `result` no viaja al núcleo
            const p = core.autoLayoutProvisional(nave, options, { key: hint.key, order: hint.order, fallbacks: hint.fallbacks ?? [] }, Math.max(1, Math.floor(settings.packs ?? 1)), Math.max(0, Math.floor(settings.maxSteps ?? 0)));
            let s = null;
            if (p.layout && shapes)
                try {
                    s = shapes(p.layout);
                }
                catch {
                    s = null;
                }
            return { ...p, shapes: s, ms: now() - t0 };
        },
        fanout: Object.freeze({
            plans: (naveJson, optionsJson, part, parts) => core.autoLayoutFanout.plans(naveJson, optionsJson, part, parts),
            jobs: (naveJson, optionsJson, jobs) => core.autoLayoutFanout.jobs(naveJson, optionsJson, jobs),
            step: (naveJson, optionsJson, parts, done, workers, winner = '') => JSON.parse(core.autoLayoutFanout.step(naveJson, optionsJson, `[${parts.join(',')}]`, `[${done.join(',')}]`, workers, winner)),
        }),
        finish: (nave, options = {}, exact) => {
            const f = core.autoLayoutFinish(nave, options, exact);
            const { explain } = exact.result;
            // sin volver a armar el park, «Cómo decide» es el del exacto (medir no cambia quién ganó)
            const result = f.rebuilt
                ? f.result
                : { layout: f.result.layout, issues: f.result.issues, ...(explain === undefined ? {} : { explain }) };
            const path = f.rebuilt ? { key: f.key, order: f.order, fallbacks: f.fallbacks, ownIssues: f.ownIssues } : {};
            return {
                ...exact,
                ...path,
                result,
                layoutHash: f.layoutHash,
                walk: f.walk,
                ...(f.walkError === undefined ? {} : { walkError: f.walkError }),
            };
        },
    });
}
//# sourceMappingURL=autolayout.js.map