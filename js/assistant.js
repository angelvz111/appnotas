// Asistente SIN INTERNET basado en tus notas y PDFs: resumir, buscar, índice automático,
// tarjetas de estudio, tus palabras, abreviaturas y estado del aprendizaje de tu letra.
import { el, icon, toast, stripAccents } from './util.js';
import { DB } from './db.js';
import * as HW from './handwriting.js';
import { openTrainer } from './trainer.js';
import { summarize } from './summary.js';

const norm = (s) => stripAccents(s.toLowerCase());

// Junta los textos de una página en renglones legibles
export function textLines(pg) {
  const items = pg.layers.filter((l) => l.visible).flatMap((l) => l.items.filter((it) => it.kind === 'text'));
  items.sort((a, b) => a.y - b.y || a.x - b.x);
  const lines = [];
  for (const it of items) {
    const ln = lines.find((l) => Math.abs(l.y - it.y) < it.size * 0.5);
    if (ln) ln.parts.push(it);
    else lines.push({ y: it.y, parts: [it] });
  }
  return lines.map((l) => {
    l.parts.sort((a, b) => a.x - b.x);
    return { y: l.y, text: l.parts.map((p) => p.text).join(' '), role: l.parts[0].brush };
  });
}
// Todo el texto de una página: lo que escribiste (ya convertido) + el texto del PDF
export function pageAllText(pg) {
  const mine = textLines(pg).map((l) => l.text).join('\n');
  return [pg.pdfText || '', mine].filter(Boolean).join('\n\n');
}

export function openAssistant(api, startTab = 'resumir') {
  let tab = startTab;
  const body = el('div', { class: 'panel-body' });
  const tabs = el('div', { class: 'tabs small wrap' });
  const TABS = [['resumir', 'Resumir'], ['buscar', 'Buscar'], ['indice', 'Índice'], ['tarjetas', 'Tarjetas'], ['palabras', 'Mis palabras'], ['abrev', 'Abreviaturas'], ['letra', 'Mi letra']];
  const render = () => {
    tabs.replaceChildren(...TABS.map(([id, n]) => el('button', { class: id === tab ? 'on' : '', onclick: () => { tab = id; render(); } }, n)));
    body.replaceChildren(tabs, VIEWS[tab]());
  };

  const VIEWS = {
    resumir() {
      const nb = api.nb();
      const out = el('div', { class: 'summary' });
      let scope = 'nb', len = 8, other = null;
      const run = async () => {
        let sources = [];
        if (scope === 'page') {
          const i = api.pageIdx();
          sources = [{ text: pageAllText(nb.pages[i]), page: i }];
        } else {
          const book = scope === 'other' ? other : nb;
          if (!book) return;
          sources = book.pages.map((pg, i) => ({ text: pageAllText(pg), page: i }));
        }
        const r = summarize(sources, len);
        if (!r.points.length) {
          out.replaceChildren(el('p', { class: 'muted' }, 'No encontré texto para resumir. Importa un PDF con texto o escribe con el corrector encendido (lo escrito a mano sin convertir no se puede leer todavía).'));
          return;
        }
        const book = scope === 'other' ? other : nb;
        out.replaceChildren(
          el('h4', {}, 'Ideas principales'),
          el('ol', { class: 'sum-list' }, r.points.map((p) => el('li', {}, p.text, el('button', { class: 'pg', title: 'Ir a la página', onclick: () => api.goTo(book.id, p.page) }, `pág. ${p.page + 1}`)))),
          r.keywords.length ? el('h4', {}, 'Palabras clave') : null,
          el('div', { class: 'chips' }, r.keywords.map((k) => el('span', { class: 'chip small' }, k))),
          r.definitions.length ? el('h4', {}, 'Definiciones') : null,
          el('div', { class: 'results' }, r.definitions.slice(0, 8).map((d) => el('div', { class: 'result' }, el('b', {}, d.term), el('span', {}, d.def)))),
          el('button', { class: 'btn primary full', onclick: () => api.addSummaryPage(r, scope === 'other' ? `Resumen · ${other.name}` : 'Resumen') }, icon('book', 18), ' Crear página de resumen'),
          el('p', { class: 'muted' }, 'Resumen hecho en tu tablet, sin internet: escoge las oraciones más importantes del documento (no inventa información).'));
      };
      const scopeChips = el('div', { class: 'chips' });
      const otherSel = el('select', { class: 'hidden', onchange: async (e) => { other = await DB.get('notebooks', e.target.value); } });
      DB.all('notebooks').then((nbs) => {
        const withPdf = nbs.filter((x) => x.id !== nb.id && x.pages.some((p) => p.pdfText));
        otherSel.replaceChildren(el('option', { value: '' }, 'Elige un PDF importado…'), ...withPdf.map((x) => el('option', { value: x.id }, x.name)));
      });
      const renderScope = () => scopeChips.replaceChildren(...[['nb', 'Este cuaderno'], ['page', 'Esta página'], ['other', 'Otro PDF']].map(([k, n]) =>
        el('button', { class: 'chip' + (scope === k ? ' on' : ''), onclick: () => { scope = k; otherSel.classList.toggle('hidden', k !== 'other'); renderScope(); } }, n)));
      renderScope();
      const lenChips = el('div', { class: 'chips' });
      const renderLen = () => lenChips.replaceChildren(...[[5, 'Corto'], [8, 'Medio'], [14, 'Largo']].map(([k, n]) =>
        el('button', { class: 'chip' + (len === k ? ' on' : ''), onclick: () => { len = k; renderLen(); } }, n)));
      renderLen();
      const hasPdf = nb.pages.some((p) => p.pdfText);
      return el('div', { class: 'col' },
        el('p', { class: 'muted' }, hasPdf ? 'Este cuaderno tiene un PDF importado: puedo resumirlo junto con tus notas.' : 'Importa un PDF (Páginas › Insertar PDF o + › Importar PDF) o resume lo que ya convertiste a texto.'),
        el('div', { class: 'field' }, el('span', {}, '¿Qué resumo?'), scopeChips, otherSel),
        el('div', { class: 'field' }, el('span', {}, 'Largo'), lenChips),
        el('button', { class: 'btn primary full', onclick: run }, icon('brain', 18), ' Resumir'),
        out);
    },
    buscar() {
      const out = el('div', { class: 'results' });
      const input = el('input', { class: 'search-in', placeholder: 'Buscar en tus cuadernos y PDFs…' });
      let t;
      input.oninput = () => {
        clearTimeout(t);
        t = setTimeout(async () => {
          const q = norm(input.value.trim());
          if (q.length < 2) { out.replaceChildren(); return; }
          const nbs = await DB.all('notebooks');
          const cur = api.nb();
          const res = [];
          for (const nb0 of nbs) {
            const nb = nb0.id === cur.id ? cur : nb0;
            nb.pages.forEach((pg, pi) => pageAllText(pg).split('\n').forEach((ln) => { if (ln.trim() && norm(ln).includes(q)) res.push({ nb, pi, text: ln.trim() }); }));
          }
          out.replaceChildren(...(res.length ? res.slice(0, 80).map((r) => el('button', { class: 'result', onclick: () => api.goTo(r.nb.id, r.pi) },
            el('small', {}, `${r.nb.name} · pág. ${r.pi + 1}`), el('span', {}, r.text.slice(0, 200))))
            : [el('p', { class: 'muted' }, 'Sin resultados. Se busca en tus PDFs y en lo que el corrector ya convirtió a texto.')]));
        }, 220);
      };
      setTimeout(() => input.focus());
      return el('div', {}, input, out);
    },
    indice() {
      const nb = api.nb();
      const entries = [];
      nb.pages.forEach((pg, pi) => textLines(pg).forEach((ln) => {
        if (ln.role === 'titulo' || ln.role === 'subtitulo' || ln.role === 'lettering') entries.push({ text: ln.text, page: pi, sub: ln.role === 'subtitulo' });
      }));
      if (!entries.length) return el('p', { class: 'muted' }, 'Escribe tus títulos con el pincel “Título”, “Lettering” o “Subtítulo” y aquí aparecerá el índice del cuaderno automáticamente.');
      return el('div', {},
        el('div', { class: 'results' }, entries.map((e) => el('button', { class: 'result' + (e.sub ? ' sub' : ''), onclick: () => api.goTo(nb.id, e.page) },
          el('span', {}, e.text), el('small', {}, `pág. ${e.page + 1}`)))),
        el('button', { class: 'btn primary full', onclick: () => api.addIndexPage(entries) }, icon('book', 18), ' Crear página de índice al inicio'));
    },
    tarjetas() {
      const nb = api.nb();
      const cards = [];
      const re = /^(.{2,60}?)\s*(?::|=|→|->|—|–| - )\s*(.{2,})$/;
      nb.pages.forEach((pg, pi) => textLines(pg).forEach((ln) => { const m = re.exec(ln.text); if (m) cards.push({ q: m[1], a: m[2], page: pi }); }));
      // definiciones de los PDFs del cuaderno
      const pdfSources = nb.pages.map((pg, i) => ({ text: pg.pdfText || '', page: i })).filter((s) => s.text);
      if (pdfSources.length) for (const d of summarize(pdfSources, 1).definitions) cards.push({ q: d.term, a: d.def, page: d.page });
      if (!cards.length) return el('p', { class: 'muted' }, 'Escribe conceptos así: “Esmalte: tejido más duro del cuerpo” o importa un PDF con definiciones. Yo los convierto en tarjetas para repasar.');
      let i = 0, flipped = false;
      const card = el('button', { class: 'flash' });
      const counter = el('small', { class: 'muted' });
      const show = () => {
        const c = cards[i];
        card.classList.toggle('back', flipped);
        card.replaceChildren(el('small', {}, flipped ? 'Respuesta' : `Concepto · pág. ${c.page + 1}`), el('span', {}, flipped ? c.a : c.q));
        counter.textContent = `${i + 1} de ${cards.length}`;
      };
      card.onclick = () => { flipped = !flipped; show(); };
      show();
      return el('div', { class: 'flash-wrap' }, card, counter,
        el('div', { class: 'row' },
          el('button', { class: 'btn', onclick: () => { i = (i - 1 + cards.length) % cards.length; flipped = false; show(); } }, '‹ Anterior'),
          el('button', { class: 'ib', title: 'Revolver', onclick: () => { cards.sort(() => Math.random() - 0.5); i = 0; flipped = false; show(); } }, icon('shuffle')),
          el('button', { class: 'btn', onclick: () => { i = (i + 1) % cards.length; flipped = false; show(); } }, 'Siguiente ›')));
    },
    palabras() {
      const input = el('input', { placeholder: 'Ej. Kevin, Ximena, odontoplastia…' });
      const add = () => {
        const parts = input.value.split(/[,\s]+/).filter(Boolean);
        const ok = parts.filter((w) => HW.addMyWord(w));
        if (ok.length) toast(`Agregué ${ok.length} palabra${ok.length > 1 ? 's' : ''}`);
        else if (parts.length) toast('Sólo letras, de 2 a 40 caracteres');
        render();
      };
      input.onkeydown = (e) => { if (e.key === 'Enter') add(); };
      const mine = [...HW.profile.lexicon].sort();
      return el('div', { class: 'col' },
        el('p', { class: 'muted' }, `El corrector ya conoce ${HW.dictionarySize().toLocaleString('es-MX')} palabras (español/inglés + odontología). Agrega aquí nombres de personas, maestros, compañeros o términos que uses mucho: tendrán prioridad.`),
        el('div', { class: 'row' }, input, el('button', { class: 'btn primary', onclick: add }, 'Agregar')),
        el('div', { class: 'chips' }, mine.length ? mine.map((w) => el('span', { class: 'chip small removable' }, w,
          el('button', { title: 'Quitar', onclick: () => { HW.removeMyWord(w); render(); } }, '×')))
          : el('p', { class: 'muted' }, 'Aún no agregas palabras. Las que corrijas en “Corregir” también aparecen aquí.')));
    },
    abrev() {
      const short = el('input', { placeholder: 'tx' });
      const long = el('input', { placeholder: 'tratamiento' });
      const entries = Object.entries(HW.profile.abbr);
      return el('div', {},
        el('p', { class: 'muted' }, 'Cuando escribas la abreviatura, el corrector pondrá la palabra completa.'),
        el('div', { class: 'abbr-list' }, entries.length ? entries.map(([k, v]) => el('div', { class: 'abbr' },
          el('b', {}, k), el('span', {}, '→ ' + v),
          el('button', { class: 'ib sm', title: 'Quitar', onclick: () => { HW.setAbbr(k, ''); render(); } }, icon('close', 16))))
          : el('p', { class: 'muted' }, 'Aún no tienes abreviaturas.')),
        el('div', { class: 'row' }, short, long,
          el('button', { class: 'btn primary', onclick: () => { if (!short.value.trim() || !long.value.trim()) return; HW.setAbbr(short.value, long.value); toast('Abreviatura guardada'); render(); } }, 'Agregar')),
        el('button', { class: 'btn full', onclick: () => openTrainer('word') }, icon('wand', 18), ' Enseñar una abreviatura escrita a mano'));
    },
    letra() {
      const st = HW.stats();
      const idle = el('b', {}, (HW.profile.idle / 1000).toFixed(1) + ' s');
      return el('div', {},
        el('div', { class: 'stat-grid' },
          el('div', { class: 'stat' }, el('b', {}, String(st.letters)), el('small', {}, 'letras tuyas aprendidas')),
          el('div', { class: 'stat' }, el('b', {}, String(st.samples)), el('small', {}, 'muestras')),
          el('div', { class: 'stat' }, el('b', {}, st.dict.toLocaleString('es-MX')), el('small', {}, 'palabras en el diccionario')),
          el('div', { class: 'stat' }, el('b', {}, String(HW.profile.style.samples || 0)), el('small', {}, 'renglones estudiados'))),
        el('div', { class: 'letters' }, [...HW.TRAIN_CHARS].map((c) => el('span', { class: st.per[c] ? 'known' : '' }, c))),
        el('p', { class: 'muted' }, 'Las letras resaltadas ya las conozco con tu forma de escribir. Mientras más corrijas o entrenes, mejor reconozco tu letra. Todo se queda en tu tablet.'),
        el('button', { class: 'btn primary full', onclick: () => openTrainer('frases') }, icon('wand', 18), ' Entrenar mi letra (5 min)'),
        el('label', { class: 'field' }, el('span', {}, 'Pausa antes de corregir: ', idle),
          el('input', { type: 'range', min: 400, max: 3000, step: 100, value: HW.profile.idle, oninput: (e) => { HW.profile.idle = +e.target.value; idle.textContent = (HW.profile.idle / 1000).toFixed(1) + ' s'; HW.saveProfile(); } })),
        el('button', { class: 'btn full danger', onclick: () => { if (confirm('¿Olvidar todo lo que aprendí de tu letra?')) { HW.resetLearning(); render(); } } }, 'Olvidar lo aprendido'));
    },
  };

  render();
  api.showPanel('assistant', 'Asistente sin internet', body);
}
