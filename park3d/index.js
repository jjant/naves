/**
 * @snowpark-bcn/park3d: API pública. Se completa por iteraciones (ver README, «Hoja de ruta»).
 *
 * - `autoLayout(nave)`: del plano de una nave a un park completo.
 * - `validateLayout(layout)` / `layoutIssues(layout)`: reglas de PROGRAMA.md; `walkabilityReport(layout)`: la
 *   circulación a escala humana sobre la escena armada (PROGRAMA §5).
 * - `createPark(canvas, { layout })`: el park en 3D con WebGPU, sobre el motor Rust (Bevy; se carga recién al
 *   llamarla: importar este módulo en el servidor no lo baja).
 * - `SLOPE`, `SAFETY`, `STAIRS`, `PROGRAM`, `MODULES`…: las reglas de PROGRAMA.md como números, del núcleo Rust (las
 *   mismas que usa el generador).
 *
 * Importar este módulo carga el núcleo Rust (`pkg/park3d_core_bg.wasm`, ~1,2 MB: `await` al nivel del módulo), que es
 * el que valida y arma el park: así `validateLayout`, `layoutIssues` y `autoLayout` son síncronas.
 * - Tipos del esquema (`Nave`, `Layout`, `Shell`, `Slope`, `Zone`, …): ver docs/ESQUEMA.md.
 */
export const VERSION = '0.1.0';
export { autoLayout, createAutoLayoutSession, MAX_AREA } from './autolayout.js';
export { validateLayout, layoutIssues, walkabilityReport } from './validate.js';
export { ESSENTIAL_TYPES, MIN_PLATFORM_HEIGHT, MODULES, PROGRAM, SAFETY, SLOPE, STAIRS, TYPE_NAMES, maxPlatformHeight, } from './program.js';
export { ASSETS_MANIFEST_SHA256 } from './assets-pin.js';
export { createPark, DEFAULT_ASSETS, ParkError } from './park.js';
//# sourceMappingURL=index.js.map