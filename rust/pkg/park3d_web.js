/* @ts-self-types="./park3d_web.d.ts" */

/**
 * Un park en un canvas: la nave y la pista en 3D (Bevy + WebGPU).
 */
export class Park {
    static __wrap(ptr) {
        const obj = Object.create(Park.prototype);
        obj.__wbg_ptr = ptr;
        ParkFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        ParkFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_park_free(ptr, 0);
    }
    /**
     * La página perdió el foco: se sueltan todas las teclas.
     */
    blur() {
        const ret = wasm.park_blur(this.__wbg_ptr);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * La cámara del último cuadro dibujado (`null` antes del primero).
     * @returns {ParkCameraState | null}
     */
    get camera() {
        const ret = wasm.park_camera(this.__wbg_ptr);
        return ret;
    }
    /**
     * La óptica del cine: profundidad de campo (`dof`) y desenfoque de movimiento (`motion_blur`, el de una cámara con
     * el obturador abierto 1/50 s), prendidos por defecto; para compararlos o apagarlos. Vale para el cine en curso y
     * los que vengan.
     * @param {boolean} dof
     * @param {boolean} motion_blur
     */
    cinemaLens(dof, motion_blur) {
        const ret = wasm.park_cinemaLens(this.__wbg_ptr, dof, motion_blur);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * En el cine, corta ya a un plano de ese tipo (`grua`, `travelling`, `kicker`, `dropin`, `tele`) o, sin
     * tipo, al mejor (la flecha → del motor JS). Un tipo que no existe tira `RangeError`.
     * @param {ParkCinemaShot} [shot]
     */
    cinemaNext(shot) {
        var ptr0 = isLikeNone(shot) ? 0 : passStringToWasm0(shot, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        var len0 = WASM_VECTOR_LEN;
        const ret = wasm.park_cinemaNext(this.__wbg_ptr, ptr0, len0);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * «Cine»: realización automática, como una retransmisión en directo (`false` sale y devuelve la cámara
     * como estaba). El modo `cinema` llega con el evento `mode` y cada rótulo con `caption`; las bandas, la
     * mosca y el rótulo los dibuja la página. Sin pista no hay cine (no pasa nada).
     * @param {boolean} on
     */
    cinema(on) {
        const ret = wasm.park_cinema(this.__wbg_ptr, on);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * Construye el park sobre el canvas y resuelve cuando ya se ve (primeros cuadros en pantalla).
     *
     * - `canvas`: el `<canvas>` o su id. Su tamaño lo pone la página con CSS (o su contenedor,
     *   con `fit: 'parent'`).
     * - `layout`: un `Layout` (ver `docs/ESQUEMA.md`), el objeto o su JSON.
     * - `options`: `{ view, fit, autoResize }`, o el nombre de la vista inicial (por defecto
     *   `maqueta`).
     *
     * Rechaza (nunca queda colgada) con un `Error` cuyo mensaje empieza con `park3d:` si los
     * argumentos no sirven, con `park3d: sin WebGPU…` si el navegador no tiene WebGPU o ningún
     * adaptador, y con `park3d: el motor se cayó…` si el motor entra en pánico al arrancar.
     *
     * Una sola vez por instancia del `.wasm` (winit): para otro park, `setLayout`.
     * @param {ParkCanvas} canvas
     * @param {ParkLayoutInput} layout
     * @param {ParkCreateOptions | string} [options]
     * @returns {Promise<Park>}
     */
    static create(canvas, layout, options) {
        const ret = wasm.park_create(canvas, layout, isLikeNone(options) ? 0 : addToExternrefTable0(options));
        return ret;
    }
    /**
     * Termina el motor (sale del event loop y libera la GPU: el canvas queda sin imagen, en la página, y el
     * dispositivo se destruye cuando la GPU termina los cuadros que tenía pedidos). Los `setLayout` y `exportGLB` que
     * estaban esperando se rechazan (`code: 'disposed'`) y los oyentes se sueltan. Se puede llamar más de una vez:
     * cada llamada devuelve la promesa de la primera, que se resuelve cuando winit soltó la `App` y su dispositivo se
     * destruyó, como mucho a los 30 s (si la GPU tarda más, se resuelve igual y el dispositivo se destruye cuando
     * termina); un `create` de antes de eso espera solo (no hace falta esperarla para crear otro park).
     * @returns {Promise<void>}
     */
    dispose() {
        const ret = wasm.park_dispose(this.__wbg_ptr);
        return ret;
    }
    /**
     * La escena en GLB para Blender/Cycles (`tools/blender/render.py` y `bake.py`), como `exportGLB` del
     * motor JS: la nave, la pista, las zonas, la calle y las puertas en su pose, con la gente congelada en
     * un instante (`moment` de ride.js; por defecto `lipslide`, como el JS) y los nombres de nodos y
     * materiales que leen las herramientas. Sin imágenes: render.py pone las texturas de alta resolución
     * por el nombre de cada material. Se arma en el próximo cuadro con el park ya armado (con un `setLayout`
     * en curso, el park nuevo). Un instante que no existe rechaza con `RangeError`.
     * @param {ParkExportOptions} [options]
     * @returns {Promise<Uint8Array<ArrayBuffer>>}
     */
    exportGLB(options) {
        const ret = wasm.park_exportGLB(this.__wbg_ptr, isLikeNone(options) ? 0 : addToExternrefTable0(options));
        return ret;
    }
    /**
     * Lo que el motor no pudo armar del park que se ve (`ParkFailure`: la nave, la pista, la calle o las zonas
     * enteras, que caen al primer corte o no se dibujan, y cada zona o módulo de la pista que su builder rechazó),
     * con el porqué. Vacío si se armó todo. Tras `setLayout`, las del park nuevo cuando ya se ve.
     * @returns {ParkFailure[]}
     */
    get failures() {
        const ret = wasm.park_failures(this.__wbg_ptr);
        return ret;
    }
    /**
     * Lleva la cámara a una vista (por nombre o la vista misma). `animate` (por defecto `true`)
     * hace la transición. Cambia `view` y avisa `view` en el momento; la cámara se mueve en el
     * cuadro siguiente. Una vista que no existe tira `RangeError`, como el motor JS.
     * @param {string | ParkView} view
     * @param {ParkGoToOptions | boolean} [options]
     */
    goTo(view, options) {
        const ret = wasm.park_goTo(this.__wbg_ptr, view, isLikeNone(options) ? 0 : addToExternrefTable0(options));
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * Cuántos avisos dio el motor desde el último `create` (cada cuadro dibujado, cada cambio en las texturas, las
     * etiquetas…): un número que sube mientras el motor avanza, para un plazo que cuente solo el tiempo sin avances
     * (el de `createPark`, en src/park-rust.ts). Uno por instancia del `.wasm`.
     * @returns {number}
     */
    static heartbeat() {
        const ret = wasm.park_heartbeat();
        return ret >>> 0;
    }
    /**
     * Una tecla de la página para caminar (`KeyboardEvent.code`: `KeyW`, `ArrowUp`, `ShiftLeft`…),
     * apretada (`down`) o soltada: para escuchar el teclado en `window` y no solo con el canvas
     * enfocado (winit escucha en el canvas).
     * @param {string} code
     * @param {boolean} down
     */
    key(code, down) {
        const val2 = +down;
        const ptr0 = passStringToWasm0(code, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.park_key(this.__wbg_ptr, ptr0, len0, val2);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * Las etiquetas del park (pista, módulos, zonas, altillos existentes, seguridad) para dibujarlas
     * con `project()`: las de `kit.label` del JS, en su orden (nave, pista, zonas); de una zona que el
     * motor todavía no dibuja, la de su builder o la del placeholder. Tras `setLayout`, las del park
     * nuevo cuando ya se ve.
     * @returns {ParkLabel[]}
     */
    get labels() {
        const ret = wasm.park_labels(this.__wbg_ptr);
        return ret;
    }
    /**
     * Quién maneja la cámara: `orbit`, `walk`, `tour`, `cinema` o `photo`.
     * @returns {ParkMode}
     */
    get mode() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.park_mode(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Escucha `ready`, `view`, `mode`, `caption`, `error` o `textures`; devuelve la función que deja de escucharlo
     * (los tipos van en `ParkEventMap`, en el `.d.ts`).
     * @param {string} kind
     * @param {Function} listener
     * @returns {Function}
     */
    on(kind, listener) {
        const ptr0 = passStringToWasm0(kind, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.park_on(this.__wbg_ptr, ptr0, len0, listener);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * Pausa el park (`true`: no dibuja ni simula; la imagen queda con el color de fondo, p. ej. con
     * otra vista encima de toda la página) o lo sigue (`false`). La cámara sigue recibiendo comandos.
     * @param {boolean} on
     */
    pause(on) {
        const ret = wasm.park_pause(this.__wbg_ptr, on);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * Una cámara de foto (`ParkPhotoCamera`): la pose y la lente de una foto real, tal cual, desde el cuadro
     * siguiente (el modo `photo` llega con el evento `mode`), y el cielo de su día (`sky`) si lo trae. Queda ahí hasta
     * `goTo`, `walk`, `tour` o `cinema` (y con ella su cielo); las entradas no la mueven. Una cámara que no sirve
     * tira `TypeError` con el porqué.
     * @param {ParkPhotoCamera} camera
     */
    photo(camera) {
        const ret = wasm.park_photo(this.__wbg_ptr, camera);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * Punto del mundo `[x, y, z]` → píxeles CSS del canvas (para etiquetas propias), con la
     * cámara del último cuadro dibujado.
     * @param {readonly [number, number, number]} position
     * @returns {ParkProjection}
     */
    project(position) {
        const ret = wasm.park_project(this.__wbg_ptr, position);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * Tamaño de la imagen en píxeles CSS, como `renderer.setSize(ancho, alto, false)` del motor
     * JS: el motor dibuja a ese tamaño (el búfer del canvas, × devicePixelRatio) y `project()` lo
     * usa, pero el canvas no cambia en la página (su `style` no se toca: el navegador estira la
     * imagen a su caja). Sin argumentos, o con un tamaño que no sirve, vuelve a medir el CSS del
     * canvas (tampoco tira, como el motor JS). Con `autoResize` (por defecto), el próximo cambio del
     * tamaño CSS del canvas vuelve a ese tamaño. Se ve en el cuadro siguiente.
     * @param {number | null} [width]
     * @param {number | null} [height]
     */
    resize(width, height) {
        const ret = wasm.park_resize(this.__wbg_ptr, !isLikeNone(width), isLikeNone(width) ? 0 : width, !isLikeNone(height), isLikeNone(height) ? 0 : height);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * Cambia la exposición sin rehacer el park: `{ exposure }` la fija (el multiplicador lineal de `exposure` de
     * `create`, mayor que 0), `{}` o `{ exposure: null }` vuelve a la automática y `exposureBias` es su
     * corrección en EV (0 si no está). Lo mismo que esas opciones de `create`, desde el cuadro siguiente; con la
     * automática, el medidor vuelve a arrancar y se asienta de una con su primera lectura. Para dejar el motor con
     * la exposición de una foto de Cycles (`exposure_ev` de `render.py`): `exposure = 2^(exposure_ev + 0,584)`.
     * @param {ParkExposureOptions} options
     */
    setExposure(options) {
        const ret = wasm.park_setExposure(this.__wbg_ptr, options);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * Joystick táctil del modo a pie (la página lo dibuja): x derecha, y abajo, en [-1, 1].
     * @param {number} x
     * @param {number} y
     */
    setJoystick(x, y) {
        const ret = wasm.park_setJoystick(this.__wbg_ptr, x, y);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * Cambia el park (mismo renderer y cámara, la misma vista si el nuevo la tiene); resuelve
     * cuando el nuevo ya se ve. Un layout inválido rechaza la promesa y avisa `error`.
     * @param {ParkLayoutInput} layout
     * @returns {Promise<ParkReady>}
     */
    setLayout(layout) {
        const ret = wasm.park_setLayout(this.__wbg_ptr, layout);
        return ret;
    }
    /**
     * La escala de render (`renderScale` de `create`): `'auto'` (el gobernador) o una fija de 0,25 a 1. Se ve en el
     * cuadro siguiente; `stats().renderScale` dice la de ahora.
     * @param {'auto' | number} scale
     */
    setRenderScale(scale) {
        const ret = wasm.park_setRenderScale(this.__wbg_ptr, scale);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * Otro escalador para una escala de render < 1 (`'fsr'` o `'browser'`, como `upscaler` de `create`); se aplica
     * al final del cuadro siguiente.
     * @param {'fsr' | 'browser'} upscaler
     */
    setUpscaler(upscaler) {
        const ret = wasm.park_setUpscaler(this.__wbg_ptr, upscaler);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * Cambia el balance de blancos sin rehacer el park: un número lo fija en esa temperatura (K, de 1667 a 25 000;
     * como `light.whiteBalanceK` de `create`), `null` o nada vuelve al de la escena (el del sitio: la luz de la nave
     * dentro, el día fuera). Para comparar cada captura con una foto de Cycles con el balance de esa foto
     * (`white_balance_K` de `renders.json`; 4600 en las de antes). Desde el cuadro siguiente; como `setExposure`,
     * el medidor vuelve a arrancar. Con `light.linear` no hay balance y no cambia nada.
     * @param {number | null} k
     */
    setWhiteBalance(k) {
        const ret = wasm.park_setWhiteBalance(this.__wbg_ptr, k);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * Lo que cuesta cada cuadro: fps, ms por cuadro, CPU, draw calls, triángulos y, con `timestamp-query`, ms de
     * GPU por tramo (ver `ParkStats`). Lo actualiza el motor cada medio segundo; antes, todo en cero.
     * @returns {ParkStats}
     */
    stats() {
        const ret = wasm.park_stats(this.__wbg_ptr);
        return ret;
    }
    /**
     * La foto quieta de las herramientas (`still` de `create`): `true` detiene la simulación (la gente, los riders,
     * los rotores) y sigue dibujando con la calidad de siempre, con la exposición de cada lectura aplicada de una;
     * `false` la suelta. Se aplica en el cuadro siguiente.
     * @param {boolean} on
     */
    still(on) {
        const ret = wasm.park_still(this.__wbg_ptr, on);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * Cómo van las texturas: `create` y `setLayout` las esperan como mucho 8 s (como el motor JS); las que
     * tardan más llegan solas después.
     * @returns {ParkTextures}
     */
    get textures() {
        const ret = wasm.park_textures(this.__wbg_ptr);
        return ret;
    }
    /**
     * Recorrido guiado de la calle a la plataforma (`false` lo corta y vuelve a la maqueta).
     * @param {boolean} on
     */
    tour(on) {
        const ret = wasm.park_tour(this.__wbg_ptr, on);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * Versión del motor.
     * @returns {string}
     */
    static version() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.park_version();
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * La vista elegida por última vez (`null` antes de la primera).
     * @returns {ParkView | null}
     */
    get view() {
        const ret = wasm.park_view(this.__wbg_ptr);
        return ret;
    }
    /**
     * Las vistas del park (`maqueta`, `plataforma`, `pista`, `planta` y las del layout), en el
     * orden del visor. Tras `setLayout`, las del park nuevo cuando ya se ve.
     * @returns {ParkView[]}
     */
    get views() {
        const ret = wasm.park_views(this.__wbg_ptr);
        return ret;
    }
    /**
     * Modo a pie (`true`: desde la entrada) o de vuelta a la maqueta (`false`). La vista y el modo
     * nuevos llegan con los eventos `view` y `mode` (en el cuadro siguiente).
     * @param {boolean} on
     */
    walk(on) {
        const ret = wasm.park_walk(this.__wbg_ptr, on);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
}
if (Symbol.dispose) Park.prototype[Symbol.dispose] = Park.prototype.free;

/**
 * Arma la paleta de `specJson` (`palette.json`) en el canvas `#<canvasId>`, con los assets para Bevy
 * (`scripts/assets-bevy.mjs`) en la URL `assets`.
 * @param {string} canvasId
 * @param {string} specJson
 * @param {string} assets
 */
export function palette(canvasId, specJson, assets) {
    let ptr0, len0, ptr1, len1, ptr2, len2;
    try {
        ptr0 = passStringToWasm0(canvasId, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        len0 = WASM_VECTOR_LEN;
        ptr1 = passStringToWasm0(specJson, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        len1 = WASM_VECTOR_LEN;
        ptr2 = passStringToWasm0(assets, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        len2 = WASM_VECTOR_LEN;
    } catch (e) {
        if (ptr2) { wasm.__wbindgen_free(ptr2, len2 * 1, 1); }
        if (ptr1) { wasm.__wbindgen_free(ptr1, len1 * 1, 1); }
        if (ptr0) { wasm.__wbindgen_free(ptr0, len0 * 1, 1); }
        throw e;
    }
    const ret = wasm.palette(ptr0, len0, ptr1, len1, ptr2, len2);
    if (ret[1]) {
        throw takeFromExternrefTable0(ret[0]);
    }
}

/**
 * Ir a una vista (sin transición).
 * @param {string} view
 */
export function simGoTo(view) {
    const ptr0 = passStringToWasm0(view, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.simGoTo(ptr0, len0);
}

/**
 * Arma el park de `layoutJson` con la nieve de `snowJson` (un `SnowInput`: el `input` de
 * `scripts/ride-dump.mjs`; vacío = la de la pista del layout, `pista::snow_input`) en el canvas
 * `#<canvasId>`, con los assets para Bevy en la URL `assets`.
 * @param {string} canvasId
 * @param {string} layoutJson
 * @param {string} snowJson
 * @param {string} assets
 * @param {string} optionsJson
 */
export function simPreview(canvasId, layoutJson, snowJson, assets, optionsJson) {
    let ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3, ptr4, len4;
    try {
        ptr0 = passStringToWasm0(canvasId, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        len0 = WASM_VECTOR_LEN;
        ptr1 = passStringToWasm0(layoutJson, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        len1 = WASM_VECTOR_LEN;
        ptr2 = passStringToWasm0(snowJson, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        len2 = WASM_VECTOR_LEN;
        ptr3 = passStringToWasm0(assets, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        len3 = WASM_VECTOR_LEN;
        ptr4 = passStringToWasm0(optionsJson, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        len4 = WASM_VECTOR_LEN;
    } catch (e) {
        if (ptr4) { wasm.__wbindgen_free(ptr4, len4 * 1, 1); }
        if (ptr3) { wasm.__wbindgen_free(ptr3, len3 * 1, 1); }
        if (ptr2) { wasm.__wbindgen_free(ptr2, len2 * 1, 1); }
        if (ptr1) { wasm.__wbindgen_free(ptr1, len1 * 1, 1); }
        if (ptr0) { wasm.__wbindgen_free(ptr0, len0 * 1, 1); }
        throw e;
    }
    const ret = wasm.simPreview(ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3, ptr4, len4);
    if (ret[1]) {
        throw takeFromExternrefTable0(ret[0]);
    }
}
function __wbg_get_imports() {
    const import0 = {
        __proto__: null,
        __wbg_Error_208446807d0d1e30: function(arg0, arg1) {
            const ret = Error(getStringFromWasm0(arg0, arg1));
            return ret;
        },
        __wbg_Window_0a3317a0ead8de46: function(arg0) {
            const ret = arg0.Window;
            return ret;
        },
        __wbg_Window_41838cbcc08822b5: function(arg0) {
            const ret = arg0.Window;
            return ret;
        },
        __wbg_Window_cf21527d11402897: function(arg0) {
            const ret = arg0.Window;
            return ret;
        },
        __wbg_WorkerGlobalScope_24f34f1070267c36: function(arg0) {
            const ret = arg0.WorkerGlobalScope;
            return ret;
        },
        __wbg_WorkerGlobalScope_448e3830f27a30fd: function(arg0) {
            const ret = arg0.WorkerGlobalScope;
            return ret;
        },
        __wbg___wbindgen_boolean_get_4f1baf9a00be3c74: function(arg0) {
            const v = arg0;
            const ret = typeof(v) === 'boolean' ? v : undefined;
            return isLikeNone(ret) ? 0xFFFFFF : ret ? 1 : 0;
        },
        __wbg___wbindgen_debug_string_f249a2a76caa9a55: function(arg0, arg1) {
            const ret = debugString(arg1);
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32((arg0 >>> 0) + 4 * 1, len1, true);
            getDataViewMemory0().setInt32((arg0 >>> 0) + 4 * 0, ptr1, true);
        },
        __wbg___wbindgen_is_function_741ff2bb612836f5: function(arg0) {
            const ret = typeof(arg0) === 'function';
            return ret;
        },
        __wbg___wbindgen_is_null_c22311b1cc228e3a: function(arg0) {
            const ret = arg0 === null;
            return ret;
        },
        __wbg___wbindgen_is_object_8b968c3ab8e96595: function(arg0) {
            const val = arg0;
            const ret = typeof(val) === 'object' && val !== null;
            return ret;
        },
        __wbg___wbindgen_is_string_fc456fee5d3317de: function(arg0) {
            const ret = typeof(arg0) === 'string';
            return ret;
        },
        __wbg___wbindgen_is_undefined_be5b34249ff1fc15: function(arg0) {
            const ret = arg0 === undefined;
            return ret;
        },
        __wbg___wbindgen_number_get_934b640d0889af78: function(arg0, arg1) {
            const obj = arg1;
            const ret = typeof(obj) === 'number' ? obj : undefined;
            getDataViewMemory0().setFloat64((arg0 >>> 0) + 8 * 1, isLikeNone(ret) ? 0 : ret, true);
            getDataViewMemory0().setInt32((arg0 >>> 0) + 4 * 0, !isLikeNone(ret), true);
        },
        __wbg___wbindgen_string_get_7ce8eee7fd327545: function(arg0, arg1) {
            const obj = arg1;
            const ret = typeof(obj) === 'string' ? obj : undefined;
            var ptr1 = isLikeNone(ret) ? 0 : passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            var len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32((arg0 >>> 0) + 4 * 1, len1, true);
            getDataViewMemory0().setInt32((arg0 >>> 0) + 4 * 0, ptr1, true);
        },
        __wbg___wbindgen_throw_4c88d8bf264fd984: function(arg0, arg1) {
            throw new Error(getStringFromWasm0(arg0, arg1));
        },
        __wbg__wbg_cb_unref_09736879a3f67559: function(arg0) {
            arg0._wbg_cb_unref();
        },
        __wbg_abort_f8d1589eb0c65ee2: function(arg0) {
            arg0.abort();
        },
        __wbg_aborted_31456edf1be00084: function(arg0) {
            const ret = arg0.aborted;
            return ret;
        },
        __wbg_activeElement_6c30fe7fda33ef51: function(arg0) {
            const ret = arg0.activeElement;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_addEventListener_847fd86b8c33ec43: function() { return handleError(function (arg0, arg1, arg2, arg3) {
            arg0.addEventListener(getStringFromWasm0(arg1, arg2), arg3);
        }, arguments); },
        __wbg_addListener_2b9e33a7d961fe62: function() { return handleError(function (arg0, arg1) {
            arg0.addListener(arg1);
        }, arguments); },
        __wbg_altKey_423da1d67b588078: function(arg0) {
            const ret = arg0.altKey;
            return ret;
        },
        __wbg_altKey_f158b37d4bccf5ff: function(arg0) {
            const ret = arg0.altKey;
            return ret;
        },
        __wbg_animate_8f41e2f47c7d04ab: function(arg0, arg1, arg2) {
            const ret = arg0.animate(arg1, arg2);
            return ret;
        },
        __wbg_appendChild_dbf7ad2f48413560: function() { return handleError(function (arg0, arg1) {
            const ret = arg0.appendChild(arg1);
            return ret;
        }, arguments); },
        __wbg_arrayBuffer_2c99a9ba14ba536c: function() { return handleError(function (arg0) {
            const ret = arg0.arrayBuffer();
            return ret;
        }, arguments); },
        __wbg_beginComputePass_b3bb1a69e6a70bde: function(arg0, arg1) {
            const ret = arg0.beginComputePass(arg1);
            return ret;
        },
        __wbg_beginRenderPass_ac30593a03c9a74e: function() { return handleError(function (arg0, arg1) {
            const ret = arg0.beginRenderPass(arg1);
            return ret;
        }, arguments); },
        __wbg_blockSize_4a396ef99671a8a3: function(arg0) {
            const ret = arg0.blockSize;
            return ret;
        },
        __wbg_body_5f971cbc6950ca4f: function(arg0) {
            const ret = arg0.body;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_brand_f6daadda82638256: function(arg0, arg1) {
            const ret = arg1.brand;
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32((arg0 >>> 0) + 4 * 1, len1, true);
            getDataViewMemory0().setInt32((arg0 >>> 0) + 4 * 0, ptr1, true);
        },
        __wbg_brands_2780bfb7d7c2c92d: function(arg0) {
            const ret = arg0.brands;
            return ret;
        },
        __wbg_button_653210370515dd71: function(arg0) {
            const ret = arg0.button;
            return ret;
        },
        __wbg_buttons_6c3569a451cd3176: function(arg0) {
            const ret = arg0.buttons;
            return ret;
        },
        __wbg_call_40b008ba32f73991: function() { return handleError(function (arg0, arg1) {
            const ret = arg0.call(arg1);
            return ret;
        }, arguments); },
        __wbg_call_a410eb4b59ed5965: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = arg0.call(arg1, arg2);
            return ret;
        }, arguments); },
        __wbg_cancelAnimationFrame_c0d19c5f7cfd7aae: function() { return handleError(function (arg0, arg1) {
            arg0.cancelAnimationFrame(arg1);
        }, arguments); },
        __wbg_cancelIdleCallback_ed6031e1cbe9b149: function(arg0, arg1) {
            arg0.cancelIdleCallback(arg1 >>> 0);
        },
        __wbg_cancel_65f38182e2eeac5c: function(arg0) {
            arg0.cancel();
        },
        __wbg_catch_fd4c7ea14fde9d83: function(arg0, arg1) {
            const ret = arg0.catch(arg1);
            return ret;
        },
        __wbg_clearTimeout_fd2c5dfcf4c67f84: function(arg0, arg1) {
            arg0.clearTimeout(arg1);
        },
        __wbg_clientHeight_b40e8971aed9fa2b: function(arg0) {
            const ret = arg0.clientHeight;
            return ret;
        },
        __wbg_clientWidth_269ea87f17b863bf: function(arg0) {
            const ret = arg0.clientWidth;
            return ret;
        },
        __wbg_close_ba88eb9a9b3180c7: function(arg0) {
            arg0.close();
        },
        __wbg_code_f0359f3273037430: function(arg0, arg1) {
            const ret = arg1.code;
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32((arg0 >>> 0) + 4 * 1, len1, true);
            getDataViewMemory0().setInt32((arg0 >>> 0) + 4 * 0, ptr1, true);
        },
        __wbg_configure_2f4cbe7746e5aa81: function() { return handleError(function (arg0, arg1) {
            arg0.configure(arg1);
        }, arguments); },
        __wbg_contains_743aa7c94499c269: function(arg0, arg1) {
            const ret = arg0.contains(arg1);
            return ret;
        },
        __wbg_contentRect_efd2ab04babd2afb: function(arg0) {
            const ret = arg0.contentRect;
            return ret;
        },
        __wbg_copyBufferToBuffer_2c8a5726f948b97e: function() { return handleError(function (arg0, arg1, arg2, arg3, arg4, arg5) {
            arg0.copyBufferToBuffer(arg1, arg2, arg3, arg4, arg5);
        }, arguments); },
        __wbg_copyBufferToBuffer_d8141ff7d5df2685: function() { return handleError(function (arg0, arg1, arg2, arg3, arg4) {
            arg0.copyBufferToBuffer(arg1, arg2, arg3, arg4);
        }, arguments); },
        __wbg_copyTextureToBuffer_7594e30771291dba: function() { return handleError(function (arg0, arg1, arg2, arg3) {
            arg0.copyTextureToBuffer(arg1, arg2, arg3);
        }, arguments); },
        __wbg_copyTextureToTexture_aa278b6e539310a3: function() { return handleError(function (arg0, arg1, arg2, arg3) {
            arg0.copyTextureToTexture(arg1, arg2, arg3);
        }, arguments); },
        __wbg_createBindGroupLayout_03a20e72b41b406e: function() { return handleError(function (arg0, arg1) {
            const ret = arg0.createBindGroupLayout(arg1);
            return ret;
        }, arguments); },
        __wbg_createBindGroup_ec4dc4d9e46e1104: function(arg0, arg1) {
            const ret = arg0.createBindGroup(arg1);
            return ret;
        },
        __wbg_createBuffer_baa81dab839b6c5c: function() { return handleError(function (arg0, arg1) {
            const ret = arg0.createBuffer(arg1);
            return ret;
        }, arguments); },
        __wbg_createCommandEncoder_a5136f45baaba888: function(arg0, arg1) {
            const ret = arg0.createCommandEncoder(arg1);
            return ret;
        },
        __wbg_createComputePipeline_6a05383609fddac6: function(arg0, arg1) {
            const ret = arg0.createComputePipeline(arg1);
            return ret;
        },
        __wbg_createElement_de4a31ed2fb252be: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = arg0.createElement(getStringFromWasm0(arg1, arg2));
            return ret;
        }, arguments); },
        __wbg_createObjectURL_45693a1454d24dac: function() { return handleError(function (arg0, arg1) {
            const ret = URL.createObjectURL(arg1);
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32((arg0 >>> 0) + 4 * 1, len1, true);
            getDataViewMemory0().setInt32((arg0 >>> 0) + 4 * 0, ptr1, true);
        }, arguments); },
        __wbg_createPipelineLayout_a955ff1e35a63634: function(arg0, arg1) {
            const ret = arg0.createPipelineLayout(arg1);
            return ret;
        },
        __wbg_createQuerySet_b68dbafb01930a3a: function() { return handleError(function (arg0, arg1) {
            const ret = arg0.createQuerySet(arg1);
            return ret;
        }, arguments); },
        __wbg_createRenderPipeline_f31fc336274aaab2: function() { return handleError(function (arg0, arg1) {
            const ret = arg0.createRenderPipeline(arg1);
            return ret;
        }, arguments); },
        __wbg_createSampler_2fe8901be471a83a: function(arg0, arg1) {
            const ret = arg0.createSampler(arg1);
            return ret;
        },
        __wbg_createShaderModule_f540847678b68e08: function(arg0, arg1) {
            const ret = arg0.createShaderModule(arg1);
            return ret;
        },
        __wbg_createTexture_5e2361f396945928: function() { return handleError(function (arg0, arg1) {
            const ret = arg0.createTexture(arg1);
            return ret;
        }, arguments); },
        __wbg_createView_e495f88700d28104: function() { return handleError(function (arg0, arg1) {
            const ret = arg0.createView(arg1);
            return ret;
        }, arguments); },
        __wbg_ctrlKey_97b77227d0599549: function(arg0) {
            const ret = arg0.ctrlKey;
            return ret;
        },
        __wbg_ctrlKey_b7978e4cf78dc62b: function(arg0) {
            const ret = arg0.ctrlKey;
            return ret;
        },
        __wbg_currentTime_ac0ea91cbf81a552: function(arg0, arg1) {
            const ret = arg1.currentTime;
            getDataViewMemory0().setFloat64((arg0 >>> 0) + 8 * 1, isLikeNone(ret) ? 0 : ret, true);
            getDataViewMemory0().setInt32((arg0 >>> 0) + 4 * 0, !isLikeNone(ret), true);
        },
        __wbg_deltaMode_d2ba7673c0228446: function(arg0) {
            const ret = arg0.deltaMode;
            return ret;
        },
        __wbg_deltaX_6ad2483f3f4c0349: function(arg0) {
            const ret = arg0.deltaX;
            return ret;
        },
        __wbg_deltaY_37dc0a54748a91f4: function(arg0) {
            const ret = arg0.deltaY;
            return ret;
        },
        __wbg_description_359d32310adf317e: function(arg0, arg1) {
            const ret = arg1.description;
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32((arg0 >>> 0) + 4 * 1, len1, true);
            getDataViewMemory0().setInt32((arg0 >>> 0) + 4 * 0, ptr1, true);
        },
        __wbg_destroy_7a2b29c47a7b3ab4: function(arg0) {
            arg0.destroy();
        },
        __wbg_devicePixelContentBoxSize_762c920a20c8b97f: function(arg0) {
            const ret = arg0.devicePixelContentBoxSize;
            return ret;
        },
        __wbg_devicePixelRatio_90ee4024cee5d5f4: function(arg0) {
            const ret = arg0.devicePixelRatio;
            return ret;
        },
        __wbg_disconnect_098ee921e4c012a2: function(arg0) {
            arg0.disconnect();
        },
        __wbg_disconnect_cfb0d06aca1c1b50: function(arg0) {
            arg0.disconnect();
        },
        __wbg_dispatchWorkgroupsIndirect_30ab1138724a2c32: function(arg0, arg1, arg2) {
            arg0.dispatchWorkgroupsIndirect(arg1, arg2);
        },
        __wbg_dispatchWorkgroups_74a6ec8812ef9f3b: function(arg0, arg1, arg2, arg3) {
            arg0.dispatchWorkgroups(arg1 >>> 0, arg2 >>> 0, arg3 >>> 0);
        },
        __wbg_document_3b5c3071b43e97ee: function(arg0) {
            const ret = arg0.document;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_drawIndexedIndirect_88b6c5e6b8c566fe: function(arg0, arg1, arg2) {
            arg0.drawIndexedIndirect(arg1, arg2);
        },
        __wbg_drawIndexed_8bcec1419f35c7a6: function(arg0, arg1, arg2, arg3, arg4, arg5) {
            arg0.drawIndexed(arg1 >>> 0, arg2 >>> 0, arg3 >>> 0, arg4, arg5 >>> 0);
        },
        __wbg_drawIndirect_193e39a1dda3a6c4: function(arg0, arg1, arg2) {
            arg0.drawIndirect(arg1, arg2);
        },
        __wbg_draw_977efcdcd4b12838: function(arg0, arg1, arg2, arg3, arg4) {
            arg0.draw(arg1 >>> 0, arg2 >>> 0, arg3 >>> 0, arg4 >>> 0);
        },
        __wbg_end_23ba48463344fbc0: function(arg0) {
            arg0.end();
        },
        __wbg_end_3bbedaa037606029: function(arg0) {
            arg0.end();
        },
        __wbg_error_2fa67a9496f77475: function(arg0) {
            const ret = arg0.error;
            return ret;
        },
        __wbg_error_757e9472f8410341: function(arg0, arg1) {
            let deferred0_0;
            let deferred0_1;
            try {
                deferred0_0 = arg0;
                deferred0_1 = arg1;
                console.error(getStringFromWasm0(arg0, arg1));
            } finally {
                wasm.__wbindgen_free(deferred0_0, deferred0_1, 1);
            }
        },
        __wbg_error_9b95f63d905893d2: function(arg0, arg1) {
            console.error(arg0, arg1);
        },
        __wbg_exitFullscreen_794b11803d43004f: function(arg0) {
            arg0.exitFullscreen();
        },
        __wbg_exitPointerLock_93a2ce487a7b7927: function(arg0) {
            arg0.exitPointerLock();
        },
        __wbg_features_29757024dfb82d0d: function(arg0) {
            const ret = arg0.features;
            return ret;
        },
        __wbg_features_b650c8412d082ef1: function(arg0) {
            const ret = arg0.features;
            return ret;
        },
        __wbg_fetch_acbcb3bcaa94bf5e: function(arg0, arg1, arg2) {
            const ret = arg0.fetch(getStringFromWasm0(arg1, arg2));
            return ret;
        },
        __wbg_fetch_c30fc2ed77d76a76: function(arg0, arg1, arg2) {
            const ret = arg0.fetch(getStringFromWasm0(arg1, arg2));
            return ret;
        },
        __wbg_finish_49529a046631ad9a: function(arg0) {
            const ret = arg0.finish();
            return ret;
        },
        __wbg_finish_678df663961386ff: function(arg0, arg1) {
            const ret = arg0.finish(arg1);
            return ret;
        },
        __wbg_focus_d5e2fdbdb56416f0: function() { return handleError(function (arg0) {
            arg0.focus();
        }, arguments); },
        __wbg_fullscreenElement_ecd845ac09ed38dc: function(arg0) {
            const ret = arg0.fullscreenElement;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_getBoundingClientRect_329ca748ec918b0c: function(arg0) {
            const ret = arg0.getBoundingClientRect();
            return ret;
        },
        __wbg_getCoalescedEvents_1a5b79e404343ee4: function(arg0) {
            const ret = arg0.getCoalescedEvents();
            return ret;
        },
        __wbg_getCoalescedEvents_3744f7436b47befb: function(arg0) {
            const ret = arg0.getCoalescedEvents;
            return ret;
        },
        __wbg_getComputedStyle_3be93eadae0000a9: function() { return handleError(function (arg0, arg1) {
            const ret = arg0.getComputedStyle(arg1);
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        }, arguments); },
        __wbg_getContext_1938edb9a972f63d: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = arg0.getContext(getStringFromWasm0(arg1, arg2));
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        }, arguments); },
        __wbg_getContext_d93f904b714852ae: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = arg0.getContext(getStringFromWasm0(arg1, arg2));
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        }, arguments); },
        __wbg_getCurrentTexture_e9d52aabce56f3fb: function() { return handleError(function (arg0) {
            const ret = arg0.getCurrentTexture();
            return ret;
        }, arguments); },
        __wbg_getElementById_7ee213db584f37b0: function(arg0, arg1, arg2) {
            const ret = arg0.getElementById(getStringFromWasm0(arg1, arg2));
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_getMappedRange_fd3092e276caa831: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = arg0.getMappedRange(arg1, arg2);
            return ret;
        }, arguments); },
        __wbg_getOwnPropertyDescriptor_91249f9236d5b666: function(arg0, arg1) {
            const ret = Object.getOwnPropertyDescriptor(arg0, arg1);
            return ret;
        },
        __wbg_getPreferredCanvasFormat_f775f4ebe1768892: function(arg0) {
            const ret = arg0.getPreferredCanvasFormat();
            return (__wbindgen_enum_GpuTextureFormat.indexOf(ret) + 1 || 102) - 1;
        },
        __wbg_getPropertyValue_c0aae8b8341401f1: function() { return handleError(function (arg0, arg1, arg2, arg3) {
            const ret = arg1.getPropertyValue(getStringFromWasm0(arg2, arg3));
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32((arg0 >>> 0) + 4 * 1, len1, true);
            getDataViewMemory0().setInt32((arg0 >>> 0) + 4 * 0, ptr1, true);
        }, arguments); },
        __wbg_getRandomValues_01076ebaa66264dc: function() { return handleError(function (arg0, arg1) {
            globalThis.crypto.getRandomValues(getArrayU8FromWasm0(arg0, arg1));
        }, arguments); },
        __wbg_get_0c55869fe53c7d14: function(arg0, arg1) {
            const ret = arg0[arg1 >>> 0];
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_get_2080c49015e35254: function() { return handleError(function (arg0, arg1) {
            const ret = Reflect.get(arg0, arg1);
            return ret;
        }, arguments); },
        __wbg_get_bb8b6b35041e00c9: function() { return handleError(function (arg0, arg1) {
            const ret = Reflect.get(arg0, arg1 >>> 0);
            return ret;
        }, arguments); },
        __wbg_get_d7176cfb76d71114: function(arg0, arg1) {
            const ret = arg0[arg1 >>> 0];
            return ret;
        },
        __wbg_get_unchecked_e6325ad374eff861: function(arg0, arg1) {
            const ret = arg0[arg1 >>> 0];
            return ret;
        },
        __wbg_gpu_aa311a9494720027: function(arg0) {
            const ret = arg0.gpu;
            return ret;
        },
        __wbg_has_2c4d5cf25ec8c1cf: function() { return handleError(function (arg0, arg1) {
            const ret = Reflect.has(arg0, arg1);
            return ret;
        }, arguments); },
        __wbg_has_47b8eb16db92789a: function(arg0, arg1, arg2) {
            const ret = arg0.has(getStringFromWasm0(arg1, arg2));
            return ret;
        },
        __wbg_height_4e985809fcad22ec: function(arg0) {
            const ret = arg0.height;
            return ret;
        },
        __wbg_height_ac6f1c3f49c13fe2: function(arg0) {
            const ret = arg0.height;
            return ret;
        },
        __wbg_info_84c3d8389e807255: function(arg0) {
            const ret = arg0.info;
            return ret;
        },
        __wbg_inlineSize_0be24bd91656e021: function(arg0) {
            const ret = arg0.inlineSize;
            return ret;
        },
        __wbg_instanceof_AbortSignal_16e867a9888f3bc7: function(arg0) {
            let result;
            try {
                result = arg0 instanceof AbortSignal;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_instanceof_Element_05dbb22ded594343: function(arg0) {
            let result;
            try {
                result = arg0 instanceof Element;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_instanceof_Error_74e3cca0c4a69161: function(arg0) {
            let result;
            try {
                result = arg0 instanceof Error;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_instanceof_GpuOutOfMemoryError_72d4f143d9ec20cb: function(arg0) {
            let result;
            try {
                result = arg0 instanceof GPUOutOfMemoryError;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_instanceof_GpuValidationError_cdb716bc3a7ed585: function(arg0) {
            let result;
            try {
                result = arg0 instanceof GPUValidationError;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_instanceof_HtmlCanvasElement_89f280683e987b9e: function(arg0) {
            let result;
            try {
                result = arg0 instanceof HTMLCanvasElement;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_instanceof_Promise_59148c6049d0e3a0: function(arg0) {
            let result;
            try {
                result = arg0 instanceof Promise;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_instanceof_Response_5b0b4f7f1daeae51: function(arg0) {
            let result;
            try {
                result = arg0 instanceof Response;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_instanceof_Window_5cf453f5639aa1a2: function(arg0) {
            let result;
            try {
                result = arg0 instanceof Window;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_isFallbackAdapter_b70ad418e985d5d4: function(arg0) {
            const ret = arg0.isFallbackAdapter;
            return ret;
        },
        __wbg_isIntersecting_ec9e594039aba037: function(arg0) {
            const ret = arg0.isIntersecting;
            return ret;
        },
        __wbg_is_2248ff2b575d60c7: function(arg0, arg1) {
            const ret = Object.is(arg0, arg1);
            return ret;
        },
        __wbg_key_76125a528069feff: function(arg0, arg1) {
            const ret = arg1.key;
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32((arg0 >>> 0) + 4 * 1, len1, true);
            getDataViewMemory0().setInt32((arg0 >>> 0) + 4 * 0, ptr1, true);
        },
        __wbg_label_b4e9fa173fb30ad5: function(arg0, arg1) {
            const ret = arg1.label;
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32((arg0 >>> 0) + 4 * 1, len1, true);
            getDataViewMemory0().setInt32((arg0 >>> 0) + 4 * 0, ptr1, true);
        },
        __wbg_length_186163212ffe79c3: function(arg0) {
            const ret = arg0.length;
            return ret;
        },
        __wbg_length_b03a0fabb109b1e9: function(arg0) {
            const ret = arg0.length;
            return ret;
        },
        __wbg_limits_06ac8ea738a0d93e: function(arg0) {
            const ret = arg0.limits;
            return ret;
        },
        __wbg_limits_7f838192fdb36f0a: function(arg0) {
            const ret = arg0.limits;
            return ret;
        },
        __wbg_location_1c5fe5c54f34cfc2: function(arg0) {
            const ret = arg0.location;
            return ret;
        },
        __wbg_log_1f8cbb01c83d06c2: function(arg0, arg1, arg2, arg3, arg4, arg5, arg6, arg7) {
            let deferred0_0;
            let deferred0_1;
            try {
                deferred0_0 = arg0;
                deferred0_1 = arg1;
                console.log(getStringFromWasm0(arg0, arg1), getStringFromWasm0(arg2, arg3), getStringFromWasm0(arg4, arg5), getStringFromWasm0(arg6, arg7));
            } finally {
                wasm.__wbindgen_free(deferred0_0, deferred0_1, 1);
            }
        },
        __wbg_log_a54ca6b45e09078a: function(arg0, arg1) {
            let deferred0_0;
            let deferred0_1;
            try {
                deferred0_0 = arg0;
                deferred0_1 = arg1;
                console.log(getStringFromWasm0(arg0, arg1));
            } finally {
                wasm.__wbindgen_free(deferred0_0, deferred0_1, 1);
            }
        },
        __wbg_lost_b5bea941ce66b09b: function(arg0) {
            const ret = arg0.lost;
            return ret;
        },
        __wbg_mapAsync_84aeaa5780c9b8c7: function(arg0, arg1, arg2, arg3) {
            const ret = arg0.mapAsync(arg1 >>> 0, arg2, arg3);
            return ret;
        },
        __wbg_mark_6b7f03786f5e4d61: function(arg0, arg1) {
            performance.mark(getStringFromWasm0(arg0, arg1));
        },
        __wbg_matchMedia_b53687d22ec43649: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = arg0.matchMedia(getStringFromWasm0(arg1, arg2));
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        }, arguments); },
        __wbg_matches_a47c420646498c64: function(arg0) {
            const ret = arg0.matches;
            return ret;
        },
        __wbg_maxBindGroupsPlusVertexBuffers_5a483d2af94e57bc: function(arg0) {
            const ret = arg0.maxBindGroupsPlusVertexBuffers;
            return ret;
        },
        __wbg_maxBindGroups_8280e3693e832071: function(arg0) {
            const ret = arg0.maxBindGroups;
            return ret;
        },
        __wbg_maxBindingsPerBindGroup_872ae44e536b19a5: function(arg0) {
            const ret = arg0.maxBindingsPerBindGroup;
            return ret;
        },
        __wbg_maxBufferSize_9dae4d9428e42f10: function(arg0) {
            const ret = arg0.maxBufferSize;
            return ret;
        },
        __wbg_maxColorAttachmentBytesPerSample_12d8884108587e97: function(arg0) {
            const ret = arg0.maxColorAttachmentBytesPerSample;
            return ret;
        },
        __wbg_maxColorAttachments_deb9217288cb10c6: function(arg0) {
            const ret = arg0.maxColorAttachments;
            return ret;
        },
        __wbg_maxComputeInvocationsPerWorkgroup_c4b13a829ed0b259: function(arg0) {
            const ret = arg0.maxComputeInvocationsPerWorkgroup;
            return ret;
        },
        __wbg_maxComputeWorkgroupSizeX_91c35c8e026d4b2e: function(arg0) {
            const ret = arg0.maxComputeWorkgroupSizeX;
            return ret;
        },
        __wbg_maxComputeWorkgroupSizeY_961e4fb0ccb8e424: function(arg0) {
            const ret = arg0.maxComputeWorkgroupSizeY;
            return ret;
        },
        __wbg_maxComputeWorkgroupSizeZ_62c453c3b2746fe1: function(arg0) {
            const ret = arg0.maxComputeWorkgroupSizeZ;
            return ret;
        },
        __wbg_maxComputeWorkgroupStorageSize_dcf9113c2281aa6c: function(arg0) {
            const ret = arg0.maxComputeWorkgroupStorageSize;
            return ret;
        },
        __wbg_maxComputeWorkgroupsPerDimension_c8e2df553b22565e: function(arg0) {
            const ret = arg0.maxComputeWorkgroupsPerDimension;
            return ret;
        },
        __wbg_maxDynamicStorageBuffersPerPipelineLayout_43810e253385b7f5: function(arg0) {
            const ret = arg0.maxDynamicStorageBuffersPerPipelineLayout;
            return ret;
        },
        __wbg_maxDynamicUniformBuffersPerPipelineLayout_e160bf315957a3a1: function(arg0) {
            const ret = arg0.maxDynamicUniformBuffersPerPipelineLayout;
            return ret;
        },
        __wbg_maxInterStageShaderVariables_62a6f8974aa80170: function(arg0) {
            const ret = arg0.maxInterStageShaderVariables;
            return ret;
        },
        __wbg_maxSampledTexturesPerShaderStage_45931d0d0e425368: function(arg0) {
            const ret = arg0.maxSampledTexturesPerShaderStage;
            return ret;
        },
        __wbg_maxSamplersPerShaderStage_fd87b1b55a1bce03: function(arg0) {
            const ret = arg0.maxSamplersPerShaderStage;
            return ret;
        },
        __wbg_maxStorageBufferBindingSize_bec702c6fccfd8d5: function(arg0) {
            const ret = arg0.maxStorageBufferBindingSize;
            return ret;
        },
        __wbg_maxStorageBuffersPerShaderStage_36af4d1cf6b73e49: function(arg0) {
            const ret = arg0.maxStorageBuffersPerShaderStage;
            return ret;
        },
        __wbg_maxStorageTexturesPerShaderStage_bf0523882733deac: function(arg0) {
            const ret = arg0.maxStorageTexturesPerShaderStage;
            return ret;
        },
        __wbg_maxTextureArrayLayers_7c675fa8f48e7e97: function(arg0) {
            const ret = arg0.maxTextureArrayLayers;
            return ret;
        },
        __wbg_maxTextureDimension1D_bb69683afe97bf80: function(arg0) {
            const ret = arg0.maxTextureDimension1D;
            return ret;
        },
        __wbg_maxTextureDimension2D_cee54c433bf3b9c1: function(arg0) {
            const ret = arg0.maxTextureDimension2D;
            return ret;
        },
        __wbg_maxTextureDimension3D_ae26b58b1450c99a: function(arg0) {
            const ret = arg0.maxTextureDimension3D;
            return ret;
        },
        __wbg_maxUniformBufferBindingSize_00f780f64f0dd7c4: function(arg0) {
            const ret = arg0.maxUniformBufferBindingSize;
            return ret;
        },
        __wbg_maxUniformBuffersPerShaderStage_2c2054e9d96df7ad: function(arg0) {
            const ret = arg0.maxUniformBuffersPerShaderStage;
            return ret;
        },
        __wbg_maxVertexAttributes_425aa710b80da882: function(arg0) {
            const ret = arg0.maxVertexAttributes;
            return ret;
        },
        __wbg_maxVertexBufferArrayStride_8f0c56e46eba7c97: function(arg0) {
            const ret = arg0.maxVertexBufferArrayStride;
            return ret;
        },
        __wbg_maxVertexBuffers_473f2615aa5963dd: function(arg0) {
            const ret = arg0.maxVertexBuffers;
            return ret;
        },
        __wbg_measure_f2e851014f4e33a5: function() { return handleError(function (arg0, arg1, arg2, arg3) {
            let deferred0_0;
            let deferred0_1;
            let deferred1_0;
            let deferred1_1;
            try {
                deferred0_0 = arg0;
                deferred0_1 = arg1;
                deferred1_0 = arg2;
                deferred1_1 = arg3;
                performance.measure(getStringFromWasm0(arg0, arg1), getStringFromWasm0(arg2, arg3));
            } finally {
                wasm.__wbindgen_free(deferred0_0, deferred0_1, 1);
                wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
            }
        }, arguments); },
        __wbg_media_a175d27456ed4b5f: function(arg0, arg1) {
            const ret = arg1.media;
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32((arg0 >>> 0) + 4 * 1, len1, true);
            getDataViewMemory0().setInt32((arg0 >>> 0) + 4 * 0, ptr1, true);
        },
        __wbg_message_0c79c7c15b1865af: function(arg0, arg1) {
            const ret = arg1.message;
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32((arg0 >>> 0) + 4 * 1, len1, true);
            getDataViewMemory0().setInt32((arg0 >>> 0) + 4 * 0, ptr1, true);
        },
        __wbg_message_43d8c8f1d543a349: function(arg0) {
            const ret = arg0.message;
            return ret;
        },
        __wbg_message_bb4d389df9355dd2: function(arg0, arg1) {
            const ret = arg1.message;
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32((arg0 >>> 0) + 4 * 1, len1, true);
            getDataViewMemory0().setInt32((arg0 >>> 0) + 4 * 0, ptr1, true);
        },
        __wbg_metaKey_33c588e07fd74724: function(arg0) {
            const ret = arg0.metaKey;
            return ret;
        },
        __wbg_metaKey_34b378e7ba352fd6: function(arg0) {
            const ret = arg0.metaKey;
            return ret;
        },
        __wbg_minStorageBufferOffsetAlignment_f9ce2fe03a21a2e4: function(arg0) {
            const ret = arg0.minStorageBufferOffsetAlignment;
            return ret;
        },
        __wbg_minUniformBufferOffsetAlignment_bca4b75f696bbf11: function(arg0) {
            const ret = arg0.minUniformBufferOffsetAlignment;
            return ret;
        },
        __wbg_movementX_afc28e8e2f7045f9: function(arg0) {
            const ret = arg0.movementX;
            return ret;
        },
        __wbg_movementY_1edbf6740a40c7d6: function(arg0) {
            const ret = arg0.movementY;
            return ret;
        },
        __wbg_navigator_9641ab32fa612dd1: function(arg0) {
            const ret = arg0.navigator;
            return ret;
        },
        __wbg_navigator_c17f443a6fe5d38d: function(arg0) {
            const ret = arg0.navigator;
            return ret;
        },
        __wbg_new_13de428334042d26: function(arg0) {
            const ret = new Uint8Array(arg0);
            return ret;
        },
        __wbg_new_2bfd0f45e60518b1: function() { return handleError(function (arg0, arg1) {
            const ret = new OffscreenCanvas(arg0 >>> 0, arg1 >>> 0);
            return ret;
        }, arguments); },
        __wbg_new_37eb45aaf5eeb820: function() {
            const ret = new Array();
            return ret;
        },
        __wbg_new_4416a2fe2fac9c65: function(arg0, arg1) {
            const ret = new TypeError(getStringFromWasm0(arg0, arg1));
            return ret;
        },
        __wbg_new_4f75c2b453083268: function() { return handleError(function () {
            const ret = new MessageChannel();
            return ret;
        }, arguments); },
        __wbg_new_5f28518387ad0e34: function() { return handleError(function () {
            const ret = new AbortController();
            return ret;
        }, arguments); },
        __wbg_new_787b9fb330d55d78: function(arg0, arg1) {
            const ret = new Error(getStringFromWasm0(arg0, arg1));
            return ret;
        },
        __wbg_new_8a1847cd91d0d7fb: function(arg0, arg1) {
            const ret = new RangeError(getStringFromWasm0(arg0, arg1));
            return ret;
        },
        __wbg_new_b9daede95aa58c54: function() { return handleError(function (arg0) {
            const ret = new IntersectionObserver(arg0);
            return ret;
        }, arguments); },
        __wbg_new_ba40181b3f24ac80: function(arg0, arg1) {
            try {
                var state0 = {a: arg0, b: arg1};
                var cb0 = (arg0, arg1) => {
                    const a = state0.a;
                    state0.a = 0;
                    try {
                        return wasm_bindgen_be273b461b6f50be___convert__closures_____invoke___js_sys_bdfa6a79c5b45de6___Function_fn_wasm_bindgen_be273b461b6f50be___JsValue_____wasm_bindgen_be273b461b6f50be___sys__Undefined___js_sys_bdfa6a79c5b45de6___Function_fn_wasm_bindgen_be273b461b6f50be___JsValue_____wasm_bindgen_be273b461b6f50be___sys__Undefined_______true_(a, state0.b, arg0, arg1);
                    } finally {
                        state0.a = a;
                    }
                };
                const ret = new Promise(cb0);
                return ret;
            } finally {
                state0.a = 0;
            }
        },
        __wbg_new_bb74001155cb8ca8: function() {
            const ret = new Error();
            return ret;
        },
        __wbg_new_bdf613c6b0b3d702: function() { return handleError(function (arg0) {
            const ret = new ResizeObserver(arg0);
            return ret;
        }, arguments); },
        __wbg_new_cd4348290afae586: function() {
            const ret = new Object();
            return ret;
        },
        __wbg_new_df63236ec481fcd7: function() { return handleError(function (arg0, arg1) {
            const ret = new Worker(getStringFromWasm0(arg0, arg1));
            return ret;
        }, arguments); },
        __wbg_new_from_slice_b8daf545a41c6aa0: function(arg0, arg1) {
            const ret = new Uint8Array(getArrayU8FromWasm0(arg0, arg1));
            return ret;
        },
        __wbg_new_typed_6b60b99917da27d6: function() {
            const ret = new Object();
            return ret;
        },
        __wbg_new_with_byte_offset_and_length_3cd32055a417f095: function(arg0, arg1, arg2) {
            const ret = new Uint8Array(arg0, arg1 >>> 0, arg2 >>> 0);
            return ret;
        },
        __wbg_new_with_str_sequence_and_options_ea4ce88081790553: function() { return handleError(function (arg0, arg1) {
            const ret = new Blob(arg0, arg1);
            return ret;
        }, arguments); },
        __wbg_now_e7c6795a7f81e10f: function(arg0) {
            const ret = arg0.now();
            return ret;
        },
        __wbg_observe_0bd2cd721b4e32da: function(arg0, arg1) {
            arg0.observe(arg1);
        },
        __wbg_observe_1c390aab39e98a11: function(arg0, arg1) {
            arg0.observe(arg1);
        },
        __wbg_observe_2ffc8a70dc1147d1: function(arg0, arg1, arg2) {
            arg0.observe(arg1, arg2);
        },
        __wbg_of_027eb15371aac932: function(arg0) {
            const ret = Array.of(arg0);
            return ret;
        },
        __wbg_of_4cc373bef1f715a4: function(arg0, arg1, arg2) {
            const ret = Array.of(arg0, arg1, arg2);
            return ret;
        },
        __wbg_of_e7ea0fcd535c1444: function(arg0, arg1) {
            const ret = Array.of(arg0, arg1);
            return ret;
        },
        __wbg_offsetX_33cc94e6aa2a69cf: function(arg0) {
            const ret = arg0.offsetX;
            return ret;
        },
        __wbg_offsetY_0d764c86f554a605: function(arg0) {
            const ret = arg0.offsetY;
            return ret;
        },
        __wbg_onSubmittedWorkDone_f62945abb48d8a84: function(arg0) {
            const ret = arg0.onSubmittedWorkDone();
            return ret;
        },
        __wbg_park_new: function(arg0) {
            const ret = Park.__wrap(arg0);
            return ret;
        },
        __wbg_performance_7e4e4494fdc9d07a: function(arg0) {
            const ret = arg0.performance;
            return ret;
        },
        __wbg_persisted_2a67f0a292f7f102: function(arg0) {
            const ret = arg0.persisted;
            return ret;
        },
        __wbg_play_3997a1be51d27925: function(arg0) {
            arg0.play();
        },
        __wbg_pointerId_79742963a7afa662: function(arg0) {
            const ret = arg0.pointerId;
            return ret;
        },
        __wbg_pointerType_c9fa8bdb617406a5: function(arg0, arg1) {
            const ret = arg1.pointerType;
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32((arg0 >>> 0) + 4 * 1, len1, true);
            getDataViewMemory0().setInt32((arg0 >>> 0) + 4 * 0, ptr1, true);
        },
        __wbg_popDebugGroup_a3b3221b11bd6377: function(arg0) {
            arg0.popDebugGroup();
        },
        __wbg_popErrorScope_cc6d6ccf22baf4b0: function(arg0) {
            const ret = arg0.popErrorScope();
            return ret;
        },
        __wbg_port1_3496d05bb44c8f4e: function(arg0) {
            const ret = arg0.port1;
            return ret;
        },
        __wbg_port2_7bdd24b86c6fc95d: function(arg0) {
            const ret = arg0.port2;
            return ret;
        },
        __wbg_postMessage_56704f0f0cc1999c: function() { return handleError(function (arg0, arg1) {
            arg0.postMessage(arg1);
        }, arguments); },
        __wbg_postMessage_bd2251942b5b5242: function() { return handleError(function (arg0, arg1, arg2) {
            arg0.postMessage(arg1, arg2);
        }, arguments); },
        __wbg_postTask_e2439afddcdfbb55: function(arg0, arg1, arg2) {
            const ret = arg0.postTask(arg1, arg2);
            return ret;
        },
        __wbg_pressure_7f8a77640ff8cf66: function(arg0) {
            const ret = arg0.pressure;
            return ret;
        },
        __wbg_preventDefault_cfb06b02e7406899: function(arg0) {
            arg0.preventDefault();
        },
        __wbg_prototype_8e722a92fa7fa7ae: function() {
            const ret = ResizeObserverEntry.prototype;
            return ret;
        },
        __wbg_prototypesetcall_13162965d1fe7aa3: function(arg0, arg1, arg2) {
            Uint8Array.prototype.set.call(getArrayU8FromWasm0(arg0, arg1), arg2);
        },
        __wbg_pushDebugGroup_8ae6e54f51ceaaaf: function(arg0, arg1, arg2) {
            arg0.pushDebugGroup(getStringFromWasm0(arg1, arg2));
        },
        __wbg_pushErrorScope_efdacf97dcba3b94: function(arg0, arg1) {
            arg0.pushErrorScope(__wbindgen_enum_GpuErrorFilter[arg1]);
        },
        __wbg_push_c9f4893fc209f768: function(arg0, arg1) {
            const ret = arg0.push(arg1);
            return ret;
        },
        __wbg_querySelectorAll_6c1bd81d448fb480: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = arg0.querySelectorAll(getStringFromWasm0(arg1, arg2));
            return ret;
        }, arguments); },
        __wbg_querySelector_72201b7c62dc196b: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = arg0.querySelector(getStringFromWasm0(arg1, arg2));
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        }, arguments); },
        __wbg_queueMicrotask_1e8503a8a690f0a3: function(arg0) {
            const ret = arg0.queueMicrotask;
            return ret;
        },
        __wbg_queueMicrotask_4a1a4d8dd332373b: function(arg0) {
            queueMicrotask(arg0);
        },
        __wbg_queueMicrotask_6913321b637d352e: function(arg0) {
            queueMicrotask(arg0);
        },
        __wbg_queueMicrotask_dafde2da3ffcbaa1: function(arg0, arg1) {
            arg0.queueMicrotask(arg1);
        },
        __wbg_queue_41b76331de876d9d: function(arg0) {
            const ret = arg0.queue;
            return ret;
        },
        __wbg_random_df36b90cd78a7d54: function() {
            const ret = Math.random();
            return ret;
        },
        __wbg_reason_9ebfbaed7b40f058: function(arg0) {
            const ret = arg0.reason;
            return (__wbindgen_enum_GpuDeviceLostReason.indexOf(ret) + 1 || 3) - 1;
        },
        __wbg_reason_ebc3432467af6eae: function(arg0) {
            const ret = arg0.reason;
            return ret;
        },
        __wbg_reject_334b730b3c00849b: function(arg0) {
            const ret = Promise.reject(arg0);
            return ret;
        },
        __wbg_removeAttribute_735f25a801a701e1: function() { return handleError(function (arg0, arg1, arg2) {
            arg0.removeAttribute(getStringFromWasm0(arg1, arg2));
        }, arguments); },
        __wbg_removeEventListener_4e20bd5fac3de092: function() { return handleError(function (arg0, arg1, arg2, arg3) {
            arg0.removeEventListener(getStringFromWasm0(arg1, arg2), arg3);
        }, arguments); },
        __wbg_removeListener_5bad3b754268452a: function() { return handleError(function (arg0, arg1) {
            arg0.removeListener(arg1);
        }, arguments); },
        __wbg_removeProperty_24e2a492b137f2d7: function() { return handleError(function (arg0, arg1, arg2, arg3) {
            const ret = arg1.removeProperty(getStringFromWasm0(arg2, arg3));
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32((arg0 >>> 0) + 4 * 1, len1, true);
            getDataViewMemory0().setInt32((arg0 >>> 0) + 4 * 0, ptr1, true);
        }, arguments); },
        __wbg_repeat_f86675ce521ba584: function(arg0) {
            const ret = arg0.repeat;
            return ret;
        },
        __wbg_requestAdapter_b725cba92e32c4ce: function(arg0, arg1) {
            const ret = arg0.requestAdapter(arg1);
            return ret;
        },
        __wbg_requestAnimationFrame_9ba49d36a19ca83c: function() { return handleError(function (arg0, arg1) {
            const ret = arg0.requestAnimationFrame(arg1);
            return ret;
        }, arguments); },
        __wbg_requestDevice_45bc1149c3b98eaf: function(arg0, arg1) {
            const ret = arg0.requestDevice(arg1);
            return ret;
        },
        __wbg_requestFullscreen_3f16e43f398ce624: function(arg0) {
            const ret = arg0.requestFullscreen();
            return ret;
        },
        __wbg_requestFullscreen_93781fd09368f2da: function(arg0) {
            const ret = arg0.requestFullscreen;
            return ret;
        },
        __wbg_requestIdleCallback_9a533647a3cd774f: function(arg0) {
            const ret = arg0.requestIdleCallback;
            return ret;
        },
        __wbg_requestIdleCallback_accca4fa3cbdc651: function() { return handleError(function (arg0, arg1) {
            const ret = arg0.requestIdleCallback(arg1);
            return ret;
        }, arguments); },
        __wbg_requestPointerLock_7590d9ad6c551fb8: function(arg0) {
            arg0.requestPointerLock();
        },
        __wbg_resolveQuerySet_3eb16017fd6ef873: function(arg0, arg1, arg2, arg3, arg4, arg5) {
            arg0.resolveQuerySet(arg1, arg2 >>> 0, arg3 >>> 0, arg4, arg5 >>> 0);
        },
        __wbg_resolve_dbf78ab4942478b0: function(arg0) {
            const ret = Promise.resolve(arg0);
            return ret;
        },
        __wbg_revokeObjectURL_52940372bc4245cf: function() { return handleError(function (arg0, arg1) {
            URL.revokeObjectURL(getStringFromWasm0(arg0, arg1));
        }, arguments); },
        __wbg_scheduler_dfe8fec13ee211e7: function(arg0) {
            const ret = arg0.scheduler;
            return ret;
        },
        __wbg_scheduler_ff2cc7a0c49a1152: function(arg0) {
            const ret = arg0.scheduler;
            return ret;
        },
        __wbg_setAttribute_f75317b2b5cabfb4: function() { return handleError(function (arg0, arg1, arg2, arg3, arg4) {
            arg0.setAttribute(getStringFromWasm0(arg1, arg2), getStringFromWasm0(arg3, arg4));
        }, arguments); },
        __wbg_setBindGroup_09aa10258bd4dc11: function(arg0, arg1, arg2) {
            arg0.setBindGroup(arg1 >>> 0, arg2);
        },
        __wbg_setBindGroup_0e4a7b8b254673b9: function() { return handleError(function (arg0, arg1, arg2, arg3, arg4, arg5, arg6) {
            arg0.setBindGroup(arg1 >>> 0, arg2, getArrayU32FromWasm0(arg3, arg4), arg5, arg6 >>> 0);
        }, arguments); },
        __wbg_setBindGroup_1a145239764ea257: function() { return handleError(function (arg0, arg1, arg2, arg3, arg4, arg5, arg6) {
            arg0.setBindGroup(arg1 >>> 0, arg2, getArrayU32FromWasm0(arg3, arg4), arg5, arg6 >>> 0);
        }, arguments); },
        __wbg_setBindGroup_c3a39fd8d0149600: function(arg0, arg1, arg2) {
            arg0.setBindGroup(arg1 >>> 0, arg2);
        },
        __wbg_setBlendConstant_49282f54c2fa2e20: function() { return handleError(function (arg0, arg1) {
            arg0.setBlendConstant(arg1);
        }, arguments); },
        __wbg_setIndexBuffer_1872a074063dc4d2: function(arg0, arg1, arg2, arg3, arg4) {
            arg0.setIndexBuffer(arg1, __wbindgen_enum_GpuIndexFormat[arg2], arg3, arg4);
        },
        __wbg_setIndexBuffer_aedf623fb7587665: function(arg0, arg1, arg2, arg3) {
            arg0.setIndexBuffer(arg1, __wbindgen_enum_GpuIndexFormat[arg2], arg3);
        },
        __wbg_setPipeline_1368374122476dc8: function(arg0, arg1) {
            arg0.setPipeline(arg1);
        },
        __wbg_setPipeline_823fe7d48236b840: function(arg0, arg1) {
            arg0.setPipeline(arg1);
        },
        __wbg_setPointerCapture_49f83ce093912db8: function() { return handleError(function (arg0, arg1) {
            arg0.setPointerCapture(arg1);
        }, arguments); },
        __wbg_setProperty_3fe74e09d53acb0b: function() { return handleError(function (arg0, arg1, arg2, arg3, arg4) {
            arg0.setProperty(getStringFromWasm0(arg1, arg2), getStringFromWasm0(arg3, arg4));
        }, arguments); },
        __wbg_setScissorRect_5b13089a95f2dadd: function(arg0, arg1, arg2, arg3, arg4) {
            arg0.setScissorRect(arg1 >>> 0, arg2 >>> 0, arg3 >>> 0, arg4 >>> 0);
        },
        __wbg_setStencilReference_c527b7cc7d28483d: function(arg0, arg1) {
            arg0.setStencilReference(arg1 >>> 0);
        },
        __wbg_setTimeout_01207b745d9585ca: function() { return handleError(function (arg0, arg1) {
            const ret = arg0.setTimeout(arg1);
            return ret;
        }, arguments); },
        __wbg_setTimeout_9ef22b48643bd7de: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = arg0.setTimeout(arg1, arg2);
            return ret;
        }, arguments); },
        __wbg_setVertexBuffer_6cb9f5432f1462e2: function(arg0, arg1, arg2, arg3, arg4) {
            arg0.setVertexBuffer(arg1 >>> 0, arg2, arg3, arg4);
        },
        __wbg_setVertexBuffer_ff00b7e9bfd9257d: function(arg0, arg1, arg2, arg3) {
            arg0.setVertexBuffer(arg1 >>> 0, arg2, arg3);
        },
        __wbg_setViewport_1144d8635e7e792d: function(arg0, arg1, arg2, arg3, arg4, arg5, arg6) {
            arg0.setViewport(arg1, arg2, arg3, arg4, arg5, arg6);
        },
        __wbg_set_118fefd528ab0a79: function(arg0, arg1, arg2) {
            arg0.set(arg1, arg2 >>> 0);
        },
        __wbg_set_2793479888329cb6: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = Reflect.set(arg0, arg1, arg2);
            return ret;
        }, arguments); },
        __wbg_set_a_b8a7f56fa358e664: function(arg0, arg1) {
            arg0.a = arg1;
        },
        __wbg_set_access_46b3e62b6a30d608: function(arg0, arg1) {
            arg0.access = __wbindgen_enum_GpuStorageTextureAccess[arg1];
        },
        __wbg_set_address_mode_u_f67593eba8917d58: function(arg0, arg1) {
            arg0.addressModeU = __wbindgen_enum_GpuAddressMode[arg1];
        },
        __wbg_set_address_mode_v_8366e992c3ec2680: function(arg0, arg1) {
            arg0.addressModeV = __wbindgen_enum_GpuAddressMode[arg1];
        },
        __wbg_set_address_mode_w_53ae7ff9fc27d31b: function(arg0, arg1) {
            arg0.addressModeW = __wbindgen_enum_GpuAddressMode[arg1];
        },
        __wbg_set_alpha_041ea339c691473c: function(arg0, arg1) {
            arg0.alpha = arg1;
        },
        __wbg_set_alpha_mode_edf7c742eee7ac74: function(arg0, arg1) {
            arg0.alphaMode = __wbindgen_enum_GpuCanvasAlphaMode[arg1];
        },
        __wbg_set_alpha_to_coverage_enabled_66b16e2395f2145a: function(arg0, arg1) {
            arg0.alphaToCoverageEnabled = arg1 !== 0;
        },
        __wbg_set_array_layer_count_f652f75c2d85d00b: function(arg0, arg1) {
            arg0.arrayLayerCount = arg1 >>> 0;
        },
        __wbg_set_array_stride_f64_d4a555ef4287a90a: function(arg0, arg1) {
            arg0.arrayStride = arg1;
        },
        __wbg_set_aspect_0820f36ab69e69c7: function(arg0, arg1) {
            arg0.aspect = __wbindgen_enum_GpuTextureAspect[arg1];
        },
        __wbg_set_aspect_4eaf6e4f871485aa: function(arg0, arg1) {
            arg0.aspect = __wbindgen_enum_GpuTextureAspect[arg1];
        },
        __wbg_set_attributes_6753fa3eefb33349: function(arg0, arg1, arg2) {
            arg0.attributes = getArrayJsValueViewFromWasm0(arg1, arg2);
        },
        __wbg_set_b_1f0c9c5f62003b93: function(arg0, arg1) {
            arg0.b = arg1;
        },
        __wbg_set_base_array_layer_766baefe617e7450: function(arg0, arg1) {
            arg0.baseArrayLayer = arg1 >>> 0;
        },
        __wbg_set_base_mip_level_6c4e57453fe07edf: function(arg0, arg1) {
            arg0.baseMipLevel = arg1 >>> 0;
        },
        __wbg_set_beginning_of_pass_write_index_bda54c444871cf36: function(arg0, arg1) {
            arg0.beginningOfPassWriteIndex = arg1 >>> 0;
        },
        __wbg_set_beginning_of_pass_write_index_ce26d46a975d94e3: function(arg0, arg1) {
            arg0.beginningOfPassWriteIndex = arg1 >>> 0;
        },
        __wbg_set_bind_group_layouts_78efad321b8db306: function(arg0, arg1, arg2) {
            arg0.bindGroupLayouts = getArrayJsValueViewFromWasm0(arg1, arg2);
        },
        __wbg_set_binding_49121810d92bb656: function(arg0, arg1) {
            arg0.binding = arg1 >>> 0;
        },
        __wbg_set_binding_921af47b178839b7: function(arg0, arg1) {
            arg0.binding = arg1 >>> 0;
        },
        __wbg_set_blend_9b68fe4192551c11: function(arg0, arg1) {
            arg0.blend = arg1;
        },
        __wbg_set_box_fc386a28d2eedbf8: function(arg0, arg1) {
            arg0.box = __wbindgen_enum_ResizeObserverBoxOptions[arg1];
        },
        __wbg_set_buffer_3eb765d2630ec17e: function(arg0, arg1) {
            arg0.buffer = arg1;
        },
        __wbg_set_buffer_e254d16772ccdf1f: function(arg0, arg1) {
            arg0.buffer = arg1;
        },
        __wbg_set_buffer_f0412de54dad59a0: function(arg0, arg1) {
            arg0.buffer = arg1;
        },
        __wbg_set_buffers_4bae4e561a9fa5bc: function(arg0, arg1, arg2) {
            arg0.buffers = getArrayJsValueViewFromWasm0(arg1, arg2);
        },
        __wbg_set_bytes_per_row_2edc74cba6ac1b69: function(arg0, arg1) {
            arg0.bytesPerRow = arg1 >>> 0;
        },
        __wbg_set_bytes_per_row_5b4cd93af94a0d4b: function(arg0, arg1) {
            arg0.bytesPerRow = arg1 >>> 0;
        },
        __wbg_set_clear_value_gpu_color_dict_b12131c44b7f5a0b: function(arg0, arg1) {
            arg0.clearValue = arg1;
        },
        __wbg_set_code_71b4a924b594417d: function(arg0, arg1, arg2) {
            arg0.code = getStringFromWasm0(arg1, arg2);
        },
        __wbg_set_color_173beb3f62e0fe38: function(arg0, arg1) {
            arg0.color = arg1;
        },
        __wbg_set_color_attachments_bb683d934e2d6222: function(arg0, arg1, arg2) {
            arg0.colorAttachments = getArrayJsValueViewFromWasm0(arg1, arg2);
        },
        __wbg_set_compare_1f37d6bc9b4479b5: function(arg0, arg1) {
            arg0.compare = __wbindgen_enum_GpuCompareFunction[arg1];
        },
        __wbg_set_compare_9f209c2a21e5f8cc: function(arg0, arg1) {
            arg0.compare = __wbindgen_enum_GpuCompareFunction[arg1];
        },
        __wbg_set_compute_6328b3ac805fa957: function(arg0, arg1) {
            arg0.compute = arg1;
        },
        __wbg_set_count_02820c919f8591db: function(arg0, arg1) {
            arg0.count = arg1 >>> 0;
        },
        __wbg_set_count_c31ce44133f5b28b: function(arg0, arg1) {
            arg0.count = arg1 >>> 0;
        },
        __wbg_set_cull_mode_2571e6256445d311: function(arg0, arg1) {
            arg0.cullMode = __wbindgen_enum_GpuCullMode[arg1];
        },
        __wbg_set_depth_bias_9ff79c074fab3395: function(arg0, arg1) {
            arg0.depthBias = arg1;
        },
        __wbg_set_depth_bias_clamp_b9dfc0449214a137: function(arg0, arg1) {
            arg0.depthBiasClamp = arg1;
        },
        __wbg_set_depth_bias_slope_scale_bacfbadca941fcf5: function(arg0, arg1) {
            arg0.depthBiasSlopeScale = arg1;
        },
        __wbg_set_depth_clear_value_bbfc087b5b4b6d06: function(arg0, arg1) {
            arg0.depthClearValue = arg1;
        },
        __wbg_set_depth_compare_706f99d5a7658960: function(arg0, arg1) {
            arg0.depthCompare = __wbindgen_enum_GpuCompareFunction[arg1];
        },
        __wbg_set_depth_fail_op_8cc03f38206b087f: function(arg0, arg1) {
            arg0.depthFailOp = __wbindgen_enum_GpuStencilOperation[arg1];
        },
        __wbg_set_depth_load_op_96d40a8e26164544: function(arg0, arg1) {
            arg0.depthLoadOp = __wbindgen_enum_GpuLoadOp[arg1];
        },
        __wbg_set_depth_or_array_layers_41d9bf5003084813: function(arg0, arg1) {
            arg0.depthOrArrayLayers = arg1 >>> 0;
        },
        __wbg_set_depth_read_only_8be6458323119975: function(arg0, arg1) {
            arg0.depthReadOnly = arg1 !== 0;
        },
        __wbg_set_depth_stencil_attachment_7a083fe21730d473: function(arg0, arg1) {
            arg0.depthStencilAttachment = arg1;
        },
        __wbg_set_depth_stencil_f138ba545e6cc4d4: function(arg0, arg1) {
            arg0.depthStencil = arg1;
        },
        __wbg_set_depth_store_op_3e7ee4bf89cda835: function(arg0, arg1) {
            arg0.depthStoreOp = __wbindgen_enum_GpuStoreOp[arg1];
        },
        __wbg_set_depth_write_enabled_c1ad58fe7207ef11: function(arg0, arg1) {
            arg0.depthWriteEnabled = arg1 !== 0;
        },
        __wbg_set_device_2b7e0e4f69784351: function(arg0, arg1) {
            arg0.device = arg1;
        },
        __wbg_set_dimension_536f245d466cca10: function(arg0, arg1) {
            arg0.dimension = __wbindgen_enum_GpuTextureDimension[arg1];
        },
        __wbg_set_dimension_91e724d498a35c9a: function(arg0, arg1) {
            arg0.dimension = __wbindgen_enum_GpuTextureViewDimension[arg1];
        },
        __wbg_set_dst_factor_9789f02ad2a0c61e: function(arg0, arg1) {
            arg0.dstFactor = __wbindgen_enum_GpuBlendFactor[arg1];
        },
        __wbg_set_end_of_pass_write_index_4b0931cfb0c1f44c: function(arg0, arg1) {
            arg0.endOfPassWriteIndex = arg1 >>> 0;
        },
        __wbg_set_end_of_pass_write_index_bd996c6cc50b794b: function(arg0, arg1) {
            arg0.endOfPassWriteIndex = arg1 >>> 0;
        },
        __wbg_set_entries_02ae66da25c9ddae: function(arg0, arg1, arg2) {
            arg0.entries = getArrayJsValueViewFromWasm0(arg1, arg2);
        },
        __wbg_set_entries_8036374af27741dc: function(arg0, arg1, arg2) {
            arg0.entries = getArrayJsValueViewFromWasm0(arg1, arg2);
        },
        __wbg_set_entry_point_79bb4d8fb01c97ec: function(arg0, arg1, arg2) {
            arg0.entryPoint = getStringFromWasm0(arg1, arg2);
        },
        __wbg_set_entry_point_89ecd5ddd9c56d5c: function(arg0, arg1, arg2) {
            arg0.entryPoint = getStringFromWasm0(arg1, arg2);
        },
        __wbg_set_entry_point_b4eb7d2dd59b5c76: function(arg0, arg1, arg2) {
            arg0.entryPoint = getStringFromWasm0(arg1, arg2);
        },
        __wbg_set_external_texture_34c43368e77cc844: function(arg0, arg1) {
            arg0.externalTexture = arg1;
        },
        __wbg_set_fail_op_e901d7b520ae0e15: function(arg0, arg1) {
            arg0.failOp = __wbindgen_enum_GpuStencilOperation[arg1];
        },
        __wbg_set_format_1d70746424721ed1: function(arg0, arg1) {
            arg0.format = __wbindgen_enum_GpuTextureFormat[arg1];
        },
        __wbg_set_format_594ffafc6477f59d: function(arg0, arg1) {
            arg0.format = __wbindgen_enum_GpuTextureFormat[arg1];
        },
        __wbg_set_format_781ab1cf2f8f2465: function(arg0, arg1) {
            arg0.format = __wbindgen_enum_GpuVertexFormat[arg1];
        },
        __wbg_set_format_8003fc2174c14359: function(arg0, arg1) {
            arg0.format = __wbindgen_enum_GpuTextureFormat[arg1];
        },
        __wbg_set_format_c1603ca98ab9cb13: function(arg0, arg1) {
            arg0.format = __wbindgen_enum_GpuTextureFormat[arg1];
        },
        __wbg_set_format_cdccd8422de3c885: function(arg0, arg1) {
            arg0.format = __wbindgen_enum_GpuTextureFormat[arg1];
        },
        __wbg_set_format_df8baca64e04f5ef: function(arg0, arg1) {
            arg0.format = __wbindgen_enum_GpuTextureFormat[arg1];
        },
        __wbg_set_fragment_3635fd557dbd99bc: function(arg0, arg1) {
            arg0.fragment = arg1;
        },
        __wbg_set_front_face_13105806890daab7: function(arg0, arg1) {
            arg0.frontFace = __wbindgen_enum_GpuFrontFace[arg1];
        },
        __wbg_set_g_9d2890d6fb93dba4: function(arg0, arg1) {
            arg0.g = arg1;
        },
        __wbg_set_has_dynamic_offset_0086bc7faede16d1: function(arg0, arg1) {
            arg0.hasDynamicOffset = arg1 !== 0;
        },
        __wbg_set_height_546367a98b9ab695: function(arg0, arg1) {
            arg0.height = arg1 >>> 0;
        },
        __wbg_set_height_ae0610d318c3428c: function(arg0, arg1) {
            arg0.height = arg1 >>> 0;
        },
        __wbg_set_height_ae24c2f7d580ae0a: function(arg0, arg1) {
            arg0.height = arg1 >>> 0;
        },
        __wbg_set_label_0b78f43973577425: function(arg0, arg1, arg2) {
            arg0.label = getStringFromWasm0(arg1, arg2);
        },
        __wbg_set_label_16858d210dffe9ff: function(arg0, arg1, arg2) {
            arg0.label = getStringFromWasm0(arg1, arg2);
        },
        __wbg_set_label_1d7c053bc726e08f: function(arg0, arg1, arg2) {
            arg0.label = getStringFromWasm0(arg1, arg2);
        },
        __wbg_set_label_1e431973068c0ea4: function(arg0, arg1, arg2) {
            arg0.label = getStringFromWasm0(arg1, arg2);
        },
        __wbg_set_label_2d3e4456ff9a120a: function(arg0, arg1, arg2) {
            arg0.label = getStringFromWasm0(arg1, arg2);
        },
        __wbg_set_label_39038ba992db5f45: function(arg0, arg1, arg2) {
            arg0.label = getStringFromWasm0(arg1, arg2);
        },
        __wbg_set_label_5e1a79b630ee9fa3: function(arg0, arg1, arg2) {
            arg0.label = getStringFromWasm0(arg1, arg2);
        },
        __wbg_set_label_89172d31c03b3375: function(arg0, arg1, arg2) {
            arg0.label = getStringFromWasm0(arg1, arg2);
        },
        __wbg_set_label_a71d5f5c41bed969: function(arg0, arg1, arg2) {
            arg0.label = getStringFromWasm0(arg1, arg2);
        },
        __wbg_set_label_d133ac18919ae10f: function(arg0, arg1, arg2) {
            arg0.label = getStringFromWasm0(arg1, arg2);
        },
        __wbg_set_label_dcaa5d479cbb5311: function(arg0, arg1, arg2) {
            arg0.label = getStringFromWasm0(arg1, arg2);
        },
        __wbg_set_label_dcb16ec336a5420d: function(arg0, arg1, arg2) {
            arg0.label = getStringFromWasm0(arg1, arg2);
        },
        __wbg_set_label_e9f1af9890ad68b6: function(arg0, arg1, arg2) {
            arg0.label = getStringFromWasm0(arg1, arg2);
        },
        __wbg_set_label_ea59541fa72ee985: function(arg0, arg1, arg2) {
            arg0.label = getStringFromWasm0(arg1, arg2);
        },
        __wbg_set_label_ef8bfd8864e594a4: function(arg0, arg1, arg2) {
            arg0.label = getStringFromWasm0(arg1, arg2);
        },
        __wbg_set_label_f9171cd5c971dbf2: function(arg0, arg1, arg2) {
            arg0.label = getStringFromWasm0(arg1, arg2);
        },
        __wbg_set_layout_6b757fab7265d0f7: function(arg0, arg1) {
            arg0.layout = arg1;
        },
        __wbg_set_layout_905339a584186697: function(arg0, arg1) {
            arg0.layout = arg1;
        },
        __wbg_set_layout_bfddc4788acb0736: function(arg0, arg1) {
            arg0.layout = arg1;
        },
        __wbg_set_layout_gpu_auto_layout_mode_0e86cf27fd7c9e0c: function(arg0, arg1) {
            arg0.layout = __wbindgen_enum_GpuAutoLayoutMode[arg1];
        },
        __wbg_set_layout_gpu_auto_layout_mode_89827b74212f80b4: function(arg0, arg1) {
            arg0.layout = __wbindgen_enum_GpuAutoLayoutMode[arg1];
        },
        __wbg_set_load_op_9a24b40a8df7115b: function(arg0, arg1) {
            arg0.loadOp = __wbindgen_enum_GpuLoadOp[arg1];
        },
        __wbg_set_lod_max_clamp_c1935a38a79d7f3b: function(arg0, arg1) {
            arg0.lodMaxClamp = arg1;
        },
        __wbg_set_lod_min_clamp_27d01e7c2938fe09: function(arg0, arg1) {
            arg0.lodMinClamp = arg1;
        },
        __wbg_set_mag_filter_657599d734cdc0d9: function(arg0, arg1) {
            arg0.magFilter = __wbindgen_enum_GpuFilterMode[arg1];
        },
        __wbg_set_mapped_at_creation_a4cd55019116b792: function(arg0, arg1) {
            arg0.mappedAtCreation = arg1 !== 0;
        },
        __wbg_set_mask_7a39674fcbc00286: function(arg0, arg1) {
            arg0.mask = arg1 >>> 0;
        },
        __wbg_set_max_anisotropy_b05f95dcdfdae8bb: function(arg0, arg1) {
            arg0.maxAnisotropy = arg1;
        },
        __wbg_set_min_binding_size_f64_2458ad9bffad7ea7: function(arg0, arg1) {
            arg0.minBindingSize = arg1;
        },
        __wbg_set_min_filter_93e33f778b66ecb0: function(arg0, arg1) {
            arg0.minFilter = __wbindgen_enum_GpuFilterMode[arg1];
        },
        __wbg_set_mip_level_count_19560e4f63320832: function(arg0, arg1) {
            arg0.mipLevelCount = arg1 >>> 0;
        },
        __wbg_set_mip_level_count_ef313d3a441aa51e: function(arg0, arg1) {
            arg0.mipLevelCount = arg1 >>> 0;
        },
        __wbg_set_mip_level_dbdf4ee3ba07c689: function(arg0, arg1) {
            arg0.mipLevel = arg1 >>> 0;
        },
        __wbg_set_mipmap_filter_aacb60d49a794ef5: function(arg0, arg1) {
            arg0.mipmapFilter = __wbindgen_enum_GpuMipmapFilterMode[arg1];
        },
        __wbg_set_mode_73d9eb9243253108: function(arg0, arg1) {
            arg0.mode = __wbindgen_enum_GpuCanvasToneMappingMode[arg1];
        },
        __wbg_set_module_85e1d5368a2b9422: function(arg0, arg1) {
            arg0.module = arg1;
        },
        __wbg_set_module_bffb3e27ccc03d8d: function(arg0, arg1) {
            arg0.module = arg1;
        },
        __wbg_set_module_c746beebaa6ede01: function(arg0, arg1) {
            arg0.module = arg1;
        },
        __wbg_set_multisample_7471ab77b8e5a567: function(arg0, arg1) {
            arg0.multisample = arg1;
        },
        __wbg_set_multisampled_d385dcc24cbcdac9: function(arg0, arg1) {
            arg0.multisampled = arg1 !== 0;
        },
        __wbg_set_offset_f64_106ac70d42ed0b22: function(arg0, arg1) {
            arg0.offset = arg1;
        },
        __wbg_set_offset_f64_1596700fad993892: function(arg0, arg1) {
            arg0.offset = arg1;
        },
        __wbg_set_offset_f64_b1157147188cb175: function(arg0, arg1) {
            arg0.offset = arg1;
        },
        __wbg_set_offset_f64_f65aa794a52b87dc: function(arg0, arg1) {
            arg0.offset = arg1;
        },
        __wbg_set_onmessage_5e09c5c5df17fb8b: function(arg0, arg1) {
            arg0.onmessage = arg1;
        },
        __wbg_set_onuncapturederror_1a772a1feba5ec1d: function(arg0, arg1) {
            arg0.onuncapturederror = arg1;
        },
        __wbg_set_operation_b82c9485304b393c: function(arg0, arg1) {
            arg0.operation = __wbindgen_enum_GpuBlendOperation[arg1];
        },
        __wbg_set_origin_gpu_origin_3d_dict_c2b5dc3bd3763139: function(arg0, arg1) {
            arg0.origin = arg1;
        },
        __wbg_set_pass_op_3b1d192c54b1a827: function(arg0, arg1) {
            arg0.passOp = __wbindgen_enum_GpuStencilOperation[arg1];
        },
        __wbg_set_power_preference_06107ba643e66249: function(arg0, arg1) {
            arg0.powerPreference = __wbindgen_enum_GpuPowerPreference[arg1];
        },
        __wbg_set_primitive_14377cb8cbd23584: function(arg0, arg1) {
            arg0.primitive = arg1;
        },
        __wbg_set_query_set_a1af7e0b244eb437: function(arg0, arg1) {
            arg0.querySet = arg1;
        },
        __wbg_set_query_set_da20f7d5b37c78e1: function(arg0, arg1) {
            arg0.querySet = arg1;
        },
        __wbg_set_r_473d4bd5f6ddbe44: function(arg0, arg1) {
            arg0.r = arg1;
        },
        __wbg_set_required_features_ef8aeb4d5f909e03: function(arg0, arg1, arg2) {
            arg0.requiredFeatures = getArrayJsValueViewFromWasm0(arg1, arg2);
        },
        __wbg_set_required_limits_a80a53fd4744ccb2: function(arg0, arg1) {
            arg0.requiredLimits = arg1;
        },
        __wbg_set_resolve_target_gpu_texture_view_6c8f66cd96330a45: function(arg0, arg1) {
            arg0.resolveTarget = arg1;
        },
        __wbg_set_resource_d37005b6a3d3375f: function(arg0, arg1) {
            arg0.resource = arg1;
        },
        __wbg_set_resource_gpu_buffer_binding_8e9be21bc9a45330: function(arg0, arg1) {
            arg0.resource = arg1;
        },
        __wbg_set_resource_gpu_texture_view_e3bf3810e7168d2b: function(arg0, arg1) {
            arg0.resource = arg1;
        },
        __wbg_set_rows_per_image_aa7986b60cd7869e: function(arg0, arg1) {
            arg0.rowsPerImage = arg1 >>> 0;
        },
        __wbg_set_rows_per_image_e9f4da51b05f4ee1: function(arg0, arg1) {
            arg0.rowsPerImage = arg1 >>> 0;
        },
        __wbg_set_sample_count_a4d54cf5bcf23914: function(arg0, arg1) {
            arg0.sampleCount = arg1 >>> 0;
        },
        __wbg_set_sample_type_660a4d77497517e2: function(arg0, arg1) {
            arg0.sampleType = __wbindgen_enum_GpuTextureSampleType[arg1];
        },
        __wbg_set_sampler_35b5b2e68532815b: function(arg0, arg1) {
            arg0.sampler = arg1;
        },
        __wbg_set_shader_location_e0fdb186c91ac5df: function(arg0, arg1) {
            arg0.shaderLocation = arg1 >>> 0;
        },
        __wbg_set_size_f64_04b949f2af8176ba: function(arg0, arg1) {
            arg0.size = arg1;
        },
        __wbg_set_size_f64_2418f77508fb05d7: function(arg0, arg1) {
            arg0.size = arg1;
        },
        __wbg_set_size_gpu_extent_3d_dict_7180918365da46d5: function(arg0, arg1) {
            arg0.size = arg1;
        },
        __wbg_set_src_factor_e72cbac8c7084adc: function(arg0, arg1) {
            arg0.srcFactor = __wbindgen_enum_GpuBlendFactor[arg1];
        },
        __wbg_set_stencil_back_4df76dba55137aa9: function(arg0, arg1) {
            arg0.stencilBack = arg1;
        },
        __wbg_set_stencil_clear_value_686c18ee265a672c: function(arg0, arg1) {
            arg0.stencilClearValue = arg1 >>> 0;
        },
        __wbg_set_stencil_front_ec8c0eedf46d4973: function(arg0, arg1) {
            arg0.stencilFront = arg1;
        },
        __wbg_set_stencil_load_op_1bce6d97f680eda7: function(arg0, arg1) {
            arg0.stencilLoadOp = __wbindgen_enum_GpuLoadOp[arg1];
        },
        __wbg_set_stencil_read_mask_1f242f58d95e02e1: function(arg0, arg1) {
            arg0.stencilReadMask = arg1 >>> 0;
        },
        __wbg_set_stencil_read_only_50c3a3b3cbdc83c1: function(arg0, arg1) {
            arg0.stencilReadOnly = arg1 !== 0;
        },
        __wbg_set_stencil_store_op_9703f525bc5e8e0c: function(arg0, arg1) {
            arg0.stencilStoreOp = __wbindgen_enum_GpuStoreOp[arg1];
        },
        __wbg_set_stencil_write_mask_463f4b6208354e15: function(arg0, arg1) {
            arg0.stencilWriteMask = arg1 >>> 0;
        },
        __wbg_set_step_mode_c10a50b921560088: function(arg0, arg1) {
            arg0.stepMode = __wbindgen_enum_GpuVertexStepMode[arg1];
        },
        __wbg_set_storage_texture_c2ed1f3eb327112e: function(arg0, arg1) {
            arg0.storageTexture = arg1;
        },
        __wbg_set_store_op_e3edba4d13e36cbf: function(arg0, arg1) {
            arg0.storeOp = __wbindgen_enum_GpuStoreOp[arg1];
        },
        __wbg_set_strip_index_format_a7cb0b950f8653f8: function(arg0, arg1) {
            arg0.stripIndexFormat = __wbindgen_enum_GpuIndexFormat[arg1];
        },
        __wbg_set_targets_b24b23a20f1c7f7f: function(arg0, arg1, arg2) {
            arg0.targets = getArrayJsValueViewFromWasm0(arg1, arg2);
        },
        __wbg_set_texture_39ac35f54ef4c3ba: function(arg0, arg1) {
            arg0.texture = arg1;
        },
        __wbg_set_texture_c89ca659682f2fd6: function(arg0, arg1) {
            arg0.texture = arg1;
        },
        __wbg_set_timestamp_writes_90e77f617d9af260: function(arg0, arg1) {
            arg0.timestampWrites = arg1;
        },
        __wbg_set_timestamp_writes_9fd1c7b5cb0a6a5c: function(arg0, arg1) {
            arg0.timestampWrites = arg1;
        },
        __wbg_set_tone_mapping_92c0666fef742c68: function(arg0, arg1) {
            arg0.toneMapping = arg1;
        },
        __wbg_set_topology_ed2942658d3771ab: function(arg0, arg1) {
            arg0.topology = __wbindgen_enum_GpuPrimitiveTopology[arg1];
        },
        __wbg_set_type_4f916b69d83408df: function(arg0, arg1) {
            arg0.type = __wbindgen_enum_GpuQueryType[arg1];
        },
        __wbg_set_type_609b0cea6429d7bb: function(arg0, arg1, arg2) {
            arg0.type = getStringFromWasm0(arg1, arg2);
        },
        __wbg_set_type_6cc967b44400577b: function(arg0, arg1) {
            arg0.type = __wbindgen_enum_GpuSamplerBindingType[arg1];
        },
        __wbg_set_type_dd6c71bc279b420e: function(arg0, arg1) {
            arg0.type = __wbindgen_enum_GpuBufferBindingType[arg1];
        },
        __wbg_set_unclipped_depth_f24953dc0eb8c84c: function(arg0, arg1) {
            arg0.unclippedDepth = arg1 !== 0;
        },
        __wbg_set_usage_1d663151adcb7f1a: function(arg0, arg1) {
            arg0.usage = arg1 >>> 0;
        },
        __wbg_set_usage_63cd5e88050b26e8: function(arg0, arg1) {
            arg0.usage = arg1 >>> 0;
        },
        __wbg_set_usage_6c4bd5f209a0579c: function(arg0, arg1) {
            arg0.usage = arg1 >>> 0;
        },
        __wbg_set_usage_a65753b69e218ec9: function(arg0, arg1) {
            arg0.usage = arg1 >>> 0;
        },
        __wbg_set_vertex_b8cfd3671e5edfbb: function(arg0, arg1) {
            arg0.vertex = arg1;
        },
        __wbg_set_view_dimension_ce6e77a9eb67aa53: function(arg0, arg1) {
            arg0.viewDimension = __wbindgen_enum_GpuTextureViewDimension[arg1];
        },
        __wbg_set_view_dimension_d5c87d8c6f1266b5: function(arg0, arg1) {
            arg0.viewDimension = __wbindgen_enum_GpuTextureViewDimension[arg1];
        },
        __wbg_set_view_formats_8b40d61be4d5be29: function(arg0, arg1, arg2) {
            arg0.viewFormats = getArrayJsValueViewFromWasm0(arg1, arg2);
        },
        __wbg_set_view_formats_ea87e3d240842107: function(arg0, arg1, arg2) {
            arg0.viewFormats = getArrayJsValueViewFromWasm0(arg1, arg2);
        },
        __wbg_set_view_gpu_texture_view_bf636cc659953b65: function(arg0, arg1) {
            arg0.view = arg1;
        },
        __wbg_set_view_gpu_texture_view_d53664457085e78b: function(arg0, arg1) {
            arg0.view = arg1;
        },
        __wbg_set_visibility_f68d6576737b8b45: function(arg0, arg1) {
            arg0.visibility = arg1 >>> 0;
        },
        __wbg_set_width_5f89a551b5472887: function(arg0, arg1) {
            arg0.width = arg1 >>> 0;
        },
        __wbg_set_width_eb3001e1dcabb909: function(arg0, arg1) {
            arg0.width = arg1 >>> 0;
        },
        __wbg_set_width_fc76d04c0309b403: function(arg0, arg1) {
            arg0.width = arg1 >>> 0;
        },
        __wbg_set_write_mask_51378295d978a0f8: function(arg0, arg1) {
            arg0.writeMask = arg1 >>> 0;
        },
        __wbg_set_x_aa58610e8a2b3347: function(arg0, arg1) {
            arg0.x = arg1 >>> 0;
        },
        __wbg_set_y_6a3e943d5ad07e0d: function(arg0, arg1) {
            arg0.y = arg1 >>> 0;
        },
        __wbg_set_z_dc1a88e5f0e1508d: function(arg0, arg1) {
            arg0.z = arg1 >>> 0;
        },
        __wbg_shiftKey_6a84be2563ae8a55: function(arg0) {
            const ret = arg0.shiftKey;
            return ret;
        },
        __wbg_shiftKey_a6ce93ef743d5834: function(arg0) {
            const ret = arg0.shiftKey;
            return ret;
        },
        __wbg_signal_fac908876f45725d: function(arg0) {
            const ret = arg0.signal;
            return ret;
        },
        __wbg_size_524ea4908379eb54: function(arg0) {
            const ret = arg0.size;
            return ret;
        },
        __wbg_stack_575c4e0918581b9c: function(arg0, arg1) {
            const ret = arg1.stack;
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32((arg0 >>> 0) + 4 * 1, len1, true);
            getDataViewMemory0().setInt32((arg0 >>> 0) + 4 * 0, ptr1, true);
        },
        __wbg_start_519d7e0585a678a1: function(arg0) {
            arg0.start();
        },
        __wbg_static_accessor_GLOBAL_THIS_003ee833af9699fc: function() {
            const ret = typeof globalThis === 'undefined' ? undefined : globalThis;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_static_accessor_GLOBAL_e4293fb22cbe77da: function() {
            const ret = typeof global === 'undefined' ? undefined : global;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_static_accessor_SELF_53bb20457401453d: function() {
            const ret = typeof self === 'undefined' ? undefined : self;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_static_accessor_WINDOW_b5e0810bfecb7feb: function() {
            const ret = typeof window === 'undefined' ? undefined : window;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_status_cb85b6c8d1769fa1: function(arg0) {
            const ret = arg0.status;
            return ret;
        },
        __wbg_stringify_0a0fbf2ef722380a: function() { return handleError(function (arg0) {
            const ret = JSON.stringify(arg0);
            return ret;
        }, arguments); },
        __wbg_style_f499e599ac70277f: function(arg0) {
            const ret = arg0.style;
            return ret;
        },
        __wbg_subgroupMaxSize_b33b2d37e3f1f5f5: function(arg0) {
            const ret = arg0.subgroupMaxSize;
            return ret;
        },
        __wbg_subgroupMinSize_ff381626432f1cbc: function(arg0) {
            const ret = arg0.subgroupMinSize;
            return ret;
        },
        __wbg_submit_c4379e221512d3fa: function(arg0, arg1, arg2) {
            arg0.submit(getArrayJsValueViewFromWasm0(arg1, arg2));
        },
        __wbg_then_3a4f899454bcf8c9: function(arg0, arg1) {
            const ret = arg0.then(arg1);
            return ret;
        },
        __wbg_then_656f253a5dd7d8ea: function(arg0, arg1, arg2) {
            const ret = arg0.then(arg1, arg2);
            return ret;
        },
        __wbg_then_e3f7f2d365708be8: function(arg0, arg1) {
            const ret = arg0.then(arg1);
            return ret;
        },
        __wbg_timeline_1b03d8e1dae1c814: function(arg0) {
            const ret = arg0.timeline;
            return ret;
        },
        __wbg_unconfigure_7ca436ff70c0bcc3: function(arg0) {
            arg0.unconfigure();
        },
        __wbg_unmap_073211b910c6a369: function(arg0) {
            arg0.unmap();
        },
        __wbg_unobserve_fff2444f7a490382: function(arg0, arg1) {
            arg0.unobserve(arg1);
        },
        __wbg_usage_81303cd46280f8aa: function(arg0) {
            const ret = arg0.usage;
            return ret;
        },
        __wbg_userAgentData_0148e444c4b01dac: function(arg0) {
            const ret = arg0.userAgentData;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_userAgent_a20b4771d027eeaa: function() { return handleError(function (arg0, arg1) {
            const ret = arg1.userAgent;
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32((arg0 >>> 0) + 4 * 1, len1, true);
            getDataViewMemory0().setInt32((arg0 >>> 0) + 4 * 0, ptr1, true);
        }, arguments); },
        __wbg_valueOf_2ad4a09774ac959e: function(arg0) {
            const ret = arg0.valueOf();
            return ret;
        },
        __wbg_visibilityState_b1951b0d978d7cf3: function(arg0) {
            const ret = arg0.visibilityState;
            return (__wbindgen_enum_VisibilityState.indexOf(ret) + 1 || 3) - 1;
        },
        __wbg_webkitExitFullscreen_f487871f11a8185e: function(arg0) {
            arg0.webkitExitFullscreen();
        },
        __wbg_webkitFullscreenElement_764e8753a8a542d7: function(arg0) {
            const ret = arg0.webkitFullscreenElement;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_webkitRequestFullscreen_c4ec4df7be373ffd: function(arg0) {
            arg0.webkitRequestFullscreen();
        },
        __wbg_width_b81b030bc60498d5: function(arg0) {
            const ret = arg0.width;
            return ret;
        },
        __wbg_width_babc5dc7654771b1: function(arg0) {
            const ret = arg0.width;
            return ret;
        },
        __wbg_writeBuffer_dbc00ede89a23b5e: function() { return handleError(function (arg0, arg1, arg2, arg3, arg4, arg5, arg6) {
            arg0.writeBuffer(arg1, arg2, getArrayU8FromWasm0(arg3, arg4), arg5, arg6);
        }, arguments); },
        __wbg_writeTexture_ddcddb10ef4a4155: function() { return handleError(function (arg0, arg1, arg2, arg3, arg4, arg5) {
            arg0.writeTexture(arg1, getArrayU8FromWasm0(arg2, arg3), arg4, arg5);
        }, arguments); },
        __wbg_x_54d5f149ad41e730: function(arg0) {
            const ret = arg0.x;
            return ret;
        },
        __wbg_y_c6112724c3d3edbf: function(arg0) {
            const ret = arg0.y;
            return ret;
        },
        __wbindgen_generic_0000000000000001: function(arg0, arg1) {
            // Cast intrinsic for `Closure(Closure { owned: true, function: Function { arguments: [Externref], shim_idx: 62866, ret: Unit, inner_ret: Some(Unit) }, mutable: true }) -> Externref`.
            const ret = makeMutClosure(arg0, arg1, wasm_bindgen_be273b461b6f50be___convert__closures_____invoke___wasm_bindgen_be273b461b6f50be___JsValue______true__1_);
            return ret;
        },
        __wbindgen_generic_0000000000000002: function(arg0, arg1) {
            // Cast intrinsic for `Closure(Closure { owned: true, function: Function { arguments: [Externref], shim_idx: 70127, ret: Result(Unit), inner_ret: Some(Result(Unit)) }, mutable: true }) -> Externref`.
            const ret = makeMutClosure(arg0, arg1, wasm_bindgen_be273b461b6f50be___convert__closures_____invoke___wasm_bindgen_be273b461b6f50be___JsValue__core_d941ad8722425d2e___result__Result_____wasm_bindgen_be273b461b6f50be___JsError___true_);
            return ret;
        },
        __wbindgen_generic_0000000000000003: function(arg0, arg1) {
            // Cast intrinsic for `Closure(Closure { owned: true, function: Function { arguments: [Externref], shim_idx: 9752, ret: Unit, inner_ret: Some(Unit) }, mutable: true }) -> Externref`.
            const ret = makeMutClosure(arg0, arg1, wasm_bindgen_be273b461b6f50be___convert__closures_____invoke___wasm_bindgen_be273b461b6f50be___JsValue______true_);
            return ret;
        },
        __wbindgen_generic_0000000000000004: function(arg0, arg1) {
            // Cast intrinsic for `Closure(Closure { owned: true, function: Function { arguments: [NamedExternref("Array<any>"), NamedExternref("ResizeObserver")], shim_idx: 9754, ret: Unit, inner_ret: Some(Unit) }, mutable: true }) -> Externref`.
            const ret = makeMutClosure(arg0, arg1, wasm_bindgen_be273b461b6f50be___convert__closures_____invoke___js_sys_bdfa6a79c5b45de6___Array__web_sys_9a9eeb5a97ae25e9___features__gen_ResizeObserver__ResizeObserver______true_);
            return ret;
        },
        __wbindgen_generic_0000000000000005: function(arg0, arg1) {
            // Cast intrinsic for `Closure(Closure { owned: true, function: Function { arguments: [NamedExternref("Array<any>")], shim_idx: 9753, ret: Unit, inner_ret: Some(Unit) }, mutable: true }) -> Externref`.
            const ret = makeMutClosure(arg0, arg1, wasm_bindgen_be273b461b6f50be___convert__closures_____invoke___js_sys_bdfa6a79c5b45de6___Array______true_);
            return ret;
        },
        __wbindgen_generic_0000000000000006: function(arg0, arg1) {
            // Cast intrinsic for `Closure(Closure { owned: true, function: Function { arguments: [NamedExternref("Event")], shim_idx: 9752, ret: Unit, inner_ret: Some(Unit) }, mutable: true }) -> Externref`.
            const ret = makeMutClosure(arg0, arg1, wasm_bindgen_be273b461b6f50be___convert__closures_____invoke___wasm_bindgen_be273b461b6f50be___JsValue______true__42);
            return ret;
        },
        __wbindgen_generic_0000000000000007: function(arg0, arg1) {
            // Cast intrinsic for `Closure(Closure { owned: true, function: Function { arguments: [NamedExternref("FocusEvent")], shim_idx: 9752, ret: Unit, inner_ret: Some(Unit) }, mutable: true }) -> Externref`.
            const ret = makeMutClosure(arg0, arg1, wasm_bindgen_be273b461b6f50be___convert__closures_____invoke___wasm_bindgen_be273b461b6f50be___JsValue______true__43);
            return ret;
        },
        __wbindgen_generic_0000000000000008: function(arg0, arg1) {
            // Cast intrinsic for `Closure(Closure { owned: true, function: Function { arguments: [NamedExternref("GPUDevice")], shim_idx: 34061, ret: Result(Unit), inner_ret: Some(Result(Unit)) }, mutable: true }) -> Externref`.
            const ret = makeMutClosure(arg0, arg1, wasm_bindgen_be273b461b6f50be___convert__closures_____invoke___wasm_bindgen_be273b461b6f50be___sys__JsNullable_wgpu_b601947fcaaf1663___backend__webgpu__webgpu_sys__gen_GpuError__GpuError___core_d941ad8722425d2e___result__Result_____wasm_bindgen_be273b461b6f50be___JsError___true_);
            return ret;
        },
        __wbindgen_generic_0000000000000009: function(arg0, arg1) {
            // Cast intrinsic for `Closure(Closure { owned: true, function: Function { arguments: [NamedExternref("GPUDeviceLostInfo")], shim_idx: 34062, ret: Unit, inner_ret: Some(Unit) }, mutable: true }) -> Externref`.
            const ret = makeMutClosure(arg0, arg1, wasm_bindgen_be273b461b6f50be___convert__closures_____invoke___wgpu_b601947fcaaf1663___backend__webgpu__webgpu_sys__gen_GpuDeviceLostInfo__GpuDeviceLostInfo______true_);
            return ret;
        },
        __wbindgen_generic_000000000000000a: function(arg0, arg1) {
            // Cast intrinsic for `Closure(Closure { owned: true, function: Function { arguments: [NamedExternref("GPUUncapturedErrorEvent")], shim_idx: 34062, ret: Unit, inner_ret: Some(Unit) }, mutable: true }) -> Externref`.
            const ret = makeMutClosure(arg0, arg1, wasm_bindgen_be273b461b6f50be___convert__closures_____invoke___wgpu_b601947fcaaf1663___backend__webgpu__webgpu_sys__gen_GpuDeviceLostInfo__GpuDeviceLostInfo______true__46);
            return ret;
        },
        __wbindgen_generic_000000000000000b: function(arg0, arg1) {
            // Cast intrinsic for `Closure(Closure { owned: true, function: Function { arguments: [NamedExternref("KeyboardEvent")], shim_idx: 9752, ret: Unit, inner_ret: Some(Unit) }, mutable: true }) -> Externref`.
            const ret = makeMutClosure(arg0, arg1, wasm_bindgen_be273b461b6f50be___convert__closures_____invoke___wasm_bindgen_be273b461b6f50be___JsValue______true__47);
            return ret;
        },
        __wbindgen_generic_000000000000000c: function(arg0, arg1) {
            // Cast intrinsic for `Closure(Closure { owned: true, function: Function { arguments: [NamedExternref("PageTransitionEvent")], shim_idx: 9752, ret: Unit, inner_ret: Some(Unit) }, mutable: true }) -> Externref`.
            const ret = makeMutClosure(arg0, arg1, wasm_bindgen_be273b461b6f50be___convert__closures_____invoke___wasm_bindgen_be273b461b6f50be___JsValue______true__48);
            return ret;
        },
        __wbindgen_generic_000000000000000d: function(arg0, arg1) {
            // Cast intrinsic for `Closure(Closure { owned: true, function: Function { arguments: [NamedExternref("PointerEvent")], shim_idx: 9752, ret: Unit, inner_ret: Some(Unit) }, mutable: true }) -> Externref`.
            const ret = makeMutClosure(arg0, arg1, wasm_bindgen_be273b461b6f50be___convert__closures_____invoke___wasm_bindgen_be273b461b6f50be___JsValue______true__49);
            return ret;
        },
        __wbindgen_generic_000000000000000e: function(arg0, arg1) {
            // Cast intrinsic for `Closure(Closure { owned: true, function: Function { arguments: [NamedExternref("WheelEvent")], shim_idx: 9752, ret: Unit, inner_ret: Some(Unit) }, mutable: true }) -> Externref`.
            const ret = makeMutClosure(arg0, arg1, wasm_bindgen_be273b461b6f50be___convert__closures_____invoke___wasm_bindgen_be273b461b6f50be___JsValue______true__50);
            return ret;
        },
        __wbindgen_generic_000000000000000f: function(arg0, arg1) {
            // Cast intrinsic for `Closure(Closure { owned: true, function: Function { arguments: [NamedExternref("any")], shim_idx: 34061, ret: Result(Unit), inner_ret: Some(Result(Unit)) }, mutable: true }) -> Externref`.
            const ret = makeMutClosure(arg0, arg1, wasm_bindgen_be273b461b6f50be___convert__closures_____invoke___wasm_bindgen_be273b461b6f50be___sys__JsNullable_wgpu_b601947fcaaf1663___backend__webgpu__webgpu_sys__gen_GpuError__GpuError___core_d941ad8722425d2e___result__Result_____wasm_bindgen_be273b461b6f50be___JsError___true__51);
            return ret;
        },
        __wbindgen_generic_0000000000000010: function(arg0, arg1) {
            // Cast intrinsic for `Closure(Closure { owned: true, function: Function { arguments: [NamedExternref("undefined")], shim_idx: 34061, ret: Result(Unit), inner_ret: Some(Result(Unit)) }, mutable: true }) -> Externref`.
            const ret = makeMutClosure(arg0, arg1, wasm_bindgen_be273b461b6f50be___convert__closures_____invoke___wasm_bindgen_be273b461b6f50be___sys__JsNullable_wgpu_b601947fcaaf1663___backend__webgpu__webgpu_sys__gen_GpuError__GpuError___core_d941ad8722425d2e___result__Result_____wasm_bindgen_be273b461b6f50be___JsError___true__52);
            return ret;
        },
        __wbindgen_generic_0000000000000011: function(arg0, arg1) {
            // Cast intrinsic for `Closure(Closure { owned: true, function: Function { arguments: [], shim_idx: 9751, ret: Unit, inner_ret: Some(Unit) }, mutable: true }) -> Externref`.
            const ret = makeMutClosure(arg0, arg1, wasm_bindgen_be273b461b6f50be___convert__closures_____invoke_______true_);
            return ret;
        },
        __wbindgen_generic_0000000000000012: function(arg0) {
            // Cast intrinsic for `F64 -> Externref`.
            const ret = arg0;
            return ret;
        },
        __wbindgen_generic_0000000000000013: function(arg0, arg1) {
            // Cast intrinsic for `Ref(Slice(U8)) -> NamedExternref("Uint8Array")`.
            const ret = getArrayU8FromWasm0(arg0, arg1);
            return ret;
        },
        __wbindgen_generic_0000000000000014: function(arg0, arg1) {
            // Cast intrinsic for `Ref(String) -> Externref`.
            const ret = getStringFromWasm0(arg0, arg1);
            return ret;
        },
        __wbindgen_init_externref_table: function() {
            const table = wasm.__wbindgen_externrefs;
            table.set(0, undefined);
            table.set(1024, undefined);
            table.set(1025, null);
            table.set(1026, true);
            table.set(1027, false);
        },
    };
    return {
        __proto__: null,
        "./park3d_web_bg.js": import0,
    };
}

function wasm_bindgen_be273b461b6f50be___convert__closures_____invoke_______true_(arg0, arg1) {
    wasm.wasm_bindgen_be273b461b6f50be___convert__closures_____invoke_______true_(arg0, arg1);
}

function wasm_bindgen_be273b461b6f50be___convert__closures_____invoke___wasm_bindgen_be273b461b6f50be___JsValue______true__1_(arg0, arg1, arg2) {
    wasm.wasm_bindgen_be273b461b6f50be___convert__closures_____invoke___wasm_bindgen_be273b461b6f50be___JsValue______true__1_(arg0, arg1, arg2);
}

function wasm_bindgen_be273b461b6f50be___convert__closures_____invoke___wasm_bindgen_be273b461b6f50be___JsValue______true_(arg0, arg1, arg2) {
    wasm.wasm_bindgen_be273b461b6f50be___convert__closures_____invoke___wasm_bindgen_be273b461b6f50be___JsValue______true_(arg0, arg1, arg2);
}

function wasm_bindgen_be273b461b6f50be___convert__closures_____invoke___js_sys_bdfa6a79c5b45de6___Array______true_(arg0, arg1, arg2) {
    wasm.wasm_bindgen_be273b461b6f50be___convert__closures_____invoke___js_sys_bdfa6a79c5b45de6___Array______true_(arg0, arg1, arg2);
}

function wasm_bindgen_be273b461b6f50be___convert__closures_____invoke___wasm_bindgen_be273b461b6f50be___JsValue______true__42(arg0, arg1, arg2) {
    wasm.wasm_bindgen_be273b461b6f50be___convert__closures_____invoke___wasm_bindgen_be273b461b6f50be___JsValue______true__42(arg0, arg1, arg2);
}

function wasm_bindgen_be273b461b6f50be___convert__closures_____invoke___wasm_bindgen_be273b461b6f50be___JsValue______true__43(arg0, arg1, arg2) {
    wasm.wasm_bindgen_be273b461b6f50be___convert__closures_____invoke___wasm_bindgen_be273b461b6f50be___JsValue______true__43(arg0, arg1, arg2);
}

function wasm_bindgen_be273b461b6f50be___convert__closures_____invoke___wgpu_b601947fcaaf1663___backend__webgpu__webgpu_sys__gen_GpuDeviceLostInfo__GpuDeviceLostInfo______true_(arg0, arg1, arg2) {
    wasm.wasm_bindgen_be273b461b6f50be___convert__closures_____invoke___wgpu_b601947fcaaf1663___backend__webgpu__webgpu_sys__gen_GpuDeviceLostInfo__GpuDeviceLostInfo______true_(arg0, arg1, arg2);
}

function wasm_bindgen_be273b461b6f50be___convert__closures_____invoke___wgpu_b601947fcaaf1663___backend__webgpu__webgpu_sys__gen_GpuDeviceLostInfo__GpuDeviceLostInfo______true__46(arg0, arg1, arg2) {
    wasm.wasm_bindgen_be273b461b6f50be___convert__closures_____invoke___wgpu_b601947fcaaf1663___backend__webgpu__webgpu_sys__gen_GpuDeviceLostInfo__GpuDeviceLostInfo______true__46(arg0, arg1, arg2);
}

function wasm_bindgen_be273b461b6f50be___convert__closures_____invoke___wasm_bindgen_be273b461b6f50be___JsValue______true__47(arg0, arg1, arg2) {
    wasm.wasm_bindgen_be273b461b6f50be___convert__closures_____invoke___wasm_bindgen_be273b461b6f50be___JsValue______true__47(arg0, arg1, arg2);
}

function wasm_bindgen_be273b461b6f50be___convert__closures_____invoke___wasm_bindgen_be273b461b6f50be___JsValue______true__48(arg0, arg1, arg2) {
    wasm.wasm_bindgen_be273b461b6f50be___convert__closures_____invoke___wasm_bindgen_be273b461b6f50be___JsValue______true__48(arg0, arg1, arg2);
}

function wasm_bindgen_be273b461b6f50be___convert__closures_____invoke___wasm_bindgen_be273b461b6f50be___JsValue______true__49(arg0, arg1, arg2) {
    wasm.wasm_bindgen_be273b461b6f50be___convert__closures_____invoke___wasm_bindgen_be273b461b6f50be___JsValue______true__49(arg0, arg1, arg2);
}

function wasm_bindgen_be273b461b6f50be___convert__closures_____invoke___wasm_bindgen_be273b461b6f50be___JsValue______true__50(arg0, arg1, arg2) {
    wasm.wasm_bindgen_be273b461b6f50be___convert__closures_____invoke___wasm_bindgen_be273b461b6f50be___JsValue______true__50(arg0, arg1, arg2);
}

function wasm_bindgen_be273b461b6f50be___convert__closures_____invoke___wasm_bindgen_be273b461b6f50be___JsValue__core_d941ad8722425d2e___result__Result_____wasm_bindgen_be273b461b6f50be___JsError___true_(arg0, arg1, arg2) {
    const ret = wasm.wasm_bindgen_be273b461b6f50be___convert__closures_____invoke___wasm_bindgen_be273b461b6f50be___JsValue__core_d941ad8722425d2e___result__Result_____wasm_bindgen_be273b461b6f50be___JsError___true_(arg0, arg1, arg2);
    if (ret[1]) {
        throw takeFromExternrefTable0(ret[0]);
    }
}

function wasm_bindgen_be273b461b6f50be___convert__closures_____invoke___wasm_bindgen_be273b461b6f50be___sys__JsNullable_wgpu_b601947fcaaf1663___backend__webgpu__webgpu_sys__gen_GpuError__GpuError___core_d941ad8722425d2e___result__Result_____wasm_bindgen_be273b461b6f50be___JsError___true_(arg0, arg1, arg2) {
    const ret = wasm.wasm_bindgen_be273b461b6f50be___convert__closures_____invoke___wasm_bindgen_be273b461b6f50be___sys__JsNullable_wgpu_b601947fcaaf1663___backend__webgpu__webgpu_sys__gen_GpuError__GpuError___core_d941ad8722425d2e___result__Result_____wasm_bindgen_be273b461b6f50be___JsError___true_(arg0, arg1, arg2);
    if (ret[1]) {
        throw takeFromExternrefTable0(ret[0]);
    }
}

function wasm_bindgen_be273b461b6f50be___convert__closures_____invoke___wasm_bindgen_be273b461b6f50be___sys__JsNullable_wgpu_b601947fcaaf1663___backend__webgpu__webgpu_sys__gen_GpuError__GpuError___core_d941ad8722425d2e___result__Result_____wasm_bindgen_be273b461b6f50be___JsError___true__51(arg0, arg1, arg2) {
    const ret = wasm.wasm_bindgen_be273b461b6f50be___convert__closures_____invoke___wasm_bindgen_be273b461b6f50be___sys__JsNullable_wgpu_b601947fcaaf1663___backend__webgpu__webgpu_sys__gen_GpuError__GpuError___core_d941ad8722425d2e___result__Result_____wasm_bindgen_be273b461b6f50be___JsError___true__51(arg0, arg1, arg2);
    if (ret[1]) {
        throw takeFromExternrefTable0(ret[0]);
    }
}

function wasm_bindgen_be273b461b6f50be___convert__closures_____invoke___wasm_bindgen_be273b461b6f50be___sys__JsNullable_wgpu_b601947fcaaf1663___backend__webgpu__webgpu_sys__gen_GpuError__GpuError___core_d941ad8722425d2e___result__Result_____wasm_bindgen_be273b461b6f50be___JsError___true__52(arg0, arg1, arg2) {
    const ret = wasm.wasm_bindgen_be273b461b6f50be___convert__closures_____invoke___wasm_bindgen_be273b461b6f50be___sys__JsNullable_wgpu_b601947fcaaf1663___backend__webgpu__webgpu_sys__gen_GpuError__GpuError___core_d941ad8722425d2e___result__Result_____wasm_bindgen_be273b461b6f50be___JsError___true__52(arg0, arg1, arg2);
    if (ret[1]) {
        throw takeFromExternrefTable0(ret[0]);
    }
}

function wasm_bindgen_be273b461b6f50be___convert__closures_____invoke___js_sys_bdfa6a79c5b45de6___Function_fn_wasm_bindgen_be273b461b6f50be___JsValue_____wasm_bindgen_be273b461b6f50be___sys__Undefined___js_sys_bdfa6a79c5b45de6___Function_fn_wasm_bindgen_be273b461b6f50be___JsValue_____wasm_bindgen_be273b461b6f50be___sys__Undefined_______true_(arg0, arg1, arg2, arg3) {
    wasm.wasm_bindgen_be273b461b6f50be___convert__closures_____invoke___js_sys_bdfa6a79c5b45de6___Function_fn_wasm_bindgen_be273b461b6f50be___JsValue_____wasm_bindgen_be273b461b6f50be___sys__Undefined___js_sys_bdfa6a79c5b45de6___Function_fn_wasm_bindgen_be273b461b6f50be___JsValue_____wasm_bindgen_be273b461b6f50be___sys__Undefined_______true_(arg0, arg1, arg2, arg3);
}

function wasm_bindgen_be273b461b6f50be___convert__closures_____invoke___js_sys_bdfa6a79c5b45de6___Array__web_sys_9a9eeb5a97ae25e9___features__gen_ResizeObserver__ResizeObserver______true_(arg0, arg1, arg2, arg3) {
    wasm.wasm_bindgen_be273b461b6f50be___convert__closures_____invoke___js_sys_bdfa6a79c5b45de6___Array__web_sys_9a9eeb5a97ae25e9___features__gen_ResizeObserver__ResizeObserver______true_(arg0, arg1, arg2, arg3);
}


const __wbindgen_enum_GpuAddressMode = ["clamp-to-edge", "repeat", "mirror-repeat"];


const __wbindgen_enum_GpuAutoLayoutMode = ["auto"];


const __wbindgen_enum_GpuBlendFactor = ["zero", "one", "src", "one-minus-src", "src-alpha", "one-minus-src-alpha", "dst", "one-minus-dst", "dst-alpha", "one-minus-dst-alpha", "src-alpha-saturated", "constant", "one-minus-constant", "src1", "one-minus-src1", "src1-alpha", "one-minus-src1-alpha"];


const __wbindgen_enum_GpuBlendOperation = ["add", "subtract", "reverse-subtract", "min", "max"];


const __wbindgen_enum_GpuBufferBindingType = ["uniform", "storage", "read-only-storage"];


const __wbindgen_enum_GpuCanvasAlphaMode = ["opaque", "premultiplied"];


const __wbindgen_enum_GpuCanvasToneMappingMode = ["standard", "extended"];


const __wbindgen_enum_GpuCompareFunction = ["never", "less", "equal", "less-equal", "greater", "not-equal", "greater-equal", "always"];


const __wbindgen_enum_GpuCullMode = ["none", "front", "back"];


const __wbindgen_enum_GpuDeviceLostReason = ["unknown", "destroyed"];


const __wbindgen_enum_GpuErrorFilter = ["validation", "out-of-memory", "internal"];


const __wbindgen_enum_GpuFilterMode = ["nearest", "linear"];


const __wbindgen_enum_GpuFrontFace = ["ccw", "cw"];


const __wbindgen_enum_GpuIndexFormat = ["uint16", "uint32"];


const __wbindgen_enum_GpuLoadOp = ["load", "clear"];


const __wbindgen_enum_GpuMipmapFilterMode = ["nearest", "linear"];


const __wbindgen_enum_GpuPowerPreference = ["low-power", "high-performance"];


const __wbindgen_enum_GpuPrimitiveTopology = ["point-list", "line-list", "line-strip", "triangle-list", "triangle-strip"];


const __wbindgen_enum_GpuQueryType = ["occlusion", "timestamp"];


const __wbindgen_enum_GpuSamplerBindingType = ["filtering", "non-filtering", "comparison"];


const __wbindgen_enum_GpuStencilOperation = ["keep", "zero", "replace", "invert", "increment-clamp", "decrement-clamp", "increment-wrap", "decrement-wrap"];


const __wbindgen_enum_GpuStorageTextureAccess = ["write-only", "read-only", "read-write"];


const __wbindgen_enum_GpuStoreOp = ["store", "discard"];


const __wbindgen_enum_GpuTextureAspect = ["all", "stencil-only", "depth-only"];


const __wbindgen_enum_GpuTextureDimension = ["1d", "2d", "3d"];


const __wbindgen_enum_GpuTextureFormat = ["r8unorm", "r8snorm", "r8uint", "r8sint", "r16unorm", "r16snorm", "r16uint", "r16sint", "r16float", "rg8unorm", "rg8snorm", "rg8uint", "rg8sint", "r32uint", "r32sint", "r32float", "rg16unorm", "rg16snorm", "rg16uint", "rg16sint", "rg16float", "rgba8unorm", "rgba8unorm-srgb", "rgba8snorm", "rgba8uint", "rgba8sint", "bgra8unorm", "bgra8unorm-srgb", "rgb9e5ufloat", "rgb10a2uint", "rgb10a2unorm", "rg11b10ufloat", "rg32uint", "rg32sint", "rg32float", "rgba16unorm", "rgba16snorm", "rgba16uint", "rgba16sint", "rgba16float", "rgba32uint", "rgba32sint", "rgba32float", "stencil8", "depth16unorm", "depth24plus", "depth24plus-stencil8", "depth32float", "depth32float-stencil8", "bc1-rgba-unorm", "bc1-rgba-unorm-srgb", "bc2-rgba-unorm", "bc2-rgba-unorm-srgb", "bc3-rgba-unorm", "bc3-rgba-unorm-srgb", "bc4-r-unorm", "bc4-r-snorm", "bc5-rg-unorm", "bc5-rg-snorm", "bc6h-rgb-ufloat", "bc6h-rgb-float", "bc7-rgba-unorm", "bc7-rgba-unorm-srgb", "etc2-rgb8unorm", "etc2-rgb8unorm-srgb", "etc2-rgb8a1unorm", "etc2-rgb8a1unorm-srgb", "etc2-rgba8unorm", "etc2-rgba8unorm-srgb", "eac-r11unorm", "eac-r11snorm", "eac-rg11unorm", "eac-rg11snorm", "astc-4x4-unorm", "astc-4x4-unorm-srgb", "astc-5x4-unorm", "astc-5x4-unorm-srgb", "astc-5x5-unorm", "astc-5x5-unorm-srgb", "astc-6x5-unorm", "astc-6x5-unorm-srgb", "astc-6x6-unorm", "astc-6x6-unorm-srgb", "astc-8x5-unorm", "astc-8x5-unorm-srgb", "astc-8x6-unorm", "astc-8x6-unorm-srgb", "astc-8x8-unorm", "astc-8x8-unorm-srgb", "astc-10x5-unorm", "astc-10x5-unorm-srgb", "astc-10x6-unorm", "astc-10x6-unorm-srgb", "astc-10x8-unorm", "astc-10x8-unorm-srgb", "astc-10x10-unorm", "astc-10x10-unorm-srgb", "astc-12x10-unorm", "astc-12x10-unorm-srgb", "astc-12x12-unorm", "astc-12x12-unorm-srgb"];


const __wbindgen_enum_GpuTextureSampleType = ["float", "unfilterable-float", "depth", "sint", "uint"];


const __wbindgen_enum_GpuTextureViewDimension = ["1d", "2d", "2d-array", "cube", "cube-array", "3d"];


const __wbindgen_enum_GpuVertexFormat = ["uint8", "uint8x2", "uint8x4", "sint8", "sint8x2", "sint8x4", "unorm8", "unorm8x2", "unorm8x4", "snorm8", "snorm8x2", "snorm8x4", "uint16", "uint16x2", "uint16x4", "sint16", "sint16x2", "sint16x4", "unorm16", "unorm16x2", "unorm16x4", "snorm16", "snorm16x2", "snorm16x4", "float16", "float16x2", "float16x4", "float32", "float32x2", "float32x3", "float32x4", "uint32", "uint32x2", "uint32x3", "uint32x4", "sint32", "sint32x2", "sint32x3", "sint32x4", "unorm10-10-10-2", "unorm8x4-bgra"];


const __wbindgen_enum_GpuVertexStepMode = ["vertex", "instance"];


const __wbindgen_enum_ResizeObserverBoxOptions = ["border-box", "content-box", "device-pixel-content-box"];


const __wbindgen_enum_VisibilityState = ["hidden", "visible"];
const ParkFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_park_free(ptr, 1));

function addToExternrefTable0(obj) {
    const idx = wasm.__externref_table_alloc();
    wasm.__wbindgen_externrefs.set(idx, obj);
    return idx;
}

const CLOSURE_DTORS = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(state => wasm.__wbindgen_destroy_closure(state.a, state.b));

function debugString(val) {
    switch (typeof val) {
        // primitive types
        case 'number':
        case 'boolean':
        case 'undefined':
        return `${val}`;
        case 'string':
        return JSON.stringify(val);
        case 'bigint':
        return `${val}n`;
        case 'symbol':
        return val.description !== undefined
            ? `Symbol(${val.description})`
            : 'Symbol';
        case 'function':
        return typeof val.name === 'string' && val.name !== ''
            ? `Function(${val.name})`
            : 'Function';
        case 'object': {
            if (val === null) {
                return 'null';
            }
            // objects
            if (Array.isArray(val)) {
                return '[' + Array.from(val, debugString).join(', ') + ']';
            }
            // errors
            if (val instanceof Error) {
                return `${val.name}: ${val.message}\n${val.stack}`;
            }

            const toStringOutput = toString.call(val);
            // Test for built-in
            const className = /\[object ([^\]]+)\]/.exec(toStringOutput)?.[1];

            // Failed to match the standard '[object ClassName]'
            if (className === undefined) {
                return toStringOutput;
            }
            if (className === 'Object') {
                // we're a user defined class or Object
                // JSON.stringify avoids problems with cycles, and is generally much
                // easier than looping through ownProperties of `val`.
                try {
                    return 'Object(' + JSON.stringify(val) + ')';
                } catch (_) {
                    return 'Object';
                }
            }
            // TODO we could test for more things here, like `Set`s and `Map`s.
            return className;
        }
        // Per MDN: 'This list of values is exhaustive.'
        // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/typeof#description
    }
}

function getArrayJsValueViewFromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    const mem = getDataViewMemory0();
    const result = [];
    for (let i = ptr; i < ptr + 4 * len; i += 4) {
        result.push(wasm.__wbindgen_externrefs.get(mem.getUint32(i, true)));
    }
    return result;
}

function getArrayU32FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint32ArrayMemory0().subarray(ptr / 4, ptr / 4 + len);
}

function getArrayU8FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
}

let cachedDataViewMemory0 = null;
function getDataViewMemory0() {
    if (cachedDataViewMemory0 === null || cachedDataViewMemory0.buffer.detached === true || (cachedDataViewMemory0.buffer.detached === undefined && cachedDataViewMemory0.buffer !== wasm.memory.buffer)) {
        cachedDataViewMemory0 = new DataView(wasm.memory.buffer);
    }
    return cachedDataViewMemory0;
}

function getStringFromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return decodeText(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

let cachedUint32ArrayMemory0 = null;
function getUint32ArrayMemory0() {
    if (cachedUint32ArrayMemory0 === null || cachedUint32ArrayMemory0.byteLength === 0) {
        cachedUint32ArrayMemory0 = new Uint32Array(wasm.memory.buffer);
    }
    return cachedUint32ArrayMemory0;
}

let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function handleError(f, args) {
    try {
        return f.apply(this, args);
    } catch (e) {
        const idx = addToExternrefTable0(e);
        wasm.__wbindgen_exn_store(idx);
    }
}

function isLikeNone(x) {
    return x === undefined || x === null;
}

function makeMutClosure(arg0, arg1, f) {
    const state = { a: arg0, b: arg1, cnt: 1 };
    const real = (...args) => {

        // First up with a closure we increment the internal reference
        // count. This ensures that the Rust closure environment won't
        // be deallocated while we're invoking it.
        state.cnt++;
        const a = state.a;
        state.a = 0;
        try {
            return f(a, state.b, ...args);
        } finally {
            state.a = a;
            real._wbg_cb_unref();
        }
    };
    real._wbg_cb_unref = () => {
        if (--state.cnt === 0) {
            wasm.__wbindgen_destroy_closure(state.a, state.b);
            state.a = 0;
            CLOSURE_DTORS.unregister(state);
        }
    };
    CLOSURE_DTORS.register(real, state, state);
    return real;
}

function passStringToWasm0(arg, malloc, realloc) {
    if (realloc === undefined) {
        const buf = cachedTextEncoder.encode(arg);
        const ptr = malloc(buf.length, 1) >>> 0;
        getUint8ArrayMemory0().subarray(ptr, ptr + buf.length).set(buf);
        WASM_VECTOR_LEN = buf.length;
        return ptr;
    }

    let len = arg.length;
    let ptr = malloc(len, 1) >>> 0;

    const mem = getUint8ArrayMemory0();

    let offset = 0;

    for (; offset < len; offset++) {
        const code = arg.charCodeAt(offset);
        if (code > 0x7F) break;
        mem[ptr + offset] = code;
    }
    if (offset !== len) {
        if (offset !== 0) {
            arg = arg.slice(offset);
        }
        ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
        const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
        const ret = cachedTextEncoder.encodeInto(arg, view);

        offset += ret.written;
        ptr = realloc(ptr, len, offset, 1) >>> 0;
    }

    WASM_VECTOR_LEN = offset;
    return ptr;
}

function takeFromExternrefTable0(idx) {
    const value = wasm.__wbindgen_externrefs.get(idx);
    wasm.__externref_table_dealloc(idx);
    return value;
}

let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true });
cachedTextDecoder.decode();
const MAX_SAFARI_DECODE_BYTES = 2146435072;
let numBytesDecoded = 0;
function decodeText(bytes) {
    numBytesDecoded += bytes.length;
    if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
        cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true });
        cachedTextDecoder.decode();
        numBytesDecoded = bytes.length;
    }
    return cachedTextDecoder.decode(bytes);
}

const cachedTextEncoder = new TextEncoder();

if (!('encodeInto' in cachedTextEncoder)) {
    cachedTextEncoder.encodeInto = function (arg, view) {
        const buf = cachedTextEncoder.encode(arg);
        view.set(buf);
        return {
            read: arg.length,
            written: buf.length
        };
    };
}

let WASM_VECTOR_LEN = 0;

let wasmModule, wasmInstance, wasm;
function __wbg_finalize_init(instance, module) {
    wasmInstance = instance;
    wasm = instance.exports;
    wasmModule = module;
    cachedDataViewMemory0 = null;
    cachedUint32ArrayMemory0 = null;
    cachedUint8ArrayMemory0 = null;
    wasm.__wbindgen_start();
    return wasm;
}

async function __wbg_load(module, imports) {
    if (typeof Response === 'function' && module instanceof Response) {
        if (!module.ok) {
            throw new Error(`failed to fetch Wasm: ${module.status} ${module.statusText} fetching '${module.url}'`);
        }

        if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
                return await WebAssembly.instantiateStreaming(module, imports);
            } catch (e) {
                const validResponse = expectedResponseType(module.type);

                if (validResponse && module.headers.get('Content-Type') !== 'application/wasm') {
                    console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                } else { throw e; }
            }
        }

        const bytes = await module.arrayBuffer();
        return await WebAssembly.instantiate(bytes, imports);
    } else {
        const instance = await WebAssembly.instantiate(module, imports);

        if (instance instanceof WebAssembly.Instance) {
            return { instance, module };
        } else {
            return instance;
        }
    }

    function expectedResponseType(type) {
        switch (type) {
            case 'basic': case 'cors': case 'default': return true;
        }
        return false;
    }
}

function initSync(module) {
    if (wasm !== undefined) return wasm;


    if (module !== undefined) {
        if (Object.getPrototypeOf(module) === Object.prototype) {
            ({module} = module)
        } else {
            console.warn('using deprecated parameters for `initSync()`; pass a single object instead')
        }
    }

    const imports = __wbg_get_imports();
    if (!(module instanceof WebAssembly.Module)) {
        module = new WebAssembly.Module(module);
    }
    const instance = new WebAssembly.Instance(module, imports);
    return __wbg_finalize_init(instance, module);
}

let __wbg_init_promise;
async function __wbg_init(module_or_path) {
    if (wasm !== undefined) return wasm;
    if (__wbg_init_promise === undefined) {
        __wbg_init_promise = __wbg_init_once(module_or_path);
        __wbg_init_promise.catch(() => { __wbg_init_promise = undefined; });
    }
    return __wbg_init_promise;
}

async function __wbg_init_once(module_or_path) {

    if (module_or_path !== undefined) {
        if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
            ({module_or_path} = module_or_path)
        } else {
            console.warn('using deprecated parameters for the initialization function; pass a single object instead')
        }
    }

    if (module_or_path === undefined) {
        module_or_path = new URL('park3d_web_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync, __wbg_init as default };
