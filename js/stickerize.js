// Convertir una imagen en sticker: quita el fondo automáticamente (o recortas con el lápiz)
// y le pone un marco blanco con sombrita, como sticker de verdad.
import { el, icon, $, toast, fileToDataURL, loadImage, compressImage } from './util.js';
import { mat, addSticker, createStickerFolder } from './materials.js';

const MAX_INPUT = 15 * 1024 * 1024;

function toCanvas(img, max = 800) {
  const k = Math.min(1, max / Math.max(img.width, img.height));
  const c = el('canvas');
  c.width = Math.max(1, Math.round(img.width * k));
  c.height = Math.max(1, Math.round(img.height * k));
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c;
}

// Quita el fondo: toma el color de las orillas y "inunda" desde los bordes todo lo parecido
function autoCut(src, tol) {
  const c = el('canvas');
  c.width = src.width; c.height = src.height;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(src, 0, 0);
  const W = c.width, H = c.height;
  const img = ctx.getImageData(0, 0, W, H);
  const d = img.data;
  const border = [];
  for (let x = 0; x < W; x += 2) border.push((0 * W + x) * 4, ((H - 1) * W + x) * 4);
  for (let y = 0; y < H; y += 2) border.push((y * W) * 4, (y * W + W - 1) * 4);
  const med = [0, 1, 2].map((k) => { const v = border.map((i) => d[i + k]).sort((a, b) => a - b); return v[v.length >> 1]; });
  const t2 = tol * tol;
  const near = (i) => d[i + 3] < 30 || ((d[i] - med[0]) ** 2 + (d[i + 1] - med[1]) ** 2 + (d[i + 2] - med[2]) ** 2) < t2;
  const seen = new Uint8Array(W * H);
  const stack = [];
  for (let x = 0; x < W; x++) stack.push(x, (H - 1) * W + x);
  for (let y = 0; y < H; y++) stack.push(y * W, y * W + W - 1);
  while (stack.length) {
    const p = stack.pop();
    if (seen[p]) continue;
    if (!near(p * 4)) continue;
    seen[p] = 1;
    const x = p % W, y = (p / W) | 0;
    if (x > 0) stack.push(p - 1);
    if (x < W - 1) stack.push(p + 1);
    if (y > 0) stack.push(p - W);
    if (y < H - 1) stack.push(p + W);
  }
  let removed = 0;
  for (let p = 0; p < W * H; p++) {
    if (seen[p]) { d[p * 4 + 3] = 0; removed++; }
    else {
      // suaviza la orilla: píxeles pegados al fondo quedan semitransparentes
      const x = p % W, y = (p / W) | 0;
      if ((x > 0 && seen[p - 1]) || (x < W - 1 && seen[p + 1]) || (y > 0 && seen[p - W]) || (y < H - 1 && seen[p + W])) d[p * 4 + 3] = Math.min(d[p * 4 + 3], 170);
    }
  }
  ctx.putImageData(img, 0, 0);
  return { canvas: c, ratio: removed / (W * H) };
}

function lassoCut(src, path) {
  const c = el('canvas');
  c.width = src.width; c.height = src.height;
  const ctx = c.getContext('2d');
  ctx.beginPath();
  path.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(src, 0, 0);
  return c;
}

function trim(c) {
  const ctx = c.getContext('2d', { willReadFrequently: true });
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
    if (d[(y * c.width + x) * 4 + 3] > 12) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (x1 < 0) return null;
  const out = el('canvas');
  out.width = x1 - x0 + 1; out.height = y1 - y0 + 1;
  out.getContext('2d').drawImage(c, -x0, -y0);
  return out;
}

// Marco blanco "coqueto" con sombrita alrededor de la silueta
function withBorder(c, r) {
  const t = trim(c);
  if (!t) return null;
  if (!r) return t;
  const pad = r + 10;
  const sil = el('canvas');
  sil.width = t.width; sil.height = t.height;
  const sctx = sil.getContext('2d');
  sctx.drawImage(t, 0, 0);
  sctx.globalCompositeOperation = 'source-in';
  sctx.fillStyle = '#fff';
  sctx.fillRect(0, 0, sil.width, sil.height);
  const ring = el('canvas');
  ring.width = t.width + pad * 2; ring.height = t.height + pad * 2;
  const rctx = ring.getContext('2d');
  for (let a = 0; a < 32; a++) {
    const ang = (a / 32) * Math.PI * 2;
    rctx.drawImage(sil, pad + Math.cos(ang) * r, pad + Math.sin(ang) * r);
  }
  rctx.drawImage(sil, pad, pad);
  const out = el('canvas');
  out.width = ring.width; out.height = ring.height;
  const o = out.getContext('2d');
  o.shadowColor = 'rgba(0,0,0,.28)'; o.shadowBlur = 8; o.shadowOffsetY = 3;
  o.drawImage(ring, 0, 0);
  o.shadowColor = 'transparent';
  o.drawImage(t, pad, pad);
  return out;
}

/**
 * opts.mode: 'insert' (desde el editor: insertar imagen o sticker) | 'save' (sólo guardar sticker)
 * opts.onImage({src,w,h}) · opts.onSticker(id) · opts.onDone()
 */
export async function openStickerMaker(file, opts = {}) {
  if (!file.type.startsWith('image/') || file.size > MAX_INPUT) { toast('Elige una imagen (máx. 15 MB)'); return; }
  const dataUrl = await fileToDataURL(file);
  const img = await loadImage(dataUrl);
  const src = toCanvas(img);
  const m = $('#modal');
  const st = { mode: opts.mode === 'save' ? 'auto' : 'image', tol: 48, border: 12, path: [], cut: null, folder: opts.folder || mat.folders[0] || 'Mis stickers', result: null };

  const view = el('canvas', { class: 'smk-view' });
  const info = el('p', { class: 'muted' });
  const controls = el('div', { class: 'smk-controls' });

  const compute = () => {
    if (st.mode === 'image') st.result = src;
    else if (st.mode === 'auto') {
      const { canvas, ratio } = autoCut(src, st.tol);
      st.result = withBorder(canvas, st.border);
      info.textContent = ratio < 0.03 ? 'No encontré un fondo liso. Sube la sensibilidad o usa “Recortar a mano”.' : 'Fondo quitado. Ajusta la sensibilidad si se comió partes de tu imagen.';
    } else {
      st.result = st.cut ? withBorder(st.cut, st.border) : null;
      info.textContent = st.cut ? 'Listo. Si no quedó bien, vuelve a dibujar el contorno.' : 'Dibuja con el lápiz o el dedo alrededor de lo que quieres recortar.';
    }
    draw();
  };
  const draw = () => {
    const showing = st.mode === 'manual' && !st.cut ? src : st.result || src;
    view.width = showing.width; view.height = showing.height;
    const ctx = view.getContext('2d');
    ctx.clearRect(0, 0, view.width, view.height);
    ctx.drawImage(showing, 0, 0);
    if (st.mode === 'manual' && !st.cut && st.path.length > 1) {
      ctx.save();
      ctx.strokeStyle = '#3d7bff'; ctx.lineWidth = Math.max(2, view.width / 250); ctx.setLineDash([10, 8]);
      ctx.beginPath(); st.path.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
      ctx.restore();
    }
  };
  // Recorte a mano
  const pos = (e) => { const r = view.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * view.width, ((e.clientY - r.top) / r.height) * view.height]; };
  view.addEventListener('pointerdown', (e) => {
    if (st.mode !== 'manual') return;
    try { view.setPointerCapture(e.pointerId); } catch { /* */ }
    st.cut = null; st.path = [pos(e)]; st.drawing = true; draw();
  });
  view.addEventListener('pointermove', (e) => { if (st.drawing) { st.path.push(pos(e)); draw(); } });
  const end = () => {
    if (!st.drawing) return;
    st.drawing = false;
    if (st.path.length > 8) { st.cut = lassoCut(src, st.path); compute(); }
  };
  view.addEventListener('pointerup', end);
  view.addEventListener('pointercancel', end);

  const folderSel = () => el('select', {
    onchange: async (e) => {
      if (e.target.value === '__new') {
        const n = await createStickerFolder(prompt('Nombre de la carpeta (ej. Dental)'));
        st.folder = n || st.folder;
        render();
      } else st.folder = e.target.value;
    },
  }, mat.folders.map((f) => el('option', { value: f, selected: f === st.folder }, f)), el('option', { value: '__new' }, '+ Nueva carpeta…'));

  const render = () => {
    const modes = [...(opts.mode === 'save' ? [] : [['image', 'Como imagen']]), ['auto', 'Sticker automático'], ['manual', 'Recortar a mano']];
    controls.replaceChildren(
      el('div', { class: 'tabs' }, modes.map(([k, n]) => el('button', { class: st.mode === k ? 'on' : '', onclick: () => { st.mode = k; render(); compute(); } }, n))),
      st.mode === 'auto' ? el('label', { class: 'field' }, el('span', {}, 'Sensibilidad del fondo'),
        el('input', { type: 'range', min: 10, max: 140, value: st.tol, onchange: (e) => { st.tol = +e.target.value; compute(); } })) : null,
      st.mode !== 'image' ? el('label', { class: 'field' }, el('span', {}, 'Marco blanco'),
        el('input', { type: 'range', min: 0, max: 26, value: st.border, onchange: (e) => { st.border = +e.target.value; compute(); } })) : null,
      st.mode !== 'image' ? el('label', { class: 'field' }, el('span', {}, 'Guardar en la carpeta'), folderSel()) : null,
      info,
      el('div', { class: 'row end' },
        el('button', { class: 'btn', onclick: () => m.close() }, 'Cancelar'),
        el('button', {
          class: 'btn primary', onclick: async () => {
            if (st.mode === 'image') {
              const r = await compressImage(dataUrl, 1600);
              m.close();
              opts.onImage?.(r);
              return;
            }
            if (!st.result) { toast('Primero recorta la imagen'); return; }
            let out = st.result;
            const k = Math.min(1, 600 / Math.max(out.width, out.height));
            if (k < 1) { const s = el('canvas'); s.width = Math.round(out.width * k); s.height = Math.round(out.height * k); s.getContext('2d').drawImage(out, 0, 0, s.width, s.height); out = s; }
            const id = await addSticker(out.toDataURL('image/png'), st.folder);
            m.close();
            toast(`Sticker guardado en “${st.folder}”`);
            opts.onSticker?.(id);
            opts.onDone?.();
          },
        }, st.mode === 'image' ? 'Insertar imagen' : opts.mode === 'save' ? 'Guardar sticker' : 'Guardar e insertar sticker')));
  };

  m.replaceChildren(el('div', { class: 'modal-card wide' },
    el('header', { class: 'modal-head' }, el('h2', {}, opts.mode === 'save' ? 'Nuevo sticker' : 'Agregar imagen'), el('button', { class: 'ib', onclick: () => m.close() }, icon('close'))),
    el('div', { class: 'modal-body smk' }, el('div', { class: 'smk-stage' }, view), controls)));
  render();
  compute();
  if (!m.open) m.showModal();
}
