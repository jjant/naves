/**
 * El programa del snowpark y las reglas de encaje, como números (`PROGRAMA.md`): metros y grados. Salen del núcleo
 * Rust (`crates/park3d-core/src/program.rs`, la fuente única, la misma que usa el generador), del `.wasm` de `pkg/`:
 * acá solo se reparten y se congelan, con los tipos que genera ts-rs (`src/generated/core.ts`).
 *
 * Importar este módulo carga el núcleo (`loadCore()`, con `await` al nivel del módulo), como `validate.ts`.
 */
import { loadCore } from './core.js';
// el núcleo WASM, una vez (la misma instancia que `loadCore()` de /core, que validate.ts y que /plan)
const core = await loadCore();
const P = deepFreeze(core.program());
/** §1: la pista (plataforma → rampa de ola → llano con módulos → run-out / quarter pipe). */
export const SLOPE = P.slope;
/** Los módulos reales del llano (PROGRAMA §1). */
export const MODULES = P.modules;
/** La escalera a la plataforma (CTE DB-SUA, uso público). */
export const STAIRS = P.stairs;
/** §3: las reglas de seguridad y de licencia que tiene que respetar el plano. */
export const SAFETY = P.safety;
/** §2: el resto del programa (900 m² construidos de objetivo), pieza por pieza. */
export const PROGRAM = P.program;
/** Lounge y café juntos (§2: 30-50 m²). */
export const LOUNGE_CAFE_AREA = P.loungeCafeArea;
/** Lo que tiene el alquiler (§2). */
export const RENTAL = P.rental;
/** Las taquillas (§2): 50 en 2 alturas. */
export const LOCKERS = P.lockers;
/** Los trampolines (§2): 2 camas rectangulares, con ≥ 1,5 m entre marcos. */
export const TRAMPOLINE = P.trampoline;
/** Cada vestuario (§2). */
export const CHANGING = P.changing;
/** El aseo adaptado, como mínimo (≥ 1,80 × 2,20 m). */
export const WC_ACCESSIBLE = P.wcAccessible;
/**
 * Si no entra todo, las piezas se sueltan en este orden (la primera, la primera en irse): PROGRAMA «pista > mini
 * rampa / pad > trampolines > gym».
 */
export const DROP_ORDER = P.dropOrder;
/**
 * Las piezas sin las que un snowpark no abre (§2 y §3: recepción, alquiler, vestuarios, taquillas, el aseo adaptado y
 * un sitio para quien acompaña): que falte una es un error, no un aviso.
 */
export const ESSENTIAL_TYPES = P.essentialTypes;
/** El nombre en castellano de cada tipo de zona, para los mensajes. */
export const TYPE_NAMES = P.typeNames;
/** La plataforma de salida más baja que arma el generador (por debajo no hay drop-in que valga). */
export const MIN_PLATFORM_HEIGHT = P.minPlatformHeight;
/**
 * La plataforma más alta para una altura libre (PROGRAMA §1, «Altura»): `min(5, libre − 0,4 − 2,4)` redondeada para
 * abajo al paso y al centímetro (sin 4,6000000000000005); 0 si la altura libre no deja nada. La misma cuenta que usa
 * `autoLayout`, del núcleo.
 */
export function maxPlatformHeight(clearHeight) {
    return core.maxPlatformHeight(clearHeight);
}
function deepFreeze(v) {
    if (typeof v === 'object' && v !== null) {
        for (const x of Object.values(v))
            deepFreeze(x);
        Object.freeze(v);
    }
    return v;
}
/** @internal Para los tests: todas juntas, como las da el núcleo. */
export const CONSTANTS = P;
//# sourceMappingURL=program.js.map