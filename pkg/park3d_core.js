/* @ts-self-types="./park3d_core.d.ts" */

/**
 * El marco de una pista (`slopeFrame`), armado una vez: las medidas en JSON y el perfil sin volver a leer la pista
 * en cada llamada. Lo libera el `FinalizationRegistry` de wasm-bindgen cuando JS suelta el objeto.
 */
export class SlopeFrameHandle {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        SlopeFrameHandleFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_slopeframehandle_free(ptr, 0);
    }
    /**
     * Las medidas (`SlopeFrameData`) en JSON.
     * @returns {string}
     */
    dataJson() {
        let deferred2_0;
        let deferred2_1;
        try {
            const ret = wasm.slopeframehandle_dataJson(this.__wbg_ptr);
            var ptr1 = ret[0];
            var len1 = ret[1];
            if (ret[3]) {
                ptr1 = 0; len1 = 0;
                throw takeFromExternrefTable0(ret[2]);
            }
            deferred2_0 = ptr1;
            deferred2_1 = len1;
            return getStringFromWasm0(ptr1, len1);
        } finally {
            wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
        }
    }
    /**
     * Arma el marco de la pista en JSON (`slope` del layout).
     * @param {string} slope
     */
    constructor(slope) {
        const ptr0 = passStringToWasm0(slope, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.slopeframehandle_new(ptr0, len0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        this.__wbg_ptr = ret[0];
        SlopeFrameHandleFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * `S.profile(sa, lane)`: la cota de la superficie de la línea `lane` (1…lanes).
     * @param {number} sa
     * @param {number} lane
     * @returns {number}
     */
    profile(sa, lane) {
        const ret = wasm.slopeframehandle_profile(this.__wbg_ptr, sa, lane);
        return ret;
    }
    /**
     * `S.surfaceAt(sa, u)`: la cota de lo que se pisa en `(sa, u)`.
     * @param {number} sa
     * @param {number} u
     * @returns {number}
     */
    surfaceAt(sa, u) {
        const ret = wasm.slopeframehandle_surfaceAt(this.__wbg_ptr, sa, u);
        return ret;
    }
    /**
     * `S.toLocal(x, z)` → `[sa, u]`.
     * @param {number} x
     * @param {number} z
     * @returns {Float64Array}
     */
    toLocal(x, z) {
        const ret = wasm.slopeframehandle_toLocal(this.__wbg_ptr, x, z);
        var v1 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v1;
    }
    /**
     * `S.toWorld(sa, u)` → `[x, z]`.
     * @param {number} sa
     * @param {number} u
     * @returns {Float64Array}
     */
    toWorld(sa, u) {
        const ret = wasm.slopeframehandle_toWorld(this.__wbg_ptr, sa, u);
        var v1 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v1;
    }
    /**
     * `S.wallAt(k)`: la holgura de más en el borde `k` donde hay un muro de ola (0 si no hay).
     * @param {number} k
     * @returns {number}
     */
    wallAt(k) {
        const ret = wasm.slopeframehandle_wallAt(this.__wbg_ptr, k);
        return ret;
    }
}
if (Symbol.dispose) SlopeFrameHandle.prototype[Symbol.dispose] = SlopeFrameHandle.prototype.free;

/**
 * `exact` de la sesión del editor en tiempo real (`createAutoLayoutSession`, docs/TIEMPO-REAL.md): `autoLayout` sobre
 * la nave en JSON sin medir lo que se camina del park armado (`result`: el de `autoLayout` sin park3d-walk) y el camino
 * del programa que ganó, para el park provisional de las ediciones siguientes; `AutoLayoutExact` en JSON.
 *
 * Con `walk`, midiendo lo que se camina como `autoLayout`: `result` es el texto de `autoLayoutJson` tal cual.
 * @param {string} nave
 * @param {string} options
 * @param {boolean} walk
 * @returns {string}
 */
export function autoLayoutExactJson(nave, options, walk) {
    let deferred5_0;
    let deferred5_1;
    try {
        const val3 = +walk;
        let ptr0, len0, ptr1, len1;
        try {
            ptr0 = passStringToWasm0(nave, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            len0 = WASM_VECTOR_LEN;
            ptr1 = passStringToWasm0(options, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            len1 = WASM_VECTOR_LEN;
        } catch (e) {
            if (ptr1) { wasm.__wbindgen_free(ptr1, len1 * 1, 1); }
            if (ptr0) { wasm.__wbindgen_free(ptr0, len0 * 1, 1); }
            throw e;
        }
        const ret = wasm.autoLayoutExactJson(ptr0, len0, ptr1, len1, val3);
        var ptr4 = ret[0];
        var len4 = ret[1];
        if (ret[3]) {
            ptr4 = 0; len4 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred5_0 = ptr4;
        deferred5_1 = len4;
        return getStringFromWasm0(ptr4, len4);
    } finally {
        wasm.__wbindgen_free(deferred5_0, deferred5_1, 1);
    }
}

/**
 * E en paralelo: los programas pedidos (`jobs`, lo que da el coordinador), armados en este worker, en JSON (o
 * `{"fallback": motivo}`). No lanza.
 * @param {string} nave
 * @param {string} options
 * @param {string} jobs
 * @returns {string}
 */
export function autoLayoutFanoutJobsJson(nave, options, jobs) {
    let deferred4_0;
    let deferred4_1;
    try {
        let ptr0, len0, ptr1, len1, ptr2, len2;
        try {
            ptr0 = passStringToWasm0(nave, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            len0 = WASM_VECTOR_LEN;
            ptr1 = passStringToWasm0(options, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            len1 = WASM_VECTOR_LEN;
            ptr2 = passStringToWasm0(jobs, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            len2 = WASM_VECTOR_LEN;
        } catch (e) {
            if (ptr2) { wasm.__wbindgen_free(ptr2, len2 * 1, 1); }
            if (ptr1) { wasm.__wbindgen_free(ptr1, len1 * 1, 1); }
            if (ptr0) { wasm.__wbindgen_free(ptr0, len0 * 1, 1); }
            throw e;
        }
        const ret = wasm.autoLayoutFanoutJobsJson(ptr0, len0, ptr1, len1, ptr2, len2);
        deferred4_0 = ret[0];
        deferred4_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred4_0, deferred4_1, 1);
    }
}

/**
 * E en paralelo (`autolayout::fanout`, docs/TIEMPO-REAL.md): la parte `part` de `parts` de los candidatos de pista de
 * la nave, en JSON (o `{"fallback": motivo}`). No lanza.
 * @param {string} nave
 * @param {string} options
 * @param {number} part
 * @param {number} parts
 * @returns {string}
 */
export function autoLayoutFanoutPlansJson(nave, options, part, parts) {
    let deferred5_0;
    let deferred5_1;
    try {
        const val3 = +part;
        const val4 = +parts;
        let ptr0, len0, ptr1, len1;
        try {
            ptr0 = passStringToWasm0(nave, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            len0 = WASM_VECTOR_LEN;
            ptr1 = passStringToWasm0(options, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            len1 = WASM_VECTOR_LEN;
        } catch (e) {
            if (ptr1) { wasm.__wbindgen_free(ptr1, len1 * 1, 1); }
            if (ptr0) { wasm.__wbindgen_free(ptr0, len0 * 1, 1); }
            throw e;
        }
        const ret = wasm.autoLayoutFanoutPlansJson(ptr0, len0, ptr1, len1, val3, val4);
        deferred5_0 = ret[0];
        deferred5_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred5_0, deferred5_1, 1);
    }
}

/**
 * E en paralelo, el coordinador: con las partes (`parts`, la lista JSON de lo que dieron; `[]` después de la primera
 * ronda) y lo armado hasta ahora (`done`), los programas que faltan (`{"jobs":…}`), la clave del ganador
 * (`{"winner":…}`: se vuelve a llamar con `winner` = la clave, un salto de línea y el layout que dio su worker, o
 * `rebuild`), el exacto (`{"exact":…}`, el texto de `autoLayoutExactJson`) o `{"fallback": motivo}`. `workers`:
 * cuántos workers arman (con menos pedidos, pide además lo que quizás haga falta). No lanza.
 * @param {string} nave
 * @param {string} options
 * @param {string} parts
 * @param {string} done
 * @param {number} workers
 * @param {string} winner
 * @returns {string}
 */
export function autoLayoutFanoutStepJson(nave, options, parts, done, workers, winner) {
    let deferred7_0;
    let deferred7_1;
    try {
        const val6 = +workers;
        let ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3, ptr4, len4;
        try {
            ptr0 = passStringToWasm0(nave, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            len0 = WASM_VECTOR_LEN;
            ptr1 = passStringToWasm0(options, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            len1 = WASM_VECTOR_LEN;
            ptr2 = passStringToWasm0(parts, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            len2 = WASM_VECTOR_LEN;
            ptr3 = passStringToWasm0(done, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            len3 = WASM_VECTOR_LEN;
            ptr4 = passStringToWasm0(winner, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            len4 = WASM_VECTOR_LEN;
        } catch (e) {
            if (ptr4) { wasm.__wbindgen_free(ptr4, len4 * 1, 1); }
            if (ptr3) { wasm.__wbindgen_free(ptr3, len3 * 1, 1); }
            if (ptr2) { wasm.__wbindgen_free(ptr2, len2 * 1, 1); }
            if (ptr1) { wasm.__wbindgen_free(ptr1, len1 * 1, 1); }
            if (ptr0) { wasm.__wbindgen_free(ptr0, len0 * 1, 1); }
            throw e;
        }
        const ret = wasm.autoLayoutFanoutStepJson(ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3, val6, ptr4, len4);
        deferred7_0 = ret[0];
        deferred7_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred7_0, deferred7_1, 1);
    }
}

/**
 * `finish` de la sesión del editor: lo que `autoLayout` hace después de armar el park (medirlo con park3d-walk y lo que
 * sale de eso), sobre un exacto de la misma nave (`exact`: `{ key, order, ownIssues, layout }` en JSON), con el informe
 * de la medición (`walk`, el de `walkabilityReportJson` del layout final), en JSON.
 * @param {string} nave
 * @param {string} options
 * @param {string} exact
 * @returns {string}
 */
export function autoLayoutFinishJson(nave, options, exact) {
    let deferred5_0;
    let deferred5_1;
    try {
        let ptr0, len0, ptr1, len1, ptr2, len2;
        try {
            ptr0 = passStringToWasm0(nave, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            len0 = WASM_VECTOR_LEN;
            ptr1 = passStringToWasm0(options, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            len1 = WASM_VECTOR_LEN;
            ptr2 = passStringToWasm0(exact, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            len2 = WASM_VECTOR_LEN;
        } catch (e) {
            if (ptr2) { wasm.__wbindgen_free(ptr2, len2 * 1, 1); }
            if (ptr1) { wasm.__wbindgen_free(ptr1, len1 * 1, 1); }
            if (ptr0) { wasm.__wbindgen_free(ptr0, len0 * 1, 1); }
            throw e;
        }
        const ret = wasm.autoLayoutFinishJson(ptr0, len0, ptr1, len1, ptr2, len2);
        var ptr4 = ret[0];
        var len4 = ret[1];
        if (ret[3]) {
            ptr4 = 0; len4 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred5_0 = ptr4;
        deferred5_1 = len4;
        return getStringFromWasm0(ptr4, len4);
    } finally {
        wasm.__wbindgen_free(deferred5_0, deferred5_1, 1);
    }
}

/**
 * `autoLayout` sobre una nave en JSON (y sus opciones en JSON, `""` = ninguna); devuelve
 * `{ layout, issues }` en JSON.
 * @param {string} nave
 * @param {string} options
 * @returns {string}
 */
export function autoLayoutJson(nave, options) {
    let deferred4_0;
    let deferred4_1;
    try {
        let ptr0, len0, ptr1, len1;
        try {
            ptr0 = passStringToWasm0(nave, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            len0 = WASM_VECTOR_LEN;
            ptr1 = passStringToWasm0(options, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            len1 = WASM_VECTOR_LEN;
        } catch (e) {
            if (ptr1) { wasm.__wbindgen_free(ptr1, len1 * 1, 1); }
            if (ptr0) { wasm.__wbindgen_free(ptr0, len0 * 1, 1); }
            throw e;
        }
        const ret = wasm.autoLayoutJson(ptr0, len0, ptr1, len1);
        var ptr3 = ret[0];
        var len3 = ret[1];
        if (ret[3]) {
            ptr3 = 0; len3 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred4_0 = ptr3;
        deferred4_1 = len3;
        return getStringFromWasm0(ptr3, len3);
    } finally {
        wasm.__wbindgen_free(deferred4_0, deferred4_1, 1);
    }
}

/**
 * `provisional` de la sesión del editor: el park provisional de la nave en JSON con el camino (`hint`, en JSON) de un
 * exacto, armando hasta `packs` programas y probando hasta `max_steps` pasos (0: todos); `AutoLayoutProvisional` en
 * JSON. No lanza: una nave que no se puede armar va en `error`.
 * @param {string} nave
 * @param {string} options
 * @param {string} hint
 * @param {number} packs
 * @param {number} max_steps
 * @returns {string}
 */
export function autoLayoutProvisionalJson(nave, options, hint, packs, max_steps) {
    let deferred6_0;
    let deferred6_1;
    try {
        const val4 = +packs;
        const val5 = +max_steps;
        let ptr0, len0, ptr1, len1, ptr2, len2;
        try {
            ptr0 = passStringToWasm0(nave, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            len0 = WASM_VECTOR_LEN;
            ptr1 = passStringToWasm0(options, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            len1 = WASM_VECTOR_LEN;
            ptr2 = passStringToWasm0(hint, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            len2 = WASM_VECTOR_LEN;
        } catch (e) {
            if (ptr2) { wasm.__wbindgen_free(ptr2, len2 * 1, 1); }
            if (ptr1) { wasm.__wbindgen_free(ptr1, len1 * 1, 1); }
            if (ptr0) { wasm.__wbindgen_free(ptr0, len0 * 1, 1); }
            throw e;
        }
        const ret = wasm.autoLayoutProvisionalJson(ptr0, len0, ptr1, len1, ptr2, len2, val4, val5);
        deferred6_0 = ret[0];
        deferred6_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred6_0, deferred6_1, 1);
    }
}

/**
 * `edgeFrame(outline, k)` sobre el contorno plano (`outline.flat()`): `[Ax, Az, Bx, Bz, len, dirX, dirZ, nInX, nInZ]`.
 * @param {Float64Array | number[]} outline
 * @param {number} k
 * @returns {Float64Array}
 */
export function edgeFrameFlat(outline, k) {
    const val2 = +k;
    const ptr0 = passArrayF64ToWasm0(outline, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.edgeFrameFlat(ptr0, len0, val2);
    if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
    }
    var v3 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
    return v3;
}

/**
 * `evacuationWalk` sobre un layout en JSON: `{ d, at }` (el recorrido más largo hasta una salida, en m, y desde
 * dónde) o `null` sin salidas utilizables, en JSON.
 * @param {string} json
 * @returns {string}
 */
export function evacuationWalkJson(json) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.evacuationWalkJson(ptr0, len0);
        var ptr2 = ret[0];
        var len2 = ret[1];
        if (ret[3]) {
            ptr2 = 0; len2 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred3_0 = ptr2;
        deferred3_1 = len2;
        return getStringFromWasm0(ptr2, len2);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}

/**
 * `insidePoly(outline, x, z)` sobre el contorno plano (`outline.flat()`).
 * @param {Float64Array | number[]} outline
 * @param {number} x
 * @param {number} z
 * @returns {boolean}
 */
export function insidePolyFlat(outline, x, z) {
    const val2 = +x;
    const val3 = +z;
    const ptr0 = passArrayF64ToWasm0(outline, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.insidePolyFlat(ptr0, len0, val2, val3);
    return ret !== 0;
}

/**
 * `layoutIssues` sobre un layout en JSON: los errores y avisos de `validateLayout`, de `programChecks` y de la
 * circulación sobre la escena armada, en una lista `[{ level, message }]` en JSON, errores primero.
 * @param {string} json
 * @returns {string}
 */
export function layoutIssuesJson(json) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.layoutIssuesJson(ptr0, len0);
        var ptr2 = ret[0];
        var len2 = ret[1];
        if (ret[3]) {
            ptr2 = 0; len2 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred3_0 = ptr2;
        deferred3_1 = len2;
        return getStringFromWasm0(ptr2, len2);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}

/**
 * `maxPlatformHeight`: la plataforma más alta para una altura libre (PROGRAMA §1), en m; 0 si no entra ninguna.
 * @param {number} clear_height
 * @returns {number}
 */
export function maxPlatformHeight(clear_height) {
    const ret = wasm.maxPlatformHeight(clear_height);
    return ret;
}

/**
 * `planSVG` sobre un layout (o una nave) en JSON: el plano acotado como texto SVG, de `width` píxeles de ancho
 * máximo.
 * @param {string} layout
 * @param {number} width
 * @returns {string}
 */
export function planSvgJson(layout, width) {
    let deferred4_0;
    let deferred4_1;
    try {
        const val2 = +width;
        const ptr0 = passStringToWasm0(layout, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.planSvgJson(ptr0, len0, val2);
        var ptr3 = ret[0];
        var len3 = ret[1];
        if (ret[3]) {
            ptr3 = 0; len3 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred4_0 = ptr3;
        deferred4_1 = len3;
        return getStringFromWasm0(ptr3, len3);
    } finally {
        wasm.__wbindgen_free(deferred4_0, deferred4_1, 1);
    }
}

/**
 * `preconditionErrors` sobre un layout en JSON: por qué no se lo puede recorrer (vacío si se puede), en JSON.
 * @param {string} json
 * @returns {string}
 */
export function preconditionErrorsJson(json) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.preconditionErrorsJson(ptr0, len0);
        var ptr2 = ret[0];
        var len2 = ret[1];
        if (ret[3]) {
            ptr2 = 0; len2 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred3_0 = ptr2;
        deferred3_1 = len2;
        return getStringFromWasm0(ptr2, len2);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}

/**
 * `programChecks` sobre un layout en JSON (lo que validate.py no mira: áreas, pasos de 1,2 m, evacuación real,
 * extintores, BIE); devuelve `{ errors, warnings, info }` en JSON.
 * @param {string} json
 * @returns {string}
 */
export function programChecksJson(json) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.programChecksJson(ptr0, len0);
        var ptr2 = ret[0];
        var len2 = ret[1];
        if (ret[3]) {
            ptr2 = 0; len2 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred3_0 = ptr2;
        deferred3_1 = len2;
        return getStringFromWasm0(ptr2, len2);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}

/**
 * Las constantes del programa (`ProgramConstants`: `SLOPE`, `SAFETY`, `STAIRS`, `PROGRAM`… de `src/program.ts`), en
 * JSON.
 * @returns {string}
 */
export function programJson() {
    let deferred2_0;
    let deferred2_1;
    try {
        const ret = wasm.programJson();
        var ptr1 = ret[0];
        var len1 = ret[1];
        if (ret[3]) {
            ptr1 = 0; len1 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred2_0 = ptr1;
        deferred2_1 = len1;
        return getStringFromWasm0(ptr1, len1);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * `roofModel` sobre el `shell` en JSON; devuelve la cubierta en JSON.
 * @param {string} shell
 * @returns {string}
 */
export function roofModelJson(shell) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(shell, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.roofModelJson(ptr0, len0);
        var ptr2 = ret[0];
        var len2 = ret[1];
        if (ret[3]) {
            ptr2 = 0; len2 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred3_0 = ptr2;
        deferred3_1 = len2;
        return getStringFromWasm0(ptr2, len2);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}

/**
 * `validateLayout` sobre un layout en JSON; devuelve `{ errors, warnings, info }` en JSON.
 * @param {string} json
 * @returns {string}
 */
export function validateLayoutJson(json) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.validateLayoutJson(ptr0, len0);
        var ptr2 = ret[0];
        var len2 = ret[1];
        if (ret[3]) {
            ptr2 = 0; len2 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred3_0 = ptr2;
        deferred3_1 = len2;
        return getStringFromWasm0(ptr2, len2);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}

/**
 * Versión del núcleo (la del crate).
 * @returns {string}
 */
export function version() {
    let deferred1_0;
    let deferred1_1;
    try {
        const ret = wasm.version();
        deferred1_0 = ret[0];
        deferred1_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
}

/**
 * `walkabilityReport` sobre un layout en JSON: lo que una persona de verdad camina en la escena armada (park3d-walk),
 * `WalkReport` en JSON. Lanza si el layout no es del esquema (`park3d_model::Layout`).
 * @param {string} json
 * @returns {string}
 */
export function walkabilityReportJson(json) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.walkabilityReportJson(ptr0, len0);
        var ptr2 = ret[0];
        var len2 = ret[1];
        if (ret[3]) {
            ptr2 = 0; len2 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred3_0 = ptr2;
        deferred3_1 = len2;
        return getStringFromWasm0(ptr2, len2);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}
function __wbg_get_imports() {
    const import0 = {
        __proto__: null,
        __wbg_Error_208446807d0d1e30: function(arg0, arg1) {
            const ret = Error(getStringFromWasm0(arg0, arg1));
            return ret;
        },
        __wbg___wbindgen_throw_4c88d8bf264fd984: function(arg0, arg1) {
            throw new Error(getStringFromWasm0(arg0, arg1));
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
        "./park3d_core_bg.js": import0,
    };
}

const SlopeFrameHandleFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_slopeframehandle_free(ptr, 1));

function getArrayF64FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getFloat64ArrayMemory0().subarray(ptr / 8, ptr / 8 + len);
}

let cachedFloat64ArrayMemory0 = null;
function getFloat64ArrayMemory0() {
    if (cachedFloat64ArrayMemory0 === null || cachedFloat64ArrayMemory0.byteLength === 0) {
        cachedFloat64ArrayMemory0 = new Float64Array(wasm.memory.buffer);
    }
    return cachedFloat64ArrayMemory0;
}

function getStringFromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return decodeText(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function passArrayF64ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 8, 8) >>> 0;
    getFloat64ArrayMemory0().set(arg, ptr / 8);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
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
    cachedFloat64ArrayMemory0 = null;
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
        module_or_path = new URL('park3d_core_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync, __wbg_init as default };
