// Un layout entero dentro de la URL, para pasar el park del editor (editor.html) al visor (sim.html) sin servidor y sin
// que la pestaña del editor tenga que seguir abierta: `#layout=<el JSON comprimido con deflate-raw, en base64url>`. Lo
// escribe «Abrir en el visor» (js/editor/park-3d.js) y lo lee js/app.js antes de pedir `data/<id>.json`. Va en el `#`
// (no viaja al servidor): un park del editor (~7 KB de JSON) queda en ~4 KB de URL y el layout de una nave del sitio con
// todas sus notas (~75 KB), en ~35 KB, muy por debajo de lo que acepta Chrome (2 MB). El enlace se puede copiar, guardar
// o mandar. Sin DOM: lo prueban los tests en Node.

/** La clave del `#` de la URL. */
export const HASH_KEY = 'layout';

/** Los bytes en base64url (sin `=`). */
function toBase64url(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** El layout comprimido, como texto para la URL. */
export async function encodeLayout(layout) {
  const stream = new Blob([JSON.stringify(layout)]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return toBase64url(new Uint8Array(await new Response(stream).arrayBuffer()));
}

/** El layout de lo que dio `encodeLayout`. Lanza si el texto no es un layout comprimido (un enlace cortado). */
export async function decodeLayout(text) {
  const b64 = String(text).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return JSON.parse(await new Response(stream).text());
}

/** La promesa del layout de `#layout=…` en `hash` (el `location.hash`), o null si no trae uno. */
export function layoutFromHash(hash) {
  const m = new RegExp(`(?:^#|&)${HASH_KEY}=([A-Za-z0-9_-]+)`).exec(String(hash ?? ''));
  return m ? decodeLayout(m[1]) : null;
}
