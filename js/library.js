// Biblioteca: carpetas, cuadernos, crear cuaderno (portada + plantilla) y menús.
import { $, el, icon, toast, emit, menu, uid, pickFiles, fileToDataURL, compressImage, hydrateIcons } from './util.js';
import { DB } from './db.js';
import { TEMPLATES, PAPER_COLORS, LINE_COLORS, defaultPaper, paperThumb } from './paper.js';
import { COVERS, coverSrc } from './assets.js';
import { newNotebook, normalizeNotebook } from './model.js';
import { openMaterials } from './materials.js';
import { readPdf, pdfToNotebookPages, progressToast } from './pdf.js';

const L = { folder: 'all', query: '' };
const pad = (n) => String(n).padStart(2, '0');
const fmtDate = (t) => { const d = new Date(t); return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };

export async function showLibrary() {
  $('#editor').classList.add('hidden');
  $('#library').classList.remove('hidden');
  await renderLibrary();
}

export async function renderLibrary() {
  const [nbs, folders] = await Promise.all([DB.all('notebooks'), DB.all('folders')]);
  nbs.forEach(normalizeNotebook);
  folders.sort((a, b) => a.created - b.created);
  if (L.folder !== 'all' && !folders.find((f) => f.id === L.folder)) L.folder = 'all';

  $('#countAll').textContent = nbs.length;
  $('#sAll').classList.toggle('on', L.folder === 'all');
  $('#folderList').replaceChildren(...folders.map((f) => {
    const n = nbs.filter((nb) => nb.folderId === f.id).length;
    return el('div', { class: 'side-item' + (L.folder === f.id ? ' on' : ''), onclick: () => { L.folder = f.id; closeSide(); renderLibrary(); } },
      icon('folder', 20), el('span', { class: 'grow' }, f.name), el('span', { class: 'count' }, n),
      el('button', {
        class: 'ib sm ghost', title: 'Opciones', onclick: (e) => {
          e.stopPropagation();
          menu(e.currentTarget, [
            { label: 'Renombrar', icon: 'edit', action: async () => { const v = prompt('Nombre de la carpeta', f.name); if (v?.trim()) { f.name = v.trim(); await DB.put('folders', f); renderLibrary(); } } },
            {
              label: 'Eliminar carpeta', icon: 'trash', danger: true, action: async () => {
                if (!confirm(`¿Eliminar la carpeta “${f.name}”? Los cuadernos no se borran.`)) return;
                for (const nb of nbs.filter((x) => x.folderId === f.id)) { nb.folderId = null; await DB.put('notebooks', nb); }
                await DB.del('folders', f.id);
                renderLibrary();
              },
            },
          ]);
        },
      }, icon('more', 18)));
  }));

  const folder = folders.find((f) => f.id === L.folder);
  $('#libTitle').textContent = folder ? folder.name : 'Todos los cuadernos';
  const q = L.query.toLowerCase();
  const list = nbs
    .filter((nb) => (L.folder === 'all' || nb.folderId === L.folder) && (!q || nb.name.toLowerCase().includes(q)))
    .sort((a, b) => b.updated - a.updated);
  $('#libEmpty').classList.toggle('hidden', list.length > 0);
  $('#nbGrid').replaceChildren(...list.map((nb) => card(nb, folders)));
}

function card(nb, folders) {
  return el('div', { class: 'nb-card' },
    el('button', { class: 'nb-thumb', onclick: () => emit('open', nb) }, el('img', { src: coverSrc(nb.cover), alt: '' })),
    el('div', { class: 'nb-info' },
      el('div', { class: 'nb-text', onclick: () => emit('open', nb) },
        el('div', { class: 'nb-name' }, nb.name),
        el('div', { class: 'nb-date' }, `${fmtDate(nb.updated)} · ${nb.pages.length} pág.`)),
      el('button', { class: 'ib sm ghost', title: 'Opciones', onclick: (e) => cardMenu(e.currentTarget, nb, folders) }, icon('more', 18))));
}

function cardMenu(anchor, nb, folders) {
  menu(anchor, [
    { label: 'Abrir', icon: 'book', action: () => emit('open', nb) },
    { label: 'Renombrar', icon: 'edit', action: async () => { const v = prompt('Nombre del cuaderno', nb.name); if (v?.trim()) { nb.name = v.trim(); await DB.put('notebooks', nb); renderLibrary(); } } },
    { label: 'Cambiar portada', icon: 'image', action: () => coverDialog(nb) },
    {
      label: 'Mover a carpeta', icon: 'folder', action: () => menu(anchor, [
        { label: 'Sin carpeta', icon: 'book', action: () => moveTo(nb, null) },
        ...folders.map((f) => ({ label: f.name, icon: 'folder', action: () => moveTo(nb, f.id) })),
      ]),
    },
    {
      label: 'Duplicar', icon: 'plus', action: async () => {
        const copy = JSON.parse(JSON.stringify(nb));
        Object.assign(copy, { id: uid(), name: nb.name + ' (copia)', created: Date.now(), updated: Date.now() });
        await DB.put('notebooks', copy);
        renderLibrary();
      },
    },
    '-',
    { label: 'Eliminar', icon: 'trash', danger: true, action: async () => { if (confirm(`¿Eliminar “${nb.name}”? No se puede deshacer.`)) { await DB.del('notebooks', nb.id); renderLibrary(); } } },
  ]);
}
async function moveTo(nb, folderId) { nb.folderId = folderId; await DB.put('notebooks', nb); renderLibrary(); }

async function uploadCover() {
  const [f] = await pickFiles('image/*');
  if (!f) return null;
  const { src } = await compressImage(await fileToDataURL(f), 800, 'image/jpeg', 0.86);
  return { kind: 'image', src };
}

function coverRow(current, onPick) {
  const row = el('div', { class: 'cover-row' });
  const render = (cur) => row.replaceChildren(
    el('button', {
      class: 'cover-opt upload', onclick: async () => { const c = await uploadCover(); if (c) { onPick(c); render(c); } },
    }, icon('upload'), el('small', {}, 'Subir imagen')),
    ...(cur.kind === 'image' ? [el('button', { class: 'cover-opt on' }, el('img', { src: cur.src }), el('small', {}, 'Tu imagen'))] : []),
    ...COVERS.map((c) => el('button', {
      class: 'cover-opt' + (cur.kind === 'preset' && cur.id === c.id ? ' on' : ''),
      onclick: () => { const v = { kind: 'preset', id: c.id }; onPick(v); render(v); },
    }, el('img', { src: c.src, alt: '' }), el('small', {}, c.name))));
  render(current);
  return row;
}

function coverDialog(nb) {
  const m = $('#modal');
  let pick = nb.cover;
  m.replaceChildren(el('div', { class: 'modal-card wide' },
    el('header', { class: 'modal-head' }, el('h2', {}, 'Cambiar portada'), el('button', { class: 'ib', onclick: () => m.close() }, icon('close'))),
    el('div', { class: 'modal-body' },
      coverRow(nb.cover, (c) => { pick = c; }),
      el('div', { class: 'row end' },
        el('button', { class: 'btn', onclick: () => m.close() }, 'Cancelar'),
        el('button', { class: 'btn primary', onclick: async () => { nb.cover = pick; await DB.put('notebooks', nb); m.close(); renderLibrary(); } }, 'Guardar')))));
  m.showModal();
}

/* ---------- Nuevo cuaderno ---------- */
async function openNewSheet() {
  const all = await DB.all('notebooks');
  const draft = { name: `Cuaderno sin título ${all.length + 1}`, cover: { kind: 'preset', id: 'rosa' }, paper: defaultPaper('cuadricula') };
  const sheet = $('#sheet');
  const preview = el('img', { class: 'cover-preview', src: coverSrc(draft.cover) });
  const name = el('input', { value: draft.name, class: 'big-input', maxlength: 80 });
  const basic = el('div', { class: 'tpl-row' });
  const edu = el('div', { class: 'tpl-row' });
  const renderTpl = () => {
    for (const [box, group] of [[basic, 'basic'], [edu, 'edu']]) {
      box.replaceChildren(...TEMPLATES.filter((t) => t.group === group).map((t) => el('button', {
        class: 'tpl' + (draft.paper.type === t.id ? ' on' : ''),
        onclick: () => { draft.paper.type = t.id; renderTpl(); },
      }, paperThumb({ ...draft.paper, type: t.id }, 150), el('small', {}, t.name))));
    }
  };
  const swatches = (list, key) => {
    const row = el('div', { class: 'swatches inline' });
    const render = () => row.replaceChildren(
      ...list.map((c) => el('button', { class: 'sw' + (draft.paper[key] === c ? ' on' : ''), style: { background: c }, onclick: () => { draft.paper[key] = c; render(); renderTpl(); } })),
      el('label', { class: 'sw custom' + (list.includes(draft.paper[key]) ? '' : ' on'), title: 'Personalizado' },
        el('input', { type: 'color', value: draft.paper[key], onchange: (e) => { draft.paper[key] = e.target.value; render(); renderTpl(); } })));
    render();
    return row;
  };
  const spacingVal = el('b', {}, String(draft.paper.spacing));
  renderTpl();
  sheet.replaceChildren(
    el('header', { class: 'sheet-head' },
      el('button', { class: 'btn ghost', onclick: () => sheet.close() }, 'Cancelar'),
      el('h2', {}, 'Nuevo cuaderno'),
      el('button', {
        class: 'btn primary', onclick: async () => {
          const nb = newNotebook({ name: name.value.trim() || draft.name, paper: draft.paper, cover: draft.cover, folderId: L.folder === 'all' ? null : L.folder });
          await DB.put('notebooks', nb);
          sheet.close();
          emit('open', nb);
        },
      }, 'Crear')),
    el('div', { class: 'sheet-body' },
      el('div', { class: 'new-top' }, preview,
        el('div', { class: 'grow' },
          el('label', { class: 'field' }, el('span', {}, 'Título'), name),
          el('p', { class: 'muted' }, 'Empieza con 5 páginas. En la última, desliza hacia la izquierda para agregar más.'))),
      el('h3', {}, 'Portada'),
      coverRow(draft.cover, (c) => { draft.cover = c; preview.src = coverSrc(c); }),
      el('h3', {}, 'Plantillas básicas'), basic,
      el('div', { class: 'opts-grid' },
        el('div', { class: 'field' }, el('span', {}, 'Color del papel'), swatches(PAPER_COLORS, 'color')),
        el('div', { class: 'field' }, el('span', {}, 'Color de la línea'), swatches(LINE_COLORS, 'line')),
        el('label', { class: 'field' }, el('span', {}, 'Espaciado ', spacingVal),
          el('input', { type: 'range', min: 32, max: 72, step: 2, value: draft.paper.spacing, oninput: (e) => { draft.paper.spacing = +e.target.value; spacingVal.textContent = e.target.value; }, onchange: renderTpl }))),
      el('h3', {}, 'Educación'), edu));
  sheet.showModal();
}

/* ---------- Otros ---------- */
async function newFolder() {
  const v = prompt('Nombre de la carpeta', 'Nueva carpeta');
  if (!v?.trim()) return;
  const f = { id: uid(), name: v.trim(), created: Date.now() };
  await DB.put('folders', f);
  L.folder = f.id;
  renderLibrary();
}
async function quickNote() {
  const d = new Date();
  const nb = newNotebook({ name: `Nota rápida ${pad(d.getDate())}/${pad(d.getMonth() + 1)}`, paper: defaultPaper('rayado'), cover: { kind: 'preset', id: 'menta' }, folderId: L.folder === 'all' ? null : L.folder });
  await DB.put('notebooks', nb);
  emit('open', nb);
}
// Importar un PDF como cuaderno nuevo: cada página del PDF es una hoja donde puedes escribir encima
async function importPdfNotebook() {
  const [f] = await pickFiles('application/pdf,.pdf');
  if (!f) return;
  try {
    const pdf = await readPdf(f, progressToast(f.name));
    const paper = defaultPaper('blanco');
    const nb = newNotebook({ name: pdf.name.slice(0, 80), paper, cover: { kind: 'preset', id: 'clinica' }, folderId: L.folder === 'all' ? null : L.folder });
    nb.pages = pdfToNotebookPages(pdf, paper);
    if (pdf.pages[0]) {
      const { src } = await compressImage(pdf.pages[0].src, 600, 'image/jpeg', 0.8);
      nb.cover = { kind: 'image', src };
    }
    await DB.put('notebooks', nb);
    const words = pdf.pages.reduce((a, p) => a + (p.text.match(/\S+/g) || []).length, 0);
    toast(`PDF listo: ${pdf.pages.length} páginas${words ? ` · ${words.toLocaleString('es-MX')} palabras para resumir` : ' (escaneado: sin texto para resumir)'}`, 4000);
    emit('open', nb);
  } catch (e) {
    toast(e.message || 'No pude leer ese PDF');
  }
}
const closeSide = () => document.body.classList.remove('side-open');

export function initLibrary() {
  $('#sAll').onclick = () => { L.folder = 'all'; closeSide(); renderLibrary(); };
  $('#sMaterials').onclick = () => { closeSide(); openMaterials(); };
  $('#sAddFolder').onclick = newFolder;
  $('#sideToggle').onclick = () => document.body.classList.toggle('side-open');
  $('#scrim').onclick = closeSide;
  $('#libSearchBtn').onclick = () => {
    const s = $('#libSearch');
    s.classList.toggle('hidden');
    if (!s.classList.contains('hidden')) s.focus(); else { s.value = ''; L.query = ''; renderLibrary(); }
  };
  $('#libSearch').oninput = (e) => { L.query = e.target.value; renderLibrary(); };
  $('#libAdd').onclick = (e) => menu(e.currentTarget, [
    { label: 'Nuevo cuaderno', icon: 'book', action: openNewSheet },
    { label: 'Nota rápida', icon: 'edit', action: quickNote },
    { label: 'Importar PDF', icon: 'pdf', action: importPdfNotebook },
    { label: 'Nueva carpeta', icon: 'folderPlus', action: newFolder },
    '-',
    { label: 'Centro de materiales', icon: 'sticker', action: openMaterials },
  ]);
  hydrateIcons($('#library'));
}
