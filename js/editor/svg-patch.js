// Lo que cambia en el DOM del plano del editor de un cuadro al siguiente, y nada más (docs/TIEMPO-REAL.md, «El dibujo
// del park»). Dos formas:
//
// - **El park** (park-panel.js): las piezas de park-overlay.js como elementos descritos (`{ t, a, c }`). Rehacer el
//   park entero en cada cuadro de un arrastre (un `innerHTML` por pieza) era leer el texto, crear los ~300 elementos
//   de nuevo y que el navegador volviera a calcular el estilo, el layout y la pintura de todos, aunque cada zona solo se
//   hubiera corrido unos centímetros. `patchKeyed` busca cada pieza (por su `data-key`) entre las del cuadro anterior
//   y, si tiene la misma forma (las mismas etiquetas, la misma cantidad de hijos), le cambia solo los atributos y los
//   textos que cambiaron; si no, la arma de nuevo.
// - **La nave** (draw.js: el suelo, los muros, huecos y pilares, y lo de la herramienta): cada capa como una lista de
//   textos SVG, uno por cosa (`patchItems`): solo se leen de nuevo los que cambiaron (al mover un vértice, sus dos
//   aristas y su asa; no los pilares ni los huecos de las otras).
//
// En los dos casos el DOM que queda es el mismo que da leer el texto entero (los mismos elementos, atributos y textos;
// en el park solo puede cambiar el orden de los atributos de un elemento, que no se ve), así que el plano se ve igual
// píxel a píxel (rt-draw.mjs lo prueba, cuadro a cuadro y en capturas).

const SVG_NS = 'http://www.w3.org/2000/svg';

/** El elemento del DOM de `e` (con lo de adentro), sin poner en ningún lado. */
export function build(e, doc = document) {
  const node = doc.createElementNS(SVG_NS, e.t);
  const a = e.a;
  for (let i = 0; i < a.length; i += 2) node.setAttribute(a[i], a[i + 1]);
  const c = e.c;
  if (Array.isArray(c)) for (const k of c) node.appendChild(build(k, doc));
  else if (c != null && c !== '') node.textContent = c;
  return node;
}

/** Si `a` y `b` se pueden cambiar uno en el otro sin rearmarlo: la misma etiqueta y lo de adentro del mismo tipo. */
function sameShape(a, b) {
  if (a.t !== b.t) return false;
  const x = a.c;
  const y = b.c;
  if (Array.isArray(x) || Array.isArray(y)) {
    if (!Array.isArray(x) || !Array.isArray(y) || x.length !== y.length) return false;
    for (let i = 0; i < x.length; i++) if (x[i].t !== y[i].t) return false;
    return true;
  }
  // un texto: vacío o no, el elemento tiene un nodo de texto o ninguno
  return (x == null || x === '') === (y == null || y === '');
}

/** Los atributos de `node` (que es `a`) como los de `b`. */
function patchAttrs(node, a, b) {
  const x = a.a;
  const y = b.a;
  let same = x.length === y.length;
  for (let i = 0; same && i < y.length; i += 2) same = x[i] === y[i];
  if (same) {
    for (let i = 1; i < y.length; i += 2) if (x[i] !== y[i]) node.setAttribute(y[i - 1], y[i]);
    return;
  }
  // otros nombres (un rótulo que se gira, una zona que pasa al altillo): los que ya no están, afuera
  const next = new Map();
  for (let i = 0; i < y.length; i += 2) next.set(y[i], y[i + 1]);
  const prev = new Map();
  for (let i = 0; i < x.length; i += 2) {
    prev.set(x[i], x[i + 1]);
    if (!next.has(x[i])) node.removeAttribute(x[i]);
  }
  for (const [k, v] of next) if (prev.get(k) !== v || !prev.has(k)) node.setAttribute(k, v);
}

/**
 * `node` (el elemento de `a`) cambiado a `b`: el mismo nodo con lo que cambió, o uno nuevo (sin poner en el DOM) si
 * `b` tiene otra forma.
 */
export function update(node, a, b, doc = document) {
  if (a === b) return node;
  if (!sameShape(a, b)) return build(b, doc);
  patchAttrs(node, a, b);
  const x = a.c;
  const y = b.c;
  if (Array.isArray(y)) {
    let k = node.firstChild;
    for (let i = 0; i < y.length; i++) {
      // un DOM que no es el de `a` (lo tocó otro): de nuevo
      if (!k) return build(b, doc);
      const next = k.nextSibling;
      const m = update(k, x[i], y[i], doc);
      if (m !== k) node.replaceChild(m, k);
      k = next;
    }
  } else if (x !== y && y != null && y !== '') {
    // el mismo nodo de texto, con el texto nuevo
    if (node.firstChild?.nodeType === 3 && !node.firstChild.nextSibling) node.firstChild.data = y;
    else node.textContent = y;
  }
  return node;
}

/** El `data-key` de un elemento descrito, o null. */
const keyOf = e => {
  const a = e.a;
  for (let i = 0; i < a.length; i += 2) if (a[i] === 'data-key') return a[i + 1];
  return null;
};

/**
 * Deja en `parent` las piezas `after`, en ese orden, a partir de las de antes (`before`, que están en `parent` como
 * `nodes`, en el mismo orden). Cada pieza nueva se cambia sobre la de antes con su mismo `data-key` (sin clave, la del
 * mismo lugar), si la hay; si no, se arma. Lo que sobra se saca. Devuelve los nodos de `after`, en orden.
 *
 * Solo se mueve en el DOM lo que cambió de lugar: lo que sobra sale antes de empezar y una pieza que hubo que rearmar
 * va en el lugar de la de antes. Si quedaran en el medio hasta el final, cada pieza de después se sacaría y se volvería
 * a poner (el mismo DOM, pero el navegador vuelve a calcular el estilo y el layout de todas).
 */
export function patchKeyed(parent, before, nodes, after, doc = document) {
  const byKey = new Map();
  for (let i = 0; i < before.length; i++) {
    const k = keyOf(before[i]) ?? `#${i}`;
    if (!byKey.has(k)) byKey.set(k, i);
  }
  // de cada pieza nueva, la de antes sobre la que se cambia (-1: se arma)
  const used = new Uint8Array(before.length);
  const take = new Int32Array(after.length).fill(-1);
  for (let j = 0; j < after.length; j++) {
    const i = byKey.get(keyOf(after[j]) ?? `#${j}`);
    if (i !== undefined && !used[i]) {
      used[i] = 1;
      take[j] = i;
    }
  }
  for (let i = 0; i < before.length; i++) if (!used[i] && nodes[i]?.parentNode === parent) parent.removeChild(nodes[i]);
  const out = Array.from({ length: after.length });
  // todo lo que está antes de `cursor` ya está en su lugar
  let cursor = parent.firstChild;
  for (let j = 0; j < after.length; j++) {
    const e = after[j];
    const i = take[j];
    let node;
    if (i >= 0) {
      const old = nodes[i];
      node = update(old, before[i], e, doc);
      if (node !== old && old.parentNode === parent) {
        parent.replaceChild(node, old);
        if (old === cursor) cursor = node;
      }
    } else node = build(e, doc);
    if (node === cursor) cursor = cursor.nextSibling;
    else parent.insertBefore(node, cursor);
    out[j] = node;
  }
  // lo que no era de `nodes` (otro tocó el grupo)
  while (cursor) {
    const next = cursor.nextSibling;
    parent.removeChild(cursor);
    cursor = next;
  }
  return out;
}

/** Un `<g>` suelto donde leer textos SVG (el mismo contexto que el `innerHTML` de una capa del plano). */
const scratchOf = new WeakMap();
/** Los nodos que da leer `text` dentro de un `<g>` SVG (sin poner en ningún lado). */
function parse(text, doc) {
  let g = scratchOf.get(doc);
  if (!g) scratchOf.set(doc, (g = doc.createElementNS(SVG_NS, 'g')));
  g.innerHTML = text;
  const out = [...g.childNodes];
  for (const k of out) g.removeChild(k);
  return out;
}

/** Lo que `patchItems` dejó en cada capa: los textos y sus nodos (de cada texto, los que dio leerlo). */
const itemsOf = new WeakMap();

/**
 * Deja en `parent` lo que da leer `items.join('')` (textos SVG, uno por cosa; los vacíos no cuentan), leyendo solo los
 * que cambiaron desde la última vez: lo que es igual al principio y al final se queda; en el medio, si son tantos como
 * antes, cada uno distinto se cambia por el suyo; si no, el medio entero. Si la capa no es la que dejó (otro escribió
 * su `innerHTML`), la rehace.
 */
export function patchItems(parent, items, doc = document) {
  const next = items.filter(Boolean);
  let st = itemsOf.get(parent);
  if (st && st.total !== parent.childNodes.length) st = null;
  if (!st && parent.firstChild) parent.textContent = '';
  const prev = st?.items ?? [];
  const nodes = st?.nodes ?? [];
  const n0 = prev.length;
  const n1 = next.length;
  let p = 0;
  while (p < n0 && p < n1 && prev[p] === next[p]) p++;
  let s = 0;
  while (s < n0 - p && s < n1 - p && prev[n0 - 1 - s] === next[n1 - 1 - s]) s++;
  const out = nodes.slice(0, p);
  if (n0 === n1) {
    for (let i = p; i < n1 - s; i++) {
      if (prev[i] === next[i]) {
        out.push(nodes[i]);
        continue;
      }
      const fresh = parse(next[i], doc);
      const at = nodes[i][0] ?? null;
      for (const k of fresh) parent.insertBefore(k, at);
      for (const k of nodes[i]) parent.removeChild(k);
      out.push(fresh);
    }
  } else {
    const ref = s ? (nodes[n0 - s][0] ?? null) : null;
    for (let i = p; i < n0 - s; i++) for (const k of nodes[i]) parent.removeChild(k);
    for (let i = p; i < n1 - s; i++) {
      const fresh = parse(next[i], doc);
      for (const k of fresh) parent.insertBefore(k, ref);
      out.push(fresh);
    }
  }
  for (let i = n0 - s; i < n0; i++) out.push(nodes[i]);
  let total = 0;
  for (const k of out) total += k.length;
  itemsOf.set(parent, { items: next, nodes: out, total });
}
