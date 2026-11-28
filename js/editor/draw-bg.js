// La imagen de fondo del editor de naves, para calcar: un plano escaneado o la foto del plano de un anuncio. Se carga
// (botón, o soltándola en el plano), se calibra con dos puntos y la distancia real entre ellos, se gira, se mueve y se
// le baja la opacidad. No se exporta: se guarda en localStorage, recomprimida a ≤ 2400 px para que entre.
//
// Mientras la página está abierta vive en las coordenadas del marco de la pantalla (las de la nave menos `off`, lo que
// la nave se corrió al normalizarse desde que se abrió: draw.js), así no se despega de la nave al correrla ni al
// deshacer. Lo que se guarda es dónde cae en las coordenadas de la nave guardada (`AT_KEY`, con cada guardado de la
// nave: `onSave` de state.js): al recargar, `off` vuelve a 0 y la imagen sigue sobre lo que se calcó.
import * as S from './state.js';
import { dist, fmt, parseNum, round } from './draw-geom.js';

/** La imagen (`src`, `w`, `h`, `name`; y dónde estaba al cargarla, de las versiones que no guardaban `AT_KEY`). */
const KEY = 'naves-editor:background:v1';
/** Dónde cae y cómo se ve: `{ x, z, scale, rot, opacity, visible }`, en las coordenadas de la nave guardada. */
const AT_KEY = 'naves-editor:background-at:v1';
const MAX_PX = 2400;
const N = v => round(v, 4);
const esc = s =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;');
const num = (v, dflt) => (Number.isFinite(Number(v)) ? Number(v) : dflt);

/**
 * El fondo leído de localStorage, con cada campo de su tipo (o null). El almacenamiento es del origen entero
 * (jjant.github.io, con las otras páginas que haya ahí): lo que se lee no se mete en el HTML sin pasar por acá.
 */
export function readBackground(v) {
  if (!v || typeof v !== 'object' || typeof v.src !== 'string' || !/^data:image\/[a-z+.-]+;base64,/i.test(v.src))
    return null;
  const w = num(v.w, 0);
  const h = num(v.h, 0);
  const scale = num(v.scale, 0);
  if (!(w > 0 && h > 0 && scale > 0)) return null;
  return {
    src: v.src,
    w,
    h,
    x: num(v.x, 0),
    z: num(v.z, 0),
    scale,
    rot: num(v.rot, 0),
    opacity: Math.max(0.05, Math.min(1, num(v.opacity, 0.5))),
    visible: v.visible !== false,
    name: typeof v.name === 'string' ? v.name.slice(0, 200) : '',
  };
}

export function initBackground(ed) {
  const layer = /** @type {SVGGElement} */ (/** @type {unknown} */ (document.getElementById('bgWorld')));
  /** `{ src, w, h, x, z, scale (m por píxel de la imagen), rot (°), opacity, visible }` en coordenadas de pantalla. */
  let st = null;
  try {
    st = readBackground(JSON.parse(localStorage.getItem(KEY) ?? 'null'));
    const at = st && JSON.parse(localStorage.getItem(AT_KEY) ?? 'null');
    // al abrir, el marco es la nave (off = 0)
    if (st && at && typeof at === 'object') st = readBackground({ ...st, ...at }) ?? st;
  } catch {
    st = null;
  }
  let moving = false;
  let drag = null;

  /** De la nave a las coordenadas del fondo (lo que la nave se corrió desde que se abrió). */
  const toFrame = p => {
    const o = ed.offsetOf(ed.b);
    return [p[0] - o[0], p[1] - o[1]];
  };

  /** Dónde cae la imagen, en las coordenadas de la nave `b` (la que se acaba de guardar). */
  function saveAt(b) {
    if (!st) return localStorage.removeItem(AT_KEY);
    const o = ed.offsetOf(b);
    const { scale, rot, opacity, visible } = st;
    localStorage.setItem(
      AT_KEY,
      JSON.stringify({ x: N(st.x + o[0]), z: N(st.z + o[1]), scale, rot, opacity, visible }),
    );
  }
  S.onSave(saveAt);

  /** Guarda la imagen (con `image`: también la imagen en sí, que pesa) y dónde cae, junto con la nave de ahora. */
  function persist({ image = false } = {}) {
    try {
      if (image && st) localStorage.setItem(KEY, JSON.stringify(st));
      else if (!st) localStorage.removeItem(KEY);
      S.save();
    } catch {
      ed.toast(
        'La imagen no entra en el almacenamiento del navegador: no se guarda (al recargar hay que volver a cargarla)',
        6000,
      );
    }
  }

  /** La `<image>` del fondo (con setAttribute: el `src` es un data: URL que viene de localStorage). */
  let img = null;
  function render() {
    if (!st?.src || !st.visible) {
      img?.remove();
      img = null;
      return;
    }
    if (!img) {
      img = document.createElementNS('http://www.w3.org/2000/svg', 'image');
      img.setAttribute('x', '0');
      img.setAttribute('y', '0');
      img.setAttribute('preserveAspectRatio', 'none');
      layer.replaceChildren(img);
    }
    if (img.getAttribute('href') !== st.src) img.setAttribute('href', st.src);
    img.setAttribute('width', String(st.w));
    img.setAttribute('height', String(st.h));
    img.setAttribute('opacity', String(st.opacity));
    img.setAttribute('transform', `translate(${N(st.x)},${N(st.z)}) rotate(${N(st.rot)}) scale(${N(st.scale)})`);
  }

  /** Carga una imagen: recomprimida, del ancho de la nave (o 40 m) y con su esquina en la de la nave. */
  async function loadFile(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      const k = Math.min(1, MAX_PX / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.round(img.naturalWidth * k);
      const h = Math.round(img.naturalHeight * k);
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const g = c.getContext('2d');
      if (!g) throw new Error('sin canvas 2D');
      g.fillStyle = '#fff';
      g.fillRect(0, 0, w, h);
      g.drawImage(img, 0, 0, w, h);
      const src = c.toDataURL('image/jpeg', 0.86);
      const poly = ed.b.shell.outline;
      let x0 = 0;
      let z0 = 0;
      let span = 40;
      if (poly.length >= 3) {
        x0 = Math.min(...poly.map(p => p[0]));
        z0 = Math.min(...poly.map(p => p[1]));
        span = Math.max(...poly.map(p => p[0])) - x0 || 40;
        [x0, z0] = toFrame([x0, z0]);
      }
      st = { src, w, h, x: x0, z: z0, scale: span / w, rot: 0, opacity: 0.5, visible: true, name: file.name };
      persist({ image: true });
      ed.render();
      ed.setTool('calibrate');
      ed.fit({ withBg: true });
      ed.toast('Imagen cargada: ahora clic en los dos extremos de una medida conocida (una cota del plano)', 5000);
    } catch (e) {
      ed.toast(`No se pudo leer la imagen: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  /**
   * Un punto de la calibración (en coordenadas de la nave). Con el segundo, la distancia real se escribe en el plano
   * (el recuadro de draw.js, como los largos del contorno) y Enter la aplica (`applyCalibration`).
   */
  function calibrateClick(p) {
    if (!st?.src) return ed.toast('Primero una imagen de fondo (Importar, o soltarla en el plano)');
    if (moving) return;
    const d = ed.ui.draft?.points ?? [];
    if (d.length >= 2) d.length = 0;
    d.push([...p]);
    ed.ui.draft = { points: d };
    ed.ui.typed = '';
    if (d.length === 2 && measured() < 1e-6) d.length = 1;
    ed.showTyped();
    ed.render();
  }

  /** Lo que mide en la imagen el tramo de la calibración (m), o 0 si todavía no tiene los dos puntos. */
  function measured() {
    const d = ed.ui.draft?.points;
    return d?.length === 2 ? dist(toFrame(d[0]), toFrame(d[1])) : 0;
  }

  /** Escala la imagen alrededor del primer punto para que el tramo mida `real` m; devuelve qué quedó, o null. */
  function applyCalibration(real) {
    const d = ed.ui.draft?.points;
    const now = measured();
    if (!st || !d || !(now > 1e-6) || !(real > 0)) return null;
    const a = toFrame(d[0]);
    const k = real / now;
    st.scale *= k;
    st.x = a[0] + (st.x - a[0]) * k;
    st.z = a[1] + (st.z - a[1]) * k;
    ed.ui.draft = null;
    persist();
    ed.render();
    ed.refreshPanel?.();
    return `1 px = ${fmt(st.scale * 100, 2)} cm · la imagen mide ${fmt(st.w * st.scale, 1)} × ${fmt(st.h * st.scale, 1)} m`;
  }

  /** Gira la imagen alrededor de su centro. */
  function rotate(deg) {
    if (!st) return;
    const r0 = (st.rot * Math.PI) / 180;
    const r1 = (deg * Math.PI) / 180;
    const hw = (st.w * st.scale) / 2;
    const hh = (st.h * st.scale) / 2;
    const cx = st.x + Math.cos(r0) * hw - Math.sin(r0) * hh;
    const cz = st.z + Math.sin(r0) * hw + Math.cos(r0) * hh;
    st.rot = deg;
    st.x = cx - (Math.cos(r1) * hw - Math.sin(r1) * hh);
    st.z = cz - (Math.sin(r1) * hw + Math.cos(r1) * hh);
  }

  // ---------------------------------------------------------------- panel

  ed.bgPanel = () => {
    let h = '<h3>Imagen de fondo</h3>';
    if (!st?.src)
      return (
        h +
        '<div class="buttons"><button data-bg="load">Cargar un plano o una foto…</button></div><p class="note">Para calcar: después se calibra con dos puntos de una medida conocida.</p>'
      );
    h += `<p class="note">${st.name ? `${esc(st.name)} · ` : ''}${fmt(st.w, 0)} × ${fmt(st.h, 0)} px · 1 px = ${fmt(st.scale * 100, 2)} cm · ${fmt(st.w * st.scale, 1)} × ${fmt(st.h * st.scale, 1)} m</p>`;
    h += `<label class="row"><span>Opacidad</span><input type="range" min="0.05" max="1" step="0.05" value="${Number(st.opacity)}" data-bg="opacity"></label>`;
    h += `<label class="row"><span>Giro</span><span class="unit" data-unit="°"><input data-bg="rot" value="${fmt(st.rot, 2)}" inputmode="decimal"></span></label>`;
    h += `<label class="row"><span>Escala</span><span class="unit" data-unit="cm/px"><input data-bg="scale" value="${fmt(st.scale * 100, 4)}" inputmode="decimal"></span></label>`;
    h += `<label class="row"><span>Mover arrastrando</span><span><input type="checkbox" data-bg="move"${moving ? ' checked' : ''}></span></label>`;
    h += `<label class="row"><span>Visible</span><span><input type="checkbox" data-bg="visible"${st.visible ? ' checked' : ''}></span></label>`;
    h +=
      '<div class="buttons"><button data-bg="calibrate">Calibrar con dos puntos</button><button data-bg="load">Otra imagen…</button><button data-bg="remove" class="danger">Quitar</button></div>';
    return h;
  };
  ed.bindBgPanel = root => {
    for (const el of root.querySelectorAll('[data-bg]')) {
      const input = /** @type {HTMLInputElement} */ (el);
      const k = input.dataset.bg;
      if (input.tagName === 'BUTTON')
        input.addEventListener('click', () => {
          if (k === 'load') /** @type {HTMLInputElement} */ (document.getElementById('fileInput')).click();
          else if (k === 'remove') {
            st = null;
            moving = false;
            persist();
            render();
            ed.refreshPanel?.();
          } else if (k === 'calibrate') {
            moving = false;
            ed.setTool('calibrate');
            ed.toast('Clic en dos puntos de la imagen de una medida conocida');
          }
        });
      else
        input.addEventListener(input.type === 'range' ? 'input' : 'change', () => {
          if (!st) return;
          if (k === 'opacity') st.opacity = Number(input.value);
          else if (k === 'visible') st.visible = input.checked;
          else if (k === 'move') {
            moving = input.checked;
            if (moving) ed.setTool('calibrate');
          } else if (k === 'rot') {
            const v = parseNum(input.value);
            if (Number.isFinite(v)) rotate(v);
          } else if (k === 'scale') {
            const v = parseNum(input.value);
            if (v > 0) st.scale = v / 100;
          }
          persist();
          ed.render();
        });
    }
  };

  /** La caja de la imagen (girada) en las coordenadas del marco, o null sin imagen. */
  function bounds() {
    if (!st?.src) return null;
    const r = (st.rot * Math.PI) / 180;
    const c = [Math.cos(r), Math.sin(r)];
    const W = st.w * st.scale;
    const H = st.h * st.scale;
    const pts = [
      [0, 0],
      [W, 0],
      [W, H],
      [0, H],
    ].map(([u, v]) => [st.x + c[0] * u - c[1] * v, st.z + c[1] * u + c[0] * v]);
    const xs = pts.map(p => p[0]);
    const zs = pts.map(p => p[1]);
    return { x0: Math.min(...xs), z0: Math.min(...zs), x1: Math.max(...xs), z1: Math.max(...zs) };
  }

  return {
    render,
    loadFile,
    calibrateClick,
    measured,
    applyCalibration,
    bounds,
    get moving() {
      return moving && !!st;
    },
    /** Si hay imagen de fondo / si está a la vista. */
    get has() {
      return !!st?.src;
    },
    get shown() {
      return !!st?.src && st.visible;
    },
    /** Muestra u oculta la imagen (el «fondo» de la barra de ajustes, la tecla I y «Visible» del panel). */
    setVisible(v) {
      if (!st) return;
      st.visible = v;
      persist();
      ed.render();
      ed.refreshPanel?.();
    },
    /** Arrastrar la imagen (con «Mover arrastrando»): de un punto de la nave a otro. */
    startDrag(p) {
      drag = { p: toFrame(p), x: st.x, z: st.z };
    },
    dragTo(p) {
      if (!drag) return;
      const q = toFrame(p);
      st.x = drag.x + q[0] - drag.p[0];
      st.z = drag.z + q[1] - drag.p[1];
      render();
    },
    endDrag() {
      if (drag) persist();
      drag = null;
    },
  };
}
