// Centro de materiales: paquetes de stickers, tus stickers en carpetas y tus tipografías.
import { getKV, setKV } from './db.js';
import { PACKS, COVERS, customStickers, FONT_GROUPS } from './assets.js';
import { el, icon, $, toast, pickFiles, fileToDataURL, uid, menu } from './util.js';
import { openStickerMaker } from './stickerize.js';

const MAX_FONT = 5 * 1024 * 1024;
export const mat = { installed: ['dientes'], fonts: [], folders: ['Mis stickers'], mine: [] };

export async function loadMaterials() {
  mat.installed = await getKV('packs', ['dientes']);
  mat.folders = await getKV('stickerFolders', ['Mis stickers']);
  mat.mine = (await getKV('myStickers', [])).map((s) => ({ folder: 'Mis stickers', ...s }));
  for (const s of mat.mine) customStickers.set(s.id, s.src);
  for (const s of mat.mine) if (!mat.folders.includes(s.folder)) mat.folders.push(s.folder);
  const fonts = await getKV('fonts', []);
  await Promise.all(fonts.map((f) => registerFont(f.family, f.data)));
  mat.fonts = fonts.map((f) => f.family);
}

async function registerFont(family, data) {
  try {
    const ff = new FontFace(family, `url(${data})`);
    await ff.load();
    document.fonts.add(ff);
    return true;
  } catch (e) {
    console.warn('No se pudo cargar la tipografía', family, e);
    return false;
  }
}

export const allFonts = () => [...FONT_GROUPS.flatMap(([, f]) => f), ...mat.fonts];
export const fontGroups = () => [...FONT_GROUPS, ...(mat.fonts.length ? [['Tus tipografías', mat.fonts]] : [])];

export async function addFontFiles() {
  const files = await pickFiles('.ttf,.otf,.woff,.woff2', true);
  if (!files.length) return [];
  const list = await getKV('fonts', []);
  const added = [];
  for (const f of files) {
    // Seguridad: sólo archivos de tipografía y de tamaño razonable
    if (!/\.(ttf|otf|woff2?)$/i.test(f.name) || f.size > MAX_FONT) { toast(`“${f.name}” no es una tipografía válida (máx. 5 MB)`); continue; }
    const family = f.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').replace(/[^\p{L}\p{N} ]/gu, '').trim().slice(0, 40) || 'Mi letra';
    const data = await fileToDataURL(f);
    if (!(await registerFont(family, data))) { toast(`No pude leer “${f.name}”`); continue; }
    list.push({ family, data });
    added.push(family);
  }
  await setKV('fonts', list);
  mat.fonts = list.map((x) => x.family);
  if (added.length) toast(`Tipografía agregada: ${added.join(', ')}`);
  return added;
}

/* ---------- Tus stickers (en carpetas) ---------- */
async function persistMine() { await setKV('myStickers', mat.mine); await setKV('stickerFolders', mat.folders); }
export async function addSticker(src, folder = 'Mis stickers') {
  const id = 'mine:' + uid();
  if (!mat.folders.includes(folder)) mat.folders.push(folder);
  mat.mine.push({ id, src, folder });
  customStickers.set(id, src);
  await persistMine();
  return id;
}
export async function createStickerFolder(name) {
  const n = (name || '').trim().slice(0, 40);
  if (!n) return null;
  if (!mat.folders.includes(n)) { mat.folders.push(n); await persistMine(); }
  return n;
}
async function removeSticker(id) {
  mat.mine = mat.mine.filter((s) => s.id !== id);
  customStickers.delete(id);
  await persistMine();
}
async function moveSticker(id, folder) {
  const s = mat.mine.find((x) => x.id === id);
  if (s) { s.folder = folder; await persistMine(); }
}
async function deleteFolder(name) {
  mat.mine.forEach((s) => { if (s.folder === name) s.folder = 'Mis stickers'; });
  mat.folders = mat.folders.filter((f) => f !== name);
  if (!mat.folders.includes('Mis stickers')) mat.folders.unshift('Mis stickers');
  await persistMine();
}
export const stickersIn = (folder) => mat.mine.filter((s) => s.folder === folder).map((s) => s.id);

export async function setInstalled(id, on) {
  mat.installed = on ? [...new Set([...mat.installed, id])] : mat.installed.filter((x) => x !== id);
  await setKV('packs', mat.installed);
}

export function openMaterials() {
  const m = $('#modal');
  const render = () => {
    m.replaceChildren(el('div', { class: 'modal-card wide' },
      el('header', { class: 'modal-head' },
        el('h2', {}, 'Centro de materiales'),
        el('button', { class: 'ib', title: 'Cerrar', onclick: () => m.close() }, icon('close'))),
      el('div', { class: 'modal-body' },
        el('p', { class: 'muted' }, 'Todo viene dentro de la app: descargar un paquete lo agrega a tus stickers y funciona sin internet.'),
        el('h3', {}, 'Stickers de odontología'),
        el('div', { class: 'packs' }, PACKS.map((p) => {
          const on = mat.installed.includes(p.id);
          return el('div', { class: 'pack' },
            el('div', { class: 'pack-prev' }, p.stickers.slice(0, 6).map((s) => el('img', { src: s.src, alt: s.name }))),
            el('div', { class: 'pack-info' }, el('b', {}, p.name), el('small', {}, `${p.stickers.length} stickers · ${p.desc}`)),
            el('button', {
              class: 'btn ' + (on ? 'ghost' : 'primary'),
              onclick: async () => { await setInstalled(p.id, !on); toast(on ? 'Paquete quitado' : `“${p.name}” descargado 🦷`); render(); },
            }, on ? '✓ Instalado' : 'Descargar'));
        })),
        el('div', { class: 'row' },
          el('h3', { class: 'grow' }, 'Mis stickers'),
          el('button', { class: 'btn', onclick: async () => { if (await createStickerFolder(prompt('Nombre de la carpeta (ej. Dental)'))) render(); } }, icon('folderPlus', 18), ' Nueva carpeta')),
        mat.folders.map((folder) => el('div', { class: 'sfolder' },
          el('div', { class: 'row' },
            icon('folder', 18), el('b', { class: 'grow' }, folder), el('small', { class: 'muted' }, `${stickersIn(folder).length}`),
            folder !== 'Mis stickers' ? el('button', { class: 'ib sm ghost', title: 'Eliminar carpeta (los stickers pasan a “Mis stickers”)', onclick: async () => { if (confirm(`¿Eliminar la carpeta “${folder}”?`)) { await deleteFolder(folder); render(); } } }, icon('trash', 16)) : null),
          el('div', { class: 'mine' },
            el('button', {
              class: 'add-tile', title: 'Crear sticker desde una imagen', onclick: async () => {
                const [f] = await pickFiles('image/*');
                if (!f) return;
                openStickerMaker(f, { folder, mode: 'save', onDone: () => openMaterials() });
              },
            }, icon('plus'), el('small', {}, 'Agregar')),
            stickersIn(folder).map((id) => el('div', { class: 'mine-item' },
              el('img', { src: customStickers.get(id), alt: '' }),
              el('button', {
                class: 'x', title: 'Opciones', onclick: (e) => menu(e.currentTarget, [
                  ...mat.folders.filter((f) => f !== folder).map((f) => ({ label: `Mover a “${f}”`, icon: 'folder', action: async () => { await moveSticker(id, f); render(); } })),
                  { label: 'Eliminar', icon: 'trash', danger: true, action: async () => { await removeSticker(id); render(); } },
                ]),
              }, icon('more', 14))))))),
        el('h3', {}, 'Tipografías'),
        fontGroups().map(([g, fonts]) => el('div', { class: 'fonts' },
          el('small', { class: 'muted fgroup' }, g),
          fonts.map((f) => el('span', { class: 'font-chip', style: { fontFamily: `"${f}"` } }, f)))),
        el('button', { class: 'btn', onclick: async () => { if ((await addFontFiles()).length) render(); } }, icon('upload', 18), ' Subir tu tipografía (.ttf / .otf)'),
        el('h3', {}, 'Portadas incluidas'),
        el('p', { class: 'muted' }, 'Elígelas al crear un cuaderno o desde ⋯ › Cambiar portada. También puedes subir tu propia imagen.'),
        el('div', { class: 'cover-strip' }, COVERS.map((c) => el('img', { src: c.src, alt: c.name, title: c.name }))))));
  };
  render();
  if (!m.open) m.showModal();
}
