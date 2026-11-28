// La barra de arriba del editor de naves: empezar otra nave (en blanco, un rectángulo o el edificio de una de las naves
// del sitio), importar y exportar el JSON, copiarlo, deshacer y rehacer, y soltar en el plano un JSON (la nave) o una
// imagen (el fondo para calcar).
import * as S from './state.js';
import { parseNum } from './draw-geom.js';
import { emptyBuilding, naveOf, rectangleBuilding } from './draw-model.js';

const $ = s => /** @type {HTMLElement} */ (document.querySelector(s));
const esc = s =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;');

export function initIO(ed) {
  /** Las naves del sitio: `[{ id, name, city }]`, que escribe editor-build.mjs en la página. */
  const naves = (() => {
    try {
      return JSON.parse($('#naveList').textContent || '[]');
    } catch {
      return [];
    }
  })();
  const menu = $('#newMenu');
  $('#naveMenu').innerHTML = naves.length
    ? naves
        .map(n => `<button data-nave="${esc(n.id)}">${esc(n.name)}<small>${esc(n.city ?? '')}</small></button>`)
        .join('')
    : '<div class="sep">(no hay naves en esta copia del sitio)</div>';
  const close = () => (menu.hidden = true);
  $('#newBtn').onclick = e => {
    e.stopPropagation();
    menu.hidden = !menu.hidden;
  };
  window.addEventListener('click', e => {
    if (!menu.hidden && !menu.contains(/** @type {Node} */ (e.target))) close();
  });
  menu.addEventListener('click', async e => {
    const btn = /** @type {HTMLElement} */ (e.target).closest('button');
    if (!btn) return;
    close();
    if (btn.dataset.new === 'blank') {
      S.loadBuilding(emptyBuilding());
      ed.setTool('outline');
      ed.toast('Nave en blanco: clic en cada vértice del contorno');
    } else if (btn.dataset.new === 'rect') rectDialog();
    else if (btn.dataset.nave) await openNave(btn.dataset.nave);
  });

  async function openNave(id) {
    if (!/^[a-z0-9-]+$/.test(id)) return;
    try {
      const res = await fetch(`data/${id}.json`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const L = await res.json();
      S.loadBuilding(naveOf(L));
      ed.setTool('select');
      ed.toast(`${L.name}: el edificio, sin la pista ni las zonas (⌘Z vuelve a la de antes)`);
    } catch (e) {
      ed.toast(`No se pudo abrir ${id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  function rectDialog() {
    const dlg = /** @type {HTMLDialogElement} */ ($('#rectDialog'));
    const form = /** @type {HTMLFormElement} */ (dlg.querySelector('form'));
    dlg.onclose = () => {
      if (dlg.returnValue !== 'ok') return;
      const f = new FormData(form);
      const w = parseNum(f.get('w'));
      const l = parseNum(f.get('l'));
      const h = parseNum(f.get('h'));
      if (!(w > 1 && l > 1 && h > 1))
        return ed.toast('Ancho, largo y altura libre tienen que ser números de más de 1 m');
      S.loadBuilding(rectangleBuilding(w, l, { clearHeight: h, doors: f.get('doors') === 'on' }));
      ed.setTool('select');
    };
    dlg.returnValue = '';
    dlg.showModal();
  }

  // ---------------------------------------------------------------- archivos

  const fileInput = /** @type {HTMLInputElement} */ ($('#fileInput'));
  $('#importBtn').onclick = () => fileInput.click();
  fileInput.onchange = () => {
    const f = fileInput.files?.[0];
    fileInput.value = '';
    if (f) void openFile(f);
  };

  async function openFile(f) {
    if (f.type.startsWith('image/')) return ed.bg?.loadFile(f);
    try {
      S.loadBuilding(S.parseBuilding(await f.text()));
      ed.setTool('select');
      ed.toast(`Importada: ${S.getBuilding().name}`);
    } catch (e) {
      ed.toast(`No se pudo importar ${f.name}: ${e instanceof Error ? e.message : String(e)}`, 6000);
    }
  }

  const canvas = $('#canvas');
  canvas.addEventListener('dragover', e => {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  });
  canvas.addEventListener('drop', e => {
    e.preventDefault();
    const f = e.dataTransfer?.files?.[0];
    if (f) void openFile(f);
  });

  $('#exportBtn').onclick = () => {
    const b = S.getBuilding();
    const blob = new Blob([S.exportJSON(b)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${b.id || 'nave'}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  $('#copyBtn').onclick = async () => {
    try {
      await navigator.clipboard.writeText(S.exportJSON());
      ed.toast('JSON de la nave copiado');
    } catch (e) {
      ed.toast(`No se pudo copiar: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  // ---------------------------------------------------------------- deshacer y guardado

  const undoBtn = /** @type {HTMLButtonElement} */ ($('#undoBtn'));
  const redoBtn = /** @type {HTMLButtonElement} */ ($('#redoBtn'));
  undoBtn.onclick = () => S.undo();
  redoBtn.onclick = () => S.redo();
  const saved = $('#saved');
  let t = 0;
  const sync = (_, meta) => {
    undoBtn.disabled = !S.canUndo();
    redoBtn.disabled = !S.canRedo();
    if (meta && !meta.live) {
      clearTimeout(t);
      t = setTimeout(() => {
        saved.textContent = `guardada en este navegador · ${new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`;
      }, 400);
    }
  };
  S.subscribe(sync);
  sync(null, null);
  saved.textContent = 'se guarda sola en este navegador';
  return { openNave };
}
