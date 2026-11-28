// Visor de una nave (sim.html?id=<id>): la interfaz de jjant.github.io/naves sobre createPark() de park3d, con el motor
// Rust (Bevy + WebGPU: el .wasm de rust/pkg y sus assets de rust/assets, que copia build.mjs junto a la página).
// El 3D (escena, luz, gente, cámaras, cine) es del paquete; acá va lo que dibuja la página: cabecera, barra de vistas,
// recorrido, modo a pie con joystick, etiquetas (park.labels + park.project()), ficha con el plano acotado y las
// fotos del anuncio, galería de renders de Cycles con visor 360° y «Foto realista» de cada vista. Solo usa la API de
// `Park` (nada del motor por dentro).
// Parámetros: id, view, src (layout a leer; o el layout entero en `#layout=…`, layout-link.js), people=0 / life=0 (sin gente), photos (abre la galería), baked=0 / baked=1
// (sin la luz horneada de Cycles / pedirla aunque el índice no la liste: por defecto va en las naves con un bake al día;
// lm=<carpeta dentro de rust/assets>, otra carpeta), hoy=1 (la
// nave como está hoy, el botón «La nave como está hoy»: `fitout: false` del layout), fps=1 (el medidor de cuadros
// por segundo y ms por cuadro, ver fps.js), upscaler=fsr|browser (cómo se sube a la pantalla una escala de render < 1:
// FSR 1 o el navegador estirando, para compararlos a ojo), scale=0.75 (la escala de render fija, de 0,25 a 1, en vez
// del gobernador; `auto` es el de siempre) y sky=clear|overcast (el cielo: sin él, el del día de las fotos del anuncio,
// el `sky` del layout, en la nave de hoy, y el despejado con la propuesta).
import { instrument, showFps } from './fps.js';
import { fillSheet } from './sheet.js';
import { openPano } from './pano.js';
import { layoutFromHash } from './layout-link.js';

const q = new URLSearchParams(location.search);
const id = q.get('id') || 'montigala';
// el paquete sin esperarlo (su núcleo, ~0,5 MB, se importa con await al nivel del módulo): así el plano se pide a la
// vez, no después; sim.html ya pidió con `modulepreload`/`preload` el paquete y el motor (build.mjs)
const PARK3D = import('@snowpark-bcn/park3d');
PARK3D.catch(() => {}); // el error lo ve `main`, al esperarlo
const FPS = q.get('fps') === '1';
const UPSCALER = q.get('upscaler');
const SCALE = q.get('scale');
/**
 * La óptica del cine desde `?lens=` (para medir lo que cuesta, docs/PERF.md): `0` ninguna, `dof` o `blur` solo esa;
 * sin el parámetro (o con otro valor), las dos, como siempre.
 */
const LENS = { 0: [false, false], none: [false, false], dof: [true, false], blur: [false, true] }[q.get('lens') ?? ''];
const SKY = q.get('sky');
/** `upscaler`, `renderScale` y `light.sky` de createPark desde `?upscaler=`, `?scale=` y `?sky=` (lo que no sirve se ignora). */
const renderOptions = () => {
  const o = {};
  if (SKY === 'clear' || SKY === 'overcast') o.light = { sky: SKY };
  if (UPSCALER === 'fsr' || UPSCALER === 'browser') o.upscaler = UPSCALER;
  const s = Number(SCALE);
  if (SCALE === 'auto') o.renderScale = 'auto';
  else if (SCALE && s >= 0.25 && s <= 1) o.renderScale = s;
  return o;
};
const TOUCH = matchMedia('(pointer: coarse)').matches; // solo interfaz (joystick, etiquetas): el render es siempre ultra
// el motor Rust: el módulo de wasm-bindgen (el .wasm va al lado) y la carpeta de los assets para Bevy
const WASM = new URL('rust/pkg/park3d_web.js', location.href);
const RUST_ASSETS = new URL('rust/assets/', location.href).href;
const $ = s => document.querySelector(s);

const status = $('#status');
const statusText = $('#statusText');
const statusBar = $('#statusBar');
/** El cartel del medio: el texto y, si se sabe, la barra de avance (`done` de 0 a 1; sin ella, la barra se va). */
const setStatus = (t, done = null) => {
  statusText.textContent = t;
  status.hidden = !t;
  statusBar.hidden = done == null;
  if (done != null) statusBar.style.setProperty('--done', String(Math.max(0, Math.min(1, done))));
};
/**
 * El avance de createPark en el cartel: la descarga del motor (bytes) y después las texturas (bytes de las cercanas
 * hasta que se ven; el resto sigue llegando con la nave en pantalla, abajo a la derecha).
 */
const onProgress = p => {
  if (p.stage === 'renderer' && p.total) setStatus(p.message, p.loaded / p.total);
  else if (p.stage === 'textures' && p.textures?.near) setStatus(p.message, p.textures.nearReady / p.textures.near);
  else if (p.stage === 'textures' && p.textures?.bytes) setStatus(p.message, p.textures.bytesReady / p.textures.bytes);
  else setStatus(p.message);
};
/** Las texturas que siguen llegando con la nave ya en pantalla: un aviso chico abajo a la derecha, hasta la última. */
const streamEl = $('#stream');
const streaming = p => {
  streamEl.textContent = p.message;
  streamEl.hidden = !p.message || !!p.textures?.done;
};
/** Lo que pesa el .wasm del motor (lo anota build.mjs en el preload de sim.html): el total de su descarga. */
const WASM_BYTES = Number(document.querySelector('link[data-wasm-bytes]')?.getAttribute('data-wasm-bytes')) || 0;
/** Un aviso que se va solo a los 4 s (si no lo reemplazó otro). */
const flash = t => {
  setStatus(t);
  setTimeout(() => {
    if (status.textContent === t) setStatus('');
  }, 4000);
};

/** El layout de `src` o el de la nave `id` en data/. */
async function fetchLayout() {
  const res = await fetch(q.get('src') || `data/${id}.json`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`no está el plano de «${id}» (HTTP ${res.status})`);
  return res.json();
}

async function main() {
  // el id va a rutas y a atributos: solo los de las naves (minúsculas, cifras y guiones)
  if (!/^[a-z0-9-]+$/.test(id)) throw new Error(`id de nave no válido: «${id}»`);
  setStatus('Cargando el plano…');
  // a la vez que el plano: el índice de la luz horneada es un JSON chico
  const bakedP = bakedLightmaps(id);
  // `#layout=…`: el layout entero en la URL, comprimido (el de «Abrir en el visor» del editor, js/layout-link.js)
  const L = await (layoutFromHash(location.hash) ?? fetchLayout());
  // la nave como está hoy (`fitout: false`): sin el park ni lo que la propuesta pone en la nave, con sus luminarias
  let today = q.get('hoy') === '1';
  const layoutFor = on => (on ? { ...L, fitout: false } : L);
  const { createPark } = await PARK3D;
  document.title = `${L.name} · simulador 3D · Snowpark Barcelona`;
  $('#name').textContent = L.name;
  $('#city').textContent = `${L.city || ''}${L.rank ? ` · puesto ${L.rank}` : ''}${L.score ? ` · ${L.score}/100` : ''}`;

  // ------- ficha (no depende del 3D: se puede abrir mientras carga; se arma la primera vez que se abre) -------
  let sheet = null;
  const openSheet = () => {
    sheet ??= fillSheet($('#sheetBody'), L).catch(e => {
      console.error(e);
      sheet = null;
      $('#sheetBody').textContent = 'No se pudo armar la ficha: ' + e.message;
    });
    document.body.classList.toggle('sheet-open');
  };
  $('#sheetBtn').onclick = openSheet;
  $('#closeSheet').onclick = () => document.body.classList.remove('sheet-open');
  const renders = loadRenders(id);

  // ------- el park -------
  const people = q.get('people') !== '0' && q.get('life') !== '0';
  const canvas = /** @type {HTMLCanvasElement} */ ($('#park'));
  if (FPS) instrument(); // antes de crear el park: cuenta desde el primer cuadro
  let ready = false;
  const baked = await bakedP;
  const park = await createPark(canvas, {
    layout: layoutFor(today),
    engine: 'rust',
    wasm: WASM,
    // `rustAssets` es la carpeta de Bevy; `assets` (la del motor JS, obligatoria en el tipo) apunta a la misma
    assets: RUST_ASSETS,
    rustAssets: RUST_ASSETS,
    view: q.get('view') || 'maqueta',
    people,
    ...renderOptions(),
    ...(baked ? { lightmaps: q.get('lm') || 'lightmaps/' } : {}),
    // la nave se entrega con las texturas que se ven desde la vista inicial; el resto (y la gente) llega después
    ready: 'near',
    wasmBytes: WASM_BYTES,
    onProgress: p => {
      // para las herramientas (load-time.mjs: cuándo estuvieron las cercanas), como `__ready`
      if (p.textures) window.__textures = p.textures;
      if (!ready) onProgress(p);
      else if (p.stage === 'textures') streaming(p);
    },
  });
  ready = true;
  if (LENS) park.cinemaLens(LENS[0], LENS[1]);
  setStatus('');
  if (FPS) showFps(park, canvas);
  park.on('error', ({ error }) => setStatus('Error en el simulador: ' + error.message));

  // ------- vistas, a pie, recorrido y cine -------
  const chips = $('#views');
  // las vistas del park (cambian con «La nave como está hoy»: sin park no hay plataforma, pista ni zonas)
  const fillChips = () => {
    chips.replaceChildren();
    for (const v of park.views) {
      const b = document.createElement('button');
      b.textContent = v.title;
      b.dataset.name = v.name;
      b.onclick = () => park.goTo(v);
      chips.appendChild(b);
    }
  };
  fillChips();
  const photoBtn = $('#viewPhoto');
  const RENDERS = new Map();
  const syncPhoto = () => {
    // las fotos de Cycles son del park: la nave de hoy no tiene
    const v = today || park.mode === 'tour' || park.mode === 'cinema' ? null : park.view;
    const r = v && RENDERS.get(v.name);
    const p = v && RENDERS.get(v.name + '-360');
    photoBtn.hidden = !r && !p;
    if (!v || (!r && !p)) return;
    photoBtn.textContent = p ? 'Foto 360° realista' : 'Foto realista';
    photoBtn.onclick = () =>
      p ? pano(`renders/${id}/${p.file}`, p.title || v.title) : window.open(`renders/${id}/${r.file}`, '_blank');
  };
  const sync = () => {
    const mode = park.mode;
    for (const b of chips.children) b.classList.toggle('on', mode !== 'tour' && b.dataset.name === park.view?.name);
    $('#mode').textContent = mode === 'walk' ? 'Maqueta' : 'A pie';
    $('#tourBtn').classList.toggle('on', mode === 'tour');
    $('#cineBtn').classList.toggle('on', mode === 'cinema');
    document.body.classList.toggle('walking', mode === 'walk');
    document.body.classList.toggle('touring', mode === 'tour');
    document.body.classList.toggle('cine', mode === 'cinema');
    syncPhoto();
  };
  park.on('view', sync);
  park.on('mode', sync);
  $('#mode').onclick = () => park.walk(park.mode !== 'walk');
  $('#tourBtn').onclick = () => park.tour(park.mode !== 'tour');
  $('#cineBtn').onclick = () => {
    try {
      park.cinema(park.mode !== 'cinema');
    } catch (e) {
      flash('El cine no arrancó: ' + e.message);
    }
  };
  sync();

  // ------- joystick táctil (modo a pie) -------
  const joy = $('#joy'),
    knob = $('#knob');
  let joyId = null,
    joyC = [0, 0];
  joy.addEventListener('pointerdown', e => {
    joyId = e.pointerId;
    const r = joy.getBoundingClientRect();
    joyC = [r.left + r.width / 2, r.top + r.height / 2];
    joy.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  joy.addEventListener('pointermove', e => {
    if (e.pointerId !== joyId) return;
    let dx = (e.clientX - joyC[0]) / 50,
      dy = (e.clientY - joyC[1]) / 50;
    const m = Math.hypot(dx, dy);
    if (m > 1) {
      dx /= m;
      dy /= m;
    }
    park.setJoystick(dx, dy);
    knob.style.transform = `translate(${dx * 38}px, ${dy * 38}px)`;
  });
  const joyEnd = () => {
    joyId = null;
    park.setJoystick(0, 0);
    knob.style.transform = '';
  };
  joy.addEventListener('pointerup', joyEnd);
  joy.addEventListener('pointercancel', joyEnd);

  // ------- etiquetas -------
  const labels = makeLabels(park, L);

  // ------- la nave como está hoy -------
  // el mismo park con `fitout: false` (setLayout: la cámara sigue donde estaba); otra vez, la propuesta
  const todayBtn = $('#todayBtn');
  let switching = false;
  const syncToday = () => {
    todayBtn.classList.toggle('on', today);
    todayBtn.textContent = today ? 'Con el park' : 'La nave como está hoy';
    document.body.classList.toggle('today', today);
  };
  todayBtn.onclick = async () => {
    if (switching) return;
    switching = true;
    if (park.mode === 'tour') park.tour(false);
    if (park.mode === 'cinema') park.cinema(false);
    today = !today;
    syncToday();
    setStatus(today ? 'Armando la nave como está hoy…' : 'Armando el park…');
    try {
      await park.setLayout(layoutFor(today));
      setStatus('');
    } catch (e) {
      today = !today;
      syncToday();
      flash('No se pudo cambiar: ' + e.message);
    } finally {
      switching = false;
    }
    fillChips();
    labels.rebuild();
    sync();
  };
  syncToday();

  // ------- fotos de Cycles (galería, 360° y «Foto realista» por vista) -------
  // mientras está abierto el 360° el park se pausa (park.pause: ni dibuja ni simula)
  const pano = (url, title) =>
    openPano(url, title, {
      pause: () => {
        park.pause(true);
        labels.pause(true);
      },
      resume: () => {
        park.pause(false);
        labels.pause(false);
      },
    });
  renders.then(views => {
    if (!views) return;
    for (const v of views) RENDERS.set(v.name, v);
    galleryFor(id, views, pano);
    syncPhoto();
  });

  // dev/: capturas y depuración en Chromium sin pantalla
  Object.assign(window, { park, __park: park, __views: park.views, __ready: true });
}

/** Etiquetas del motor sobre el canvas: prioridad por tipo, sin solaparse, y a pie solo lo cercano. */
function makeLabels(park, L) {
  const layer = $('#labels');
  const short = t => {
    let x = String(t)
      .split(/[:(;·]| — | - /)[0]
      .replace(/,\s*$/, '')
      .trim();
    if (x.length > 34) x = x.slice(0, 32).trim() + '…';
    return x.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  };
  const PRIO = { slope: 0, module: 2, zone: 1, existing: 3, safety: 4 };
  // las del park de ahora (otra vez tras un setLayout: «La nave como está hoy» no tiene las de la pista ni las zonas)
  const make = () => {
    layer.replaceChildren();
    const out = park.labels.map(l => {
      const el = document.createElement('div');
      el.className = 'tag ' + l.kind;
      el.title = l.text;
      el.innerHTML = `<b>${short(l.text)}</b>${l.sub ? `<small>${short(l.sub)}</small>` : ''}`;
      layer.appendChild(el);
      return { el, l, size: null, shown: undefined };
    });
    out.sort((a, b) => (PRIO[a.l.kind] ?? 5) - (PRIO[b.l.kind] ?? 5));
    return out;
  };
  let items = make();
  const poly = L.shell.outline;
  const inPoly = (x, z) => {
    let c = false;
    for (let i = 0, n = poly.length; i < n; i++) {
      const [x1, z1] = poly[i],
        [x2, z2] = poly[(i + 1) % n];
      if (z1 > z !== z2 > z && x < x1 + ((z - z1) * (x2 - x1)) / (z2 - z1)) c = !c;
    }
    return c;
  };
  const xs = poly.map(p => p[0]),
    zs = poly.map(p => p[1]);
  const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs));
  let show = !(TOUCH || Math.min(innerWidth, innerHeight) < 600); // pantallas chicas: sin etiquetas de entrada
  let paused = false;
  const btn = $('#labelsBtn');
  const syncBtn = () => {
    layer.hidden = !show;
    btn.classList.toggle('on', show);
  };
  btn.onclick = () => {
    show = !show;
    syncBtn();
  };
  syncBtn();
  addEventListener('resize', () => {
    for (const it of items) it.size = null;
  });
  const hide = it => {
    if (it.shown !== false) {
      it.el.style.display = 'none';
      it.shown = false;
    }
  };
  // rectángulos ya puestos (se reciclan): una etiqueta que pisa a otra de más prioridad no se muestra
  const placed = [];
  let frame = 0;
  const update = () => {
    requestAnimationFrame(update);
    if (!show || paused) return;
    const mode = park.mode;
    const onFoot = mode === 'walk' || mode === 'tour';
    const c = park.cameraState?.position;
    if (!c) return;
    if (onFoot && !inPoly(c[0], c[2])) {
      for (const it of items) hide(it);
      return;
    }
    let n = 0;
    frame++;
    for (const it of items) {
      const { el, l } = it;
      const p = park.project(l.position);
      const dist = Math.hypot(c[0] - l.position[0], c[1] - l.position[1], c[2] - l.position[2]);
      let vis =
        p.visible &&
        (onFoot
          ? l.kind === 'safety'
            ? dist < 6
            : dist < 10
          : l.kind === 'slope' || l.kind === 'zone' || (l.kind === 'module' && dist < span * 0.7));
      if (vis) {
        if (!it.size || (it.size[2] && frame % 30 === 0)) {
          el.style.display = '';
          it.shown = true;
          const w = el.offsetWidth,
            h = el.offsetHeight;
          it.size = [w || 80, h || 20, !w];
        }
        const x0 = p.x - it.size[0] / 2,
          y0 = p.y - it.size[1] - 6,
          x1 = p.x + it.size[0] / 2,
          y1 = p.y;
        let hit = false;
        for (let i = 0; i < n && !hit; i++) {
          const r = placed[i];
          hit = x0 < r[2] && x1 > r[0] && y0 < r[3] && y1 > r[1];
        }
        if (hit) vis = false;
        else {
          const r = placed[n] || (placed[n] = [0, 0, 0, 0]);
          r[0] = x0;
          r[1] = y0;
          r[2] = x1;
          r[3] = y1;
          n++;
        }
      }
      if (it.shown !== vis) {
        el.style.display = vis ? '' : 'none';
        it.shown = vis;
      }
      if (vis) el.style.transform = `translate(-50%, -100%) translate(${p.x}px, ${p.y}px)`;
    }
  };
  requestAnimationFrame(update);
  return {
    pause(on) {
      paused = on;
    },
    rebuild() {
      items = make();
    },
  };
}

/** renders/<id>/renders.json (fotos de Cycles que pasaron el filtro de frescura de build.mjs), o null. */
/**
 * ¿La nave lleva la luz horneada de Cycles? Por defecto, sí si su bake está al día: las que lista `naves` de
 * rust/assets/lightmaps/index.json (build.mjs publica solo los bakes que cubren todos los lotes de la escena que arma
 * el motor publicado, del mismo layout). Es de la escena con el park: en la nave como está hoy (`hoy=1`, el mismo park
 * con `fitout: false`) el motor no lo aplica (`fits_scene` de lightmap.rs: el manifiesto dice de qué escena es, y la
 * cobertura sola no las separa, porque la cáscara y la calle son las mismas), así que se pide igual con «La nave como
 * está hoy» y vale al volver al park (cada `setLayout` lo vuelve a pedir). `baked=0` lo apaga (la luz en tiempo real);
 * `baked=1` lo pide aunque el índice no lo liste (uno de otra geometría lo descarta el motor). Sin índice, sin bake.
 * @param {string} nave
 */
async function bakedLightmaps(nave) {
  const b = q.get('baked');
  if (b === '0') return false;
  if (b === '1') return true;
  try {
    const r = await fetch(new URL('lightmaps/index.json', RUST_ASSETS), { cache: 'no-store' });
    if (!r.ok) return false;
    const index = await r.json();
    return Array.isArray(index?.naves) && index.naves.includes(nave);
  } catch {
    return false;
  }
}

async function loadRenders(id) {
  try {
    const r = await fetch(`renders/${id}/renders.json`);
    if (!r.ok) return null;
    const data = await r.json();
    const views = Array.isArray(data) ? data : data.views;
    return Array.isArray(views) && views.length ? views : null;
  } catch {
    return null; // sin renders todavía
  }
}

const esc = s =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;');

function galleryFor(id, views, pano) {
  const box = $('#photos');
  box.hidden = false;
  $('#photosBtn').hidden = false;
  $('#photosBtn').onclick = () => document.body.classList.toggle('photos-open');
  const panos = views.filter(v => v.type === 'pano'),
    stills = views.filter(v => v.type !== 'pano');
  const base = `renders/${id}/`;
  box.querySelector('.grid').innerHTML =
    panos
      .map(v => {
        const t = (v.title || v.name).replace(/\s*·\s*360°$/, '');
        return `<a href="#" data-pano="${esc(base + v.file)}" data-title="${esc(t)} · 360°"><img loading="lazy" src="${esc(base + (v.thumb || v.file))}" alt=""><span>360° · ${esc(t)}</span></a>`;
      })
      .join('') +
    stills
      .map(
        v =>
          `<a href="${esc(base + v.file)}" target="_blank" rel="noopener"><img loading="lazy" src="${esc(base + (v.thumb || v.file))}" alt="${esc(v.title || v.name)}"><span>${esc(v.title || v.name)}</span></a>`,
      )
      .join('');
  for (const a of box.querySelectorAll('[data-pano]'))
    a.onclick = ev => {
      ev.preventDefault();
      pano(a.dataset.pano, a.dataset.title);
    };
  if (q.get('photos') !== null) document.body.classList.add('photos-open');
}

main().catch(e => {
  console.error(e);
  setStatus('No se pudo cargar el simulador: ' + e.message);
});
