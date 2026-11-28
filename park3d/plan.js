/**
 * @snowpark-bcn/park3d/plan: el plano acotado (SVG) y las medidas de la nave y de la pista, con las mismas cuentas que
 * arman la escena 3D, así la ficha de un sitio no se aparta de lo que se ve (la de jjant.github.io/naves y la del Park
 * builder de landing). Todo sale del núcleo Rust (`crates/park3d-plan`, en el `.wasm` de `pkg/`): estas funciones son
 * envolturas finas, y los tipos de la ficha salen del crate con ts-rs (`src/generated/plan.ts`).
 *
 * - `planSVG(layout)`: el plano acotado, como texto SVG con los textos del layout escapados.
 * - `roofModel(shell)`: tipo de cubierta, alero, cumbrera y caja de la nave.
 * - `slopeFrame(slope)`: largo de la pista, huella de la rampa, llano, altura de la plataforma, la plantilla Stoke y el
 *   paso local ↔ mundo y el perfil de cada línea.
 * - `edgeFrame(outline, k)` / `insidePoly(outline, x, z)`: la arista `k` del contorno (como la nombran los avisos) y si
 *   un punto cae dentro.
 *
 * Importar este módulo carga el `.wasm` del núcleo (`loadCore()`, con `await` al nivel del módulo), así que las
 * funciones son síncronas: en una página conviene cargarlo con `import()` o en un componente cliente; en Node anda (lo
 * lee del disco). Para usar otro `.wasm` (otra URL, bytes ya bajados), llamar a `loadCore({ wasm })` de
 * `@snowpark-bcn/park3d/core` antes de importar este módulo; con el núcleo ya cargado, `core.planSVG` y compañía son lo
 * mismo. Ya no importa three.
 */
import { loadCore } from './core.js';
// el núcleo WASM, una vez (la misma instancia que `loadCore()` de /core)
const core = await loadCore();
/**
 * Plano acotado del layout, como documento SVG (texto): contorno con el número de cada arista, pista por tramos,
 * módulos, zonas, altillos, columnas, aberturas y cotas. Los textos del layout van escapados, así que se puede
 * insertar tal cual en la página aunque el JSON venga pegado a mano. `width`: ancho máximo en píxeles (760).
 *
 * Lanza `CoreError` si el layout no sigue el esquema (el mensaje dice en qué campo), si el contorno tiene menos de 3
 * vértices o si la pista no se puede recorrer. Una abertura en una arista que no existe no se dibuja (la marca
 * `validateLayout`).
 */
export function planSVG(layout, options) {
    return core.planSVG(layout, options);
}
/** Modelo de la cubierta: tipo, alero, cumbrera, altura libre y caja de la nave (las de la escena). */
export function roofModel(shell) {
    return core.roofModel(shell);
}
/** Marco de la pista: largos (`L`, `R`, `F`), altura de la plataforma (`H`) y el paso local ↔ mundo. */
export function slopeFrame(slope) {
    return core.slopeFrame(slope);
}
/** Marco de la arista `k` del contorno: origen `A`, fin `B`, largo, dirección y normal hacia dentro. */
export function edgeFrame(outline, k) {
    return core.edgeFrame(outline, k);
}
/** Si `(x, z)` cae dentro del contorno (regla par-impar). */
export function insidePoly(outline, x, z) {
    return core.insidePoly(outline, x, z);
}
//# sourceMappingURL=plan.js.map