// Entrenador: escribe frases, letras, palabras o abreviaturas para que el corrector aprenda TU letra.
import { el, icon, $, toast } from './util.js';
import * as HW from './handwriting.js';

// Frases con TODAS las letras del abecedario (incluye ñ, w, k, x) + palabras de odontología
const CHUNKS = [
  'El veloz murciélago hindú',
  'comía feliz cardillo y kiwi',
  'La cigüeña tocaba el saxofón',
  'detrás del palenque de paja',
  'Ximena revisó la caries y el esmalte',
  'quizá extraiga la muela del juicio',
];
const ROUNDS = [
  { name: 'Lento', hint: 'Escríbela despacio, con tu letra de siempre.', chunks: [0, 1, 2, 3, 4, 5] },
  { name: 'Rápido', hint: 'Ahora más rápido, como cuando tomas apuntes.', chunks: [0, 1, 2, 3] },
  { name: 'Súper rápido', hint: 'Ahora súper rápido, como cuando el profe dicta sin parar.', chunks: [0, 1, 2, 3] },
];

function makePad(w = 900, h = 300, lines = 1) {
  const c = el('canvas', { class: 'pad' });
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const strokes = [];
  let cur = null;
  const guides = () => {
    ctx.clearRect(0, 0, c.width, c.height);
    const step = h / (lines + 0.4);
    for (let i = 1; i <= lines; i++) {
      const y = step * i + step * 0.15;
      ctx.strokeStyle = '#c7d2fe'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(30, y); ctx.lineTo(w - 30, y); ctx.stroke();
      ctx.setLineDash([8, 10]);
      ctx.beginPath(); ctx.moveTo(30, y - step * 0.32); ctx.lineTo(w - 30, y - step * 0.32); ctx.stroke();
      ctx.setLineDash([]);
    }
  };
  const redraw = () => {
    guides();
    ctx.strokeStyle = '#1c1f26'; ctx.lineWidth = 4.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const s of strokes) {
      ctx.beginPath(); ctx.moveTo(s[0][0], s[0][1]);
      for (const p of s) ctx.lineTo(p[0], p[1]);
      if (s.length === 1) ctx.lineTo(s[0][0] + 0.1, s[0][1]);
      ctx.stroke();
    }
  };
  const pos = (e) => { const r = c.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * c.width, ((e.clientY - r.top) / r.height) * c.height, 0.5]; };
  c.addEventListener('pointerdown', (e) => { try { c.setPointerCapture(e.pointerId); } catch { /* */ } cur = [pos(e)]; strokes.push(cur); redraw(); });
  c.addEventListener('pointermove', (e) => {
    if (!cur) return;
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    for (const ev of evs.length ? evs : [e]) cur.push(pos(ev));
    redraw();
  });
  const up = () => { cur = null; };
  c.addEventListener('pointerup', up);
  c.addEventListener('pointercancel', up);
  guides();
  return { canvas: c, strokes, clear() { strokes.length = 0; redraw(); } };
}

export function openTrainer(mode = 'frases') {
  const m = $('#modal');
  const st = HW.stats();
  let i = [...HW.TRAIN_CHARS].findIndex((ch) => !st.per[ch]);
  if (i < 0) i = 0;
  let round = 0, chunk = 0, learnedTotal = 0;

  const render = () => {
    const tabs = el('div', { class: 'tabs' },
      [['frases', 'Frases (recomendado)'], ['letters', 'Letras'], ['word', 'Palabras y abreviaturas']].map(([k, n]) =>
        el('button', { class: mode === k ? 'on' : '', onclick: () => { mode = k; render(); } }, n)));
    let body;
    if (mode === 'frases') {
      const R = ROUNDS[round];
      const text = CHUNKS[R.chunks[chunk]];
      const pad = makePad(1100, 260, 1);
      const total = ROUNDS.reduce((a, r) => a + r.chunks.length, 0);
      const done = ROUNDS.slice(0, round).reduce((a, r) => a + r.chunks.length, 0) + chunk;
      const next = () => {
        chunk++;
        if (chunk >= R.chunks.length) { chunk = 0; round++; }
        if (round >= ROUNDS.length) {
          toast(`¡Entrenamiento terminado! Aprendí ${learnedTotal} palabras de tu letra 🦷`, 4000);
          m.close();
          return;
        }
        render();
      };
      body = el('div', { class: 'trainer' },
        el('div', { class: 'speed' }, ROUNDS.map((r, k) => el('span', { class: k === round ? 'on' : k < round ? 'done' : '' }, r.name))),
        el('div', { class: 'progress' }, el('i', { style: { width: (done / total) * 100 + '%' } })),
        el('p', { class: 'muted' }, R.hint),
        el('div', { class: 'phrase' }, text),
        pad.canvas,
        el('div', { class: 'row' },
          el('button', { class: 'btn', onclick: () => pad.clear() }, 'Borrar'),
          el('span', { class: 'spacer' }),
          el('button', { class: 'btn', onclick: next }, 'Saltar'),
          el('button', {
            class: 'btn primary', onclick: () => {
              if (pad.strokes.length < 3) { toast('Escribe la frase en el recuadro'); return; }
              const r = HW.learnFromPassage(pad.strokes.map((s) => s.slice()), text);
              learnedTotal += r.learned;
              toast(r.learned ? `Aprendí ${r.learned} de ${r.total} palabras ✍️` : 'No logré separar tus palabras; deja un espacio un poco más grande entre ellas.', 2600);
              next();
            },
          }, 'Listo ✓')));
    } else if (mode === 'letters') {
      const pad = makePad();
      const ch = HW.TRAIN_CHARS[i];
      const n = HW.stats().per[ch] || 0;
      body = el('div', { class: 'trainer' },
        el('div', { class: 'train-prompt' },
          el('span', { class: 'big' }, ch),
          el('span', { class: 'muted' }, `Escríbela como siempre la haces · ${i + 1}/${HW.TRAIN_CHARS.length} · ${n ? `ya tengo ${n} muestra${n > 1 ? 's' : ''}` : 'aún no la conozco'}`)),
        pad.canvas,
        el('div', { class: 'row' },
          el('button', { class: 'btn', onclick: () => pad.clear() }, 'Borrar'),
          el('span', { class: 'spacer' }),
          el('button', { class: 'btn', onclick: () => { i = (i + 1) % HW.TRAIN_CHARS.length; render(); } }, 'Saltar'),
          el('button', {
            class: 'btn primary', onclick: () => {
              if (!pad.strokes.length) { toast('Escribe la letra primero'); return; }
              HW.addCharTemplate(ch, pad.strokes.map((s) => s.slice()));
              HW.saveProfile();
              i = (i + 1) % HW.TRAIN_CHARS.length;
              render();
            },
          }, 'Guardar ✓')));
    } else {
      const pad = makePad();
      const short = el('input', { placeholder: 'Lo que escribes (ej. tx)' });
      const long = el('input', { placeholder: 'Significado (ej. tratamiento) — opcional' });
      body = el('div', { class: 'trainer' },
        el('p', { class: 'muted' }, 'Enséñame palabras que escribes mucho o tus abreviaturas. Si pones significado, cada vez que lo escribas lo convertiré en la palabra completa.'),
        el('div', { class: 'row' }, short, long),
        pad.canvas,
        el('div', { class: 'row' },
          el('button', { class: 'btn', onclick: () => pad.clear() }, 'Borrar'),
          el('span', { class: 'spacer' }),
          el('button', {
            class: 'btn primary', onclick: () => {
              const s = short.value.trim(), l = long.value.trim();
              if (!s) { toast('Escribe en el cuadro de texto qué palabra es'); return; }
              if (l) HW.setAbbr(s, l);
              if (pad.strokes.length) HW.learnWord(pad.strokes.map((x) => x.slice()), l || s, { asWord: true });
              toast(l ? `Listo: “${s}” → “${l}”` : `Aprendí “${s}”`);
              render();
            },
          }, 'Guardar ✓')));
    }
    m.replaceChildren(el('div', { class: 'modal-card' + (mode === 'frases' ? ' wide' : '') },
      el('header', { class: 'modal-head' }, el('h2', {}, 'Entrenar mi letra'), el('button', { class: 'ib', onclick: () => m.close() }, icon('close'))),
      el('div', { class: 'modal-body' }, tabs, body)));
  };
  render();
  if (!m.open) m.showModal();
}
