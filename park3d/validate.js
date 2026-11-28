/**
 * `validateLayout` / `layoutIssues`: las reglas de ESQUEMA.md y PROGRAMA.md sobre un layout. Son el núcleo Rust
 * (`crates/park3d-core`: `validate.rs`, `validate/stoke.rs` y `autolayout/checks.rs`, en el `.wasm` de `pkg/`): estas
 * funciones son envolturas finas, y los tipos (`Validation`, `Issue`) salen del crate con ts-rs
 * (`src/generated/core.ts`). La implementación de TS que había acá se borró; para leerla, el tag `js-engine-final`
 * (docs/PORTING.md §4).
 *
 * - `validateLayout(layout)`: lo que dice validate.py (piezas dentro de la nave, solapes, altura de la plataforma,
 *   pendiente, run-out, escaleras, evacuación, programa y la plantilla Stoke), con sus mensajes.
 * - `layoutIssues(layout)`: eso, `programChecks` (áreas de PROGRAMA §2, pasos de 1,2 m alrededor de lo que estorba,
 *   la evacuación real, extintores y BIE, el paso después del run-out) y la circulación sobre la escena armada
 *   (`walkabilityReport`: PROGRAMA §5, con el artículo del CTE de cada regla) en una lista, errores primero.
 * - `walkabilityReport(layout)`: lo que una persona de verdad camina en la escena armada, con cada medida.
 *
 * Errores = el visor o el proyecto no se sostienen (piezas fuera de la nave, solapes, una pista que no entra en altura,
 * una salida o el pasillo de retorno a los que no se llega, una evacuación de más de 50 m). Avisos = programa incompleto
 * o medidas para revisar.
 *
 * Importar este módulo carga el `.wasm` del núcleo (`loadCore()`, con `await` al nivel del módulo), así que las
 * funciones son síncronas. Para usar otro `.wasm`, `loadCore({ wasm })` de `@snowpark-bcn/park3d/core` antes de
 * importarlo.
 */
import { loadCore } from './core.js';
// el núcleo WASM, una vez (la misma instancia que `loadCore()` de /core y que /plan)
const core = await loadCore();
/**
 * Lo que dice validate.py del layout: errores, avisos e info, con sus textos. Antes mira que se lo pueda recorrer
 * (contorno de 3 vértices o más y hasta 500 m de lado, medidas finitas, zonas de hasta 500 m, huecos en aristas que
 * existan): si no, devuelve solo esos errores. Lanza `CoreError` si falta la estructura que recorre.
 */
export function validateLayout(L) {
    return core.validateLayout(L);
}
/**
 * Los errores y avisos de `validateLayout` y de `programChecks` en una lista plana, errores primero. Una pieza
 * esencial que falta llega como el aviso de validate.py: quien la muestra decide que es un error.
 */
export function layoutIssues(L) {
    return core.layoutIssues(L);
}
/**
 * Lo que una persona de verdad camina en la escena armada del layout (la nave con sus puertas abiertas, la pista con
 * su escalera y sus retornos, las zonas con su utilería), en una rejilla de 5 cm desde la puerta de público: el paso
 * más angosto hasta cada zona, salida, escalera y la plataforma (con escalones y sin ellos), puertas, escaleras,
 * retornos, giros de Ø 1,50 m, altura libre, bordes sin barrera y la evacuación más larga, y los `findings` con su
 * regla y su fuente (CTE DB-SI 3, DB-SUA 1, 2 y 9; PROGRAMA §5). Arma la escena: ~1 s por nave.
 */
export function walkabilityReport(L) {
    return core.walkabilityReport(L);
}
/** @internal Lo que validate.py no mira (la parte de `layoutIssues` que no es `validateLayout`), para los tests. */
export function programChecks(L) {
    return core.programChecks(L);
}
/** @internal El recorrido de evacuación más largo (m) y desde dónde, rodeando lo que estorba; para los tests. */
export function evacuationWalk(L) {
    return core.evacuationWalk(L);
}
/** @internal Por qué no se puede recorrer el layout (vacío si se puede), para los tests. */
export function preconditionErrors(L) {
    return core.preconditionErrors(L);
}
//# sourceMappingURL=validate.js.map