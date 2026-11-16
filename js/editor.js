// Editor de cuaderno: lienzo, herramientas, páginas laterales, figuras perfectas,
// corrector de letra en tiempo real, lazo de selección, stickers, imágenes, capas y PDF.
import {
  $, el, icon, toast, emit, clamp, uid, wait, popover, closePopover, popoverOpenFor, menu,
  pickFiles, cachedImage, readyImage,
} from './util.js';
import { DB, getKV, setKV } from './db.js';
import { W, H, drawPaper, rulings, snapBaseline, snapX, lineStep, TEMPLATES, defaultPaper } from './paper.js';
import { drawStroke, perfectShape, bboxOf, distToSeg, view, inkColor } from './ink.js';
import { readPdf, pdfToNotebookPages, progressToast } from './pdf.js';
import * as HW from './handwriting.js';
import { PACKS, stickerSrc, customStickers, DEFAULT_BRUSHES } from './assets.js';
import { mat, fontGroups, addFontFiles, openMaterials, stickersIn } from './materials.js';
import { newPage, newLayer } from './model.js';
import { openTrainer } from './trainer.js';
import { openAssistant } from './assistant.js';
import { openStickerMaker } from './stickerize.js';

const INK = ['#1c1f26', '#2563eb', '#dc2626', '#16a34a', '#7c3aed', '#ea580c', '#0891b2', '#db2777', '#92400e', '#64748b', '#ffffff', '#facc15'];
const HL = ['#fde047', '#86efac', '#f9a8d4', '#93c5fd', '#fdba74', '#c4b5fd', '#67e8f9', '#fca5a5'];
const TOOLS = [
  ['pen', 'Pluma'], ['fineliner', 'Plumón fino'], ['highlighter', 'Resaltador'], ['eraser', 'Borrador'],
  ['select', 'Lazo: encierra para seleccionar · toca para mover'], ['text', 'Texto'], ['sticker', 'Stickers'], ['image', 'Imagen o sticker desde foto'],
];

export const S = {
  nb: null, pageIdx: 0, layerId: null, tool: 'pen',
  colors: { pen: INK[0], fineliner: INK[1], highlighter: HL[0] },
  quick: { pen: INK.slice(0, 4), fineliner: [INK[1], INK[2], INK[3], INK[0]], highlighter: HL.slice(0, 4) },
  presets: { pen: [2.5, 4, 7], fineliner: [1.5, 3, 5], highlighter: [14, 24, 38], eraser: [10, 22, 44] },
  sizeIdx: { pen: 1, fineliner: 1, highlighter: 1, eraser: 1 },
  straight: false,
  ai: { on: true, brush: 'texto', unify: true, snap: true, suggest: true, dict: true },
  pillPos: null, pageDark: false,
  penOnly: false, penSeen: false, zoom: 1, zoomLock: false, scale: 1,
  undo: [], redo: [], sel: null,
};
const size = (t = S.tool) => S.presets[t][S.sizeIdx[t]];
const colorKey = (t = S.tool) => (t === 'text' ? 'pen' : t);
const page = () => S.nb.pages[S.pageIdx];
const activeLayer = () => page().layers.find((l) => l.id === S.layerId) || page().layers[page().layers.length - 1];
const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;
export const brushes = () => HW.profile.brushes || DEFAULT_BRUSHES;
const currentBrush = () => brushes().find((b) => b.id === S.ai.brush) || brushes()[0];

/* ================= Guardado ================= */
let saveT, prefT;
function save() {
  if (!S.nb) return;
  S.nb.updated = Date.now();
  clearTimeout(saveT);
  saveT = setTimeout(saveNow, 500);
}
function saveNow() {
  clearTimeout(saveT);
  if (S.nb) DB.put('notebooks', S.nb).catch((e) => toast('No se pudo guardar: ' + e.message));
}
function savePrefs() {
  clearTimeout(prefT);
  prefT = setTimeout(() => setKV('prefs', {
    colors: S.colors, quick: S.quick, presets: S.presets, sizeIdx: S.sizeIdx,
    straight: S.straight, ai: S.ai, pillPos: S.pillPos, pageDark: S.pageDark,
  }), 400);
}

/* ================= Abrir / páginas ================= */
export function openNotebook(nb) {
  S.nb = nb;
  S.zoom = 1;
  $('#library').classList.add('hidden');
  $('#editor').classList.remove('hidden');
  $('#eTitle').textContent = nb.name;
  closePanel();
  goToPage(0);
  renderPill();
  getKV('tipAI2', false).then((seen) => {
    if (!seen && S.ai.on) {
      toast('✨ Corrector activo: escribe y haz una pausa. Toca el triangulito del botón ✨ para entrenarlo con tu letra.', 6500);
      setKV('tipAI2', true);
    }
  });
}

function goToPage(i) {
  runAI();
  hideSuggest();
  S.pageIdx = clamp(i, 0, S.nb.pages.length - 1);
  S.undo = []; S.redo = [];
  S.layerId = page().layers[page().layers.length - 1].id;
  setSel(null);
  updatePager();
  $('#stage').scrollTop = 0;
  layout();
  updateUndo();
  if (panelKind === 'layers') renderLayers();
}
function updatePager() {
  const n = S.nb.pages.length;
  $('#pNum').textContent = `${S.pageIdx + 1} / ${n}`;
  $('#pPrev').disabled = S.pageIdx === 0;
  $('#pNext').replaceChildren(icon(S.pageIdx === n - 1 ? 'plus' : 'fwd'));
  $('#pNext').dataset.tip = S.pageIdx === n - 1 ? 'Agregar página' : 'Página siguiente';
}
function addPage() {
  S.nb.pages.push(newPage(page().paper));
  save();
  toast(`Página ${S.nb.pages.length} agregada`);
}
async function slide(idx, dir) {
  const wrap = $('#pageWrap'), w = $('#stage').clientWidth;
  $('#stage').classList.add('swiping');
  wrap.style.transition = 'transform .18s ease-in';
  wrap.style.transform = `translateX(${-dir * w}px)`;
  await wait(180);
  wrap.style.transition = 'none';
  goToPage(idx);
  wrap.style.transform = `translateX(${dir * w * 0.5}px)`;
  void wrap.offsetWidth;
  wrap.style.transition = 'transform .22s cubic-bezier(.2,.8,.2,1)';
  wrap.style.transform = '';
  await wait(230);
  wrap.style.transition = '';
  $('#stage').classList.remove('swiping');
}
function nextPage() {
  if (S.pageIdx === S.nb.pages.length - 1) addPage();
  slide(S.pageIdx + 1, 1);
}
function prevPage() { if (S.pageIdx > 0) slide(S.pageIdx - 1, -1); }

/* ================= Lienzo ================= */
function layout() {
  const st = $('#stage');
  const fit = Math.min((st.clientWidth - 40) / W, 1.3);
  const cssW = Math.round(W * fit * S.zoom);
  const pg = $('#page');
  pg.style.width = cssW + 'px';
  pg.style.height = Math.round((cssW * H) / W) + 'px';
  S.scale = clamp((cssW * (window.devicePixelRatio || 1)) / W, 0.6, 1.5);
  updateZoomPill();
  rebuildCanvases();
  positionSel();
}
function sizeCanvas(c) {
  c.width = Math.round(W * S.scale);
  c.height = Math.round(H * S.scale);
  const ctx = c.getContext('2d');
  ctx.setTransform(S.scale, 0, 0, S.scale, 0, 0);
  return ctx;
}
const layerCanvases = new Map();
function setPageDark(on) {
  S.pageDark = on;
  view.dark = on;
  $('#ePageDark')?.classList.toggle('on', on);
  $('#page').classList.toggle('dark', on);
}
function rebuildCanvases() {
  drawPaper(sizeCanvas($('#bg')), page().paper, 1, S.pageDark);
  const stack = $('#layerStack');
  stack.replaceChildren();
  layerCanvases.clear();
  for (const l of page().layers) {
    const c = el('canvas');
    stack.append(c);
    layerCanvases.set(l.id, c);
    redrawLayer(l);
  }
  sizeCanvas($('#live'));
}
function redrawLayer(l) {
  const c = layerCanvases.get(l.id);
  if (!c) return;
  const ctx = sizeCanvas(c);
  c.style.opacity = l.opacity;
  c.style.display = l.visible ? '' : 'none';
  paintLayer(ctx, l, { marks: true, onload: () => redrawLayer(l) });
}
const redrawAll = () => S.nb && page().layers.forEach(redrawLayer);
const layerCtx = (l) => layerCanvases.get(l.id).getContext('2d');

/* ---------- Elementos (texto, stickers, imágenes) ---------- */
const mctx = document.createElement('canvas').getContext('2d');
const fontOf = (it) => `${it.weight || 400} ${it.size}px "${it.font}", system-ui, sans-serif`;
const LH = 1.28; // interlineado del texto de varias líneas
const linesOf = (it) => String(it.text).split('\n');
function textWidth(it) { mctx.font = fontOf(it); return Math.max(...linesOf(it).map((l) => mctx.measureText(l).width)); }
const srcOf = (it) => (it.kind === 'sticker' ? stickerSrc(it.sticker) : it.src);
function itemBox(it) {
  if (it.kind === 'text') {
    const w = it.w ?? textWidth(it);
    return { x: it.x, y: it.y - it.size * 0.86, w, h: it.size * 1.14 + (linesOf(it).length - 1) * it.size * LH };
  }
  return { x: it.x, y: it.y, w: it.w, h: it.h };
}
function paintLayer(ctx, l, { marks = false, onload } = {}) {
  for (const s of l.strokes) drawStroke(ctx, s);
  for (const it of l.items) drawItem(ctx, it, marks, onload);
}
function shade(hex, k) {
  const n = parseInt((hex || '#000000').slice(1), 16);
  const f = (v) => Math.round(clamp(v * k, 0, 255));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}
function drawItem(ctx, it, marks, onload) {
  if (it.kind === 'text') {
    ctx.save();
    ctx.font = fontOf(it);
    ctx.textBaseline = 'alphabetic';
    ctx.lineJoin = 'round';
    const color = inkColor(it.color);
    const lines = linesOf(it);
    let maxW = 0;
    lines.forEach((ln, k) => {
      const y = it.y + k * it.size * LH;
      if (it.effect === 'lettering') {
        // Lettering: sombra de color + contorno grueso + relleno
        const o = it.size * 0.07;
        ctx.fillStyle = shade(it.color, 0.55);
        ctx.strokeStyle = shade(it.color, 0.55);
        ctx.lineWidth = it.size * 0.16;
        ctx.strokeText(ln, it.x + o, y + o);
        ctx.fillText(ln, it.x + o, y + o);
        ctx.strokeStyle = view.dark ? '#18191d' : '#fff';
        ctx.lineWidth = it.size * 0.14;
        ctx.strokeText(ln, it.x, y);
      }
      ctx.fillStyle = color;
      ctx.fillText(ln, it.x, y);
      maxW = Math.max(maxW, ctx.measureText(ln).width);
    });
    it.w = maxW;
    if (marks && it.uncertain?.length && lines.length === 1) {
      ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 3; ctx.setLineDash([5, 4]);
      for (const i of it.uncertain) {
        if (i >= it.text.length) continue;
        const x0 = it.x + ctx.measureText(it.text.slice(0, i)).width;
        const w = ctx.measureText(it.text[i]).width;
        ctx.beginPath(); ctx.moveTo(x0, it.y + it.size * 0.18); ctx.lineTo(x0 + w, it.y + it.size * 0.18); ctx.stroke();
      }
    }
    ctx.restore();
    return;
  }
  const img = cachedImage(srcOf(it), onload);
  if (img) ctx.drawImage(img, it.x, it.y, it.w, it.h);
}
function replaceItem(l, id, it) { l.items = l.items.map((x) => (x.id === id ? it : x)); }

/* ================= Historial ================= */
const snap = (l) => ({ strokes: l.strokes.slice(), items: l.items.slice() });
function pushHistory(l, before) {
  S.undo.push({ layerId: l.id, before, after: snap(l) });
  if (S.undo.length > 120) S.undo.shift();
  S.redo = [];
  updateUndo();
}
function applyHistory(from, to, key) {
  const h = from.pop();
  if (!h) return;
  setSel(null);
  const l = page().layers.find((x) => x.id === h.layerId);
  if (l) { l.strokes = h[key].strokes.slice(); l.items = h[key].items.slice(); redrawLayer(l); save(); }
  to.push(h);
  updateUndo();
}
function updateUndo() { $('#eUndo').disabled = !S.undo.length; $('#eRedo').disabled = !S.redo.length; }

/* ================= Entrada: lápiz, dedo, mouse ================= */
const pointers = new Map();
let G = null;
let holdTimer = 0, aiTimer = 0;
const pending = [];
const live = () => $('#live');
function toPage(e) {
  const r = live().getBoundingClientRect();
  return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H];
}
const pressureOf = (e) => (e.pointerType === 'pen' ? Math.max(0.05, e.pressure || 0.5) : 0.5);
const capture = (target, id) => { try { target.setPointerCapture(id); } catch { /* puntero ya liberado */ } };

function onDown(e) {
  if (e.pointerType === 'pen' && !S.penSeen) {
    S.penSeen = true;
    if (!S.penOnly) { setPenOnly(true); toast('Lápiz detectado ✍️ Con el dedo deslizas páginas y desplazas.'); }
  }
  if (e.pointerType === 'touch') {
    pointers.set(e.pointerId, [e.clientX, e.clientY]);
    if (pointers.size === 2) { cancelGesture(); startPinch(); return; }
    if (pointers.size > 2) return;
    if (S.penOnly) { startSwipe(e); return; }
  }
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  closePopover();
  hideSuggest();
  const p = toPage(e);
  const t = S.tool;
  if (t === 'select') return startSelect(e, p);
  if (t === 'text') return placeText(p);
  const layer = activeLayer();
  if (!layer.visible) { toast('La capa activa está oculta'); return; }
  capture(live(), e.pointerId);
  if (t === 'eraser') {
    G = { type: 'erase', id: e.pointerId, layer, before: snap(layer), changed: false };
    eraseAt(p);
    return;
  }
  clearTimeout(aiTimer);
  G = {
    type: 'draw', id: e.pointerId, layer, anchor: p,
    stroke: { tool: t, color: S.colors[t], size: size(t), points: [[r1(p[0]), r1(p[1]), r2(pressureOf(e))]] },
  };
  if (t === 'highlighter' && S.straight) G.stroke.straight = true;
  live().style.opacity = layer.opacity;
  armHold();
  renderLive();
}

function onMove(e) {
  if (e.pointerType === 'touch' && pointers.has(e.pointerId)) pointers.set(e.pointerId, [e.clientX, e.clientY]);
  if (!G) { if (S.tool === 'eraser' && e.pointerType !== 'touch') eraserCursor(toPage(e)); return; }
  if (G.type === 'pinch') return updatePinch();
  if (G.id !== e.pointerId) return;
  if (G.type === 'swipe') return updateSwipe(e);
  if (G.type === 'gmove' || G.type === 'gscale') return updateGroup(e);
  const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
  for (const ev of evs.length ? evs : [e]) {
    const p = toPage(ev);
    if (G.type === 'erase') { eraseAt(p); continue; }
    if (G.type === 'lasso') { const l = G.pts[G.pts.length - 1]; if (Math.hypot(p[0] - l[0], p[1] - l[1]) > 4) G.pts.push(p); continue; }
    const pts = G.stroke.points;
    if (G.shape) { if (G.shape === 'Línea') pts[1] = [r1(p[0]), r1(p[1]), 0.6]; continue; }
    if (G.stroke.straight) { pts[1] = [r1(p[0]), pts[0][1], 0.5]; continue; }
    const last = pts[pts.length - 1];
    if (Math.hypot(p[0] - last[0], p[1] - last[1]) < 1.2) continue;
    pts.push([r1(p[0]), r1(p[1]), r2(pressureOf(ev))]);
    if (Math.hypot(p[0] - G.anchor[0], p[1] - G.anchor[1]) > 5) { G.anchor = p; armHold(); }
  }
  if (G.type === 'draw') renderLive();
  if (G.type === 'lasso') drawLasso(G.pts);
}

function onUp(e) {
  if (e.pointerType === 'touch') pointers.delete(e.pointerId);
  if (!G) return;
  if (G.type === 'pinch') { if (pointers.size < 2) endPinch(); return; }
  if (G.id !== e.pointerId) return;
  const g = G;
  G = null;
  clearTimeout(holdTimer);
  if (g.type === 'swipe') return endSwipe(g);
  if (g.type === 'gmove' || g.type === 'gscale') return endGroup(g);
  if (g.type === 'lasso') return endLasso(g);
  if (g.type === 'erase') { if (g.changed) { pushHistory(g.layer, g.before); save(); } clearLive(); return; }
  if (g.type === 'draw') {
    if (e.type === 'pointercancel' && g.stroke.points.length < 3) { clearLive(); return; }
    commitStroke(g);
  }
}

function cancelGesture() {
  clearTimeout(holdTimer);
  if (G?.type === 'swipe') { $('#pageWrap').style.transform = ''; $('#addHint').style.opacity = 0; }
  G = null;
  clearLive();
}

function clearLive() {
  const c = live(), ctx = c.getContext('2d');
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, c.width, c.height); ctx.restore();
}
function renderLive() { clearLive(); drawStroke(live().getContext('2d'), G.stroke); }
function eraserCursor(p) {
  clearLive();
  const ctx = live().getContext('2d');
  ctx.save(); ctx.strokeStyle = 'rgba(90,90,90,.85)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(p[0], p[1], size('eraser'), 0, Math.PI * 2); ctx.stroke(); ctx.restore();
}

/* ---------- Mantener presionado = figura perfecta ---------- */
function armHold() {
  clearTimeout(holdTimer);
  const g = G;
  holdTimer = setTimeout(() => {
    if (G !== g || g.shape || g.stroke.straight || g.stroke.points.length < 4) return;
    const r = perfectShape(g.stroke.points);
    if (!r) return;
    g.stroke.points = r.points;
    g.stroke.shape = true;
    g.shape = r.name;
    navigator.vibrate?.(12);
    renderLive();
    toast(r.name + (r.name === 'Línea' ? ' · mueve para ajustar' : ''), 1200);
  }, 550);
}

function commitStroke(g) {
  const { layer, stroke } = g;
  const before = snap(layer);
  layer.strokes.push(stroke);
  pushHistory(layer, before);
  drawStroke(layerCtx(layer), stroke);
  clearLive();
  save();
  if (S.ai.on && (stroke.tool === 'pen' || stroke.tool === 'fineliner') && !stroke.shape && textLike(stroke)) {
    pending.push({ layer, stroke });
    clearTimeout(aiTimer);
    aiTimer = setTimeout(runAI, HW.profile.idle || 900);
  }
}
function textLike(s) {
  const b = bboxOf(s.points);
  const step = rulings(page().paper).length ? lineStep(page().paper) : 56;
  return b.h < Math.max(step * 4.5, 260) && b.w < W * 0.55;
}

/* ================= Corrector en tiempo real ================= */
function runAI() {
  clearTimeout(aiTimer);
  const batch = pending.splice(0);
  if (!batch.length) return;
  const byLayer = new Map();
  for (const { layer, stroke } of batch) {
    if (!layer.strokes.includes(stroke)) continue;
    if (!byLayer.has(layer)) byLayer.set(layer, []);
    byLayer.get(layer).push(stroke);
  }
  let kept = 0, lastItem = null, lastLayer = null;
  for (const [layer, strokes] of byLayer) {
    const res = convertStrokes(layer, strokes);
    kept += res.kept;
    if (res.last) { lastItem = res.last; lastLayer = layer; }
  }
  if (kept) toast(`Dejé ${kept === 1 ? 'una palabra' : kept + ' palabras'} con tu letra porque no estaba segura. Usa el lazo › Corregir para enseñarme.`, 4200);
  if (lastItem && S.ai.suggest) showSuggest(lastLayer, lastItem);
}

// Convierte trazos de una capa a texto. Devuelve { done, kept, last }.
function convertStrokes(layer, strokes, { learn = true } = {}) {
  const pg = S.nb.pages.find((p) => p.layers.includes(layer)) || page();
  const lines = HW.recognize(strokes.map((s) => s.points), { dict: S.ai.dict });
  const before = snap(layer);
  const remove = new Set(), add = [];
  let kept = 0;
  for (const ln of lines) {
    for (const { item, idx } of placeLine(ln, strokes, pg, [...layer.items, ...add])) { add.push(item); idx.forEach((i) => remove.add(strokes[i])); }
    kept += ln.words.filter((w) => !w.text).length;
  }
  if (!add.length) return { done: 0, kept, last: null };
  layer.strokes = layer.strokes.filter((s) => !remove.has(s));
  layer.items = [...layer.items, ...add];
  if (pg === page()) { pushHistory(layer, before); redrawLayer(layer); }
  if (learn) HW.learnStyle(lines);
  save();
  return { done: add.length, kept, last: add[add.length - 1] };
}

// Coloca un renglón reconocido: mismo tamaño (según el pincel) y misma línea base para todas
// las palabras; nunca encima de texto que ya estaba y siempre con un espacio entre palabras.
function placeLine(ln, strokes, pg, existing) {
  const paper = pg.paper;
  const brush = currentBrush();
  const ruled = rulings(paper).length > 0;
  const step = ruled ? lineStep(paper) : 56;
  const px = Math.round(S.ai.unify ? step * brush.scale : Math.max(18, ln.xh * 2.1 * (brush.scale / 0.72)));
  let baseline = ruled && S.ai.snap ? snapBaseline(paper, ln.baseline) : ln.baseline;
  // Si ya hay texto en ese renglón, se usa exactamente su línea base (no sube ni baja)
  const texts = existing.filter((it) => it.kind === 'text');
  const sameRow = texts.filter((it) => Math.abs(it.y - baseline) < Math.max(px, it.size) * 0.55);
  if (sameRow.length) baseline = sameRow.sort((a, b) => Math.abs(a.y - ln.baseline) - Math.abs(b.y - ln.baseline))[0].y;
  const row = texts.filter((it) => Math.abs(it.y - baseline) < 2);
  const out = [];
  let cursor = null, prevB = null;
  for (const w of ln.words) {
    if (!w.text) { cursor = null; prevB = w.b; continue; } // no reconocida: se queda tu trazo en su lugar
    const it = {
      id: uid(), kind: 'text', text: w.text, font: brush.font, weight: brush.weight, size: px, effect: brush.effect,
      color: strokes[w.idx[0]].color, brush: brush.id, uncertain: w.uncertain || [], x: 0, y: baseline,
      ink: w.idx.map((i) => strokes[i]),
    };
    const width = textWidth(it);
    mctx.font = fontOf(it);
    const space = mctx.measureText(' ').width * 1.15;
    let x = S.ai.snap ? snapX(paper, w.b.x0) : w.b.x0;
    if (cursor !== null && prevB) {
      const gap = w.b.x0 - prevB.x1;
      x = gap < ln.xh * 3 ? cursor + space : Math.max(x, cursor + space);
    }
    // no encimar ni pegar con texto existente del mismo renglón
    for (const o of [...row, ...out.map((q) => q.item)].sort((a, b) => a.x - b.x)) {
      const ow = o.w ?? textWidth(o);
      if (x < o.x + ow + space && x + width > o.x - space * 0.5) x = o.x + ow + space;
    }
    it.x = Math.round(Math.max(8, Math.min(x, W - width - 8)));
    it.w = width;
    cursor = it.x + width;
    prevB = w.b;
    out.push({ item: it, idx: w.idx });
  }
  return out;
}

/* ---------- Sugerencias para completar la palabra ---------- */
let suggestT = 0;
function hideSuggest() { clearTimeout(suggestT); $('#suggest')?.classList.add('hidden'); }
function showSuggest(layer, it) {
  const list = HW.suggest(it.text, 3);
  if (!list.length) return;
  const box = $('#suggest');
  const b = itemBox(it);
  box.replaceChildren(el('span', { class: 'sg-ico' }, icon('sparkle', 14)), ...list.map((w) => el('button', {
    onpointerdown: (e) => e.stopPropagation(),
    onclick: () => {
      const cur = layer.items.find((x) => x.id === it.id);
      if (!cur) return hideSuggest();
      const before = snap(layer);
      replaceItem(layer, it.id, { ...cur, text: w, uncertain: [], w: undefined });
      pushHistory(layer, before);
      redrawLayer(layer);
      save();
      hideSuggest();
    },
  }, w)));
  Object.assign(box.style, { left: (b.x / W) * 100 + '%', top: ((b.y + b.h + 6) / H) * 100 + '%' });
  box.classList.remove('hidden');
  clearTimeout(suggestT);
  suggestT = setTimeout(hideSuggest, 6000);
}

/* ================= Borrador ================= */
const bbCache = new WeakMap();
const strokeBox = (s) => { let b = bbCache.get(s); if (!b) { b = bboxOf(s.points); bbCache.set(s, b); } return b; };
function hitStroke(s, p, r) {
  const b = strokeBox(s);
  const pad = r + s.size / 2;
  if (p[0] < b.x0 - pad || p[0] > b.x1 + pad || p[1] < b.y0 - pad || p[1] > b.y1 + pad) return false;
  const P = s.points;
  if (P.length === 1) return Math.hypot(p[0] - P[0][0], p[1] - P[0][1]) <= pad;
  for (let i = 1; i < P.length; i++) if (distToSeg(p, P[i - 1], P[i]) <= pad) return true;
  return false;
}
function eraseAt(p) {
  const l = G.layer, r = size('eraser');
  const ks = l.strokes.filter((s) => !hitStroke(s, p, r));
  const ki = l.items.filter((it) => { if (it.locked) return true; const b = itemBox(it); return !(p[0] > b.x - r / 2 && p[0] < b.x + b.w + r / 2 && p[1] > b.y - r / 2 && p[1] < b.y + b.h + r / 2); });
  if (ks.length !== l.strokes.length || ki.length !== l.items.length) {
    l.strokes = ks; l.items = ki; G.changed = true; redrawLayer(l);
  }
  eraserCursor(p);
}

/* ================= Lazo y selección ================= */
// S.sel = { layerId, strokes: Set<trazo>, items: Set<id> }
function selection() {
  if (!S.sel || !S.nb) return null;
  const layer = page().layers.find((x) => x.id === S.sel.layerId);
  if (!layer) return null;
  const strokes = layer.strokes.filter((s) => S.sel.strokes.has(s));
  const items = layer.items.filter((it) => S.sel.items.has(it.id));
  return strokes.length || items.length ? { layer, strokes, items } : null;
}
function selBounds(s) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const st of s.strokes) { const b = strokeBox(st), p = st.size / 2; x0 = Math.min(x0, b.x0 - p); y0 = Math.min(y0, b.y0 - p); x1 = Math.max(x1, b.x1 + p); y1 = Math.max(y1, b.y1 + p); }
  for (const it of s.items) { const b = itemBox(it); x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h); }
  return { x: x0, y: y0, w: Math.max(4, x1 - x0), h: Math.max(4, y1 - y0) };
}
function hitItem(p) {
  for (const l of [...page().layers].reverse()) {
    if (!l.visible) continue;
    for (let i = l.items.length - 1; i >= 0; i--) {
      if (l.items[i].locked) continue; // páginas de PDF: fijas
      const b = itemBox(l.items[i]);
      if (p[0] >= b.x - 10 && p[0] <= b.x + b.w + 10 && p[1] >= b.y - 10 && p[1] <= b.y + b.h + 10) return { layer: l, item: l.items[i] };
    }
  }
  return null;
}
function startSelect(e, p) {
  const s = selection();
  if (s) {
    const b = selBounds(s);
    if (p[0] >= b.x - 8 && p[0] <= b.x + b.w + 8 && p[1] >= b.y - 8 && p[1] <= b.y + b.h + 8) return beginGroup(e, p, 'gmove', live());
  }
  const hit = hitItem(p);
  if (hit) { setSel({ layerId: hit.layer.id, strokes: new Set(), items: new Set([hit.item.id]) }); return beginGroup(e, p, 'gmove', live()); }
  setSel(null);
  capture(live(), e.pointerId);
  G = { type: 'lasso', id: e.pointerId, pts: [p] };
}
function drawLasso(pts) {
  clearLive();
  const ctx = live().getContext('2d');
  ctx.save();
  ctx.setLineDash([10, 8]);
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = '#3d7bff';
  ctx.fillStyle = 'rgba(61,123,255,.06)';
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}
function inPoly(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function endLasso(g) {
  clearLive();
  if (g.pts.length < 4) return;
  let best = null;
  for (const l of page().layers) {
    if (!l.visible) continue;
    const strokes = l.strokes.filter((s) => { const n = s.points.filter((q) => inPoly(q, g.pts)).length; return n >= s.points.length * 0.6; });
    const items = l.items.filter((it) => { if (it.locked) return false; const b = itemBox(it); return inPoly([b.x + b.w / 2, b.y + b.h / 2], g.pts); });
    const n = strokes.length + items.length;
    if (n && (!best || n > best.n || l.id === S.layerId)) best = { l, strokes, items, n };
  }
  if (!best) { toast('No hay nada dentro del lazo'); return; }
  S.layerId = best.l.id;
  setSel({ layerId: best.l.id, strokes: new Set(best.strokes), items: new Set(best.items.map((i) => i.id)) });
}
function setSel(sel) {
  S.sel = sel;
  buildSelBar();
  positionSel();
}
function positionSel() {
  const box = $('#selBox'), s = selection();
  if (!s) { box.classList.add('hidden'); return; }
  const b = selBounds(s);
  box.classList.remove('hidden');
  Object.assign(box.style, { left: (b.x / W) * 100 + '%', top: (b.y / H) * 100 + '%', width: (b.w / W) * 100 + '%', height: (b.h / H) * 100 + '%' });
  box.classList.toggle('bar-below', b.y < 160);
}
function selBtn(label, ic, fn, cls = '') {
  return el('button', { class: cls, onpointerdown: (e) => e.stopPropagation(), onclick: (e) => fn(e.currentTarget) }, ic ? icon(ic, 15) : null, el('span', {}, label));
}
function buildSelBar() {
  const bar = $('#selBox .sel-actions');
  const s = selection();
  if (!s) { bar.replaceChildren(); return; }
  const texts = s.items.filter((i) => i.kind === 'text');
  const ink = s.strokes.filter((st) => st.tool === 'pen' || st.tool === 'fineliner');
  const single = !s.strokes.length && s.items.length === 1 ? s.items[0] : null;
  bar.replaceChildren(...[
    single?.kind === 'text' ? selBtn('Editar', 'type', () => openTextEditor({ layer: s.layer, item: single })) : null,
    single?.kind === 'text' && single.ink?.length ? selBtn('Corregir', 'wand', openCorrection, 'ai') : null,
    single?.kind === 'text' && single.ink?.length ? selBtn('Mi letra', 'edit', revertToInk) : null,
    ink.length ? selBtn('A texto', 'sparkle', convertSelection, 'ai') : null,
    s.strokes.length || texts.length ? selBtn('Color', 'drop', selColor) : null,
    texts.length ? selBtn('Letra', 'text', selFont) : null,
    selBtn('', 'minus', () => scaleSel(1 / 1.12)),
    selBtn('', 'plus', () => scaleSel(1.12)),
    selBtn('Duplicar', 'copy', duplicateSel),
    selBtn('', 'trash', deleteSel, 'danger'),
  ].filter(Boolean));
}

function beginGroup(e, p, type, target) {
  const s = selection();
  if (!s) return;
  hideSuggest();
  G = { type, id: e.pointerId, layer: s.layer, p0: p, before: snap(s.layer), box: selBounds(s), origS: s.strokes, curS: s.strokes, origI: s.items, moved: false };
  capture(target, e.pointerId);
}
function transformFns(mode, a, b, box) {
  if (mode === 'move') {
    return {
      s: (st) => ({ ...st, points: st.points.map((q) => [r1(q[0] + a), r1(q[1] + b), q[2]]) }),
      i: (it) => ({ ...it, x: it.x + a, y: it.y + b }),
    };
  }
  const k = a, ox = box.x, oy = box.y;
  const tx = (x) => ox + (x - ox) * k, ty = (y) => oy + (y - oy) * k;
  return {
    s: (st) => ({ ...st, size: st.size * k, points: st.points.map((q) => [r1(tx(q[0])), r1(ty(q[1])), q[2]]) }),
    i: (it) => (it.kind === 'text'
      ? { ...it, x: tx(it.x), y: ty(it.y), size: Math.max(6, Math.round(it.size * k)), w: undefined }
      : { ...it, x: tx(it.x), y: ty(it.y), w: it.w * k, h: it.h * k }),
  };
}
function applyGroup(g, fns) {
  const newS = g.origS.map(fns.s);
  g.layer.strokes = g.layer.strokes.map((st) => { const i = g.curS.indexOf(st); return i >= 0 ? newS[i] : st; });
  g.curS = newS;
  for (const it of g.origI) replaceItem(g.layer, it.id, fns.i(it));
  S.sel.strokes = new Set(newS);
  redrawLayer(g.layer);
  positionSel();
}
function updateGroup(e) {
  const p = toPage(e);
  const dx = p[0] - G.p0[0], dy = p[1] - G.p0[1];
  if (Math.abs(dx) + Math.abs(dy) > 2) G.moved = true;
  if (!G.moved) return;
  if (G.type === 'gmove') applyGroup(G, transformFns('move', dx, dy));
  else applyGroup(G, transformFns('scale', Math.max(0.15, (G.box.w + dx) / G.box.w), 0, G.box));
}
function endGroup(g) { if (g.moved) { pushHistory(g.layer, g.before); save(); buildSelBar(); } }
function editSel(fnS, fnI) {
  const s = selection();
  if (!s) return;
  const g = { layer: s.layer, origS: s.strokes, curS: s.strokes, origI: s.items };
  const before = snap(s.layer);
  applyGroup(g, { s: fnS || ((x) => x), i: fnI || ((x) => x) });
  pushHistory(s.layer, before);
  save();
  buildSelBar();
}
function scaleSel(k) {
  const s = selection();
  if (!s) return;
  const f = transformFns('scale', k, 0, selBounds(s));
  editSel(f.s, f.i);
}
function selColor(anchor) {
  const pal = [...INK.slice(0, 10), ...HL.slice(0, 6)];
  const apply = (c) => { closePopover(); editSel((st) => ({ ...st, color: c }), (it) => (it.kind === 'text' ? { ...it, color: c } : it)); };
  popover(anchor, el('div', { class: 'color-pop' },
    el('div', { class: 'pop-title' }, 'Color de la selección'),
    el('div', { class: 'swatches' }, pal.map((c) => el('button', { class: 'sw', style: { background: c }, onclick: () => apply(c) }))),
    el('label', { class: 'btn full' }, 'Personalizado', el('input', { type: 'color', class: 'color-in', onchange: (e) => apply(e.target.value) }))), { side: 'under' });
}
function selFont(anchor) {
  const apply = (patch) => { closePopover(); editSel(null, (it) => (it.kind === 'text' ? { ...it, ...patch, w: undefined } : it)); };
  popover(anchor, el('div', { class: 'font-pop' },
    el('div', { class: 'pop-title' }, 'Pinceles'),
    el('div', { class: 'chips' }, brushes().map((b) => el('button', {
      class: 'chip', style: { fontFamily: `"${b.font}"`, fontWeight: b.weight },
      onclick: () => apply({ font: b.font, weight: b.weight, brush: b.id, effect: b.effect }),
    }, b.name))),
    el('div', { class: 'pop-title' }, 'Tipografías'),
    el('div', { class: 'font-list' }, fontGroups().map(([g, fonts]) => [
      el('small', { class: 'muted fgroup' }, g),
      fonts.map((f) => el('button', { class: 'font-row', style: { fontFamily: `"${f}"` }, onclick: () => apply({ font: f }) }, f)),
    ])),
    el('div', { class: 'row' },
      el('button', { class: 'btn', onclick: () => apply({ effect: 'lettering' }) }, 'Lettering ✨'),
      el('button', { class: 'btn', onclick: () => apply({ effect: undefined }) }, 'Sin efecto'))), { side: 'under' });
}
function duplicateSel() {
  const s = selection();
  if (!s) return;
  const before = snap(s.layer);
  const ns = s.strokes.map((st) => ({ ...st, points: st.points.map((q) => [q[0] + 30, q[1] + 30, q[2]]) }));
  const ni = s.items.map((it) => ({ ...it, id: uid(), x: it.x + 30, y: it.y + 30 }));
  s.layer.strokes = [...s.layer.strokes, ...ns];
  s.layer.items = [...s.layer.items, ...ni];
  pushHistory(s.layer, before);
  redrawLayer(s.layer);
  save();
  setSel({ layerId: s.layer.id, strokes: new Set(ns), items: new Set(ni.map((i) => i.id)) });
}
function deleteSel() {
  const s = selection();
  if (!s) return;
  const before = snap(s.layer);
  s.layer.strokes = s.layer.strokes.filter((st) => !S.sel.strokes.has(st));
  s.layer.items = s.layer.items.filter((it) => !S.sel.items.has(it.id));
  pushHistory(s.layer, before);
  setSel(null);
  redrawLayer(s.layer);
  save();
}
function convertSelection() {
  const s = selection();
  if (!s) return;
  const ink = s.strokes.filter((st) => st.tool === 'pen' || st.tool === 'fineliner');
  const r = convertStrokes(s.layer, ink);
  setSel(null);
  toast(r.done ? `Convertí ${r.done} palabra${r.done > 1 ? 's' : ''} a texto` : 'No pude leer esa parte; enséñame tu letra en el entrenador.');
}
function revertToInk() {
  const s = selection();
  const it = s?.items[0];
  if (!it?.ink) return;
  const before = snap(s.layer);
  s.layer.items = s.layer.items.filter((x) => x.id !== it.id);
  s.layer.strokes = [...s.layer.strokes, ...it.ink];
  pushHistory(s.layer, before);
  setSel(null);
  redrawLayer(s.layer);
  save();
}

function inkPreview(ink) {
  const c = el('canvas', { class: 'ink-prev' });
  c.width = 520; c.height = 150;
  const ctx = c.getContext('2d');
  const b = bboxOf(ink.flatMap((s) => s.points));
  const k = Math.min((c.width - 40) / (b.w || 1), (c.height - 30) / (b.h || 1), 3);
  ctx.translate((c.width - b.w * k) / 2 - b.x0 * k, (c.height - b.h * k) / 2 - b.y0 * k);
  ctx.scale(k, k);
  ink.forEach((s) => drawStroke(ctx, { ...s, color: '#1c1f26' }));
  return c;
}

function openCorrection() {
  const s = selection();
  const it = s?.items.length === 1 ? s.items[0] : null;
  if (!it || it.kind !== 'text') return;
  const m = $('#modal');
  const input = el('input', { value: it.text, class: 'big-input' });
  const abbr = el('input', { type: 'checkbox' });
  const meaning = el('input', { placeholder: 'Significado completo (ej. tratamiento)', class: 'hidden' });
  abbr.onchange = () => meaning.classList.toggle('hidden', !abbr.checked);
  let chosen = brushes().find((b) => b.id === it.brush) || currentBrush();
  const chips = el('div', { class: 'chips' });
  const renderChips = () => chips.replaceChildren(...brushes().map((b) =>
    el('button', { class: 'chip' + (b.id === chosen.id ? ' on' : ''), style: { fontFamily: `"${b.font}"`, fontWeight: b.weight }, onclick: () => { chosen = b; renderChips(); } }, b.name)));
  renderChips();
  const unsure = (it.uncertain || []).map((i) => it.text[i]).filter(Boolean);
  const sugg = HW.suggest(it.text.slice(0, Math.max(3, it.text.length - 1)), 4).filter((w) => w !== it.text);
  m.replaceChildren(el('div', { class: 'modal-card' },
    el('header', { class: 'modal-head' }, el('h2', {}, 'Corregir y enseñar'), el('button', { class: 'ib', onclick: () => m.close() }, icon('close'))),
    el('div', { class: 'modal-body' },
      it.ink?.length ? el('div', { class: 'field' }, el('span', {}, 'Lo que escribiste'), inkPreview(it.ink)) : null,
      el('label', { class: 'field' }, el('span', {}, unsure.length ? `Dudé en: ${unsure.join(', ')}` : 'Texto'), input),
      sugg.length ? el('div', { class: 'chips' }, el('small', { class: 'muted' }, '¿Quisiste decir?'), sugg.map((w) => el('button', { class: 'chip', onclick: () => { input.value = w; } }, w))) : null,
      el('div', { class: 'field' }, el('span', {}, 'Pincel'), chips),
      el('label', { class: 'check' }, abbr, el('span', {}, 'Es una abreviatura mía')),
      meaning,
      el('p', { class: 'muted' }, 'Al guardar, la app aprende cómo haces estas letras para equivocarse menos la próxima vez.'),
      el('div', { class: 'row end' },
        el('button', { class: 'btn', onclick: () => m.close() }, 'Cancelar'),
        el('button', {
          class: 'btn primary', onclick: () => {
            const text = input.value.trim();
            if (!text) return;
            const pts = (it.ink || []).map((x) => x.points);
            let final = text;
            if (abbr.checked && meaning.value.trim()) {
              HW.setAbbr(text, meaning.value.trim());
              final = meaning.value.trim();
              if (pts.length) HW.learnWord(pts, final, { asWord: true });
            } else if (pts.length) HW.learnWord(pts, text);
            const old = brushes().find((b) => b.id === it.brush) || chosen;
            const before = snap(s.layer);
            replaceItem(s.layer, it.id, {
              ...it, text: final, uncertain: [], brush: chosen.id, font: chosen.font, weight: chosen.weight, effect: chosen.effect,
              size: Math.round((it.size * chosen.scale) / old.scale), w: undefined,
            });
            pushHistory(s.layer, before);
            redrawLayer(s.layer);
            buildSelBar();
            positionSel();
            save();
            m.close();
            toast('¡Aprendido! 🦷');
          },
        }, 'Guardar y aprender')))));
  m.showModal();
  input.focus();
}

/* ================= Texto, stickers e imágenes ================= */
function visibleCenter() {
  const r = live().getBoundingClientRect(), st = $('#stage').getBoundingClientRect();
  return [
    clamp(((st.left + st.width / 2 - r.left) / r.width) * W, 150, W - 150),
    clamp(((st.top + st.height / 2 - r.top) / r.height) * H, 150, H - 150),
  ];
}
function addItem(it) {
  const l = activeLayer();
  if (!l.visible) { toast('La capa activa está oculta'); return; }
  const before = snap(l);
  l.items = [...l.items, it];
  pushHistory(l, before);
  redrawLayer(l);
  save();
  selectTool('select');
  setSel({ layerId: l.id, strokes: new Set(), items: new Set([it.id]) });
}
function placeText(p) { openTextEditor({ at: p }); }

// Editor de texto: menú con tamaños predefinidos (Título, Subtítulo, Normal y tus pinceles)
// + tipografía, tamaño, color, negrita y lettering a tu gusto, con corrector ortográfico.
function openTextEditor({ at, layer, item }) {
  const paper = page().paper;
  const ruled = rulings(paper).length > 0;
  const step = ruled ? lineStep(paper) : 56;
  const byId = (id) => brushes().find((b) => b.id === id);
  const fromBrush = (b) => ({ font: b.font, weight: b.weight, size: Math.round(step * b.scale), effect: b.effect, brush: b.id });
  const st = item
    ? { text: item.text, font: item.font, weight: item.weight || 400, size: item.size, color: item.color, effect: item.effect, brush: item.brush }
    : { text: '', color: S.colors.pen, ...fromBrush(byId('texto') || currentBrush()) };
  const m = $('#modal');
  const area = el('textarea', { class: 'text-area', rows: 4, placeholder: 'Escribe aquí… (Enter = nueva línea)' });
  area.value = st.text;
  const preview = el('div', { class: 'text-preview' });
  const sugg = el('div', { class: 'chips sugg' });
  const sizeVal = el('b', {}, String(st.size));
  const sizeIn = el('input', { type: 'range', min: 12, max: 160, value: st.size });
  const fontSel = el('select', {}, fontGroups().map(([g, fonts]) => el('optgroup', { label: g }, fonts.map((f) => el('option', { value: f }, f)))));
  const presetSel = el('select', { class: 'preset' },
    el('optgroup', { label: 'Tamaños rápidos' },
      [['titulo', 'Título'], ['subtitulo', 'Subtítulo'], ['texto', 'Letra normal']].map(([id, n]) => el('option', { value: id }, n))),
    el('optgroup', { label: 'Tus pinceles' }, brushes().filter((b) => !['titulo', 'subtitulo', 'texto'].includes(b.id)).map((b) => el('option', { value: b.id }, b.name))),
    el('option', { value: 'custom' }, 'Personalizado'));
  const boldBtn = el('button', { class: 'chip', title: 'Negrita' }, el('b', {}, 'B'));
  const letBtn = el('button', { class: 'chip', title: 'Lettering: contorno y sombra' }, 'Lettering ✨');
  const swatches = el('div', { class: 'swatches inline' });

  const sync = () => {
    presetSel.value = byId(st.brush) && fromBrush(byId(st.brush)).size === st.size && byId(st.brush).font === st.font ? st.brush : 'custom';
    fontSel.value = st.font;
    sizeIn.value = st.size; sizeVal.textContent = st.size;
    boldBtn.classList.toggle('on', st.weight >= 600);
    letBtn.classList.toggle('on', st.effect === 'lettering');
    swatches.replaceChildren(
      ...INK.map((c) => el('button', { class: 'sw' + (c === st.color ? ' on' : ''), style: { background: c }, onclick: () => { st.color = c; sync(); } })),
      el('label', { class: 'sw custom', title: 'Personalizado' }, el('input', { type: 'color', value: st.color, onchange: (e) => { st.color = e.target.value; sync(); } })));
    Object.assign(preview.style, { fontFamily: `"${st.font}"`, fontWeight: st.weight, fontSize: Math.min(64, Math.max(14, st.size * 0.62)) + 'px', color: st.color });
    preview.classList.toggle('lettering-prev', st.effect === 'lettering');
    preview.textContent = area.value || 'Así se verá tu texto';
  };
  // Sugerencias: completar la palabra que escribes o corregir su ortografía
  const lastWord = () => /([\p{L}]+)$/u.exec(area.value.slice(0, area.selectionEnd ?? area.value.length))?.[1] || '';
  const updateSugg = () => {
    const w = lastWord();
    const list = w.length >= 3 ? [...new Set([...HW.suggest(w, 3), ...HW.spellSuggest(w, 2)])].filter((x) => x !== w).slice(0, 4) : [];
    sugg.replaceChildren(...list.map((s) => el('button', {
      class: 'chip small', onclick: () => {
        const end = area.selectionEnd ?? area.value.length;
        area.value = area.value.slice(0, end - w.length) + s + ' ' + area.value.slice(end);
        area.focus();
        const pos = end - w.length + s.length + 1;
        area.setSelectionRange(pos, pos);
        sync(); updateSugg();
      },
    }, s)));
  };
  area.oninput = () => { sync(); updateSugg(); };
  area.onkeyup = area.onclick = updateSugg;
  presetSel.onchange = () => { const b = byId(presetSel.value); if (b) Object.assign(st, fromBrush(b)); sync(); };
  fontSel.onchange = () => { st.font = fontSel.value; sync(); };
  sizeIn.oninput = () => { st.size = +sizeIn.value; sync(); };
  boldBtn.onclick = () => { st.weight = st.weight >= 600 ? 400 : 700; sync(); };
  letBtn.onclick = () => { st.effect = st.effect === 'lettering' ? undefined : 'lettering'; sync(); };

  const commit = () => {
    const text = area.value.replace(/\s+$/, '').slice(0, 2000);
    if (!text.trim()) { m.close(); return; }
    const data = { text, font: st.font, weight: st.weight, size: st.size, color: st.color, effect: st.effect, brush: st.brush, uncertain: [], w: undefined };
    if (item) {
      const l = layer || activeLayer();
      const before = snap(l);
      replaceItem(l, item.id, { ...item, ...data });
      pushHistory(l, before);
      redrawLayer(l);
      buildSelBar();
      positionSel();
      save();
    } else {
      addItem({ id: uid(), kind: 'text', ...data, x: Math.round(snapX(paper, at[0])), y: ruled ? snapBaseline(paper, at[1]) : at[1] });
    }
    m.close();
  };
  m.replaceChildren(el('div', { class: 'modal-card' },
    el('header', { class: 'modal-head' }, el('h2', {}, item ? 'Editar texto' : 'Agregar texto'), el('button', { class: 'ib', onclick: () => m.close() }, icon('close'))),
    el('div', { class: 'modal-body' },
      el('div', { class: 'row' }, el('span', { class: 'muted' }, 'Estilo'), presetSel),
      area, sugg, preview,
      el('div', { class: 'opts-grid' },
        el('label', { class: 'field' }, el('span', {}, 'Tipografía'), fontSel),
        el('label', { class: 'field' }, el('span', {}, 'Tamaño ', sizeVal), sizeIn)),
      el('div', { class: 'row' }, boldBtn, letBtn),
      el('div', { class: 'field' }, el('span', {}, 'Color'), swatches),
      el('div', { class: 'row end' },
        el('button', { class: 'btn', onclick: () => m.close() }, 'Cancelar'),
        el('button', { class: 'btn primary', onclick: commit }, item ? 'Guardar' : 'Insertar')))));
  sync();
  m.showModal();
  area.focus();
}
async function ratioOf(src) {
  const vb = /viewBox%3D%22([\d.\s%20-]+)%22/.exec(src) || /viewBox="([\d.\s-]+)"/.exec(src);
  if (vb) { const n = decodeURIComponent(vb[1]).trim().split(/\s+/).map(Number); return n[3] / n[2]; }
  const img = await readyImage(src);
  return img && img.naturalWidth ? img.naturalHeight / img.naturalWidth : 1;
}
async function insertSticker(id) {
  closePopover();
  const src = stickerSrc(id);
  const ratio = await ratioOf(src);
  const w = ratio < 0.6 ? 280 : 190;
  const [cx, cy] = visibleCenter();
  addItem({ id: uid(), kind: 'sticker', sticker: id, x: Math.round(cx - w / 2), y: Math.round(cy - (w * ratio) / 2), w, h: Math.round(w * ratio) });
}
async function insertImage() {
  const [f] = await pickFiles('image/*');
  if (!f) return;
  openStickerMaker(f, {
    mode: 'insert',
    onImage: ({ src, w, h }) => {
      const iw = Math.min(620, w), ih = (iw * h) / w;
      const [cx, cy] = visibleCenter();
      addItem({ id: uid(), kind: 'image', src, x: Math.round(cx - iw / 2), y: Math.round(cy - ih / 2), w: Math.round(iw), h: Math.round(ih) });
    },
    onSticker: (id) => insertSticker(id),
  });
}
function stickerPicker(anchor) {
  if (popoverOpenFor(anchor)) { closePopover(); return; }
  const tabs = [
    ...PACKS.filter((p) => mat.installed.includes(p.id)).map((p) => ({ name: p.name, list: p.stickers.map((s) => s.id) })),
    ...mat.folders.map((f) => ({ name: '📁 ' + f, list: stickersIn(f), folder: f })),
  ];
  let cur = tabs[0];
  const grid = el('div', { class: 'stk-grid' });
  const head = el('div', { class: 'tabs small wrap' });
  const render = () => {
    head.replaceChildren(...tabs.map((t) => el('button', { class: t === cur ? 'on' : '', onclick: () => { cur = t; render(); } }, t.name)));
    grid.replaceChildren(
      ...cur.list.map((id) => el('button', { class: 'stk', onclick: () => insertSticker(id) }, el('img', { src: stickerSrc(id), alt: '' }))),
      ...(cur.folder ? [el('button', {
        class: 'stk add', title: 'Crear sticker desde una foto', onclick: async () => {
          closePopover();
          const [f] = await pickFiles('image/*');
          if (f) openStickerMaker(f, { mode: 'save', folder: cur.folder, onSticker: (id) => insertSticker(id) });
        },
      }, icon('plus'))] : []));
  };
  render();
  popover(anchor, el('div', { class: 'stk-pop' }, head, grid,
    el('button', { class: 'btn full', onclick: () => { closePopover(); openMaterials(); } }, icon('download', 18), ' Más stickers y carpetas')),
  { side: popSide() });
}

/* ================= Gestos: deslizar páginas y pellizcar ================= */
const threshold = () => Math.min(170, $('#stage').clientWidth * 0.22);
function startSwipe(e) { G = { type: 'swipe', id: e.pointerId, x0: e.clientX, y0: e.clientY, dx: 0, active: false }; }
function updateSwipe(e) {
  const dx = e.clientX - G.x0, dy = e.clientY - G.y0;
  if (!G.active) {
    if (Math.abs(dx) > 14 && Math.abs(dx) > Math.abs(dy) * 1.3) {
      G.active = true;
      capture(e.target, e.pointerId);
      $('#stage').classList.add('swiping');
    } else return;
  }
  G.dx = dx;
  const last = S.pageIdx === S.nb.pages.length - 1, first = S.pageIdx === 0;
  $('#pageWrap').style.transform = `translateX(${first && dx > 0 ? dx * 0.25 : dx}px)`;
  const hint = $('#addHint');
  if (last && dx < 0) {
    const k = Math.min(1, -dx / threshold());
    hint.style.opacity = k;
    hint.classList.toggle('ready', k >= 1);
  } else hint.style.opacity = 0;
}
async function endSwipe(g) {
  $('#addHint').style.opacity = 0;
  const wrap = $('#pageWrap');
  if (!g.active) { $('#stage').classList.remove('swiping'); return; }
  if (g.dx < -threshold()) { nextPage(); return; }
  if (g.dx > threshold() && S.pageIdx > 0) { prevPage(); return; }
  wrap.style.transition = 'transform .2s';
  wrap.style.transform = '';
  await wait(210);
  wrap.style.transition = '';
  $('#stage').classList.remove('swiping');
}
function startPinch() {
  const [a, b] = [...pointers.values()];
  const st = $('#stage');
  G = { type: 'pinch', d0: Math.hypot(a[0] - b[0], a[1] - b[1]), m0: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], z0: S.zoom, k: 1, s0: [st.scrollLeft, st.scrollTop] };
}
function updatePinch() {
  const [a, b] = [...pointers.values()];
  if (!b) return;
  const d = Math.hypot(a[0] - b[0], a[1] - b[1]), m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  if (!S.zoomLock) { G.k = clamp(d / G.d0, 0.5 / G.z0, 3 / G.z0); $('#page').style.transform = `scale(${G.k})`; }
  const st = $('#stage');
  st.scrollLeft = G.s0[0] - (m[0] - G.m0[0]);
  st.scrollTop = G.s0[1] - (m[1] - G.m0[1]);
}
function endPinch() {
  const g = G;
  G = null;
  $('#page').style.transform = '';
  if (!S.zoomLock && Math.abs(g.k - 1) > 0.04) { S.zoom = clamp(Math.round(g.z0 * g.k * 20) / 20, 0.5, 3); layout(); }
}
function setZoom(z) { if (S.zoomLock) return; S.zoom = clamp(Math.round(z * 20) / 20, 0.5, 3); layout(); }
function updateZoomPill() {
  const p = $('#zoomPill');
  p.replaceChildren(el('span', {}, Math.round(S.zoom * 100) + '%'), icon(S.zoomLock ? 'lock' : 'unlock', 14));
  p.classList.toggle('on', S.zoomLock);
}
function setPenOnly(on) {
  S.penOnly = on;
  live().style.touchAction = on ? 'pan-y' : 'none';
}

/* ================= Barra flotante (arrastrable) ================= */
function selectTool(t) {
  S.tool = t;
  if (t !== 'select') setSel(null);
  clearLive();
  live().style.cursor = t === 'select' ? 'default' : t === 'text' ? 'text' : 'crosshair';
  renderPill();
}
function popSide() {
  const r = $('#pill').getBoundingClientRect();
  if ($('#pill').classList.contains('horiz')) return r.top < innerHeight / 2 ? 'under' : 'above';
  return r.left + r.width / 2 > innerWidth / 2 ? 'left' : 'right';
}
function toolClick(id, btn) {
  if (id === 'sticker') return stickerPicker(btn);
  if (id === 'image') return insertImage();
  if (S.tool === id && ['pen', 'fineliner', 'highlighter', 'eraser'].includes(id)) return toolOptions(btn);
  closePopover();
  selectTool(id);
}
function toolOptions(anchor) {
  if (popoverOpenFor(anchor)) { closePopover(); return; }
  const t = S.tool;
  const val = el('b', {}, String(size(t)));
  const big = t === 'highlighter' || t === 'eraser';
  const range = el('input', {
    type: 'range', min: big ? 6 : 1, max: big ? 70 : 20, step: 0.5, value: size(t),
    oninput: (e) => { S.presets[t][S.sizeIdx[t]] = +e.target.value; val.textContent = e.target.value; renderPill(); savePrefs(); },
  });
  const extra = t === 'highlighter' ? el('label', { class: 'check' },
    el('input', { type: 'checkbox', checked: S.straight, onchange: (e) => { S.straight = e.target.checked; savePrefs(); } }),
    el('span', {}, 'Siempre en línea recta')) : null;
  popover(anchor, el('div', { class: 'opts-pop' },
    el('div', { class: 'row' }, el('span', {}, 'Grosor'), el('span', { class: 'spacer' }), val), range, extra,
    el('p', { class: 'muted' }, 'Tip: mantén el lápiz quieto al terminar una figura para perfeccionarla.')),
  { side: popSide() });
}
function colorPicker(anchor) {
  if (popoverOpenFor(anchor)) { closePopover(); return; }
  const k = colorKey();
  const pal = k === 'highlighter' ? HL : INK;
  const pick = (c) => {
    S.colors[k] = c;
    S.quick[k] = [c, ...S.quick[k].filter((x) => x !== c)].slice(0, 4);
    savePrefs(); renderPill(); closePopover();
  };
  popover(anchor, el('div', { class: 'color-pop' },
    el('div', { class: 'swatches' }, pal.map((c) => el('button', { class: 'sw' + (c === S.colors[k] ? ' on' : ''), style: { background: c }, title: c, onclick: () => pick(c) }))),
    el('label', { class: 'btn full' }, 'Color personalizado', el('input', { type: 'color', value: S.colors[k], class: 'color-in', onchange: (e) => pick(e.target.value) }))),
  { side: popSide() });
}
function brushPicker(anchor) {
  if (popoverOpenFor(anchor)) { closePopover(); return; }
  popover(anchor, el('div', { class: 'brush-pop' },
    el('div', { class: 'pop-title' }, 'Pincel de corrección'),
    brushes().map((b) => el('button', {
      class: 'brush-row' + (b.id === S.ai.brush ? ' on' : ''),
      onclick: () => { S.ai.brush = b.id; if (!S.ai.on) S.ai.on = true; savePrefs(); renderPill(); closePopover(); toast(`Pincel “${b.name}”`); },
    }, el('span', { class: 'sample' + (b.effect === 'lettering' ? ' lettering' : ''), style: { fontFamily: `"${b.font}"`, fontWeight: b.weight } }, 'Aa'), el('span', {}, b.name), el('small', {}, b.font))),
    el('div', { class: 'row' },
      el('button', { class: 'btn', onclick: () => { closePopover(); openBrushEditor(); } }, icon('edit', 16), ' Editar'),
      el('button', { class: 'btn', onclick: () => { closePopover(); openTrainer('frases'); } }, icon('wand', 16), ' Entrenar'))),
  { side: popSide() });
}
// Opciones del corrector (triangulito del botón ✨)
function aiOptions(anchor) {
  if (popoverOpenFor(anchor)) { closePopover(); return; }
  const tog = (key, label, hint) => el('label', { class: 'check opt' },
    el('input', { type: 'checkbox', checked: S.ai[key], onchange: (e) => { S.ai[key] = e.target.checked; savePrefs(); } }),
    el('span', {}, label, hint ? el('small', {}, hint) : null));
  const idle = el('b', {}, (HW.profile.idle / 1000).toFixed(1) + ' s');
  const st = HW.stats();
  popover(anchor, el('div', { class: 'ai-pop' },
    el('div', { class: 'pop-title' }, '✨ Corrector de letra'),
    el('div', { class: 'field' }, el('span', {}, 'Idioma'),
      el('div', { class: 'chips' }, [['es', 'Español'], ['en', 'English']].map(([k, n]) => el('button', {
        class: 'chip' + (HW.profile.lang === k ? ' on' : ''), onclick: (e) => { HW.setLanguage(k); [...e.currentTarget.parentNode.children].forEach((c) => c.classList.toggle('on', c === e.currentTarget)); },
      }, n)))),
    tog('unify', 'Unificar tamaño según el pincel', 'Todo queda del mismo tamaño aunque escribas grande o chiquito'),
    tog('snap', 'Alinear a renglones, cuadros y puntos', 'Las palabras no se suben ni se bajan'),
    tog('dict', 'Usar diccionario para letras dudosas', 'Español/inglés + odontología. Nunca inventa palabras'),
    tog('suggest', 'Sugerir cómo termina la palabra', 'Tú decides si la tomas'),
    el('label', { class: 'field' }, el('span', {}, 'Pausa antes de corregir: ', idle),
      el('input', { type: 'range', min: 400, max: 3000, step: 100, value: HW.profile.idle, oninput: (e) => { HW.profile.idle = +e.target.value; idle.textContent = (HW.profile.idle / 1000).toFixed(1) + ' s'; HW.saveProfile(); } })),
    el('p', { class: 'muted' }, `Base: ${st.base} formas de letra · ${st.dict} palabras · ${st.samples} muestras tuyas`),
    el('button', { class: 'btn primary full', onclick: () => { closePopover(); openTrainer('frases'); } }, icon('wand', 16), ' Entrenar con mi letra (lento · rápido · súper rápido)'),
    el('div', { class: 'row' },
      el('button', { class: 'btn grow', onclick: () => { closePopover(); openTrainer('letters'); } }, 'Letras'),
      el('button', { class: 'btn grow', onclick: () => { closePopover(); openTrainer('word'); } }, 'Abreviaturas'),
      el('button', { class: 'btn grow', onclick: () => { closePopover(); openBrushEditor(); } }, 'Pinceles'))),
  { side: popSide() });
}
function openBrushEditor() {
  const m = $('#modal');
  const list = brushes().map((b) => ({ ...b }));
  const render = () => {
    m.replaceChildren(el('div', { class: 'modal-card' },
      el('header', { class: 'modal-head' }, el('h2', {}, 'Pinceles de corrección'), el('button', { class: 'ib', onclick: () => m.close() }, icon('close'))),
      el('div', { class: 'modal-body' },
        el('p', { class: 'muted' }, 'Cada pincel convierte tu letra con su propia tipografía y tamaño: títulos, subtítulos, cursiva, lettering o texto normal.'),
        list.map((b, i) => el('div', { class: 'brush-edit' },
          el('div', { class: 'preview' + (b.effect === 'lettering' ? ' lettering' : ''), style: { fontFamily: `"${b.font}"`, fontWeight: b.weight, fontSize: 18 + b.scale * 16 + 'px' } }, b.name || 'Pincel'),
          el('input', { value: b.name, placeholder: 'Nombre', maxlength: 24, oninput: (e) => { b.name = e.target.value; } }),
          el('select', { onchange: (e) => { b.font = e.target.value; render(); } },
            fontGroups().map(([g, fonts]) => el('optgroup', { label: g }, fonts.map((f) => el('option', { value: f, selected: f === b.font }, f))))),
          el('select', { onchange: (e) => { b.weight = +e.target.value; render(); } }, [400, 600, 700].map((w) => el('option', { value: w, selected: w === b.weight }, w === 400 ? 'Normal' : w === 600 ? 'Semi' : 'Negrita'))),
          el('select', { onchange: (e) => { b.effect = e.target.value || undefined; render(); } },
            el('option', { value: '', selected: !b.effect }, 'Sin efecto'), el('option', { value: 'lettering', selected: b.effect === 'lettering' }, 'Lettering (contorno + sombra)')),
          el('label', { class: 'mini' }, 'Tamaño', el('input', { type: 'range', min: 0.4, max: 1.6, step: 0.05, value: b.scale, onchange: (e) => { b.scale = +e.target.value; render(); } })),
          list.length > 1 ? el('button', { class: 'ib sm', title: 'Eliminar', onclick: () => { list.splice(i, 1); render(); } }, icon('trash', 18)) : null)),
        el('div', { class: 'row' },
          el('button', { class: 'btn', onclick: () => { list.push({ id: uid(), name: 'Nuevo', font: 'Kalam', weight: 400, scale: 0.75 }); render(); } }, icon('plus', 18), ' Nuevo pincel'),
          el('button', { class: 'btn', onclick: async () => { if ((await addFontFiles()).length) render(); } }, icon('upload', 18), ' Subir tipografía'),
          el('span', { class: 'spacer' }),
          el('button', {
            class: 'btn primary', onclick: () => {
              HW.profile.brushes = list.map((b) => ({ ...b, name: b.name.trim() || 'Pincel' }));
              HW.saveProfile();
              if (!list.find((b) => b.id === S.ai.brush)) S.ai.brush = list[0].id;
              savePrefs(); renderPill(); m.close(); toast('Pinceles guardados');
            },
          }, 'Guardar')))));
  };
  render();
  m.showModal();
}

function applyPillPos() {
  const pill = $('#pill');
  const ed = $('#editor').getBoundingClientRect();
  if (!S.pillPos) { pill.style.left = ''; pill.style.top = ''; pill.classList.remove('free', 'horiz'); return; }
  pill.classList.add('free');
  pill.classList.toggle('horiz', !!S.pillPos.h);
  const r = pill.getBoundingClientRect();
  const x = clamp(S.pillPos.x * ed.width - r.width / 2, 6, ed.width - r.width - 6);
  const y = clamp(S.pillPos.y * ed.height - r.height / 2, 56, ed.height - r.height - (S.pillPos.h === 'bottom' ? 66 : 6));
  pill.style.left = x + 'px';
  pill.style.top = y + 'px';
}
function startPillDrag(e) {
  e.preventDefault();
  e.stopPropagation();
  const pill = $('#pill'), grip = e.currentTarget;
  capture(grip, e.pointerId);
  const ed = $('#editor').getBoundingClientRect();
  const r = pill.getBoundingClientRect();
  const off = [e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2)];
  pill.classList.add('dragging');
  closePopover();
  const move = (ev) => {
    // Si la llevas hasta arriba o hasta abajo, se acomoda en horizontal
    const py = ev.clientY - ed.top;
    const h = py < 110 ? 'top' : py > ed.height - 90 ? 'bottom' : null;
    const x = clamp((ev.clientX - (h ? 0 : off[0]) - ed.left) / ed.width, 0, 1);
    S.pillPos = h ? { x, y: h === 'top' ? 0 : 1, h } : { x, y: clamp((ev.clientY - off[1] - ed.top) / ed.height, 0, 1) };
    applyPillPos();
  };
  const up = () => {
    pill.classList.remove('dragging');
    grip.removeEventListener('pointermove', move);
    grip.removeEventListener('pointerup', up);
    grip.removeEventListener('pointercancel', up);
    savePrefs();
  };
  grip.addEventListener('pointermove', move);
  grip.addEventListener('pointerup', up);
  grip.addEventListener('pointercancel', up);
}
function renderPill() {
  const pill = $('#pill');
  const tb = ([id, label]) => el('button', { class: 'pt' + (S.tool === id ? ' on' : ''), title: label, onclick: (e) => toolClick(id, e.currentTarget) }, icon(id));
  const b = currentBrush();
  const parts = [
    el('div', {
      class: 'grip', title: 'Arrastra para mover la barra · doble toque para regresarla',
      onpointerdown: startPillDrag, ondblclick: () => { S.pillPos = null; savePrefs(); applyPillPos(); },
    }, el('i'), el('i'), el('i'), el('i'), el('i'), el('i')),
    el('div', { class: 'pgroup' }, TOOLS.slice(0, 4).map(tb)),
    el('div', { class: 'pgroup' }, TOOLS.slice(4).map(tb)),
    el('div', { class: 'pgroup' },
      el('div', { class: 'aiwrap' },
        el('button', { class: 'aibtn' + (S.ai.on ? ' on' : ''), title: 'Corrector de letra en tiempo real (sin internet)', onclick: () => { S.ai.on = !S.ai.on; if (!S.ai.on) runAI(); savePrefs(); renderPill(); toast(S.ai.on ? '✨ Corrector encendido' : 'Corrector apagado'); } },
          icon('wand', 20), el('small', {}, S.ai.on ? 'ON' : 'OFF')),
        el('button', { class: 'ai-more', title: 'Opciones del corrector: idioma, tamaño, entrenar con tu letra', onclick: (e) => aiOptions(e.currentTarget) })),
      el('button', { class: 'brushchip', title: 'Pincel de corrección', onclick: (e) => brushPicker(e.currentTarget) },
        el('span', { class: b.effect === 'lettering' ? 'lettering' : '', style: { fontFamily: `"${b.font}"`, fontWeight: b.weight } }, 'Aa'), el('small', {}, b.name))),
  ];
  if (S.presets[S.tool]) {
    const max = Math.max(...S.presets[S.tool]);
    parts.push(el('div', { class: 'pgroup' }, S.presets[S.tool].map((v, i) => el('button', {
      class: 'size' + (S.sizeIdx[S.tool] === i ? ' on' : ''), title: `Grosor ${v}`,
      onclick: (e) => { if (S.sizeIdx[S.tool] === i) return toolOptions(e.currentTarget); S.sizeIdx[S.tool] = i; savePrefs(); renderPill(); },
    }, el('i', { style: { width: 4 + (v / max) * 14 + 'px', height: 4 + (v / max) * 14 + 'px', background: S.tool === 'eraser' ? 'transparent' : S.colors[colorKey()] || '#fff' } })))));
  }
  const k = colorKey();
  if (S.quick[k]) {
    parts.push(el('div', { class: 'pgroup last' },
      S.quick[k].map((c) => el('button', { class: 'sw' + (c === S.colors[k] ? ' on' : ''), style: { background: c }, title: 'Color', onclick: () => { S.colors[k] = c; savePrefs(); renderPill(); } })),
      el('button', { class: 'sw more', title: 'Más colores', onclick: (e) => colorPicker(e.currentTarget) }, icon('plus', 16))));
  }
  pill.replaceChildren(...parts);
  requestAnimationFrame(applyPillPos);
}

/* ================= Panel lateral: capas y asistente ================= */
let panelKind = null;
export function showPanel(kind, title, body) {
  panelKind = kind;
  const p = $('#sidePanel');
  p.replaceChildren(el('div', { class: 'panel-head' }, el('h3', {}, title), el('button', { class: 'ib sm', onclick: closePanel }, icon('close', 18))), body);
  p.classList.remove('hidden');
}
function closePanel() { panelKind = null; $('#sidePanel').classList.add('hidden'); }
function renderLayers() {
  const layers = page().layers;
  const list = el('ul', { class: 'layer-list' }, [...layers].reverse().map((l) => {
    const idx = layers.indexOf(l);
    const act = (fn) => (e) => { e.stopPropagation(); fn(); save(); renderLayers(); };
    return el('li', { class: 'layer' + (l.id === activeLayer().id ? ' active' : ''), onclick: () => { S.layerId = l.id; renderLayers(); } },
      el('button', { class: 'ib sm', title: 'Mostrar/ocultar', onclick: act(() => { l.visible = !l.visible; redrawLayer(l); }) }, icon(l.visible ? 'eye' : 'eyeOff', 18)),
      el('span', { class: 'name' }, l.name, el('small', {}, `${l.strokes.length} trazos · ${l.items.length} elementos`)),
      el('span', { class: 'acts' },
        el('button', { class: 'ib sm', title: 'Subir', disabled: idx === layers.length - 1, onclick: act(() => { [layers[idx], layers[idx + 1]] = [layers[idx + 1], layers[idx]]; rebuildCanvases(); }) }, '▲'),
        el('button', { class: 'ib sm', title: 'Bajar', disabled: idx === 0, onclick: act(() => { [layers[idx], layers[idx - 1]] = [layers[idx - 1], layers[idx]]; rebuildCanvases(); }) }, '▼'),
        el('button', { class: 'ib sm', title: 'Renombrar', onclick: act(() => { const n = prompt('Nombre de la capa', l.name); if (n?.trim()) l.name = n.trim().slice(0, 40); }) }, icon('edit', 16)),
        el('button', {
          class: 'ib sm', title: 'Eliminar', disabled: layers.length === 1, onclick: act(() => {
            if (!confirm(`¿Eliminar la capa “${l.name}” y todo su contenido?`)) return;
            layers.splice(idx, 1);
            if (S.layerId === l.id) S.layerId = layers[layers.length - 1].id;
            S.undo = []; S.redo = []; updateUndo();
            rebuildCanvases();
          }),
        }, icon('trash', 16))),
      el('input', { type: 'range', min: 0.1, max: 1, step: 0.05, value: l.opacity, onclick: (e) => e.stopPropagation(), oninput: (e) => { l.opacity = +e.target.value; layerCanvases.get(l.id).style.opacity = l.opacity; save(); } }));
  }));
  showPanel('layers', 'Capas de la página', el('div', { class: 'panel-body' }, list,
    el('button', {
      class: 'btn primary full', onclick: () => {
        const l = newLayer('Capa ' + (layers.length + 1));
        layers.push(l); S.layerId = l.id; rebuildCanvases(); save(); renderLayers();
      },
    }, icon('plus', 18), ' Nueva capa')));
}

/* ================= Vista de páginas ================= */
async function renderPageCanvas(pg, scale = 1) {
  const c = el('canvas');
  c.width = Math.round(W * scale);
  c.height = Math.round(H * scale);
  const ctx = c.getContext('2d');
  ctx.scale(scale, scale);
  drawPaper(ctx, pg.paper, scale < 0.5 ? 1 / scale / 3.5 : 1, view.dark);
  for (const l of pg.layers) {
    if (!l.visible) continue;
    await Promise.all(l.items.filter((it) => it.kind !== 'text').map((it) => readyImage(srcOf(it))));
    const t = el('canvas');
    t.width = c.width; t.height = c.height;
    const tc = t.getContext('2d');
    tc.scale(scale, scale);
    paintLayer(tc, l);
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = l.opacity; ctx.drawImage(t, 0, 0); ctx.restore();
  }
  return c;
}
function openPages() {
  const m = $('#modal');
  const grid = el('div', { class: 'pages-grid' });
  const render = () => {
    grid.replaceChildren(...S.nb.pages.map((pg, i) => {
      const thumb = el('button', { class: 'pthumb' + (i === S.pageIdx ? ' on' : ''), onclick: () => { m.close(); goToPage(i); } });
      renderPageCanvas(pg, 0.14).then((c) => thumb.prepend(c));
      return el('div', { class: 'pcell' }, thumb,
        el('div', { class: 'pmeta' }, el('span', {}, String(i + 1)),
          el('button', {
            class: 'ib sm', title: 'Opciones', onclick: (e) => menu(e.currentTarget, [
              { label: 'Duplicar', icon: 'copy', action: () => { S.nb.pages.splice(i + 1, 0, JSON.parse(JSON.stringify({ ...pg, id: uid() }))); save(); updatePager(); render(); } },
              S.nb.pages.length > 1 && {
                label: 'Eliminar', icon: 'trash', danger: true, action: () => {
                  if (!confirm(`¿Eliminar la página ${i + 1}?`)) return;
                  S.nb.pages.splice(i, 1);
                  save();
                  goToPage(Math.min(S.pageIdx, S.nb.pages.length - 1));
                  render();
                },
              },
            ]),
          }, icon('more', 18))));
    }), el('button', { class: 'pcell add-tile', onclick: () => { addPage(); updatePager(); render(); } }, icon('plus'), el('small', {}, 'Página')));
  };
  const tplSel = el('select', { onchange: (e) => { page().paper = { ...page().paper, type: e.target.value }; save(); layout(); render(); } },
    TEMPLATES.map((t) => el('option', { value: t.id, selected: t.id === page().paper.type }, t.name)));
  render();
  m.replaceChildren(el('div', { class: 'modal-card wide' },
    el('header', { class: 'modal-head' }, el('h2', {}, `Páginas · ${S.nb.name}`), el('button', { class: 'ib', onclick: () => m.close() }, icon('close'))),
    el('div', { class: 'modal-body' },
      el('div', { class: 'row' }, el('span', { class: 'muted' }, `Plantilla de la página ${S.pageIdx + 1}:`), tplSel,
        el('span', { class: 'spacer' }),
        el('button', { class: 'btn', onclick: () => { m.close(); insertPdfPages(); } }, icon('pdf', 18), ' Insertar PDF')),
      grid)));
  m.showModal();
}

/* ================= PDF ================= */
function loadScript(src) {
  return new Promise((res, rej) => {
    const s = el('script', { src });
    s.crossOrigin = 'anonymous';
    s.onload = res;
    s.onerror = () => rej(new Error('Necesitas internet la primera vez para preparar el PDF'));
    document.head.append(s);
  });
}
async function exportPdf() {
  const wasDark = view.dark;
  try {
    runAI();
    toast('Generando PDF…');
    if (!window.jspdf) await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
    const pdf = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' });
    view.dark = false; // el PDF siempre sale en hoja clara, lista para imprimir
    for (let i = 0; i < S.nb.pages.length; i++) {
      if (i) pdf.addPage();
      const c = await renderPageCanvas(S.nb.pages[i], 1);
      pdf.addImage(c.toDataURL('image/jpeg', 0.9), 'JPEG', 0, 0, 210, 297);
    }
    pdf.save(S.nb.name.replace(/[\\/:*?"<>|]/g, '_') + '.pdf');
    toast('PDF listo');
  } catch (e) {
    toast(e.message);
  } finally {
    view.dark = wasDark;
  }
}

/* ================= PDF dentro del cuaderno ================= */
async function insertPdfPages() {
  const [f] = await pickFiles('application/pdf,.pdf');
  if (!f) return;
  try {
    const pdf = await readPdf(f, progressToast(f.name));
    const pages = pdfToNotebookPages(pdf, page().paper);
    S.nb.pages.splice(S.pageIdx + 1, 0, ...pages);
    save();
    toast(`Agregué ${pages.length} páginas de “${pdf.name}”`, 3000);
    goToPage(S.pageIdx + 1);
  } catch (e) {
    toast(e.message || 'No pude leer ese PDF');
  }
}

// Acomoda un texto en renglones que quepan en el ancho dado
function wrapText(text, proto, maxW) {
  mctx.font = fontOf(proto);
  const out = [];
  let line = '';
  for (const w of text.split(/\s+/)) {
    const t = line ? line + ' ' + w : w;
    if (mctx.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t;
  }
  if (line) out.push(line);
  return out;
}
// Crea páginas de resumen (título, ideas principales, palabras clave, definiciones)
function addSummaryPage(r, title = 'Resumen') {
  const paper = defaultPaper('rayado');
  const ys = rulings(paper);
  const step = lineStep(paper);
  const bt = brushes().find((b) => b.id === 'titulo') || brushes()[0];
  const bs = brushes().find((b) => b.id === 'subtitulo') || bt;
  const bx = brushes().find((b) => b.id === 'texto') || brushes()[0];
  const mk = (b, text, y, extra = {}) => ({ id: uid(), kind: 'text', text, font: b.font, weight: b.weight, effect: b.effect, brush: b.id, size: Math.round(step * b.scale), color: '#1c1f26', x: 180, y, uncertain: [], ...extra });
  const pages = [];
  let pg = null, row = 0;
  const newSheet = () => { pg = newPage(paper); pages.push(pg); row = 1; };
  const put = (b, text, extra) => { if (!pg || row >= ys.length) newSheet(); pg.layers[0].items.push(mk(b, text, ys[row], extra)); row++; };
  newSheet();
  put(bt, title.slice(0, 60));
  row++;
  put(bs, 'Ideas principales', { color: '#2563eb' });
  r.points.forEach((p) => {
    wrapText(p.text, mk(bx, '', 0), W - 180 - 90).forEach((ln, k) => put(bx, (k ? '   ' : '• ') + ln));
  });
  if (r.keywords.length) {
    row++;
    put(bs, 'Palabras clave', { color: '#7c3aed' });
    wrapText(r.keywords.join(' · '), mk(bx, '', 0), W - 270).forEach((ln) => put(bx, ln));
  }
  if (r.definitions.length) {
    row++;
    put(bs, 'Definiciones', { color: '#16a34a' });
    r.definitions.slice(0, 8).forEach((d) => wrapText(`${d.term}: ${d.def}`, mk(bx, '', 0), W - 270).forEach((ln, k) => put(bx, (k ? '   ' : '▸ ') + ln)));
  }
  S.nb.pages.splice(S.pageIdx + 1, 0, ...pages);
  save();
  goToPage(S.pageIdx + 1);
  toast(pages.length > 1 ? `Resumen en ${pages.length} páginas` : 'Página de resumen creada');
}

/* ================= API para el asistente ================= */
const assistantApi = {
  nb: () => S.nb,
  pageIdx: () => S.pageIdx,
  brushes,
  showPanel,
  addSummaryPage,
  goTo: async (nbId, idx) => {
    if (S.nb.id !== nbId) {
      saveNow();
      const nb = await DB.get('notebooks', nbId);
      if (!nb) return;
      openNotebook(nb);
    }
    goToPage(idx);
  },
  addIndexPage(entries) {
    const paper = { ...page().paper, type: page().paper.type === 'blanco' ? 'rayado' : page().paper.type };
    const pg = newPage(paper);
    const ys = rulings(paper);
    const bt = brushes().find((b) => b.id === 'titulo') || brushes()[0];
    const bx = brushes().find((b) => b.id === 'texto') || brushes()[0];
    const step = lineStep(paper);
    const items = [{ id: uid(), kind: 'text', text: 'Índice', font: bt.font, weight: bt.weight, brush: bt.id, size: Math.round(step * bt.scale), color: '#1c1f26', x: 180, y: ys[1] || 200, uncertain: [] }];
    entries.forEach((en, i) => {
      const y = ys[3 + i];
      if (!y) return;
      items.push({ id: uid(), kind: 'text', text: `${en.sub ? '    ' : ''}${en.text}  ·  pág. ${en.page + 2}`, font: bx.font, weight: en.sub ? 400 : 700, brush: bx.id, size: Math.round(step * bx.scale), color: '#1c1f26', x: 180, y, uncertain: [] });
    });
    pg.layers[0].items = items;
    S.nb.pages.unshift(pg);
    save();
    goToPage(0);
    toast('Página de índice creada');
  },
};

/* ================= Inicio ================= */
export async function initEditor() {
  const prefs = await getKV('prefs', null);
  if (prefs) {
    for (const k of Object.keys(prefs)) if (prefs[k] != null && k !== 'ai') S[k] = prefs[k];
    if (prefs.ai) S.ai = { ...S.ai, ...prefs.ai };
  }
  // Agrega los pinceles nuevos (cursiva, lettering) a quien ya tenía pinceles guardados
  if (HW.profile.brushes && !HW.profile.brushesV2) {
    for (const b of DEFAULT_BRUSHES) if (!HW.profile.brushes.find((x) => x.id === b.id)) HW.profile.brushes.push({ ...b });
    HW.profile.brushesV2 = true;
    HW.saveProfile();
  }
  const lv = live();
  lv.addEventListener('pointerdown', onDown);
  lv.addEventListener('pointermove', onMove);
  lv.addEventListener('pointerup', onUp);
  lv.addEventListener('pointercancel', onUp);
  lv.addEventListener('pointerleave', () => { if (!G) clearLive(); });
  setPenOnly(false);

  const box = $('#selBox');
  box.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.sel-actions')) return;
    e.stopPropagation();
    if (e.pointerType === 'touch') pointers.set(e.pointerId, [e.clientX, e.clientY]);
    beginGroup(e, toPage(e), e.target.closest('.sel-handle') ? 'gscale' : 'gmove', box);
  });
  box.addEventListener('pointermove', onMove);
  box.addEventListener('pointerup', onUp);
  box.addEventListener('pointercancel', onUp);

  $('#eBack').onclick = () => { runAI(); saveNow(); closePopover(); hideSuggest(); S.nb = null; emit('library'); };
  $('#eUndo').onclick = () => applyHistory(S.undo, S.redo, 'before');
  $('#eRedo').onclick = () => applyHistory(S.redo, S.undo, 'after');
  $('#ePages').onclick = openPages;
  $('#eLayers').onclick = () => (panelKind === 'layers' ? closePanel() : renderLayers());
  $('#eAssist').onclick = () => (panelKind === 'assistant' ? closePanel() : openAssistant(assistantApi));
  $('#ePdf').onclick = exportPdf;
  setPageDark(!!S.pageDark);
  $('#ePageDark').onclick = () => {
    setPageDark(!S.pageDark);
    savePrefs();
    if (S.nb) { rebuildCanvases(); positionSel(); }
    toast(S.pageDark ? 'Hoja oscura: tu tinta negra se ve blanca' : 'Hoja clara');
  };
  $('#pPrev').onclick = prevPage;
  $('#pNext').onclick = nextPage;

  let lastTap = 0;
  $('#zoomPill').onclick = () => {
    const now = Date.now();
    if (now - lastTap < 350) { S.zoomLock = false; setZoom(1); toast('Zoom 100%'); }
    else { S.zoomLock = !S.zoomLock; updateZoomPill(); toast(S.zoomLock ? 'Zoom bloqueado' : 'Zoom libre (pellizca con dos dedos)'); }
    lastTap = now;
  };

  let wheelAcc = 0, wheelLock = 0;
  $('#stage').addEventListener('wheel', (e) => {
    if (!S.nb) return;
    if (e.ctrlKey) { e.preventDefault(); setZoom(S.zoom - e.deltaY * 0.002); return; }
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY) && Date.now() > wheelLock) {
      wheelAcc += e.deltaX;
      if (Math.abs(wheelAcc) > 140) { wheelAcc > 0 ? nextPage() : prevPage(); wheelAcc = 0; wheelLock = Date.now() + 700; }
    }
  }, { passive: false });

  window.addEventListener('resize', () => { if (S.nb) { layout(); applyPillPos(); } });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { runAI(); saveNow(); } });
  document.fonts?.addEventListener?.('loadingdone', () => { if (S.nb) { redrawAll(); positionSel(); } });
  document.addEventListener('keydown', (e) => {
    if (!S.nb || $('#modal').open || $('#sheet').open || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); $('#eUndo').click(); }
    else if (mod && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) { e.preventDefault(); $('#eRedo').click(); }
    else if (e.key === 'ArrowRight') nextPage();
    else if (e.key === 'ArrowLeft') prevPage();
    else if ((e.key === 'Delete' || e.key === 'Backspace') && S.sel) deleteSel();
    else if (e.key === 'Escape') setSel(null);
  });
}
