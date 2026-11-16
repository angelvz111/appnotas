// Corrector de escritura LOCAL (sin internet) que aprende de tu letra.
//
// Cómo funciona:
//  1. Separa los trazos en renglones, palabras y letras usando los espacios de TU escritura
//     (aprende cuánto separas letras y palabras, para no juntar palabras).
//  2. Reconoce cada letra comparando su "nube de puntos" ($P point-cloud) contra una base de
//     letras: ~17 tipografías manuscritas (bonitas y "feas"), cada una también inclinada a
//     izquierda y derecha, más TUS letras (que pesan más que todo lo demás).
//  3. Con un diccionario (español, inglés y odontología) busca la palabra más probable letra
//     por letra. Sólo la usa si casi todas las letras coinciden: nunca inventa palabras.
//     Si no está segura, marca la letra dudosa o deja tu trazo original.
//  4. Abreviaturas: le enseñas que "tx" = "tratamiento" (escrito o tecleado) y lo expande.
import { getKV, setKV } from './db.js';
import { DICTS } from './dict.js';
import { bboxOf, dist, pathLen } from './ink.js';
import { stripAccents } from './util.js';

const N = 32;
export const TRAIN_CHARS = 'abcdefghijklmnñopqrstuvwxyz0123456789ABCDEFGHIJKLMNÑOPQRSTUVWXYZ';
const CHARS = 'abcdefghijklmnñopqrstuvwxyzáéíóúABCDEFGHIJKLMNÑOPQRSTUVWXYZ0123456789';
// Letras "bonitas" y letras "feas" para cubrir muchas formas de escribir
export const SEED_FONTS = [
  'Patrick Hand', 'Kalam', 'Shadows Into Light', 'Caveat', 'Indie Flower', 'Gochi Hand', 'Architects Daughter',
  'Schoolbell', 'Neucha', 'Reenie Beanie', 'Nanum Pen Script', 'Covered By Your Grace', 'Just Another Hand',
  'Gloria Hallelujah', 'Mansalva', 'Dancing Script', 'sans-serif',
];
const SHEARS = [-0.22, 0.22]; // variantes inclinadas (letra chueca)
const MARKED = new Set([...'ijáéíóúñÑ']);
const TWINS = new Set([...'cosuvwxzk']);
const DESC = new Set([...'gjpqyç,']);

export const profile = {
  chars: [],     // tus letras: { ch, pts, ar, mark }
  words: [],     // palabras/abreviaturas escritas: { text, pts, ar }
  abbr: {},      // abreviaturas tecleadas: { tx: 'tratamiento' }
  lexicon: [],   // palabras que confirmaste
  style: { letterGap: 0.22, wordGap: 0.95, xh: 0, samples: 0 },
  idle: 900,     // ms de pausa antes de corregir
  lang: 'es',
  brushes: null,
};
let fontTemplates = [];

export async function loadProfile() {
  Object.assign(profile, await getKV('hw', {}));
  rebuildLexicon();
}
let saveT;
export function saveProfile() {
  clearTimeout(saveT);
  saveT = setTimeout(() => setKV('hw', JSON.parse(JSON.stringify(profile))), 300);
}

/* ================= Diccionario ================= */
let lex = new Map();      // palabra sin acentos -> { word, cost }
let lexByLen = new Map(); // largo -> [palabra sin acentos]
// Diccionario grande (~50,000 palabras por idioma, incluye nombres). Vive en /dict y se guarda sin internet.
const bigLists = {};
export async function loadDictionary() {
  const lang = profile.lang || 'es';
  if (!bigLists[lang]) {
    try {
      const r = await fetch(`dict/${lang}.txt`);
      bigLists[lang] = r.ok ? (await r.text()).split('\n') : [];
    } catch { bigLists[lang] = []; }
  }
  rebuildLexicon();
  return bigLists[lang].length;
}
export function setLanguage(lang) { profile.lang = lang; saveProfile(); return loadDictionary(); }
function rebuildLexicon() {
  lex = new Map();
  lexByLen = new Map();
  const d = DICTS[profile.lang] || DICTS.es;
  // tier: 'core' = tus palabras, odontología y palabras muy comunes · 'rare' = resto del diccionario grande
  // big = sólo viene del diccionario grande (no de tus palabras ni de las listas curadas)
  const add = (w0, cost, tier, big = false) => {
    const w = stripAccents(w0.toLowerCase());
    if (!/^[a-zñ]+$/.test(w)) return;
    const prev = lex.get(w);
    if (prev && prev.cost <= cost) return;
    lex.set(w, { word: w0.toLowerCase(), cost, tier: prev?.tier === 'core' ? 'core' : tier, big: prev ? prev.big && big : big });
    if (!prev) { if (!lexByLen.has(w.length)) lexByLen.set(w.length, []); lexByLen.get(w.length).push(w); }
  };
  profile.lexicon.forEach((w) => add(w, 0, 'core'));          // tus palabras primero
  d.dental.forEach((w) => add(w, 0.02, 'core'));              // odontología
  d.common.forEach((w, i) => add(w, 0.03 + 0.05 * Math.log10(i + 10), 'core'));
  (bigLists[profile.lang || 'es'] || []).forEach((w, i) => add(w, 0.06 + 0.06 * Math.log10(i + 10), i < 3000 ? 'core' : 'rare', true));
}
export const dictionarySize = () => lex.size;

/* ---------- Mis palabras (nombres, términos de clase…) ---------- */
export function addMyWord(w) {
  const clean = (w || '').trim().toLowerCase();
  if (!/^[a-záéíóúüñ]{2,40}$/i.test(clean)) return false;
  if (!profile.lexicon.includes(clean)) profile.lexicon.push(clean);
  rebuildLexicon();
  saveProfile();
  return true;
}
export function removeMyWord(w) {
  profile.lexicon = profile.lexicon.filter((x) => x !== w);
  rebuildLexicon();
  saveProfile();
}
export const inDictionary = (w) => lex.has(stripAccents(w.toLowerCase()));

// Sugerencias para completar una palabra (tú eliges; nunca se aplican solas)
export function suggest(text, n = 3) {
  const p = stripAccents(text.toLowerCase());
  if (p.length < 3) return [];
  const out = [];
  for (const [w, v] of lex) if (w.length > p.length && w.startsWith(p)) out.push([v.cost + w.length * 0.01, v.word]);
  out.sort((a, b) => a[0] - b[0]);
  const cap = text[0] !== text[0].toLowerCase();
  return out.slice(0, n).map(([, w]) => (cap ? w[0].toUpperCase() + w.slice(1) : w));
}

// Ortografía para texto tecleado: palabras a 1 letra de distancia (sólo sugerencias)
function within1(a, b) {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}
export function spellSuggest(text, n = 3) {
  const p = stripAccents(text.toLowerCase());
  if (p.length < 3) return [];
  if (lex.has(p)) {
    const word = lex.get(p).word;
    return word !== text.toLowerCase() ? [restoreCase(text, word)] : []; // sólo faltaba el acento
  }
  const out = [];
  for (const len of [p.length - 1, p.length, p.length + 1]) {
    for (const w of lexByLen.get(len) || []) if (within1(p, w)) out.push([lex.get(w).cost, lex.get(w).word]);
  }
  out.sort((a, b) => a[0] - b[0]);
  return out.slice(0, n).map(([, w]) => restoreCase(text, w));
}

/* ================= Nubes de puntos ($P) ================= */
function cloudFromStrokes(strokes, n = N) {
  const S = strokes.filter((s) => s.length);
  let L = 0;
  for (const s of S) L += pathLen(s);
  const all = S.flat();
  if (L < 1e-6) return Array.from({ length: n }, (_, i) => [all[i % all.length][0], all[i % all.length][1]]);
  const I = L / (n - 1), out = [];
  let D = 0;
  for (const s of S) {
    let prev = [s[0][0], s[0][1]];
    if (!out.length) out.push(prev.slice());
    for (let i = 1; i < s.length; i++) {
      const cur = [s[i][0], s[i][1]];
      let d = dist(prev, cur);
      while (D + d >= I && d > 0) {
        const t = (I - D) / d;
        const q = [prev[0] + t * (cur[0] - prev[0]), prev[1] + t * (cur[1] - prev[1])];
        out.push(q); prev = q; d = dist(prev, cur); D = 0;
      }
      D += d; prev = cur;
    }
  }
  const last = all[all.length - 1];
  while (out.length < n) out.push([last[0], last[1]]);
  return out.slice(0, n);
}
function normalize(pts) {
  const b = bboxOf(pts);
  const s = Math.max(b.w, b.h) || 1;
  let cx = 0, cy = 0;
  const q = pts.map((p) => { const x = (p[0] - b.x0) / s, y = (p[1] - b.y0) / s; cx += x; cy += y; return [x, y]; });
  cx /= q.length; cy /= q.length;
  return { pts: q.map((p) => [p[0] - cx, p[1] - cy]), ar: (b.w + 1) / (b.h + 1) };
}
function cloudDist(a, b, start) {
  const n = a.length, used = new Uint8Array(n);
  let sum = 0, i = start, k = 0;
  do {
    let min = Infinity, idx = 0;
    for (let j = 0; j < n; j++) {
      if (used[j]) continue;
      const dx = a[i][0] - b[j][0], dy = a[i][1] - b[j][1], d = dx * dx + dy * dy;
      if (d < min) { min = d; idx = j; }
    }
    used[idx] = 1;
    sum += (1 - k / n) * Math.sqrt(min);
    k++; i = (i + 1) % n;
  } while (i !== start);
  return sum;
}
function match(a, b) {
  const n = a.length, step = Math.floor(Math.sqrt(n));
  let min = Infinity;
  for (let i = 0; i < n; i += step) min = Math.min(min, cloudDist(a, b, i), cloudDist(b, a, i));
  return min;
}

/* ================= Base de letras desde tipografías ================= */
function thin(g, S) {
  // Adelgazamiento Zhang-Suen: deja el "esqueleto" de la letra, parecido a un trazo de pluma
  const at = (x, y) => (x < 0 || y < 0 || x >= S || y >= S ? 0 : g[y * S + x]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const pass of [0, 1]) {
      const del = [];
      for (let y = 1; y < S - 1; y++) for (let x = 1; x < S - 1; x++) {
        if (!g[y * S + x]) continue;
        const p = [at(x, y - 1), at(x + 1, y - 1), at(x + 1, y), at(x + 1, y + 1), at(x, y + 1), at(x - 1, y + 1), at(x - 1, y), at(x - 1, y - 1)];
        const B = p.reduce((a, b) => a + b, 0);
        if (B < 2 || B > 6) continue;
        let A = 0;
        for (let i = 0; i < 8; i++) if (!p[i] && p[(i + 1) % 8]) A++;
        if (A !== 1) continue;
        if (pass === 0 ? (p[0] * p[2] * p[4] || p[2] * p[4] * p[6]) : (p[0] * p[2] * p[6] || p[0] * p[4] * p[6])) continue;
        del.push(y * S + x);
      }
      if (del.length) { changed = true; del.forEach((i) => (g[i] = 0)); }
    }
  }
}
function glyphPoints(ch, font) {
  const S = 96;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.font = `60px ${font === 'sans-serif' ? 'sans-serif' : `"${font}"`}`;
  ctx.fillText(ch, 18, 68);
  const d = ctx.getImageData(0, 0, S, S).data;
  const g = new Uint8Array(S * S);
  for (let i = 0; i < S * S; i++) g[i] = d[i * 4 + 3] > 110 ? 1 : 0;
  thin(g, S);
  const px = [];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (g[y * S + x]) px.push([x, y]);
  if (px.length < 4) return null;
  return Array.from({ length: N }, (_, i) => px[Math.floor((i * px.length) / N)]);
}
function template(ch, pts, extra = {}) {
  const n = normalize(pts);
  return { ch, pts: n.pts, ar: n.ar, mark: MARKED.has(ch), ...extra };
}
export async function buildFontTemplates(onProgress) {
  await Promise.all(SEED_FONTS.map((f) => (f === 'sans-serif' ? 0 : document.fonts.load(`60px "${f}"`).catch(() => 0))));
  const out = [];
  let done = 0;
  for (const f of SEED_FONTS) {
    if (f === 'sans-serif' || document.fonts.check(`60px "${f}"`)) {
      for (const ch of CHARS) {
        const pts = glyphPoints(ch, f);
        if (!pts) continue;
        out.push(template(ch, pts, { font: f }));
        for (const sh of SHEARS) out.push(template(ch, pts.map(([x, y]) => [x - sh * (y - 48), y]), { font: f, aug: true }));
      }
    }
    onProgress?.(++done / SEED_FONTS.length);
    await new Promise((r) => setTimeout(r));
  }
  fontTemplates = out;
  return out.length;
}
export const templateCount = () => fontTemplates.length + profile.chars.length;

/* ================= Segmentación ================= */
const median = (a) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const pct = (a, q) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * q))]; };
const isTiny = (b, xh) => Math.max(b.w, b.h) < xh * 0.45;
const boxUnion = (a, b) => bboxOf([[a.x0, a.y0], [a.x1, a.y1], [b.x0, b.y0], [b.x1, b.y1]]);

// ¿El trazo toca a la letra? (p. ej. el arco de la "h" sale del palito)
function touches(strokes, s, tol) {
  const ends = [s[0], s[s.length - 1]];
  for (const o of strokes) {
    for (const p of o) for (const e of ends) if (Math.abs(p[0] - e[0]) < tol && Math.abs(p[1] - e[1]) < tol) return true;
    for (const e of [o[0], o[o.length - 1]]) for (const p of s) if (Math.abs(p[0] - e[0]) < tol && Math.abs(p[1] - e[1]) < tol) return true;
  }
  return false;
}

// Agrupa trazos en letras: los que se enciman horizontalmente (t, k, ñ, puntos y acentos) van juntos.
export function groupChars(strokes, xh, ids = strokes.map((_, i) => i)) {
  const items = strokes.map((s, k) => ({ s, i: ids[k], b: bboxOf(s) })).sort((a, b) => a.b.x0 - b.b.x0);
  const chars = [];
  for (const it of items) {
    let target = null;
    for (let k = chars.length - 1; k >= Math.max(0, chars.length - 2); k--) {
      const c = chars[k];
      const ov = Math.min(c.b.x1, it.b.x1) - Math.max(c.b.x0, it.b.x0);
      const tiny = isTiny(it.b, xh);
      const within = it.b.cx >= c.b.x0 - xh * 0.25 && it.b.cx <= c.b.x1 + xh * 0.25;
      if (ov > Math.min(c.b.w, it.b.w) * 0.4 || (tiny && within) || (ov > -xh * 0.08 && touches(c.strokes, it.s, xh * 0.14))) { target = c; break; }
    }
    if (target) {
      target.strokes.push(it.s);
      target.idx.push(it.i);
      target.b = bboxOf(target.strokes.flat());
    } else chars.push({ strokes: [it.s], idx: [it.i], b: it.b });
  }
  return chars;
}

function wordThreshold() {
  const { letterGap, wordGap } = profile.style;
  return Math.min(1.3, Math.max(0.38, (letterGap + wordGap) / 2));
}

// strokesPts: arreglos de puntos. Devuelve renglones -> palabras (índices de trazos).
export function segment(strokesPts) {
  const items = strokesPts.map((s, i) => ({ i, s, b: bboxOf(s) }));
  // 1) Renglones: unión de franjas verticales que se enciman
  let bands = [];
  for (const it of [...items].sort((a, b) => a.b.y0 - b.b.y0)) {
    const band = bands[bands.length - 1];
    if (band && it.b.y0 < band.b.y1 - Math.min(it.b.h, band.b.h) * 0.2) { band.items.push(it); band.b = boxUnion(band.b, it.b); }
    else bands.push({ items: [it], b: { ...it.b } });
  }
  // franjas muy delgadas (puntos de la i, acentos, tildes) se unen al renglón más cercano
  const hMed = median(bands.map((b) => b.b.h)) || 20;
  for (const small of bands.filter((b) => b.b.h < hMed * 0.45 && bands.length > 1)) {
    let best = null, bd = Infinity;
    for (const o of bands) {
      if (o === small || o.items.length === 0) continue;
      const d = Math.max(0, o.b.y0 - small.b.y1, small.b.y0 - o.b.y1);
      if (d < bd) { bd = d; best = o; }
    }
    if (best && bd < hMed) { best.items.push(...small.items); best.b = boxUnion(best.b, small.b); small.items = []; }
  }
  bands = bands.filter((b) => b.items.length);

  const T = wordThreshold();
  return bands.map((band) => {
    // 2) Letras y tamaño de letra del renglón
    const xh0 = Math.max(10, band.b.h * 0.5);
    const chars = groupChars(band.items.map((x) => x.s), xh0, band.items.map((x) => x.i));
    const hs = chars.map((c) => c.b.h).filter((h) => h > xh0 * 0.3);
    const xh = Math.max(10, (pct(hs, 0.3) || xh0) * 0.9); // altura de la "x": ignora letras altas (h, l, t…)
    // 3) Palabras: se separan cuando el hueco entre letras es como TU espacio entre palabras.
    //    Si en el renglón hay huecos chicos y grandes bien distintos, se corta entre ambos grupos.
    let runX = -Infinity;
    const gaps = chars.map((c, k) => { const g = k ? (c.b.x0 - runX) / xh : 0; runX = Math.max(runX, c.b.x1); return g; }).slice(1);
    let cut = T;
    if (gaps.length >= 2) {
      const s = [...gaps].sort((a, b) => a - b);
      let bestJump = 0;
      for (let k = 0; k < s.length - 1; k++) {
        const jump = s[k + 1] - Math.max(s[k], 0);
        if (s[k + 1] > 0.45 && jump > bestJump && s[k + 1] / Math.max(s[k], 0.08) > 1.7) { bestJump = jump; cut = (Math.max(s[k], 0) + s[k + 1]) / 2; }
      }
      // Huecos parejos (sin "chicos" y "grandes") = una sola palabra con letras separadas
      if (!bestJump) cut = s[s.length - 1] < 2.2 ? 2.3 : T;
    }
    const words = [];
    chars.forEach((c, k) => {
      const w = words[words.length - 1];
      if (w && gaps[k - 1] < cut) { w.idx.push(...c.idx); w.b = boxUnion(w.b, c.b); }
      else words.push({ idx: [...c.idx], b: { ...c.b } });
    });
    return { words, xh, b: band.b };
  });
}

/* ================= Reconocimiento ================= */
function hasMark(strokes, b) {
  return strokes.some((s) => {
    const sb = bboxOf(s);
    return Math.max(sb.w, sb.h) < b.h * 0.3 && sb.cy < b.y0 + b.h * 0.35 && strokes.length > 1;
  });
}
function classifyChar(strokes, xh, baseline) {
  const b = bboxOf(strokes.flat());
  // Signos pequeños: punto, coma, guion, dos puntos
  if (Math.max(b.w, b.h) < xh * 0.4) {
    if (strokes.length >= 2 && b.h > b.w * 1.5) return Object.assign([{ ch: ':', d: 0.3 }], { sign: true });
    if (b.y1 > baseline - xh * 0.35) return Object.assign([{ ch: b.h > b.w * 1.6 && b.y1 > baseline + xh * 0.1 ? ',' : '.', d: 0.3 }], { sign: true });
  }
  if (b.h < xh * 0.3 && b.w > xh * 0.45 && strokes.length === 1) return Object.assign([{ ch: '-', d: 0.3 }], { sign: true });

  const mark = hasMark(strokes, b);
  const c = normalize(cloudFromStrokes(strokes));
  const extra = (t) => 0.35 * Math.abs(Math.log(c.ar / t.ar)) + (t.mark !== mark ? 0.55 : 0);
  // Pasada rápida con la mitad de puntos para quedarnos con las plantillas más parecidas
  const half = c.pts.filter((_, i) => i % 2 === 0);
  const all = [];
  for (const t of fontTemplates) all.push([t, t.aug ? 1.04 : 1]);
  for (const t of profile.chars) all.push([t, 0.78]); // tu letra pesa más que cualquier tipografía
  const coarse = all.map(([t, k]) => [t, k, (cloudDist(half, t.half || (t.half = t.pts.filter((_, i) => i % 2 === 0)), 0) * 2 + extra(t)) * k]);
  coarse.sort((x, y) => x[2] - y[2]);
  const best = new Map();
  for (const [t, k] of coarse.slice(0, 70)) {
    const d = (match(c.pts, t.pts) + extra(t)) * k;
    const prev = best.get(t.ch);
    if (prev === undefined || d < prev) best.set(t.ch, d);
  }
  // Para las letras que no pasaron a la ronda fina, una estimación (sirve para el diccionario)
  const distMap = new Map();
  for (const [t, , d0] of coarse) {
    const key = stripAccents(t.ch.toLowerCase());
    const d = best.get(t.ch) ?? d0 * 1.15;
    if (!distMap.has(key) || d < distMap.get(key)) distMap.set(key, d);
  }
  const rel = b.h / xh;
  const list = [];
  for (const [ch, d] of best) {
    const lo = ch.toLowerCase();
    let out = ch;
    if (TWINS.has(stripAccents(lo))) out = rel > 1.45 ? ch.toUpperCase() : lo;
    const ex = list.find((x) => x.ch === out);
    if (ex) ex.d = Math.min(ex.d, d); else list.push({ ch: out, d });
  }
  const top = list.sort((a, b) => a.d - b.d).slice(0, 5);
  top.dist = distMap;
  return top;
}

const CONF_D = 1.45; // distancia a partir de la cual una letra se considera dudosa

// Busca en el diccionario la palabra que mejor explica tus letras (alineación letra por letra,
// permite 1 letra de más o de menos por si una letra se partió o dos se juntaron).
function dictionaryDecode(cands, raw, onlyCore = false) {
  const n = cands.length;
  const bestD = cands.map((cs) => cs[0].d);
  const sub = (i, L) => {
    if (cands[i].sign) return 2;
    return Math.max(0, (cands[i].dist.get(L) ?? 9) - bestD[i]);
  };
  const GAP = 0.8;
  const limit = 0.24 * n + 0.2;
  const sure = cands.filter((cs) => cs[0].d < 1.0).length; // letras que leí con seguridad
  let best = null;
  // Sólo palabras del MISMO largo (nunca agrega ni quita letras) y cada letra cambiada
  // tiene que parecerse casi tanto como la letra que leí en esa posición.
  for (let len = n; len <= n; len++) {
    for (const w of lexByLen.get(len) || []) {
      const info = lex.get(w);
      if (onlyCore && info.tier !== 'core') continue;
      // Palabras comunes/dentales/tuyas: hasta 1/3 de letras dudosas. Palabras raras: sólo 1 letra casi empatada.
      const rare = info.tier === 'rare';
      const short = n <= 4;
      if (short && info.big) continue; // palabras cortas: sólo con la lista curada (evita "trat" → "true")
      const maxChanges = rare || short ? 1 : Math.ceil(n / 3);
      const maxSub = rare ? 0.25 : short ? 0.3 : 0.5;
      let ok = true, changes = 0;
      for (let i = 0; i < n && ok; i++) if (w[i] !== raw[i] && (++changes > maxChanges || sub(i, w[i]) > maxSub)) ok = false;
      if (!ok) continue;
      // Programación dinámica (distancia de edición ponderada por la forma de cada letra)
      let prev = new Float64Array(len + 1);
      for (let j = 0; j <= len; j++) prev[j] = j * GAP;
      let rowMin = 0;
      for (let i = 1; i <= n && rowMin <= limit; i++) {
        const cur = new Float64Array(len + 1);
        cur[0] = i * GAP;
        rowMin = cur[0];
        for (let j = 1; j <= len; j++) {
          cur[j] = Math.min(prev[j - 1] + sub(i - 1, w[j - 1]), prev[j] + GAP, cur[j - 1] + GAP);
          if (cur[j] < rowMin) rowMin = cur[j];
        }
        prev = cur;
      }
      if (rowMin > limit) continue;
      const cost = prev[len] + info.cost;
      // Coincidencia mínima: ~60% de las letras deben ser tal cual las leí (al inicio o al final)
      let same = 0;
      for (let i = 0; i < Math.min(len, n); i++) if (raw[i] === w[i] || raw[n - 1 - i] === w[len - 1 - i]) same++;
      if (same < Math.ceil(Math.min(len, n) * 0.6)) continue;
      // Las letras que leí con seguridad no se pueden cambiar
      let broke = false;
      for (let i = 0; i < n && !broke; i++) if (cands[i][0].d < 0.6 && !w.includes(stripAccents(cands[i][0].ch.toLowerCase()))) broke = true;
      if (broke || sure === 0) continue;
      if (cost <= limit && (!best || cost < best.cost)) best = { w, cost, word: info.word };
    }
  }
  return best;
}

function recognizeWordStrokes(strokes, xh, opts) {
  // 1) ¿Es una palabra o abreviatura que te enseñé completa?
  if (profile.words.length) {
    const wc = normalize(cloudFromStrokes(strokes));
    let best = null;
    for (const t of profile.words) {
      const arD = Math.abs(Math.log(wc.ar / t.ar));
      if (arD > 0.35) continue;
      const d = match(wc.pts, t.pts) + arD;
      if (!best || d < best.d) best = { t, d };
    }
    if (best && best.d < 2.4) return { text: best.t.text, uncertain: [], source: 'aprendida' };
  }
  // 2) Letra por letra
  const chars = groupChars(strokes, xh);
  const wb = bboxOf(strokes.flat());
  const baseline = median(chars.map((c) => c.b.y1)) || wb.y1;
  if (chars.length === 1 && chars[0].b.w > xh * 3.6) return null; // cursiva continua o dibujo: no se adivina
  const cands = chars.map((c) => classifyChar(c.strokes, xh, baseline));
  if (cands.some((cs) => !cs.length)) return null; // la base de letras aún se está preparando
  // Preferencias de contexto: dentro de una palabra lo normal son minúsculas; números con números.
  const digits = cands.filter((cs) => /\d/.test(cs[0]?.ch)).length > cands.length / 2;
  const prior = (ch, i) => {
    if (/\d/.test(ch)) return digits ? 0 : 0.3;
    if (ch !== ch.toLowerCase()) return i === 0 ? 0.06 : 0.22;
    return digits ? 0.25 : 0;
  };
  let beams = [{ s: '', d: 0, idx: [] }];
  for (const [i, cs] of cands.entries()) {
    const nb = [];
    for (const bm of beams) for (const c of cs) nb.push({ s: bm.s + c.ch, d: bm.d + c.d + prior(c.ch, i), idx: [...bm.idx, c] });
    nb.sort((a, b) => a.d - b.d);
    beams = nb.slice(0, 24);
  }
  const pick = beams[0];
  let text = pick.s;
  let uncertain = [];
  const plainCh = (ch) => stripAccents(ch.toLowerCase());
  pick.idx.forEach((c, i) => {
    const alt = cands[i].find((x) => plainCh(x.ch) !== plainCh(c.ch));
    if (c.d > CONF_D || (alt && alt.d - c.d < 0.12)) uncertain.push(i);
  });
  let source = 'letras';
  const raw = stripAccents(text.toLowerCase());
  if (lex.has(raw)) {
    // Si lo que leí es una palabra rara, ¿había una común/dental casi igual? (ej. "ruiz" → "raíz")
    const alt = lex.get(raw).tier === 'rare' && opts.dict !== false ? dictionaryDecode(cands, raw, true) : null;
    text = restoreCase(text, alt ? alt.word : lex.get(raw).word);
    uncertain = [];
    source = 'diccionario';
  } else if (opts.dict !== false && !digits && cands.length >= 2) {
    const hit = dictionaryDecode(cands, raw);
    if (hit) { text = restoreCase(text, hit.word); uncertain = []; source = 'diccionario'; }
  }
  if (uncertain.length > Math.max(1, chars.length * 0.6)) return null; // demasiado dudoso: se queda tu trazo
  const ab = profile.abbr[stripAccents(text.toLowerCase())] || profile.abbr[text.toLowerCase()];
  if (ab) { text = restoreCase(text, ab); uncertain = []; source = 'abreviatura'; }
  return { text, uncertain, baseline, source, descender: DESC.has(text[text.length - 1]) };
}
const restoreCase = (written, word) => (written[0] && written[0] !== written[0].toLowerCase() ? word[0].toUpperCase() + word.slice(1) : word);

/* Entrada: lista de trazos (cada uno arreglo de puntos). Salida: renglones con palabras reconocidas. */
export function recognize(strokesPts, opts = {}) {
  const lines = segment(strokesPts);
  return lines.map((ln) => {
    const words = ln.words.map((w) => {
      const strokes = w.idx.map((i) => strokesPts[i]);
      const r = recognizeWordStrokes(strokes, ln.xh, opts);
      return { idx: w.idx, b: w.b, ...(r || { text: null }) };
    });
    // Línea base única para todo el renglón: mediana de las bases sin letras colgantes
    const bases = words.filter((w) => w.baseline && !w.descender).map((w) => w.baseline);
    return { words, xh: ln.xh, b: ln.b, baseline: median(bases) || ln.b.y1 };
  });
}

/* ================= Aprendizaje ================= */
export function learnStyle(lines) {
  // Ajusta (poco a poco) cuánto separas palabras y el tamaño de tu letra
  const st = profile.style;
  for (const ln of lines) {
    const words = ln.words;
    for (let i = 1; i < words.length; i++) {
      const g = (words[i].b.x0 - words[i - 1].b.x1) / ln.xh;
      if (g > 0 && g < 4) st.wordGap = st.wordGap * 0.9 + g * 0.1;
    }
    st.xh = st.xh ? st.xh * 0.9 + ln.xh * 0.1 : ln.xh;
  }
  st.samples++;
  saveProfile();
}
export function learnLetterGaps(strokesPts, xh) {
  const chars = groupChars(strokesPts, xh);
  for (let i = 1; i < chars.length; i++) {
    const g = (chars[i].b.x0 - chars[i - 1].b.x1) / xh;
    if (g > -0.2 && g < 1.5) profile.style.letterGap = profile.style.letterGap * 0.92 + Math.max(0, g) * 0.08;
  }
}

export function addCharTemplate(ch, strokesPts) {
  const c = normalize(cloudFromStrokes(strokesPts));
  profile.chars.push({ ch, pts: c.pts, ar: c.ar, mark: hasMark(strokesPts, bboxOf(strokesPts.flat())) });
  const same = profile.chars.filter((t) => t.ch === ch);
  if (same.length > 14) profile.chars.splice(profile.chars.indexOf(same[0]), 1);
}
export function addWordTemplate(text, strokesPts) {
  const c = normalize(cloudFromStrokes(strokesPts));
  profile.words.push({ text, pts: c.pts, ar: c.ar });
  const same = profile.words.filter((t) => t.text === text);
  if (same.length > 5) profile.words.splice(profile.words.indexOf(same[0]), 1);
}
function addLexicon(text) {
  const plain = text.toLowerCase();
  if (/^[a-záéíóúñü]{3,}$/i.test(plain) && !profile.lexicon.includes(plain)) {
    profile.lexicon.push(plain);
    rebuildLexicon();
  }
}

// Cuando corriges una palabra: si el número de letras coincide, aprende cada letra;
// si no (p. ej. abreviatura), aprende la palabra completa.
export function learnWord(strokesPts, text, { asWord = false } = {}) {
  const clean = text.trim();
  if (!clean || !strokesPts.length) return false;
  const b = bboxOf(strokesPts.flat());
  const xh = profile.style.xh || b.h * 0.6;
  const chars = groupChars(strokesPts, xh);
  const letters = [...clean.replace(/\s+/g, '')];
  let perLetter = false;
  if (!asWord && chars.length === letters.length) {
    chars.forEach((c, i) => addCharTemplate(letters[i], c.strokes));
    learnLetterGaps(strokesPts, xh);
    perLetter = true;
  } else {
    addWordTemplate(clean, strokesPts);
  }
  addLexicon(clean);
  saveProfile();
  return perLetter;
}

// Entrenamiento con texto conocido (frases): alinea lo que escribiste con el texto esperado
// y aprende letra por letra donde coincidan. Devuelve cuántas palabras aprendió.
export function learnFromPassage(strokesPts, expectedText) {
  const expected = expectedText.split(/\s+/).map((w) => w.replace(/[^\p{L}\p{N}]/gu, '')).filter(Boolean);
  const lines = segment(strokesPts);
  const written = lines.flatMap((ln) => ln.words.map((w) => ({ strokes: w.idx.map((i) => strokesPts[i]), xh: ln.xh })));
  let learned = 0, k = 0;
  for (const w of written) {
    const chars = groupChars(w.strokes, w.xh).filter((c) => !isTiny(c.b, w.xh) || c.strokes.length > 1);
    // busca la palabra esperada (en orden) con el mismo número de letras
    for (let j = k; j < Math.min(expected.length, k + 3); j++) {
      if ([...expected[j]].length === chars.length) {
        [...expected[j]].forEach((ch, i) => addCharTemplate(ch, chars[i].strokes));
        learnLetterGaps(w.strokes, w.xh);
        addLexicon(expected[j]);
        learned++;
        k = j + 1;
        break;
      }
    }
  }
  if (lines.length) learnStyle(lines);
  saveProfile();
  return { learned, total: expected.length, written: written.length };
}

export function setAbbr(short, long) {
  const k = short.trim().toLowerCase();
  if (!k) return;
  if (long && long.trim()) profile.abbr[k] = long.trim(); else delete profile.abbr[k];
  saveProfile();
}

export function stats() {
  const per = {};
  for (const t of profile.chars) per[t.ch] = (per[t.ch] || 0) + 1;
  return { letters: Object.keys(per).length, samples: profile.chars.length, words: profile.words.length, abbr: Object.keys(profile.abbr).length, per, base: fontTemplates.length, dict: lex.size, mine: profile.lexicon.length };
}
export function resetLearning() {
  profile.chars = []; profile.words = []; profile.lexicon = [];
  profile.style = { letterGap: 0.22, wordGap: 0.95, xh: 0, samples: 0 };
  rebuildLexicon();
  saveProfile();
}

// Para pruebas
export const _debug = { match, normalize, cloudFromStrokes, classifyChar, fontTemplates: () => fontTemplates };
