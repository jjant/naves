/**
 * La capa del «Cine» para el motor Rust (src/park-rust.ts): las mismas bandas 2,39:1, la mosca «En directo», el
 * rótulo inferior y el botón de salir que dibuja cinema.js para el motor JS (mismo DOM y mismos estilos, limitados a
 * `[data-park3d-cine]`), y su atajo de teclado (C entra y sale, Esc sale, → o N corta al plano siguiente). El motor
 * Rust no toca el DOM: avisa el modo (`mode: 'cinema'`) y cada rótulo (`caption`), y esto los dibuja.
 * @internal
 */
const STYLE = `[data-park3d-cine]{position:absolute;inset:0;z-index:15;pointer-events:none;display:none;container-type:size;--lb:max(0px,calc((100cqh - 100cqw / 2.39) / 2))}
[data-park3d-cine].on{display:block}
[data-park3d-cine] .lb{position:absolute;left:0;right:0;height:var(--lb);background:#000}[data-park3d-cine] .lb.t{top:0}[data-park3d-cine] .lb.b{bottom:0}
[data-park3d-cine] .bug{position:absolute;left:max(16px,4cqw);top:calc(var(--lb) + 14px);font:650 11px/1 system-ui,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:#fff;background:rgba(0,0,0,.38);padding:6px 9px;border-radius:4px}
[data-park3d-cine] .bug i{display:inline-block;width:7px;height:7px;border-radius:50%;background:#ff2d55;margin-right:7px;vertical-align:1px;animation:cineRec 1.6s infinite}
[data-park3d-cine] .bug span{letter-spacing:.03em;text-transform:none;font-weight:500;opacity:.85}
@keyframes cineRec{50%{opacity:.2}}
[data-park3d-cine] .l3{position:absolute;left:max(16px,5cqw);bottom:calc(var(--lb) + 20px);max-width:72cqw;padding:8px 18px 9px 13px;border-left:4px solid var(--pink,#DF0763);background:linear-gradient(90deg,rgba(10,18,28,.84),rgba(10,18,28,.6) 70%,rgba(10,18,28,0));color:#fff;opacity:0;transform:translateX(-14px);transition:opacity .45s,transform .45s}
[data-park3d-cine] .l3.in{opacity:1;transform:none}
[data-park3d-cine] .l3 b{display:block;font:700 19px/1.15 system-ui,sans-serif;letter-spacing:-.01em}
[data-park3d-cine] .l3 span{display:block;font:13px/1.3 system-ui,sans-serif;color:#d5dee7;margin-top:3px}
[data-park3d-cine] .x{position:absolute;right:max(14px,3cqw);top:calc(var(--lb) + 10px);pointer-events:auto;font-size:13px;padding:6px 12px}`;
/**
 * La capa sobre `host` (por defecto el padre del canvas, que pasa a `position: relative` si era `static`). `exit` es
 * lo que hace el botón «✕ Salir».
 * @internal
 */
export function createCinemaOverlay(host, name, exit) {
    let unposition = null;
    if (getComputedStyle(host).position === 'static') {
        const was = host.style.position;
        host.style.position = 'relative';
        unposition = () => {
            host.style.position = was;
        };
    }
    const el = document.createElement('div');
    el.dataset.park3dCine = '';
    const st = document.createElement('style');
    st.textContent = STYLE;
    el.append(st);
    const div = (cls, parent = el) => {
        const d = document.createElement('div');
        d.className = cls;
        parent.append(d);
        return d;
    };
    div('lb t');
    div('lb b');
    const bug = div('bug');
    bug.append(document.createElement('i'), 'En directo');
    const where = document.createElement('span');
    bug.append(where);
    const l3 = div('l3');
    const title = document.createElement('b');
    const sub = document.createElement('span');
    l3.append(title, sub);
    const x = document.createElement('button');
    x.type = 'button';
    x.className = 'x';
    x.title = 'Salir del cine (Esc)';
    x.textContent = '✕ Salir';
    x.onclick = () => {
        exit();
    };
    el.append(x);
    host.append(el);
    const rename = (n) => {
        where.textContent = n ? ` · ${n}` : '';
    };
    rename(name);
    return {
        show(on) {
            el.classList.toggle('on', on);
        },
        caption(a, b) {
            l3.classList.remove('in');
            void l3.offsetWidth; // vuelve a empezar la transición
            title.textContent = a;
            sub.textContent = b;
            l3.classList.add('in');
        },
        rename,
        dispose() {
            el.remove();
            unposition?.();
        },
    };
}
/**
 * El atajo de teclado del cine en `window`, como cinema.js: C entra y sale, Esc sale, → o N corta al plano siguiente
 * (no con modificadores ni escribiendo en un campo). Devuelve la función que lo quita.
 * @internal
 */
export function cinemaKeys(active, set, next) {
    const onKey = (e) => {
        if (e.metaKey || e.ctrlKey || e.altKey)
            return;
        if (e.target instanceof Element && e.target.closest('input,select,textarea'))
            return;
        if (e.code === 'Escape' && active()) {
            e.preventDefault();
            set(false);
        }
        else if (e.code === 'KeyC' && !e.repeat)
            set(!active());
        else if (active() && (e.code === 'ArrowRight' || e.code === 'KeyN'))
            next();
    };
    addEventListener('keydown', onKey);
    return () => {
        removeEventListener('keydown', onKey);
    };
}
//# sourceMappingURL=cinema-overlay.js.map