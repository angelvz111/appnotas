// Utilidades compartidas: DOM, íconos, popovers, imágenes y avisos.
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const wait = (ms) => new Promise((r) => setTimeout(r, ms));
export const stripAccents = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

/* ---------- Crear elementos ---------- */
const PROPS = new Set(['value', 'checked', 'disabled', 'title', 'type', 'min', 'max', 'step', 'placeholder', 'accept', 'multiple']);
export function el(tag, props = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'html') e.innerHTML = v;
    else if (PROPS.has(k)) e[k] = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat(Infinity)) if (k != null && k !== false) e.append(k.nodeType ? k : document.createTextNode(k));
  return e;
}

/* ---------- Íconos (trazo, 24×24) ---------- */
const P = {
  back: '<path d="M15 18l-6-6 6-6"/>',
  fwd: '<path d="M9 18l6-6-6-6"/>',
  grid: '<rect x="4" y="4" width="7" height="7" rx="2"/><rect x="13" y="4" width="7" height="7" rx="2"/><rect x="4" y="13" width="7" height="7" rx="2"/><rect x="13" y="13" width="7" height="7" rx="2"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 010 11H12"/>',
  redo: '<path d="M15 14l5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 000 11H12"/>',
  layers: '<path d="M12 3l9 5-9 5-9-5 9-5z"/><path d="M3 13l9 5 9-5"/>',
  brain: '<path d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9z"/><path d="M18.5 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/>',
  download: '<path d="M12 4v11"/><path d="M7 10l5 5 5-5"/><path d="M5 20h14"/>',
  pen: '<path d="M4 20l4-1 11-11-3-3L5 16l-1 4z"/><path d="M14 6l3 3"/>',
  fineliner: '<path d="M5 19l2-6 9-9 3 3-9 9-5 3z"/><path d="M3 21h6"/>',
  highlighter: '<path d="M9 15l-3 3h5l1-1"/><path d="M9 15l8-8 3 3-8 8-3-3z"/><path d="M3 21h18" stroke="#facc15" stroke-width="3"/>',
  eraser: '<path d="M16 4l5 5-10 10H6l-3-3L16 4z"/><path d="M11 19h10"/>',
  select: '<path d="M6 9c0-3 3-5.5 7-5.5s7 2.5 7 5.5-3 5.5-7 5.5c-1.8 0-3.3-.4-4.5-1" stroke-dasharray="2.5 2.5"/><path d="M9 13l-2 8 3-2.5 3 2"/>',
  text: '<path d="M5 6V4.5h14V6"/><path d="M12 4.5V19"/><path d="M9 19h6"/>',
  sticker: '<path d="M20 13V7a3 3 0 00-3-3H7a3 3 0 00-3 3v10a3 3 0 003 3h6z"/><path d="M13 20v-3.5a3.5 3.5 0 013.5-3.5H20"/><path d="M9 10h.01M14 10h.01"/><path d="M9 13.5c.8.8 2.2 1 3 .6"/>',
  image: '<rect x="3.5" y="4.5" width="17" height="15" rx="3"/><circle cx="9" cy="10" r="1.6"/><path d="M20 16l-4.5-4.5L7 20"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  hand: '<path d="M8 13V5.5a1.5 1.5 0 013 0V12M11 11.5v-7a1.5 1.5 0 013 0V12M14 11.5V6.5a1.5 1.5 0 013 0v7.5c0 4-2.5 6.5-6 6.5-2.6 0-4.2-1.3-5.4-3.4L3.8 13.7a1.5 1.5 0 012.6-1.5L8 14.5"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z"/>',
  contrast: '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5v17a8.5 8.5 0 000-17z" fill="currentColor"/>',
  pageDark: '<rect x="5" y="3.5" width="14" height="17" rx="2.5" fill="currentColor" fill-opacity=".25"/><path d="M15 9.5a3.2 3.2 0 01-4.6 4.2 3.2 3.2 0 104.6-4.2z"/>',
  pdf: '<path d="M14 3.5H7a2 2 0 00-2 2v13a2 2 0 002 2h10a2 2 0 002-2V8.5z"/><path d="M14 3.5v5h5"/><path d="M8.5 16.5v-4h1.5a1.3 1.3 0 010 2.6H8.5M13 12.5v4h1a2 2 0 000-4z"/>',
  type: '<path d="M4 7V5h10v2"/><path d="M9 5v14"/><path d="M7 19h4"/><path d="M14 12h6M17 12v7"/>',
  drop: '<path d="M12 3.5s6 6.4 6 10.5a6 6 0 01-12 0c0-4.1 6-10.5 6-10.5z"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2h2"/>',
  more: '<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>',
  folder: '<path d="M3.5 7.5a2 2 0 012-2h4l2 2.5h7a2 2 0 012 2v7.5a2 2 0 01-2 2h-13a2 2 0 01-2-2z"/>',
  folderPlus: '<path d="M3.5 7.5a2 2 0 012-2h4l2 2.5h7a2 2 0 012 2v7.5a2 2 0 01-2 2h-13a2 2 0 01-2-2z"/><path d="M12 11v5M9.5 13.5h5"/>',
  book: '<path d="M4 5.5A2.5 2.5 0 016.5 3H20v15H6.5A2.5 2.5 0 004 20.5z"/><path d="M4 20.5A2.5 2.5 0 006.5 23H20v-5"/>',
  trash: '<path d="M4 7h16"/><path d="M9 7V4.5h6V7"/><path d="M6.5 7l1 13h9l1-13"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/>',
  unlock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 017.5-2"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>',
  eyeOff: '<path d="M3 3l18 18"/><path d="M10.6 5.6A9.8 9.8 0 0112 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 01-2.6 3.4M6.3 6.8C3.9 8.5 2.5 12 2.5 12s3.5 6.5 9.5 6.5c1.5 0 2.9-.4 4.1-1"/>',
  swap: '<path d="M7 7h12l-3-3M17 17H5l3 3"/>',
  upload: '<path d="M12 20V9"/><path d="M7 13l5-5 5 5"/><path d="M5 4h14"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  tooth: '<path d="M7 4.5c-2.5 0-3.5 2.2-3.5 4.3 0 2.6 1.4 3.6 1.8 6.4.4 2.8 1.2 5.3 2.6 5.3s1.4-4.5 4.1-4.5 2.7 4.5 4.1 4.5 2.2-2.5 2.6-5.3c.4-2.8 1.8-3.8 1.8-6.4 0-2.1-1-4.3-3.5-4.3-2 0-3 1.2-5 1.2s-3-1.2-5-1.2z"/>',
  sparkle: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M18 6l-2.5 2.5M8.5 15.5L6 18"/>',
  wand: '<path d="M4 20L15 9"/><path d="M14 4v3M17.5 5.5l-2 2M20 9h-3"/><path d="M13 8l3 3"/>',
  shuffle: '<path d="M4 7h3.5c4 0 5 10 9 10H20"/><path d="M4 17h3.5c1.4 0 2.4-1.2 3.3-2.7M20 7h-3.5c-1.4 0-2.4 1.2-3.3 2.7"/><path d="M17 4l3 3-3 3M17 14l3 3-3 3"/>',
};
export function iconSvg(name, size = 22) {
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`;
}
export const icon = (name, size) => el('span', { class: 'icn', html: iconSvg(name, size) });
export function hydrateIcons(root = document) {
  for (const n of $$('[data-icon]', root)) if (!n.firstChild) n.innerHTML = iconSvg(n.dataset.icon, n.classList.contains('empty-art') ? 72 : 22);
}

/* ---------- Avisos ---------- */
let toastTimer;
export function toast(msg, ms = 2600) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}

/* ---------- Globitos de ayuda (reemplazan el "title" cuadrado del navegador) ---------- */
export function initTooltips() {
  const tip = el('div', { class: 'tip' });
  document.body.append(tip);
  let cur = null, timer = 0;
  const hide = () => { clearTimeout(timer); cur = null; tip.classList.remove('show'); };
  const show = (t) => {
    const text = t.dataset.tip;
    if (!text) return;
    tip.textContent = text;
    const r = t.getBoundingClientRect();
    tip.style.left = '0px'; tip.style.top = '0px';
    const tr = tip.getBoundingClientRect();
    let x, y, side;
    if (r.right > innerWidth - 140) { x = r.left - tr.width - 10; y = r.top + r.height / 2 - tr.height / 2; side = 'l'; }
    else if (r.left < 140 && r.top > 60) { x = r.right + 10; y = r.top + r.height / 2 - tr.height / 2; side = 'r'; }
    else { x = r.left + r.width / 2 - tr.width / 2; y = r.bottom + 8; side = 'b'; }
    tip.dataset.side = side;
    tip.style.left = clamp(x, 6, innerWidth - tr.width - 6) + 'px';
    tip.style.top = clamp(y, 6, innerHeight - tr.height - 6) + 'px';
    tip.classList.add('show');
  };
  document.addEventListener('pointerover', (e) => {
    const t = e.target.closest?.('[title],[data-tip]');
    if (!t || t === cur) return;
    if (t.title) { t.dataset.tip = t.title; t.removeAttribute('title'); }
    hide();
    cur = t;
    if (e.pointerType === 'touch') return;
    timer = setTimeout(() => show(t), 380);
  });
  document.addEventListener('pointerout', (e) => { if (cur && !cur.contains(e.relatedTarget)) hide(); });
  document.addEventListener('pointerdown', hide, true);
  // Mantener presionado con el dedo también muestra la ayuda
  let lp = 0;
  document.addEventListener('touchstart', (e) => {
    const t = e.target.closest?.('[data-tip],[title]');
    if (!t) return;
    if (t.title) { t.dataset.tip = t.title; t.removeAttribute('title'); }
    lp = setTimeout(() => { cur = t; show(t); setTimeout(hide, 1600); }, 550);
  }, { passive: true });
  document.addEventListener('touchend', () => clearTimeout(lp), { passive: true });
}

/* ---------- Bus de eventos ---------- */
const bus = new EventTarget();
export const on = (n, f) => bus.addEventListener(n, (e) => f(e.detail));
export const emit = (n, d) => bus.dispatchEvent(new CustomEvent(n, { detail: d }));

/* ---------- Popovers y menús ---------- */
let openPop = null;
function outside(e) {
  if (openPop && !openPop.contains(e.target) && !openPop._anchor?.contains(e.target)) closePopover();
}
export function closePopover() {
  if (!openPop) return;
  openPop.remove();
  openPop = null;
  document.removeEventListener('pointerdown', outside, true);
}
export function popoverOpenFor(anchor) { return openPop && openPop._anchor === anchor; }
export function popover(anchor, content, { side = 'below', cls = '' } = {}) {
  closePopover();
  const p = el('div', { class: 'popover ' + cls }, content);
  p._anchor = anchor;
  document.body.append(p);
  const r = anchor.getBoundingClientRect();
  const pr = p.getBoundingClientRect();
  let x, y;
  if (side === 'left') { x = r.left - pr.width - 12; y = r.top + r.height / 2 - pr.height / 2; }
  else if (side === 'right') { x = r.right + 12; y = r.top + r.height / 2 - pr.height / 2; }
  else if (side === 'above') { x = r.left + r.width / 2 - pr.width / 2; y = r.top - pr.height - 10; }
  else if (side === 'under') { x = r.left + r.width / 2 - pr.width / 2; y = r.bottom + 10; }
  else { x = r.right - pr.width; y = r.bottom + 8; if (x < 8) x = r.left; }
  p.style.left = clamp(x, 8, innerWidth - pr.width - 8) + 'px';
  p.style.top = clamp(y, 8, innerHeight - pr.height - 8) + 'px';
  openPop = p;
  setTimeout(() => document.addEventListener('pointerdown', outside, true));
  return p;
}
export function menu(anchor, items, opts) {
  const box = el('div', { class: 'menu' },
    items.filter(Boolean).map((it) => it === '-' ? el('hr') :
      el('button', { class: it.danger ? 'danger' : '', onclick: () => { closePopover(); it.action(); } },
        it.icon ? icon(it.icon, 18) : null, el('span', {}, it.label))));
  return popover(anchor, box, opts);
}

/* ---------- Archivos e imágenes ---------- */
export function pickFiles(accept, multiple = false) {
  return new Promise((res) => {
    const i = el('input', { type: 'file', accept, multiple });
    i.onchange = () => res([...i.files]);
    i.click();
  });
}
export const fileToDataURL = (f) => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(r.result);
  r.onerror = () => rej(r.error);
  r.readAsDataURL(f);
});
export function loadImage(src) {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
}
export async function compressImage(src, max = 1400, type = 'image/jpeg', q = 0.85) {
  const img = await loadImage(src);
  const s = Math.min(1, max / Math.max(img.width, img.height));
  const c = el('canvas');
  c.width = Math.round(img.width * s);
  c.height = Math.round(img.height * s);
  const ctx = c.getContext('2d');
  if (type === 'image/jpeg') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); }
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return { src: c.toDataURL(type, q), w: c.width, h: c.height };
}
// Caché de imágenes para dibujar stickers/fotos en el lienzo sin parpadeo
const imgs = new Map();
export function cachedImage(src, onReady) {
  let e = imgs.get(src);
  if (!e) {
    e = { img: new Image(), ready: false, waiters: new Set() };
    imgs.set(src, e);
    e.img.onload = () => { e.ready = true; e.waiters.forEach((f) => f()); e.waiters.clear(); };
    e.img.src = src;
  }
  if (e.ready) return e.img;
  if (onReady) e.waiters.add(onReady);
  return null;
}
export function readyImage(src) {
  return new Promise((res) => {
    const i = cachedImage(src, () => res(cachedImage(src)));
    if (i) res(i);
    else setTimeout(() => res(cachedImage(src)), 4000);
  });
}
