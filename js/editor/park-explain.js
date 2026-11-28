// «Cómo decide»: lo que hizo `autoLayout` para llegar al park, paso a paso, con `explain: true` (el núcleo devuelve las
// pistas candidatas con su puntaje término a término, los programas que armó sobre las mejores y cuál ganó:
// `Explain` de src/generated/core.ts, crates/park3d-core/src/autolayout/explain.rs). Sin DOM: park-panel.js lo pone en
// el panel, y una pista de la tabla, al tocarla, se dibuja encima del plano (`candidateSVG`).
import { esc } from './park-overlay.js';

// el texto de `toLocaleString('es-ES', …)`, con un `Intl.NumberFormat` por cantidad de decimales: armar uno por número
// eran ~20 ms de los ~30 que tardaba «Cómo decide» en pintarse
const FORMATS = new Map();
const es = (v, d = 1) => {
  let f = FORMATS.get(d);
  if (!f) FORMATS.set(d, (f = new Intl.NumberFormat('es-ES', { maximumFractionDigits: d })));
  return f.format(Math.round(v * 10 ** d) / 10 ** d);
};
const signed = v => (v > 0 ? '+' : v < 0 ? '−' : '±') + es(Math.abs(v), 0);

/** Los nombres de las piezas del programa del generador (las claves de `ORDER` de pack.rs). */
export const PIECES = {
  reception: 'recepción',
  wet: 'vestuarios',
  lounge: 'lounge',
  cafe: 'café',
  rental: 'alquiler',
  lockers: 'taquillas',
  wcAcc: 'aseo adaptado',
  pad: 'pad de iniciación',
  trampolines: 'trampolines',
  gym: 'gym',
  workshop: 'taller',
  office: 'oficina',
  storage: 'almacén',
};
const piece = k => PIECES[k] ?? k;

/** Los pasos en que se arma un programa (`stage` de `PackExplain`). */
export const STAGES = {
  first: 'la mejor de su grupo',
  alt: 'el otro ancho de retorno',
  shorter: 'una pista 1,5 m más corta',
  rescue: 'la menos mala (−5.000)',
  retry: 'otra vuelta con lo que faltó primero',
};

/** Una pista en pocas palabras: líneas, ancho, sentido, plataforma y largo. */
export function planName(p) {
  return `${p.lanes} × ${es(p.laneWidth, 2)} m hacia ${p.dir}, plataforma +${es(p.platformHeight, 2)} m, ${es(p.length)} m`;
}

/**
 * Por qué ganó el que ganó, contra el mejor de los otros que se pudieron armar: los términos de la pista que más
 * cambian, lo que sumó el programa y las piezas que al otro no le entraron. `{ winner, runner, lines }`.
 */
export function whyWon(ex) {
  const winner = ex.packs[ex.winner];
  const plans = new Map(ex.plans.map(p => [p.index, p]));
  const others = ex.packs.filter((p, i) => i !== ex.winner && p.feasible);
  others.sort((a, b) => b.score - a.score);
  const runner = others[0] ?? null;
  if (!winner) return { winner: null, runner: null, lines: [] };
  const wp = plans.get(winner.plan);
  const lines = [];
  if (!runner) {
    lines.push('Es el único programa que se pudo armar con una pista que deja llegar a todo.');
    return { winner, runner, lines };
  }
  const rp = plans.get(runner.plan);
  const diff = winner.score - runner.score;
  lines.push(
    `Le saca ${es(diff, 1)} puntos al segundo (${es(runner.score, 0)}, ${STAGES[runner.stage] ?? runner.stage}).`,
  );
  if (wp && rp && winner.plan !== runner.plan) {
    const d = wp.terms
      .map(t => ({ t, o: rp.terms.find(q => q.key === t.key) }))
      .map(({ t, o }) => ({ label: t.label, other: o?.label ?? '', delta: t.value - (o?.value ?? 0) }))
      .filter(x => Math.abs(x.delta) > 0.05)
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      .slice(0, 4);
    if (d.length)
      lines.push(
        'Por la pista: ' +
          d
            .map(x => `${x.label}${x.other && x.other !== x.label ? ` (el otro: ${x.other})` : ''} ${signed(x.delta)}`)
            .join(', ') +
          '.',
      );
  } else if (winner.plan === runner.plan) lines.push('Es la misma pista: cambia cómo se armó el programa.');
  const dp = winner.program - runner.program;
  if (Math.abs(dp) > 0.05)
    lines.push(`Por el programa: ${signed(dp)} (${es(winner.program, 0)} contra ${es(runner.program, 0)}).`);
  const missing = runner.failed.filter(k => !winner.failed.includes(k));
  if (missing.length) lines.push(`Al otro no le entran: ${missing.map(piece).join(', ')}.`);
  const own = winner.failed.filter(k => !runner.failed.includes(k));
  if (own.length) lines.push(`A este no le entran: ${own.map(piece).join(', ')} (y aun así gana).`);
  return { winner, runner, lines };
}

/** El HTML de la explicación, o lo que falta para tenerla. */
export function explainHTML(ex) {
  if (!ex)
    return '<p class="park-muted">Este núcleo no explica cómo decide: hace falta el de la opción <code>explain</code>.</p>';
  const { winner, lines } = whyWon(ex);
  const plans = new Map(ex.plans.map(p => [p.index, p]));
  const wp = winner ? plans.get(winner.plan) : null;
  const dirs = ex.byDir
    .map(d => `${esc(d.dir)}: ${d.count} (la mejor, nº ${d.bestIndex}, ${es(d.best, 0)})`)
    .join(' · ');
  const packed = new Map();
  for (const p of ex.packs) if (p.feasible && (packed.get(p.plan)?.score ?? -Infinity) < p.score) packed.set(p.plan, p);
  const steps = [
    `<li><b>La nave vacía.</b> ${es(ex.freeArea, 0)} m² de suelo libre y ${es(ex.clearHeight, 2)} m de altura libre: la plataforma puede ir hasta +${es(ex.maxPlatform, 2)} m. La entrada está en (${es(ex.entrance[0])}, ${es(ex.entrance[1])}): la plataforma va contra el testero más alejado (el otro sentido resta).</li>`,
    `<li><b>${ex.candidates} pistas candidatas</b> en ${ex.groups} grupos (sentido, líneas, lado del retorno, ancho, puertas). Por sentido: ${dirs}. Cada una con su puntaje (abajo, término a término) y un pre-puntaje que le resta el suelo que no deja para el programa.</li>`,
    `<li><b>${ex.packs.length} programas armados</b> sobre las mejores de cada grupo${ex.packs.some(p => !p.feasible) ? `; ${ex.packs.filter(p => !p.feasible).length} no se armaron porque la pista no deja llegar a pie a todo` : ''}. Cada pieza que entra suma (pad 100, trampolines 50, gym 25…), una esencial que falta resta 1.000 y una compacta 150.</li>`,
    winner && wp
      ? `<li><b>Gana la nº ${wp.index}</b> (${esc(planName(wp))}): ${es(winner.score, 0)} = pista ${es(wp.score, 0)} ${signed(winner.program)} del programa. ${lines.map(esc).join(' ')}</li>`
      : '',
    ex.relaxed.length ? `<li>Lo pedido que no entró y se soltó: ${ex.relaxed.map(esc).join(', ')}.</li>` : '',
  ];
  // una fila por pista, con lo que las distingue (el lado y el ancho del retorno, el de la escalera); las que en todo
  // eso dan igual (cambian solo las puertas que se conservan, por ejemplo) van juntas, «×N»
  const groups = new Map();
  for (const p of rankedPlans(ex)) {
    const pk = packed.get(p.index);
    const tried = ex.packs.some(q => q.plan === p.index);
    const cells = [
      `${esc(p.dir)} ${p.lanes}×${es(p.laneWidth, 2)}`,
      `+${es(p.platformHeight, 2)} · ${es(p.length)}`,
      `${sideOf(p.returnRect, p.foot)} ${es(p.returnWidth, 2)}`,
      sideOf(p.stairs, p.foot),
      es(p.score, 0),
      pk ? es(pk.score, 0) : tried ? '✖' : '',
    ];
    const key = cells.join('|');
    const g = groups.get(key);
    if (g) g.same.push(p);
    else groups.set(key, { p, cells, pk, tried, same: [] });
  }
  const rows = [...groups.values()].map(({ p, cells, pk, tried, same }) => {
    const win = winner?.plan === p.index || same.some(q => winner?.plan === q.index);
    const cls = win ? 'park-win' : tried && !pk ? 'park-dead' : '';
    const terms = p.terms
      .filter(t => t.value !== 0)
      .map(t => `${esc(t.label)} ${signed(t.value)}`)
      .join(' · ');
    const more = same.length
      ? ` <small class="park-muted" title="iguales en estas columnas: nº ${same.map(q => q.index).join(', ')}">×${same.length + 1}</small>`
      : '';
    return (
      `<tr data-cand="${p.index}"${same.length ? ` data-same="${same.map(q => q.index).join(',')}"` : ''} class="${cls}" title="${esc(terms)}"><td>${p.index}${win ? ' ★' : ''}${more}</td>` +
      cells.map(c => `<td>${c}</td>`).join('') +
      '</tr>'
    );
  });
  const packRows = ex.packs.map((p, i) => {
    const pl = plans.get(p.plan);
    const cls = i === ex.winner ? 'park-win' : p.feasible ? '' : 'park-dead';
    const why = p.feasible
      ? p.failed.length
        ? `no entra: ${p.failed.map(piece).join(', ')}`
        : 'entra todo'
      : (p.risks[0] ?? 'la pista no deja llegar a pie a todo');
    // dos líneas por programa: lo que no entra es largo y en una columna estiraba la tabla más allá del panel
    return (
      `<tr data-cand="${p.plan}" class="${cls}">` +
      `<td>${i + 1}${i === ex.winner ? ' ★' : ''}</td><td>nº ${p.plan}${pl ? ` · ${esc(pl.dir)} ${pl.lanes}×${es(pl.laneWidth, 2)}` : ''}</td>` +
      `<td>${p.feasible ? es(p.score, 0) : '✖'}</td></tr>` +
      `<tr data-cand="${p.plan}" class="${cls} park-sub"><td></td><td colspan="2" title="${esc([...p.notes, ...p.risks].join('\n'))}">` +
      `${esc(STAGES[p.stage] ?? p.stage)} · ${esc(why)}</td></tr>`
    );
  });
  return (
    `<h3>Cómo decide</h3><ol class="park-steps">${steps.join('')}</ol>` +
    `<h3>Programas armados</h3><table class="park-packs"><thead><tr><th>#</th><th>pista</th><th>puntaje</th></tr></thead><tbody>${packRows.join('')}</tbody></table>` +
    `<h3>Pistas candidatas <small class="park-muted">(de mejor a peor; tocar una la muestra en el plano)</small></h3>` +
    `<table class="park-cands"><thead><tr><th>nº</th><th>baja</th><th title="plataforma (m) · largo (m)">plat. · largo</th><th title="lado y ancho del pasillo de retorno">retorno</th><th title="lado de la escalera a la plataforma">esc.</th><th>pista</th><th title="el programa armado sobre esta pista">total</th></tr></thead><tbody>${rows.join('')}</tbody></table>`
  );
}

/** Las pistas candidatas de mejor a peor puntaje (las que empatan, por número). */
export function rankedPlans(ex) {
  return [...(ex?.plans ?? [])].sort((a, b) => b.score - a.score || a.index - b.index);
}

/** El color de un puntaje entre el peor (`lo`) y el mejor (`hi`) de las candidatas: rojo, ámbar, verde. */
export function scoreColor(score, lo, hi) {
  const t = hi > lo ? Math.max(0, Math.min(1, (score - lo) / (hi - lo))) : 1;
  return `hsl(${Math.round(t * 130)} 72% 38%)`;
}

/** De qué lado de la huella de la pista (`[x, z, w, d]`) queda un rectángulo: '+x', '−x', '+z' o '−z'. */
export function sideOf(rect, foot) {
  if (!rect || !foot) return '';
  const dx = rect[0] + rect[2] / 2 - (foot[0] + foot[2] / 2);
  const dz = rect[1] + rect[3] / 2 - (foot[1] + foot[3] / 2);
  // la distancia a cada borde, relativa al tamaño de la huella: lo que sobresale más de un lado
  const ax = Math.abs(dx) / Math.max(foot[2], 0.01);
  const az = Math.abs(dz) / Math.max(foot[3], 0.01);
  return ax >= az ? (dx >= 0 ? '+x' : '−x') : dz >= 0 ? '+z' : '−z';
}

/**
 * La candidata que se mira en el plano, término a término contra la que ganó: `{ head, html }`. `head` es la línea del
 * paso a paso (número, puesto, puntaje); `html`, la tabla.
 */
export function candidateHTML(ex, index) {
  const ranked = rankedPlans(ex);
  const k = ranked.findIndex(p => p.index === index);
  const p = ranked[k];
  if (!p) return { head: '', html: '' };
  const winPlan = ex.packs[ex.winner]?.plan;
  const w = ranked.find(q => q.index === winPlan);
  const pk = ex.packs.filter(q => q.plan === p.index);
  const best = pk.filter(q => q.feasible).sort((a, b) => b.score - a.score)[0];
  const head =
    `nº ${p.index}${p.index === winPlan ? ' ★' : ''} · ${k + 1}.ª de ${ranked.length} · pista ${es(p.score, 0)}` +
    (best ? ` · total ${es(best.score, 0)}` : pk.length ? ' · sin programa' : '');
  const other = w && w.index !== p.index ? w : null;
  const rows = p.terms
    .map(t => {
      const o = other?.terms.find(q => q.key === t.key);
      const d = o ? t.value - o.value : 0;
      const cls = Math.abs(d) > 0.05 ? (d > 0 ? ' class="park-up"' : ' class="park-down"') : '';
      return (
        `<tr${cls}><td title="${esc(o && o.label !== t.label ? `la ganadora: ${o.label}` : '')}">${esc(t.label)}</td>` +
        `<td>${signed(t.value)}</td>${other ? `<td>${o ? signed(o.value) : ''}</td>` : ''}</tr>`
      );
    })
    .join('');
  const why = pk.length
    ? pk
        .map(q =>
          q.feasible
            ? `programa (${STAGES[q.stage] ?? q.stage}): ${es(q.score, 0)}${q.failed.length ? `, sin ${q.failed.map(piece).join(', ')}` : ''}`
            : `programa (${STAGES[q.stage] ?? q.stage}): no se armó (${q.risks[0] ?? 'no deja llegar a pie a todo'})`,
        )
        .join('<br>')
    : 'No se armó un programa sobre esta pista: no era de las mejores de su grupo.';
  const html =
    `<p class="park-muted">${esc(planName(p))}. Retorno ${sideOf(p.returnRect, p.foot)} de ${es(p.returnWidth, 2)} m, escalera ${sideOf(p.stairs, p.foot)}${p.lostDoors ? `, tapa ${p.lostDoors} puerta(s)` : ''}${p.returnCols ? `, ${p.returnCols} pilar(es) en el retorno` : ''}.</p>` +
    `<table class="park-terms-table"><thead><tr><th>término</th><th>esta</th>${other ? `<th>ganadora (nº ${other.index})</th>` : ''}</tr></thead><tbody>${rows}` +
    `<tr><td><b>puntaje de la pista</b></td><td><b>${es(p.score, 0)}</b></td>${other ? `<td><b>${es(other.score, 0)}</b></td>` : ''}</tr>` +
    `<tr><td>suelo que deja: ${es(p.left, 0)} m²</td><td>${signed(-p.floorPenalty)}</td>${other ? `<td>${signed(-other.floorPenalty)}</td>` : ''}</tr>` +
    `</tbody></table><p class="park-muted">${why}</p>`;
  return { head, html };
}

/**
 * Todas las candidatas encima del plano (metros de la nave): la huella de cada una con el borde del color de su puntaje
 * (`scoreColor`: las peores abajo, las mejores encima), la que ganó con un borde grueso, y la que se mira (`current`)
 * con su escalera, su retorno, la flecha y su puntaje (`candidateSVG`).
 */
export function candidatesSVG(ex, current) {
  const plans = ex?.plans ?? [];
  if (!plans.length) return '';
  const scores = plans.map(p => p.score);
  const lo = Math.min(...scores);
  const hi = Math.max(...scores);
  const winPlan = ex.packs[ex.winner]?.plan;
  const rect = ([x, z, w, d], attrs) =>
    `<rect x="${n(x)}" y="${n(z)}" width="${n(w)}" height="${n(d)}" fill="none" ${attrs}/>`;
  const all = [...plans]
    .sort((a, b) => a.score - b.score)
    .map(p => rect(p.foot, `class="park-cand-foot" stroke="${scoreColor(p.score, lo, hi)}"`))
    .join('');
  const win = plans.find(p => p.index === winPlan);
  const cur = plans.find(p => p.index === current);
  return (
    `<g class="park-cands-plan">${all}${win ? rect(win.foot, 'class="park-cand-win"') : ''}</g>` +
    (cur ? candidateSVG(cur, scoreColor(cur.score, lo, hi)) : '')
  );
}

const n = v => String(Math.round(v * 1000) / 1000);

/** Los términos del puntaje de una pista, uno por fila, con una barra. */
export function termsHTML(p, title) {
  const max = Math.max(1, ...p.terms.map(t => Math.abs(t.value)));
  const rows = p.terms
    .map(
      t =>
        `<tr><td>${esc(t.label)}</td><td>${signed(t.value)}</td><td><span class="park-bar${t.value < 0 ? ' neg' : ''}" style="width:${Math.round((60 * Math.abs(t.value)) / max)}px"></span></td></tr>`,
    )
    .join('');
  return (
    `<h3>${esc(title)} (nº ${p.index})</h3><table class="park-terms-table"><tbody>${rows}` +
    `<tr><td><b>puntaje de la pista</b></td><td><b>${es(p.score, 0)}</b></td><td></td></tr>` +
    `<tr><td>suelo que deja: ${es(p.left, 0)} m²</td><td>${signed(-p.floorPenalty)}</td><td></td></tr>` +
    `<tr><td><b>pre-puntaje</b></td><td><b>${es(p.pre, 0)}</b></td><td></td></tr></tbody></table>`
  );
}

/**
 * Una pista candidata encima del plano (metros de la nave): su huella, la escalera y el retorno, con el número y el
 * puntaje, y una flecha en el sentido de bajada.
 */
export function candidateSVG(p, color = '#DF0763') {
  if (!p) return '';
  const r = ([x, z, w, d], cls, fill) =>
    `<rect x="${n(x)}" y="${n(z)}" width="${n(w)}" height="${n(d)}" class="${cls}" fill="${fill}" stroke="${color}" stroke-dasharray="6 4"/>`;
  const [x, z, w, d] = p.foot;
  const cx = x + w / 2;
  const cz = z + d / 2;
  const dir = { '+x': [1, 0], '-x': [-1, 0], '+z': [0, 1], '-z': [0, -1] }[p.dir] ?? [0, 1];
  const len = Math.min(Math.max(w, d) * 0.3, 6);
  const tip = [cx + dir[0] * len, cz + dir[1] * len];
  const tail = [cx - dir[0] * len, cz - dir[1] * len];
  const size = Math.max(0.6, Math.min(1.4, Math.min(w, d) / 6));
  return (
    `<g class="park-ghost" data-cand="${p.index}">` +
    r(p.foot, 'park-ghost-foot', 'rgba(223,7,99,.16)') +
    r(p.stairs, 'park-ghost-stairs', 'rgba(223,7,99,.08)') +
    r(p.returnRect, 'park-ghost-return', 'rgba(223,7,99,.08)') +
    `<line x1="${n(tail[0])}" y1="${n(tail[1])}" x2="${n(tip[0])}" y2="${n(tip[1])}" stroke="${color}" stroke-width="${n(size * 0.25)}" marker-end="url(#park-arrow)"/>` +
    `<text x="${n(cx)}" y="${n(cz)}" font-size="${n(size)}" style="fill:${color}" stroke="#fff" stroke-width="${n(size * 0.25)}" paint-order="stroke" font-weight="700">nº ${p.index} · ${es(p.score, 0)}</text>` +
    `</g>`
  );
}

/** La punta de flecha de `candidateSVG` (para el `<defs>` de cada plano). */
export const ARROW_DEFS =
  '<marker id="park-arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">' +
  '<path d="M0,0 L10,5 L0,10 z" fill="#DF0763"/></marker>';
