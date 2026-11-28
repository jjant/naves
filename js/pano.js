// Visor 360° de los panoramas de Cycles (equirectangulares), en WebGL2 sobre #pano: un triángulo que cubre la pantalla
// y, por píxel, la dirección de la cámara pasada a longitud y latitud de la imagen (sin three.js: el 3D de la página es
// el motor Rust). Mientras está abierto, `pause()` frena el park (dos 3D a la vez se reparten la GPU) y `resume()` lo
// vuelve a poner. Dibuja solo cuando algo cambia (arrastrar, la rueda, el tamaño o la imagen que llega).

const $ = s => document.querySelector(s);
let pano = null;
let hooks = null;

const VS = `#version 300 es
in vec2 p;
out vec2 ndc;
void main() { ndc = p; gl_Position = vec4(p, 0.0, 1.0); }`;
// la misma esfera que tenía el visor de three (SphereGeometry invertida en x): el centro de la imagen queda hacia -x y
// el arriba de la imagen, hacia +y; `yaw` gira hacia la derecha
const FS = `#version 300 es
precision highp float;
in vec2 ndc;
uniform sampler2D tex;
uniform vec3 right, up, fwd;
uniform vec2 tanHalf;
out vec4 color;
const float PI = 3.141592653589793;
void main() {
  vec3 d = normalize(fwd + right * (ndc.x * tanHalf.x) + up * (ndc.y * tanHalf.y));
  float u = fract(atan(d.z, d.x) / (2.0 * PI));
  float v = acos(clamp(d.y, -1.0, 1.0)) / PI;
  color = texture(tex, vec2(u, v));
}`;

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('visor 360°: ' + gl.getShaderInfoLog(s));
  return s;
}

/** El visor: canvas, programa WebGL2 y estado de la cámara (yaw, pitch y fov en radianes / grados). */
function createViewer(wrap) {
  const canvas = document.createElement('canvas');
  canvas.style.touchAction = 'none';
  wrap.querySelector('.view').appendChild(canvas);
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false });
  if (!gl) throw new Error('visor 360°: este navegador no tiene WebGL2');
  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VS));
  gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error('visor 360°: ' + gl.getProgramInfoLog(prog));
  gl.useProgram(prog);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  // un píxel gris hasta que llega la imagen
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([40, 40, 40, 255]));
  // la costura de la longitud: REPEAT en u; sin mipmaps (la imagen se ve cerca de 1:1 con 75°), así no hay línea
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  const u = name => gl.getUniformLocation(prog, name);
  const U = { right: u('right'), up: u('up'), fwd: u('fwd'), tanHalf: u('tanHalf') };
  const v = { canvas, gl, tex, yaw: 0, pitch: 0, fov: 75, drag: null, open: false, ready: false, url: '', queued: 0 };

  const draw = () => {
    v.queued = 0;
    if (!v.open) return;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const w = Math.round(innerWidth * dpr),
      h = Math.round(innerHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    gl.viewport(0, 0, w, h);
    const cy = Math.cos(v.yaw),
      sy = Math.sin(v.yaw),
      cp = Math.cos(v.pitch),
      sp = Math.sin(v.pitch);
    // adelante, derecha (adelante × arriba del mundo) y arriba de la cámara, como lookAt de three
    const f = [sy * cp, sp, -cy * cp];
    const r = [cy, 0, sy];
    const up = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
    const t = Math.tan((v.fov * Math.PI) / 360);
    gl.uniform3fv(U.fwd, f);
    gl.uniform3fv(U.right, r);
    gl.uniform3fv(U.up, up);
    gl.uniform2f(U.tanHalf, (t * w) / h, t);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };
  v.redraw = () => {
    if (!v.queued) v.queued = requestAnimationFrame(draw);
  };
  canvas.addEventListener('pointerdown', e => {
    v.drag = [e.clientX, e.clientY];
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', e => {
    if (!v.drag) return;
    const k = (0.0035 * v.fov) / 75;
    v.yaw += (e.clientX - v.drag[0]) * k;
    v.pitch = Math.max(-1.45, Math.min(1.45, v.pitch + (e.clientY - v.drag[1]) * k));
    v.drag = [e.clientX, e.clientY];
    v.redraw();
  });
  const end = () => {
    v.drag = null;
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener(
    'wheel',
    e => {
      v.fov = Math.max(30, Math.min(100, v.fov + e.deltaY * 0.03));
      v.redraw();
      e.preventDefault();
    },
    { passive: false },
  );
  addEventListener('resize', () => v.redraw());
  return v;
}

export function openPano(url, title, { pause, resume } = {}) {
  const wrap = $('#pano');
  wrap.hidden = false;
  $('#panoTitle').textContent = title;
  hooks = { resume };
  pause?.();
  if (!pano) {
    pano = createViewer(wrap);
    Object.assign(window, { __pano: pano }); // dev/: depuración y ui-check (`ready` cuando la imagen ya se dibujó)
    $('#panoClose').onclick = () => {
      wrap.hidden = true;
      pano.open = false;
      hooks?.resume?.();
      hooks = null;
    };
  }
  pano.open = true;
  // el centro de la imagen (hacia el objetivo de la vista) queda en -x
  pano.yaw = -Math.PI / 2;
  pano.pitch = 0;
  pano.fov = 75;
  pano.redraw();
  if (pano.url === url) return;
  pano.url = url;
  pano.ready = false;
  const img = new Image();
  img.decoding = 'async';
  img.src = url;
  img
    .decode()
    .then(() => {
      if (pano.url !== url) return; // ya se pidió otro
      const { gl } = pano;
      gl.bindTexture(gl.TEXTURE_2D, pano.tex);
      // los bytes sRGB tal cual: el lienzo de WebGL2 los muestra así (sin pasar a lineal y volver)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      pano.ready = true;
      pano.redraw();
    })
    .catch(e => {
      console.error('visor 360°: no se pudo cargar', url, e);
    });
}
