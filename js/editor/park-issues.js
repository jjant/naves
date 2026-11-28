// La lista de lo que dice el núcleo del park armado, con dónde está cada cosa en el plano: los avisos de `autoLayout`
// (validateLayout, programChecks y lo que el generador tuvo que resignar) y los hallazgos de `walkabilityReport` (lo
// que se camina, con su punto). Sin DOM: el panel (park-panel.js) los muestra y los tests los prueban en Node.
//
// Los hallazgos de la circulación traen su punto (`at`) y su clave (`zone:<id>`, `door:<i>`…). Los avisos del
// validador son texto: el sitio sale de lo que nombran («hueco 2», «arista 3», el id de una zona, la pista, la
// escalera, el retorno). Si no nombran nada que esté en el plano, van sin sitio.

import { isProposed } from './park-overlay.js';

/** El rectángulo `{ x, z, w, d }` de la zona `id`, o null. */
function zoneRect(layout, id) {
  const z = (layout?.zones ?? []).find(q => q.id === id);
  return z ? { x: z.x, z: z.z, w: z.w, d: z.d } : null;
}

/** El punto del hueco `i` de `shell.openings` en su arista, o null. */
export function openingPoint(shell, i) {
  const op = shell?.openings?.[i];
  const o = shell?.outline ?? [];
  if (!op || !o.length) return null;
  const a = o[op.edge];
  const b = o[(op.edge + 1) % o.length];
  if (!a || !b) return null;
  return [a[0] + (b[0] - a[0]) * op.t, a[1] + (b[1] - a[1]) * op.t];
}

/** El medio de la arista `k` del contorno, o null. */
function edgeMid(shell, k) {
  const o = shell?.outline ?? [];
  const a = o[k];
  const b = o[(k + 1) % o.length];
  return a && b && o.length > 2 ? [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] : null;
}

/** La caja de un polígono como rectángulo. */
function polyRect(poly) {
  const xs = poly.map(p => p[0]);
  const zs = poly.map(p => p[1]);
  const x = Math.min(...xs);
  const z = Math.min(...zs);
  return { x, z, w: Math.max(...xs) - x, d: Math.max(...zs) - z };
}

/** El centro de un rectángulo. */
const center = r => [r.x + r.w / 2, r.z + r.d / 2];

/** La caja que junta varios rectángulos. */
function union(rects) {
  if (rects.length === 1) return rects[0];
  const x = Math.min(...rects.map(r => r.x));
  const z = Math.min(...rects.map(r => r.z));
  const mm = v => Math.round(v * 1000) / 1000;
  return {
    x,
    z,
    w: mm(Math.max(...rects.map(r => r.x + r.w)) - x),
    d: mm(Math.max(...rects.map(r => r.z + r.d)) - z),
  };
}

const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.z < b.z + b.d && b.z < a.z + a.d;
const rectOf = e => ({ x: e.x, z: e.z, w: e.w, d: e.d });
const finite = e => [e?.x, e?.z, e?.w, e?.d].every(Number.isFinite);

/** Cómo nombra el validador a cada cosa existente: su `label` o, sin él, su tipo (validate.rs). */
const existingName = e => (typeof e.label === 'string' && e.label ? e.label : e.type);

/**
 * Lo que el validador nombra con `name` en un aviso («solape: A ↔ B», «existente A sale del contorno»): una zona por su
 * id, lo existente de la nave (altillos, escaleras, bloques de aseos) por su nombre, la pista y los pilares. Los
 * pilares son muchos: con `near` (el rectángulo de lo otro que nombra el aviso), los que lo tocan. Devuelve
 * `{ rect, key? }` o null.
 */
function resolveName(name, layout, shapes, near = null) {
  const n = String(name).trim();
  const zone = (layout?.zones ?? []).find(z => z.id === n);
  if (zone) return { rect: rectOf(zone), key: `zone:${zone.id}` };
  const ex = (layout?.shell?.existing ?? []).findIndex(e => finite(e) && existingName(e) === n);
  if (ex >= 0) return { rect: rectOf(layout.shell.existing[ex]), key: `existing:${ex}` };
  if (n === 'pista' && shapes) return { rect: polyRect(shapes.outline), key: 'slope' };
  if (n === 'pilar') {
    const cols = (layout?.shell?.structure?.columns ?? []).filter(finite).map(rectOf);
    const hit = near ? cols.filter(c => overlaps(c, near)) : [];
    if (hit.length) return { rect: union(hit) };
  }
  return null;
}

/** Lo que nombra un aviso del validador por su forma: `{ at, rect, rects?, key? }` o null. */
function locateNamed(m, layout, shapes) {
  // «solape: A ↔ B»: los dos, cada uno con su borde (un pilar, el que toca al otro)
  const pair = /solape: (.+?) ↔ (.+)$/.exec(m);
  if (pair) {
    const a0 = resolveName(pair[1], layout, shapes);
    const b0 = resolveName(pair[2], layout, shapes);
    const a = a0 ?? resolveName(pair[1], layout, shapes, b0?.rect);
    const b = b0 ?? resolveName(pair[2], layout, shapes, a?.rect);
    const both = [a, b].filter(Boolean);
    if (both.length) {
      const rects = both.map(x => x.rect);
      // el punto, en lo más chico (el pilar, la escalera): es donde está el choque
      const small = [...both].sort((x, y) => x.rect.w * x.rect.d - y.rect.w * y.rect.d)[0];
      const key = small.key ?? both.find(x => x.key && x.key !== 'slope')?.key ?? both.find(x => x.key)?.key;
      return { at: center(small.rect), rect: union(rects), rects, ...(key ? { key } : {}) };
    }
  }
  const outside = /existente (.+) sale del contorno/.exec(m);
  const inZone = /pilar dentro de (\S+)/.exec(m);
  const named = outside
    ? resolveName(outside[1], layout, shapes)
    : inZone
      ? resolveName(inZone[1], layout, shapes)
      : null;
  if (named) {
    const cols = inZone ? resolveName('pilar', layout, shapes, named.rect) : null;
    const rects = cols ? [named.rect, cols.rect] : [named.rect];
    return { at: center(cols?.rect ?? named.rect), rect: named.rect, rects, ...(named.key ? { key: named.key } : {}) };
  }
  // lo existente que el aviso nombra por su nombre («Escalera existente»), antes de adivinar por el tipo de zona
  const lower = m.toLowerCase();
  const exs = (layout?.shell?.existing ?? [])
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => finite(e) && typeof e.label === 'string' && e.label.length > 3)
    .sort((x, y) => y.e.label.length - x.e.label.length);
  const ex = exs.find(({ e }) => lower.includes(e.label.toLowerCase()));
  if (ex) return { at: center(rectOf(ex.e)), rect: rectOf(ex.e), key: `existing:${ex.i}` };
  return null;
}

/**
 * Dónde está en el plano lo que nombra un aviso de texto: `{ at: [x, z], rect?, rects?, key? }`, o null (`rects`: cada
 * cosa que nombra, para marcar las dos de un solape). Mira, en este orden, un hueco («hueco 2»), lo que el validador
 * nombra por su forma («solape: A ↔ B», «existente A sale del contorno», «pilar dentro de A»: zonas por su id, lo
 * existente por su nombre, la pista, los pilares que tocan lo otro), lo existente que nombra por su nombre, una zona por
 * su id («(taquillas)», ««lounge»»), la escalera existente o el altillo, la escalera del park, el retorno, el final de la
 * pista, la pista o la plataforma, y una arista («arista 3»).
 */
export function locateText(message, layout, shapes) {
  const m = String(message);
  const shell = layout?.shell;
  const hole = /\bhueco (\d+)/.exec(m);
  if (hole) {
    const at = openingPoint(shell, Number(hole[1]));
    if (at) return { at, key: `door:${hole[1]}` };
  }
  const named = locateNamed(m, layout, shapes);
  if (named) return named;
  const zones = [...(layout?.zones ?? [])].sort((a, b) => b.id.length - a.id.length);
  for (const z of zones) {
    if (m.includes(`(${z.id})`) || m.includes(`«${z.id}»`) || m.includes(`zona ${z.id}`) || m.includes(`${z.id}:`)) {
      const rect = zoneRect(layout, z.id);
      return { at: center(rect), rect, key: `zone:${z.id}` };
    }
  }
  const byType = type => (layout?.zones ?? []).find(z => z.type === type);
  const lower = m.toLowerCase();
  const zoneOf = type => {
    const z = byType(type);
    return z ? { at: center(z), rect: { x: z.x, z: z.z, w: z.w, d: z.d }, key: `zone:${z.id}` } : null;
  };
  // «escalera existente»: la de la nave (shell.existing), no la de la plataforma del park
  const stairsEx = (shell?.existing ?? []).findIndex(e => e.type === 'stairs-existing' && finite(e));
  if (/escalera (?:existente|de la nave)/.test(lower) && stairsEx >= 0) {
    const rect = rectOf(shell.existing[stairsEx]);
    return { at: center(rect), rect, key: `existing:${stairsEx}` };
  }
  if (/altillo/.test(lower) && !/plataforma/.test(lower)) {
    const i = (shell?.existing ?? []).findIndex(e => e.type === 'mezzanine' && finite(e));
    if (i >= 0 && !(layout?.zones ?? []).some(z => m.includes(z.id))) {
      const rect = rectOf(shell.existing[i]);
      return { at: center(rect), rect, key: `existing:${i}` };
    }
  }
  if (/escalera/.test(lower) && byType('stairs')) return zoneOf('stairs');
  if (/retorno/.test(lower) && byType('return')) return zoneOf('return');
  if (shapes) {
    if (/final de la pista|run-out|quarter/.test(lower) && shapes.ends.length) {
      const rect = polyRect(shapes.ends.flatMap(e => e.poly));
      return { at: center(rect), rect, key: 'slope' };
    }
    if (/plataforma/.test(lower) && shapes.sections[0]) {
      const rect = polyRect(shapes.sections[0].poly);
      return { at: center(rect), rect, key: 'slope' };
    }
    if (/\bpista\b|rampa|llano|líneas?\b/.test(lower)) {
      const rect = polyRect(shapes.outline);
      return { at: center(rect), rect, key: 'slope' };
    }
  }
  const edge = /\barista (\d+)/.exec(m);
  if (edge) {
    // el hueco que el generador puso en esa arista («La salida de emergencia de la arista 3 es nueva…», «El plano no
    // trae puertas: se supone la entrada en el centro de la arista 0»), que es lo que el aviso nombra
    const k = Number(edge[1]);
    const exit = /salida/.test(lower);
    const ops = (shell?.openings ?? []).map((op, i) => ({ op, i })).filter(({ op }) => op.edge === k && isProposed(op));
    const hit =
      ops.find(({ op }) => (op.type === 'emergency-exit') === exit) ?? (/nuev|propuest|supone/.test(lower) && ops[0]);
    if (hit) {
      const at = openingPoint(shell, hit.i);
      if (at) return { at, key: `door:${hit.i}` };
    }
    const at = edgeMid(shell, k);
    if (at) return { at };
  }
  return null;
}

/** Dónde está un hallazgo de la circulación: su punto y, si es de una zona o una puerta, su rectángulo o su hueco. */
export function locateFinding(f, layout) {
  const zone = /^zone:(.+)$/.exec(f.key ?? '');
  const rect = zone ? zoneRect(layout, zone[1]) : null;
  if (f.at) return { at: [f.at[0], f.at[2]], ...(rect ? { rect } : {}), key: f.key };
  if (rect) return { at: center(rect), rect, key: f.key };
  const door = /^(?:door|exit):(\d+)$/.exec(f.key ?? '');
  const p = door ? openingPoint(layout?.shell, Number(door[1])) : null;
  return p ? { at: p, key: f.key } : null;
}

/**
 * Las filas de la lista: errores primero, después avisos; primero los del park (autoLayout), después los de la
 * circulación. Cada una: `{ level, text, origin: 'park' | 'walk', where }` (`where` de `locateText` o
 * `locateFinding`, o null). Un hallazgo de la circulación que ya está entre los avisos del park
 * (`circulación [regla]: …`) va una sola vez, con su punto.
 */
export function issueRows(result, walk) {
  if (!result?.ok) return [];
  const layout = result.layout;
  const rows = [];
  const findings = walk?.ok ? (walk.walk?.findings ?? []) : [];
  const inPark = new Set();
  for (const i of result.issues ?? []) {
    const f = findings.find(q => i.message.includes(q.message));
    if (f) inPark.add(f);
    rows.push({
      level: i.level,
      text: i.message,
      origin: 'park',
      where: f ? locateFinding(f, layout) : locateText(i.message, layout, result.shapes),
    });
  }
  for (const f of findings) {
    if (inPark.has(f)) continue;
    rows.push({
      level: f.level,
      text: `${f.message} (${f.source})`,
      origin: 'walk',
      rule: f.rule,
      where: locateFinding(f, layout),
    });
  }
  const rank = r => (r.level === 'error' ? 0 : 1);
  return rows
    .map((r, k) => ({ r, k }))
    .sort((a, b) => rank(a.r) - rank(b.r) || a.k - b.k)
    .map(({ r }) => r);
}

/** Lo que se cuenta del park en una línea: la pista, cuántas zonas, errores y avisos. */
export function summary(result, walk) {
  if (!result?.ok) return '';
  const s = result.layout.slope;
  const zones = (result.layout.zones ?? []).filter(
    z => !['extinguisher', 'bie', 'logo-wall', 'hvls-fan'].includes(z.type),
  );
  const rows = issueRows(result, walk);
  const errors = rows.filter(r => r.level === 'error').length;
  const warnings = rows.length - errors;
  const es = v => String(Math.round(v * 100) / 100).replace('.', ',');
  const pista = s
    ? `pista de ${s.lanes} × ${es(s.laneWidth)} m${result.shapes ? `, ${es(result.shapes.length)} m` : ''}, plataforma a +${es(s.platform?.height ?? 0)} m, baja hacia ${s.dir}`
    : 'sin pista';
  return `${pista} · ${zones.length} zonas · ${errors} error${errors === 1 ? '' : 'es'} · ${warnings} aviso${warnings === 1 ? '' : 's'}`;
}
