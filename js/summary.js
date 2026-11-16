// Resúmenes LOCALES (sin internet): elige las oraciones más importantes de tus PDFs y notas,
// saca palabras clave y definiciones. Es un resumen "extractivo": usa las frases del propio
// documento (no inventa información).
import { stripAccents } from './util.js';
import { DICTS } from './dict.js';

const STOP = new Set((
  'a al algo algunas algunos ante antes como con contra cual cuando de del desde donde durante e el ella ellas ellos en entre era eran es esa esas ese eso esos esta estaba estas este esto estos fue fueron ha han hasta hay la las le les lo los mas me mi muy no nos o otra otras otro otros para pero poco por porque que se ser si sin sobre son su sus tambien tanto te tiene tienen todo todos tu un una uno unos y ya yo puede pueden cada mismo misma asi segun sea solo tan dos tres the of and to in is are for with on as by be this that from or an at it its which can these those was were has have not'
).split(' '));
const DENTAL = new Set(DICTS.es.dental.map((w) => stripAccents(w.toLowerCase())));
const DEF_RE = /^(.{3,60}?)\s*(?::|\bes\b|\bson\b|\bse define como\b|\bconsiste en\b|\bse denomina\b|\bse conoce como\b|\bse llama\b)\s+(.{12,})$/i;

const words = (s) => stripAccents(s.toLowerCase()).match(/[a-zñ]{3,}/g) || [];

function sentencesOf(text) {
  const clean = text
    .replace(/-\n(?=[a-záéíóúñ])/g, '')        // palabras cortadas al final de renglón
    .replace(/([^\n.!?:;])\n(?=[a-záéíóúñ])/g, '$1 ') // renglones de un mismo párrafo
    .replace(/[ \t]+/g, ' ');
  const out = [];
  clean.split(/\n{2,}|\n(?=[-•▪●*]\s)/).forEach((par, pi) => {
    par.split(/(?<=[.!?;])\s+(?=[A-ZÁÉÍÓÚÑ¿¡0-9])/).forEach((s, si) => {
      const t = s.replace(/\s+/g, ' ').replace(/^[-•▪●*]\s*/, '').trim();
      if (t.length >= 35 && t.length <= 420) out.push({ text: t, par: pi, pos: si });
    });
  });
  return out;
}

/**
 * sources: [{ text, page, origin }]  ·  n: número de oraciones
 * Devuelve { points: [{text, page}], keywords: [...], definitions: [{term, def, page}] }
 */
export function summarize(sources, n = 8) {
  const all = [];
  for (const src of sources) for (const s of sentencesOf(src.text || '')) all.push({ ...s, page: src.page, origin: src.origin });
  if (!all.length) return { points: [], keywords: [], definitions: [] };

  const tf = new Map(), df = new Map(), display = new Map();
  for (const s of all) {
    for (const t of s.text.toLowerCase().match(/\p{L}{3,}/gu) || []) { const k = stripAccents(t); if (!display.has(k) || t !== k) display.set(k, t); }
    const ws = words(s.text).filter((w) => !STOP.has(w));
    s.words = ws;
    for (const w of ws) tf.set(w, (tf.get(w) || 0) + 1);
    for (const w of new Set(ws)) df.set(w, (df.get(w) || 0) + 1);
  }
  const N = all.length;
  const weight = (w) => (tf.get(w) || 0) * Math.log(1 + N / (df.get(w) || 1)) * (DENTAL.has(w) ? 1.5 : 1);
  for (const s of all) {
    const uniq = [...new Set(s.words)];
    let score = uniq.reduce((a, w) => a + weight(w), 0) / Math.pow(Math.max(6, s.words.length), 0.7);
    if (DEF_RE.test(s.text)) score *= 1.25;
    if (s.pos === 0) score *= 1.15; // primera oración del párrafo
    if (/\b(importante|principal|caracter[ií]stica|clasificaci[oó]n|funci[oó]n|causa|tratamiento|diagn[oó]stico)\b/i.test(s.text)) score *= 1.1;
    s.score = score;
  }
  // Elegir las mejores sin repetir ideas (similitud de palabras)
  const picked = [];
  for (const s of [...all].sort((a, b) => b.score - a.score)) {
    if (picked.length >= n) break;
    const set = new Set(s.words);
    const dup = picked.some((p) => {
      const inter = p.words.filter((w) => set.has(w)).length;
      return inter / Math.max(1, Math.min(p.words.length, set.size)) > 0.6;
    });
    if (!dup) picked.push(s);
  }
  picked.sort((a, b) => all.indexOf(a) - all.indexOf(b));

  const keywords = [...tf.keys()]
    .filter((w) => w.length > 3)
    .sort((a, b) => weight(b) - weight(a))
    .slice(0, 14)
    .map((w) => display.get(w) || w);
  const definitions = [];
  for (const s of all) {
    const m = DEF_RE.exec(s.text);
    if (m && m[1].split(' ').length <= 6 && definitions.length < 20) definitions.push({ term: m[1].trim(), def: m[2].trim(), page: s.page });
  }
  return { points: picked.map((s) => ({ text: s.text, page: s.page, origin: s.origin })), keywords, definitions };
}
