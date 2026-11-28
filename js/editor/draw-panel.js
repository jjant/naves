// El inspector del editor de naves (la columna de la izquierda): los números de lo elegido (un vértice, una arista, un
// hueco, un pilar, un altillo, una escalera) o, sin nada elegido, los de la nave (alturas, cubierta, estructura, la
// retícula de pilares, los muros, la calle y la tabla de vértices), las opciones de la herramienta y los chequeos.
// Cada campo se escribe a mano (acepta «12,5» y cuentas: «16.4/2») y se aplica con Enter o al salir.
import * as S from './state.js';
import { area, bbox, dist, edgeFrame, fmt, parseNum, round } from './draw-geom.js';
import {
  checkBuilding,
  clone,
  columnGrid,
  deleteVertex,
  edgeLength,
  insertVertex,
  moveVertex,
  newOpening,
  openingKind,
  openingLabel,
  setEdgeLength,
  withOpeningKind,
} from './draw-model.js';

const esc = s =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;');

// oxfmt-ignore
const ROOF_TYPES = [['flat', 'Plana'], ['gable', 'A dos aguas'], ['shed', 'A un agua'], ['sawtooth', 'Diente de sierra'], ['barrel', 'Curva']];
// oxfmt-ignore
const STRUCT_TYPES = [['precast-concrete', 'Hormigón prefabricado'], ['steel-portal', 'Pórticos de acero'], ['steel-truss', 'Cerchas de acero']];
// oxfmt-ignore
const WALL_TYPES = [['precast-panel', 'Panel de hormigón'], ['block-painted', 'Bloque pintado'], ['plaster', 'Enlucido liso'], ['sheet', 'Chapa'], ['sandwich-panel', 'Panel sándwich'], ['brick', 'Ladrillo']];
const SIDES = ['+x', '-x', '+z', '-z'];

/** De la ruta de un chequeo (`shell.openings[2]`…) a lo que hay que elegir para verlo. */
function selOfPath(path) {
  const m = /^shell\.(outline|openings|structure\.columns|existing)\[(\d+)\]/.exec(path);
  if (!m) return { kind: 'building' };
  const i = Number(m[2]);
  return {
    kind: { outline: 'vertex', openings: 'opening', 'structure.columns': 'column', existing: 'existing' }[m[1]],
    i,
  };
}

/** La ruta de lo elegido (para los chequeos que van con él). */
function pathOfSel(sel) {
  if (!sel) return null;
  switch (sel.kind) {
    case 'vertex':
      return `shell.outline[${sel.i}]`;
    case 'opening':
      return `shell.openings[${sel.i}]`;
    case 'column':
      return `shell.structure.columns[${sel.i}]`;
    case 'existing':
      return `shell.existing[${sel.i}]`;
    default:
      return null;
  }
}

export function initPanel(ed, { OPENING_KINDS }) {
  const root = /** @type {HTMLElement} */ (document.getElementById('inspector'));
  /** data-k → `{ get(b), set(b, v) → nave nueva }` de los campos de ahora. */
  let fields = new Map();
  /** data-act → función, de los botones de ahora. */
  let acts = new Map();
  const grid = { sx: 6, sz: 6, ox: 0, oz: 0, w: 0.4, d: 0.4 };

  // ---------------------------------------------------------------- piezas de formulario

  const num = (k, label, get, set, { unit = 'm', d = 3, blank = false, title = '' } = {}) => {
    fields.set(k, { get, set, kind: 'num', blank });
    const v = get(ed.b);
    const val = v === undefined || v === null || Number.isNaN(v) ? '' : fmt(v, d);
    return `<label class="row" title="${esc(title)}"><span>${label}</span><span class="unit" data-unit="${unit}"><input data-k="${k}" value="${esc(val)}" inputmode="decimal" placeholder="${blank ? 'auto' : ''}" spellcheck="false"></span></label>`;
  };
  const text = (k, label, get, set) => {
    fields.set(k, { get, set, kind: 'text' });
    return `<label class="row"><span>${label}</span><input data-k="${k}" value="${esc(get(ed.b) ?? '')}" spellcheck="false"></label>`;
  };
  const choice = (k, label, options, get, set) => {
    fields.set(k, { get, set, kind: 'text' });
    const v = String(get(ed.b) ?? '');
    const opts = options.map(
      ([val, name]) => `<option value="${esc(val)}"${val === v ? ' selected' : ''}>${esc(name)}</option>`,
    );
    return `<label class="row"><span>${label}</span><select data-k="${k}">${opts.join('')}</select></label>`;
  };
  const check = (k, label, get, set) => {
    fields.set(k, { get, set, kind: 'bool' });
    return `<label class="row"><span>${label}</span><span><input type="checkbox" data-k="${k}"${get(ed.b) ? ' checked' : ''}></span></label>`;
  };
  const color = (k, label, get, set) => {
    fields.set(k, { get, set, kind: 'text' });
    const v = get(ed.b);
    return `<label class="row"><span>${label}</span><input type="color" data-k="${k}" value="${esc(/^#[0-9a-f]{6}$/i.test(v ?? '') ? v : '#d9d6cc')}"></label>`;
  };
  const button = (act, label, fn, cls = '') => {
    acts.set(act, fn);
    return `<button data-act="${act}" class="${cls}">${label}</button>`;
  };
  const issueList = list =>
    list
      .map(
        (it, i) =>
          `<div class="issue ${it.level}" data-issue="${i}"><b>${it.level === 'error' ? 'Error' : it.level === 'warning' ? 'Aviso' : 'Nota'}</b> · ${esc(it.msg)}</div>`,
      )
      .join('');

  /** Una copia de la nave con `fn(copia)` aplicado. */
  const edit = fn => {
    const nb = clone(ed.b);
    fn(nb);
    return nb;
  };
  /** Un campo opcional: vacío lo borra. */
  const opt = (obj, key, v) => {
    if (v === undefined || v === '' || Number.isNaN(v)) delete obj[key];
    else obj[key] = v;
  };

  // ---------------------------------------------------------------- secciones

  function buildingHTML() {
    const b = ed.b;
    const s = b.shell;
    const poly = s.outline;
    const n = poly.length;
    const bb = bbox(poly);
    let h = '<h3>Nave</h3>';
    h += text(
      'name',
      'Nombre',
      b => b.name,
      (b, v) => edit(nb => (nb.name = v)),
    );
    h += text(
      'id',
      'Id',
      b => b.id,
      (b, v) => edit(nb => (nb.id = slug(v) || nb.id)),
    );
    h += text(
      'city',
      'Ciudad',
      b => b.city,
      (b, v) => edit(nb => opt(nb, 'city', v.trim())),
    );
    if (n >= 3) {
      const per = poly.reduce((a, p, i) => a + dist(p, poly[(i + 1) % n]), 0);
      h += `<div class="stat"><span>Planta</span><span>${fmt(area(poly), 1)} m² · ${fmt(bb.x1 - bb.x0)} × ${fmt(bb.z1 - bb.z0)} m</span></div>`;
      h += `<div class="stat"><span>Perímetro</span><span>${fmt(per, 1)} m · ${n} vértices</span></div>`;
    } else
      h += `<p class="note">Sin contorno: elegí la herramienta Contorno (P) y hacé clic en cada vértice, o empezá de un rectángulo (Nueva ▾).</p>`;

    h += '<h3>Alturas</h3>';
    h += num(
      'clear',
      'Altura libre',
      b => b.shell.clearHeight,
      (b, v) => edit(nb => (nb.shell.clearHeight = v)),
      { title: 'Libre bajo la estructura (jácenas, cerchas)' },
    );
    h += num(
      'eave',
      'Alero',
      b => b.shell.eaveHeight,
      (b, v) => edit(nb => opt(nb.shell, 'eaveHeight', v)),
      { blank: true, title: 'Arranque de la cubierta en la fachada lateral (vacío: altura libre + canto)' },
    );
    h += num(
      'ridge',
      'Cumbrera',
      b => b.shell.ridgeHeight,
      (b, v) => edit(nb => opt(nb.shell, 'ridgeHeight', v)),
      { blank: true, title: 'Lo más alto de la cubierta (= alero si es plana)' },
    );

    h += '<h3>Cubierta</h3>';
    h += choice(
      'roof',
      'Tipo',
      ROOF_TYPES,
      b => b.shell.roof?.type ?? 'flat',
      (b, v) =>
        edit(nb => {
          nb.shell.roof = { ...(nb.shell.roof ?? {}), type: v };
          if (v === 'flat' && nb.shell.eaveHeight !== undefined) nb.shell.ridgeHeight = nb.shell.eaveHeight;
        }),
    );
    const axis = s.roof?.ridgeAxis ?? (bb.z1 - bb.z0 >= bb.x1 - bb.x0 ? 'z' : 'x');
    h += choice(
      'ridgeAxis',
      'Cumbrera a lo largo de',
      [
        ['z', 'z (el fondo)'],
        ['x', 'x (el ancho)'],
      ],
      () => axis,
      (b, v) => edit(nb => (nb.shell.roof = { type: 'flat', ...(nb.shell.roof ?? {}), ridgeAxis: v })),
    );
    if (s.roof?.type === 'shed')
      h += `<p class="note">A un agua: baja hacia ${axis === 'z' ? '−x' : '−z'} (alero) y sube hacia ${axis === 'z' ? '+x' : '+z'} (cumbrera).</p>`;

    h += '<h3>Estructura</h3>';
    h += choice(
      'stype',
      'Tipo',
      STRUCT_TYPES,
      b => b.shell.structure?.type ?? 'precast-concrete',
      (b, v) => edit(nb => (nb.shell.structure = { ...(nb.shell.structure ?? {}), type: v })),
    );
    h += choice(
      'frameAxis',
      'Pórticos a lo largo de',
      [
        ['z', 'z'],
        ['x', 'x'],
      ],
      b => b.shell.structure?.frameAxis ?? axis,
      (b, v) => edit(nb => (nb.shell.structure = { ...(nb.shell.structure ?? {}), frameAxis: v })),
    );
    h += num(
      'frameSpacing',
      'Entre pórticos',
      b => b.shell.structure?.frameSpacing,
      (b, v) => edit(nb => opt((nb.shell.structure ??= {}), 'frameSpacing', v)),
      { blank: true },
    );
    h += num(
      'beam',
      'Canto de jácena',
      b => b.shell.structure?.beamDepth,
      (b, v) => edit(nb => opt((nb.shell.structure ??= {}), 'beamDepth', v)),
      { blank: true },
    );

    const cols = s.structure?.columns ?? [];
    h += `<h3>Pilares · ${cols.length}</h3>`;
    h += `<p class="note">Clic con la herramienta Pilar (C), o en retícula: líneas cada «separación» desde la esquina mínima más el desfase; las del borde quedan contra el muro.</p>`;
    h += `<div class="pair">${gridNum('sx', 'Separación x')}${gridNum('sz', 'Separación z')}</div>`;
    h += `<div class="pair">${gridNum('ox', 'Desfase x')}${gridNum('oz', 'Desfase z')}</div>`;
    h += `<div class="pair">${gridNum('w', 'Sección x')}${gridNum('d', 'Sección z')}</div>`;
    h += '<div class="buttons">';
    h += button('gridReplace', 'Poner la retícula', () => applyGrid(true), 'primary');
    h += button('gridAdd', 'Sumarla a los que hay', () => applyGrid(false));
    if (cols.length)
      h += button(
        'colsClear',
        'Borrar todos',
        () => ed.commit(edit(nb => (nb.shell.structure.columns = []))),
        'danger',
      );
    h += '</div>';

    h += '<h3>Muros</h3>';
    h += choice(
      'wtype',
      'Acabado',
      WALL_TYPES,
      b => b.shell.walls?.type ?? 'precast-panel',
      (b, v) => edit(nb => (nb.shell.walls = { ...(nb.shell.walls ?? {}), type: v })),
    );
    h += color(
      'wcolor',
      'Color',
      b => b.shell.walls?.color,
      (b, v) => edit(nb => (nb.shell.walls = { ...(nb.shell.walls ?? {}), color: v })),
    );
    h += num(
      'plinth',
      'Zócalo',
      b => b.shell.walls?.plinthHeight,
      (b, v) => edit(nb => opt((nb.shell.walls ??= {}), 'plinthHeight', v)),
      { blank: true },
    );

    if (n >= 3) {
      h += '<h3>Calle</h3>';
      const opts = [['', '—'], ...poly.map((_, k) => [String(k), `arista ${k} · ${fmt(edgeLength(b, k))} m`])];
      h += choice(
        'street',
        'Fachada a la calle',
        opts,
        b => (Number.isInteger(b.shell.exterior?.streetEdge) ? String(b.shell.exterior.streetEdge) : ''),
        (b, v) =>
          edit(nb => {
            nb.shell.exterior = { ...(nb.shell.exterior ?? {}) };
            opt(nb.shell.exterior, 'streetEdge', v === '' ? undefined : Number(v));
          }),
      );
      h += num(
        'sidewalk',
        'Acera',
        b => b.shell.exterior?.sidewalk,
        (b, v) => edit(nb => opt((nb.shell.exterior ??= {}), 'sidewalk', v)),
        { blank: true },
      );
      h += num(
        'road',
        'Calzada',
        b => b.shell.exterior?.road,
        (b, v) => edit(nb => opt((nb.shell.exterior ??= {}), 'road', v)),
        { blank: true },
      );

      h += '<h3 id="edgesHead">Vértices y aristas</h3>';
      for (let k = 0; k < n; k++) {
        h += `<div class="pair">${num(
          `vx${k}`,
          `${k} · x`,
          b => b.shell.outline[k]?.[0],
          (b, v) => moveVertex(b, k, [v, b.shell.outline[k][1]]),
        )}${num(
          `vz${k}`,
          'z',
          b => b.shell.outline[k]?.[1],
          (b, v) => moveVertex(b, k, [b.shell.outline[k][0], v]),
        )}</div>`;
        h += num(
          `len${k}`,
          `arista ${k} → ${(k + 1) % n}`,
          b => edgeLength(b, k),
          (b, v) => setEdgeLength(b, k, v),
          { title: 'Corre el vértice final (y el muro siguiente si es perpendicular)' },
        );
      }
    }
    h += ed.bgPanel?.() ?? '';
    return h;
  }

  const gridNum = (k, label) => {
    fields.set(`grid.${k}`, { get: () => grid[k], set: (b, v) => ((grid[k] = v), null), kind: 'num' });
    return `<label class="row"><span>${label}</span><span class="unit" data-unit="m"><input data-k="grid.${k}" value="${fmt(grid[k], 3)}" inputmode="decimal"></span></label>`;
  };

  function applyGrid(replace) {
    const b = ed.b;
    if (b.shell.outline.length < 3) return ed.toast('Primero el contorno');
    const cols = columnGrid(b.shell.outline, grid);
    ed.commit(
      edit(nb => {
        nb.shell.structure = { ...(nb.shell.structure ?? {}) };
        nb.shell.structure.columns = [...(replace ? [] : (nb.shell.structure.columns ?? [])), ...cols];
      }),
    );
    ed.ui.columnSize = [grid.w, grid.d];
    ed.toast(`${cols.length} pilares`);
  }

  function vertexHTML(i) {
    const b = ed.b;
    const poly = b.shell.outline;
    const n = poly.length;
    let h = `<h3>Vértice ${i}</h3>`;
    h += `<div class="pair">${num(
      'vx',
      'x',
      b => b.shell.outline[i][0],
      (b, v) => moveVertex(b, i, [v, b.shell.outline[i][1]]),
    )}${num(
      'vz',
      'z',
      b => b.shell.outline[i][1],
      (b, v) => moveVertex(b, i, [b.shell.outline[i][0], v]),
    )}</div>`;
    const prev = (i - 1 + n) % n;
    h += num(
      'lprev',
      `Arista ${prev} (llega)`,
      b => edgeLength(b, prev),
      (b, v) => setEdgeLength(b, prev, v),
    );
    h += num(
      'lnext',
      `Arista ${i} (sale)`,
      b => edgeLength(b, i),
      (b, v) => setEdgeLength(b, i, v),
    );
    h += '<div class="buttons">';
    h += button(
      'delv',
      'Borrar el vértice',
      () => {
        if (n <= 3) return ed.toast('El contorno necesita al menos 3 vértices');
        ed.commit(deleteVertex(b, i));
        ed.select(null);
      },
      'danger',
    );
    h += button('insv', 'Vértice al medio de la arista que sale', () => {
      const p = poly[i];
      const q = poly[(i + 1) % n];
      ed.commit(insertVertex(b, i, [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]));
      ed.select({ kind: 'vertex', i: i + 1 });
    });
    h += '</div>';
    return h;
  }

  function edgeHTML(k) {
    const b = ed.b;
    const poly = b.shell.outline;
    const n = poly.length;
    const f = edgeFrame(poly, k);
    let h = `<h3>Arista ${k} · del vértice ${k} al ${(k + 1) % n}</h3>`;
    h += num(
      'elen',
      'Largo',
      b => edgeLength(b, k),
      (b, v) => setEdgeLength(b, k, v),
      { title: 'Corre el vértice final (y el muro siguiente si es perpendicular)' },
    );
    h += `<div class="stat"><span>Dirección</span><span>${fmt((Math.atan2(-f.dir[1], f.dir[0]) * 180) / Math.PI, 1)}° · normal hacia dentro ${fmt(f.nIn[0], 2)}, ${fmt(f.nIn[1], 2)}</span></div>`;
    h += check(
      'estreet',
      'Fachada a la calle',
      b => b.shell.exterior?.streetEdge === k,
      (b, v) =>
        edit(nb => {
          nb.shell.exterior = { ...(nb.shell.exterior ?? {}) };
          if (v) nb.shell.exterior.streetEdge = k;
          else if (nb.shell.exterior.streetEdge === k) delete nb.shell.exterior.streetEdge;
        }),
    );
    const ops = (b.shell.openings ?? []).map((o, i) => [o, i]).filter(([o]) => o.edge === k);
    h += `<h3>Huecos en esta arista · ${ops.length}</h3>`;
    for (const [o, i] of ops)
      h += `<div class="issue info" data-goto="opening:${i}">${esc(openingLabel(o))} · ${fmt(o.width)} × ${fmt(o.height)} m · centro a ${fmt(o.t * f.len)} m</div>`;
    h += '<div class="kind">';
    for (const kd of OPENING_KINDS)
      h += button(`add-${kd.key}`, `+ ${kd.label}`, () => {
        const o = newOpening(kd.key, k, 0.5);
        o.width = Math.min(o.width, round(f.len - 0.1, 2));
        ed.commit(edit(nb => (nb.shell.openings = [...(nb.shell.openings ?? []), o])));
        ed.select({ kind: 'opening', i: (ed.b.shell.openings?.length ?? 1) - 1 });
      });
    h += '</div><div class="buttons">';
    h += button('insmid', 'Vértice al medio', () => {
      ed.commit(insertVertex(b, k, [(f.a[0] + f.b[0]) / 2, (f.a[1] + f.b[1]) / 2]));
      ed.select({ kind: 'vertex', i: k + 1 });
    });
    h += '</div>';
    return h;
  }

  function openingHTML(i) {
    const b = ed.b;
    const o = b.shell.openings[i];
    const poly = b.shell.outline;
    const len = o.edge >= 0 && o.edge < poly.length ? edgeLength(b, o.edge) : 0;
    const upd = fn => (b, v) => edit(nb => (nb.shell.openings[i] = fn({ ...nb.shell.openings[i] }, v)));
    let h = `<h3>Hueco ${i} · ${esc(openingLabel(o))}</h3>`;
    h += '<div class="kind">';
    for (const kd of OPENING_KINDS)
      h += button(
        `kind-${kd.key}`,
        kd.label,
        () => ed.commit(edit(nb => (nb.shell.openings[i] = withOpeningKind(nb.shell.openings[i], kd.key)))),
        kd.key === openingKind(o) ? 'on' : '',
      );
    h += '</div>';
    const edges = poly.map((_, k) => [String(k), `arista ${k} · ${fmt(edgeLength(b, k))} m`]);
    h += choice(
      'oedge',
      'Arista',
      edges,
      () => String(o.edge),
      upd((x, v) => ({ ...x, edge: Number(v) })),
    );
    h += num(
      'ow',
      'Ancho',
      () => o.width,
      upd((x, v) => ({ ...x, width: v })),
    );
    h += num(
      'oh',
      'Alto',
      () => o.height,
      upd((x, v) => ({ ...x, height: v })),
    );
    h += num(
      'osill',
      'Antepecho',
      () => o.sill ?? 0,
      upd((x, v) => ({ ...x, sill: v })),
      { title: '0 = a nivel del suelo' },
    );
    h += num(
      'oc',
      `Centro desde el vértice ${o.edge}`,
      () => o.t * len,
      upd((x, v) => ({ ...x, t: len > 0 ? round(v / len, 4) : x.t })),
    );
    h += num(
      'o0',
      'Primera jamba a',
      () => o.t * len - o.width / 2,
      upd((x, v) => ({ ...x, t: len > 0 ? round((v + x.width / 2) / len, 4) : x.t })),
      { title: `Distancia del vértice ${o.edge} al borde del hueco` },
    );
    h += num(
      'ot',
      'Posición t (0–1)',
      () => o.t,
      upd((x, v) => ({ ...x, t: v })),
      { unit: '', d: 4 },
    );
    h += check(
      'oprop',
      'Propuesta (hoy no está)',
      () => o.proposed === true,
      upd((x, v) => {
        const y = { ...x };
        if (v) y.proposed = true;
        else delete y.proposed;
        return y;
      }),
    );
    h += text(
      'olabel',
      'Nota',
      () => o.label,
      upd((x, v) => {
        const y = { ...x };
        opt(y, 'label', v.trim());
        return y;
      }),
    );
    h += '<div class="buttons">';
    h += button(
      'odel',
      'Borrar el hueco',
      () => {
        ed.commit(edit(nb => nb.shell.openings.splice(i, 1)));
        ed.select(null);
      },
      'danger',
    );
    h += button('oedgego', `Ver la arista ${o.edge}`, () => ed.select({ kind: 'edge', i: o.edge }));
    h += '</div>';
    return h;
  }

  function columnHTML(i) {
    const c = ed.b.shell.structure.columns[i];
    const upd = fn => (b, v) =>
      edit(nb => (nb.shell.structure.columns[i] = fn({ ...nb.shell.structure.columns[i] }, v)));
    let h = `<h3>Pilar ${i}</h3>`;
    h += `<div class="pair">${num(
      'cx',
      'Centro x',
      () => c.x + c.w / 2,
      upd((x, v) => ({ ...x, x: round(v - x.w / 2) })),
    )}${num(
      'cz',
      'z',
      () => c.z + c.d / 2,
      upd((x, v) => ({ ...x, z: round(v - x.d / 2) })),
    )}</div>`;
    h += `<div class="pair">${num(
      'cw',
      'Sección x',
      () => c.w,
      upd((x, v) => ({ ...x, x: round(x.x + (x.w - v) / 2), w: v })),
    )}${num(
      'cd',
      'z',
      () => c.d,
      upd((x, v) => ({ ...x, z: round(x.z + (x.d - v) / 2), d: v })),
    )}</div>`;
    h += num(
      'ch',
      'Altura (si no llega)',
      () => c.h,
      upd((x, v) => {
        const y = { ...x };
        opt(y, 'h', v);
        return y;
      }),
      { blank: true, title: 'Vacío: hasta la cubierta' },
    );
    h += '<div class="buttons">';
    h += button(
      'cdel',
      'Borrar el pilar',
      () => {
        ed.commit(edit(nb => nb.shell.structure.columns.splice(i, 1)));
        ed.select(null);
      },
      'danger',
    );
    h += button('csize', 'Esta sección para los nuevos', () => {
      ed.ui.columnSize = [c.w, c.d];
      ed.toast(`Pilares nuevos de ${fmt(c.w)} × ${fmt(c.d)} m`);
    });
    h += '</div>';
    return h;
  }

  function existingHTML(i) {
    const e = ed.b.shell.existing[i];
    const upd = fn => (b, v) => edit(nb => (nb.shell.existing[i] = fn({ ...nb.shell.existing[i] }, v)));
    const set = key =>
      upd((x, v) => {
        const y = { ...x };
        opt(y, key, v);
        return y;
      });
    const moveTo = key =>
      upd((x, v) => {
        const y = { ...x, [key]: v };
        // los pilares del altillo van con él
        if (Array.isArray(x.columns)) y.columns = x.columns.map(c => ({ ...c, [key]: round(c[key] + v - x[key]) }));
        return y;
      });
    const title =
      e.type === 'mezzanine' ? 'Altillo' : e.type === 'stairs-existing' ? 'Escalera existente' : 'Bloque existente';
    let h = `<h3>${title} ${i}</h3>`;
    h += `<div class="pair">${num('ex', 'x', () => e.x, moveTo('x'))}${num('ez', 'z', () => e.z, moveTo('z'))}</div>`;
    h += `<div class="pair">${num('ew', 'Ancho (x)', () => e.w, set('w'))}${num('ed', 'Fondo (z)', () => e.d, set('d'))}</div>`;
    if (e.type === 'mezzanine') {
      h += num('efh', 'Cota del forjado', () => e.floorHeight, set('floorHeight'), { title: 'El nivel donde se pisa' });
      h += num('eh', 'Alto de oficinas', () => e.height, set('height'), {
        blank: true,
        title: '0 = planta libre con barandilla',
      });
      h += num('eslab', 'Canto del forjado', () => e.slabDepth, set('slabDepth'), {
        blank: true,
        title: 'Por defecto 0,3 m',
      });
      h += choice(
        'eglazed',
        'Frente acristalado',
        [['', 'ninguno'], ...SIDES.map(s => [s, s])],
        () => e.glazedFront ?? '',
        upd((x, v) => {
          const y = { ...x };
          opt(y, 'glazedFront', v || undefined);
          return y;
        }),
      );
      const free = (ed.b.shell.clearHeight ?? 0) - (e.floorHeight ?? 0) - (e.slabDepth ?? 0.3);
      h += `<div class="stat"><span>Libre debajo</span><span>${fmt(e.floorHeight - (e.slabDepth ?? 0.3))} m · arriba hasta la altura libre ${fmt(free)} m</span></div>`;
    } else if (e.type === 'stairs-existing') {
      h += num('erise', 'Desnivel', () => e.rise, set('rise'), { title: 'Lo que sube (negativo si baja)' });
      h += choice(
        'edir',
        'Sube hacia',
        SIDES.map(s => [s, s]),
        () => e.dir ?? (e.d >= e.w ? '+z' : '+x'),
        set('dir'),
      );
      h += choice(
        'eshape',
        'Forma',
        [
          ['straight', 'Recta'],
          ['L', 'En L'],
          ['U', 'En U (ida y vuelta)'],
        ],
        () => e.shape ?? 'straight',
        set('shape'),
      );
      h += num('eflights', 'Tramos', () => e.flights, set('flights'), { unit: '', blank: true, d: 0 });
      if (e.shape === 'U') h += num('ewidth', 'Ancho de tramo', () => e.width, set('width'), { blank: true });
      h += num('ey', 'Arranca a', () => e.y, set('y'), {
        blank: true,
        title: 'Cota de donde arranca (vacío: el suelo)',
      });
    } else {
      h += num('ebh', 'Alto', () => e.height, set('height'), { blank: true });
    }
    h += text(
      'elabel',
      'Nombre',
      () => e.label,
      upd((x, v) => {
        const y = { ...x };
        opt(y, 'label', v.trim());
        return y;
      }),
    );
    h += '<div class="buttons">';
    h += button(
      'edel',
      'Borrar',
      () => {
        ed.commit(edit(nb => nb.shell.existing.splice(i, 1)));
        ed.select(null);
      },
      'danger',
    );
    h += '</div>';
    return h;
  }

  function toolHTML() {
    const t = ed.ui.tool;
    if (t === 'opening') {
      let h = '<h3>Hueco a poner</h3><div class="kind">';
      for (const kd of OPENING_KINDS)
        h += button(
          `tool-${kd.key}`,
          kd.label,
          () => {
            ed.ui.openingKind = kd.key;
            update(true);
          },
          kd.key === ed.ui.openingKind ? 'on' : '',
        );
      return (
        h +
        '</div><p class="note">Clic sobre un muro. Después se arrastra a lo largo de él, o se escriben sus medidas acá.</p>'
      );
    }
    if (t === 'column') {
      const [w, d] = ed.ui.columnSize;
      return `<h3>Pilar a poner</h3><p class="note">Sección ${fmt(w)} × ${fmt(d)} m (la cambia «Esta sección para los nuevos» en un pilar o la retícula de la nave). Se alinea con los demás pilares y los vértices.</p>`;
    }
    if (t === 'outline')
      return '<h3>Contorno</h3><p class="note">Clic en cada vértice (el contorno interior de la nave). Un número y Enter: el largo del tramo en la dirección del puntero. Se cierra con un clic en el primer vértice o con Enter. ⌫ borra el último punto, Esc empieza de nuevo.</p>';
    if (t === 'mezzanine' || t === 'stairs')
      return `<h3>${t === 'mezzanine' ? 'Altillo' : 'Escalera'}</h3><p class="note">Arrastrar el rectángulo; las medidas se ajustan después en este panel.</p>`;
    if (t === 'calibrate') return ed.bgPanel?.() ?? '';
    return '';
  }

  // ---------------------------------------------------------------- armado

  function html() {
    fields = new Map();
    acts = new Map();
    const sel = ed.ui.sel;
    const b = ed.b;
    let h = toolHTML();
    const path = pathOfSel(sel);
    const all = ed.issues.length ? ed.issues : checkBuilding(b);
    if (path) {
      const mine = all.filter(it => it.path === path || it.path.startsWith(path + '.'));
      if (mine.length) h += issueList(mine);
    }
    if (sel?.kind === 'vertex' && sel.i < b.shell.outline.length) h += vertexHTML(sel.i);
    else if (sel?.kind === 'edge' && sel.i < b.shell.outline.length) h += edgeHTML(sel.i);
    else if (sel?.kind === 'opening' && b.shell.openings?.[sel.i]) h += openingHTML(sel.i);
    else if (sel?.kind === 'column' && b.shell.structure?.columns?.[sel.i]) h += columnHTML(sel.i);
    else if (sel?.kind === 'existing' && b.shell.existing?.[sel.i]) h += existingHTML(sel.i);
    else if (ed.ui.tool === 'select' || ed.ui.tool === 'column') h += buildingHTML();
    const errs = all.filter(i => i.level === 'error').length;
    h += `<h3>Comprobaciones · ${errs ? `${errs} error${errs > 1 ? 'es' : ''}` : 'sin errores'}</h3>`;
    h += all.length ? issueList(all) : '<p class="note">La nave cumple el esquema.</p>';
    if (ed.coreNote) h += `<p class="note">${esc(ed.coreNote)}</p>`;
    issuesShown = all;
    return h;
  }
  let issuesShown = [];

  function commitField(el) {
    const k = el.dataset.k;
    const f = fields.get(k);
    if (!f) return;
    let v;
    if (f.kind === 'num') {
      const raw = el.value.trim();
      if (raw === '' && f.blank) v = undefined;
      else {
        v = parseNum(raw);
        if (!Number.isFinite(v)) {
          el.classList.add('bad');
          ed.toast(`«${raw}» no es un número`);
          return;
        }
      }
    } else if (f.kind === 'bool') v = el.checked;
    else v = el.value;
    const nb = f.set(ed.b, v);
    if (nb) ed.commit(nb);
    else update(true);
  }

  function bind() {
    for (const el of root.querySelectorAll('[data-k]')) {
      const input = /** @type {HTMLInputElement} */ (el);
      input.addEventListener('change', () => commitField(input));
      // Enter aplica (el `change` de Chrome); Esc sale del campo sin aplicar
      input.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
          const f = fields.get(input.dataset.k);
          if (f && input.type !== 'checkbox')
            input.value = f.kind === 'num' ? fmtField(f.get(ed.b)) : String(f.get(ed.b) ?? '');
          input.blur();
        }
      });
    }
    for (const el of root.querySelectorAll('[data-act]'))
      el.addEventListener('click', () => acts.get(/** @type {HTMLElement} */ (el).dataset.act)?.());
    for (const el of root.querySelectorAll('[data-issue]'))
      el.addEventListener('click', () => {
        const it = issuesShown[Number(/** @type {HTMLElement} */ (el).dataset.issue)];
        if (it) ed.select(selOfPath(it.path));
      });
    for (const el of root.querySelectorAll('[data-goto]'))
      el.addEventListener('click', () => {
        const [kind, i] = /** @type {HTMLElement} */ (el).dataset.goto.split(':');
        ed.select({ kind, i: Number(i) });
      });
    ed.bindBgPanel?.(root);
  }

  let pending = 0;
  /** Rearma el panel (al próximo cuadro: después de que el foco se movió), conservando el campo con foco. */
  function update(now = false) {
    const run = () => {
      pending = 0;
      const a = /** @type {HTMLInputElement | null} */ (document.activeElement);
      const k = a && root.contains(a) ? a.dataset.k : null;
      const sel = k && a.selectionStart !== null ? [a.selectionStart, a.selectionEnd] : null;
      const scroll = root.scrollTop;
      root.innerHTML = html();
      bind();
      root.scrollTop = scroll;
      if (k) {
        const el = /** @type {HTMLInputElement | null} */ (root.querySelector(`[data-k="${CSS.escape(k)}"]`));
        if (el) {
          el.focus({ preventScroll: true });
          if (sel && el.setSelectionRange && el.type === 'text') el.setSelectionRange(sel[0], sel[1]);
        }
      }
    };
    if (now) {
      cancelAnimationFrame(pending);
      run();
    } else if (!pending) pending = requestAnimationFrame(run);
  }

  // la nave cambió (también por deshacer o desde el panel del park): sin rearmar en cada cuadro de un arrastre
  S.subscribe((_, { live }) => {
    if (!live) update(false);
  });
  // el nombre de arriba
  const nameInput = /** @type {HTMLInputElement} */ (document.getElementById('naveName'));
  const syncName = () => {
    if (document.activeElement !== nameInput) nameInput.value = ed.b.name ?? '';
  };
  nameInput.addEventListener('change', () => ed.commit({ ...clone(ed.b), name: nameInput.value.trim() || 'Nave' }));
  nameInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') nameInput.blur();
  });
  S.subscribe(syncName);
  syncName();
  return { update };
}

const fmtField = v => (v === undefined || v === null || Number.isNaN(v) ? '' : fmt(v, 3));

/** Un id de nave: minúsculas, cifras y guiones (como los del sitio). */
export const slug = s =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
