// Ficha técnica de la nave: plano acotado, medidas de la nave y de la pista, programa, fotos del anuncio y las notas
// del layout (cotejo, supuestos, riesgos), y el enlace a su «Checklist de visita» (visita/<id>.html, de visit.mjs). El plano y las cotas de la cubierta y de la pista salen de
// `@snowpark-bcn/park3d/plan` (planSVG, roofModel, slopeFrame: el núcleo Rust del paquete, con las mismas medidas que
// arman la escena, así no se desdicen). Se carga recién al abrir la ficha: trae el .wasm del núcleo (pkg/), que el
// visor no necesita para nada más.

const fmt = (n, d = 2) => Number(n).toLocaleString('es-ES', { maximumFractionDigits: d });
/** «1 línea», «3 líneas»: el sustantivo en singular con 1 (como «1 terraza», 256458f6). */
const count = (n, one, many) => `${n} ${n === 1 ? one : many}`;
/** «1», «1 y 2», «1, 2 y 3»: una lista con «y» antes del último. */
const and = a => (a.length < 2 ? a.join('') : `${a.slice(0, -1).join(', ')} y ${a[a.length - 1]}`);
const esc = s =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;');

const ROOF = {
  gable: 'a dos aguas',
  flat: 'plana',
  shed: 'a un agua',
  sawtooth: 'en diente de sierra',
  barrel: 'curva',
};
// oxfmt-ignore
const NAMES = {
  reception: 'Recepción', rental: 'Alquiler', lockers: 'Taquillas', changing: 'Vestuario', wc: 'Aseos', 'wc-accessible': 'Aseo adaptado',
  gym: 'Mini gym', trampolines: 'Trampolines', 'beginner-pad': 'Pad de iniciación', 'mini-ramp': 'Mini rampa', lounge: 'Lounge',
  cafe: 'Café', vending: 'Vending', workshop: 'Taller', office: 'Oficina', storage: 'Almacén', 'first-aid': 'Botiquín',
  stairs: 'Escalera', return: 'Pasillo de retorno', extinguisher: 'Extintor', bie: 'BIE', 'logo-wall': 'Mural', airbag: 'Airbag',
  'hvls-fan': 'Ventilador HVLS', 'boot-bench': 'Banco', partition: 'Tabique',
};

/** Rellena `el` con la ficha del layout `L` (carga antes las funciones del plano). */
export async function fillSheet(el, L) {
  el.innerHTML = '<p class="small">Cargando la ficha…</p>';
  const { planSVG, roofModel, slopeFrame } = await import('@snowpark-bcn/park3d/plan');
  const sh = L.shell;
  const R = roofModel(sh);
  const S = L.slope ? slopeFrame(L.slope) : null;
  const bb = R.bb;
  const area = Math.abs(
    sh.outline.reduce((a, p, i) => {
      const n = sh.outline[(i + 1) % sh.outline.length];
      return a + p[0] * n[1] - n[0] * p[1];
    }, 0) / 2,
  );
  const rows = [
    ['Planta del contorno', `${fmt(bb.x1 - bb.x0)} × ${fmt(bb.z1 - bb.z0)} m · ${fmt(area, 0)} m²`, sh.outlineSrc],
    ['Altura libre', `${fmt(sh.clearHeight)} m`, sh.clearHeightSrc],
    ['Cubierta', `${ROOF[R.type] || R.type} · alero ${fmt(R.eave)} m · cumbrera ${fmt(R.ridge)} m`, ''],
  ];
  if (S) {
    const s = L.slope;
    rows.push([
      'Pista',
      `${count(s.lanes, 'línea', 'líneas')} × ${fmt(s.laneWidth)} m · ${fmt(S.L, 1)} m de largo`,
      '',
    ]);
    rows.push(['Plataforma de salida', `${fmt(S.H)} m de alto · ${fmt(s.platform.depth)} m de fondo`, '']);
    const tpl = S.tpl;
    if (tpl) {
      // plantilla Stoke Mountain: drop-in, terrazas y carril de transición
      const drop = tpl.drops?.[1] ? tpl.drops[1].y0 - tpl.drops[1].y1 : 0;
      // «1 terraza», no «1 terrazas» (despi, granland-895, barbera-marconi…: una sola terraza)
      const decks = count(tpl.decks.length, 'terraza', 'terrazas');
      rows.push([
        'Pista (plantilla Stoke)',
        `drop-in de ${fmt(tpl.d0)} m en ${fmt(S.R)} m · ${decks} de ${tpl.decks.map(d => fmt(d.s1 - d.s0, 1)).join(' / ')} m · drops de ${fmt(drop)} m · máx. ${fmt(tpl.maxDeg, 0)}°`,
        '',
      ]);
      if (tpl.rollLane)
        rows.push([
          'Carril de transición',
          `línea ${tpl.rollLane.lane} · bajada de ${fmt(tpl.rollLane.inRun, 1)} m · ${(tpl.rollLane.rollers || []).length ? count(tpl.rollLane.rollers.length, 'roller', 'rollers') : 'sin rollers'}`,
          '',
        ]);
    } else {
      rows.push([
        'Rampa',
        `${fmt(S.R)} m de huella · pendiente media ${fmt((Math.atan(S.H / S.R) * 180) / Math.PI, 1)}°`,
        '',
      ]);
      rows.push(['Llano con módulos', `${fmt(S.F)} m`, '']);
    }
    rows.push([
      'Final',
      // «(línea 3)», «(líneas 1 y 2)»: antes «(líneas 3)» en las 11 naves con un final de una sola línea
      s.ends
        .map(
          e =>
            `${e.type === 'quarter' ? 'quarter' : 'run-out'} ${fmt(e.length)} m (${e.lanes.length === 1 ? 'línea' : 'líneas'} ${and(e.lanes)})`,
        )
        .join(' · '),
      '',
    ]);
  }
  const zones = L.zones || [];
  const zrows = zones
    .filter(z => !['extinguisher', 'bie', 'partition', 'logo-wall'].includes(z.type))
    .map(
      z =>
        `<tr><td>${esc(z.label || NAMES[z.type] || z.type)}</td><td>${fmt(z.w)} × ${fmt(z.d)} m</td><td>${fmt(z.w * z.d, 0)} m²</td></tr>`,
    )
    .join('');
  const safety = zones.filter(z => ['extinguisher', 'bie'].includes(z.type)).length;
  const exits = (sh.openings || []).filter(o => o.type !== 'window').length;
  const list = (t, a) => (a && a.length ? `<h3>${t}</h3><ul>${a.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '');
  const host = u => {
    try {
      return new URL(u).hostname.replace('www.', '');
    } catch {
      return u;
    }
  };
  const photos = L.photos || [];
  el.innerHTML = `
    ${L.fallback ? '<p class="warn">Versión preliminar: boceto anterior, el programa completo de esta nave se está dibujando.</p>' : ''}
    <p class="visit"><a href="visita/${esc(encodeURIComponent(L.id))}.html" target="_blank" rel="noopener">Checklist de visita ↗</a> <span class="small">lo que hay que medir, confirmar y fotografiar en la nave, con el plano marcado (para el móvil o para imprimir)</span></p>
    <h3>Plano acotado</h3><div class="plan">${planSVG(L)}</div>
    <p class="small legend"><i style="background:#DF0763"></i>accesos <i style="background:#13a34b"></i>salida de emergencia <i style="background:#5aa9e6"></i>ventanas <i style="background:#d4262d;border-radius:50%"></i>extintor/BIE <i style="background:#ffe53d"></i>módulos · rayado: altillo existente</p>
    <table class="kv">${rows.map(([k, v, s]) => `<tr><th>${k}</th><td>${v}${s ? `<small>${esc(s)}</small>` : ''}</td></tr>`).join('')}</table>
    <h3>Programa</h3><table class="zones"><tr><th>Pieza</th><th>Medidas</th><th>Sup.</th></tr>${zrows}</table>
    <p class="small">${count(exits, 'salida', 'salidas')} · ${count(safety, 'extintor/BIE', 'extintores/BIE')} · medidas en metros, cotas con su fuente en el plano.</p>
    ${
      photos.length
        ? `<h3>Fotos del anuncio</h3><div class="lphotos">${photos.map(p => `<a href="${esc(p.file)}" target="_blank" rel="noopener"><img loading="lazy" src="${esc(p.file)}" alt=""><span>foto ${String(p.n).padStart(2, '0')} · ${esc(p.caption)}</span></a>`).join('')}</div><p class="small">Fuente: ${[
            ...new Set(photos.map(p => p.source).filter(Boolean)),
          ]
            .map(u => `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(host(u))} ↗</a>`)
            .join(' · ')}</p>`
        : ''
    }
    ${list('Cotejo plano ↔ fotos ↔ anuncio', L.notes?.crossCheck)}
    ${list('Supuestos', L.notes?.assumptions)}
    ${list('Riesgos y pendientes', L.notes?.risks)}
    ${L.listing?.url ? `<p><a href="${esc(L.listing.url)}" target="_blank" rel="noopener">Ver el anuncio ↗</a></p>` : ''}`;
}
