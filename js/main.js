// Arranque de FreeNotas
import { cycleTheme, themeIcon, themeLabel } from './theme.js';
import { openDB } from './db.js';
import { hydrateIcons, toast, on, initTooltips, iconSvg } from './util.js';
import { loadMaterials } from './materials.js';
import * as HW from './handwriting.js';
import { initLibrary, showLibrary } from './library.js';
import { initEditor, openNotebook } from './editor.js';

(async function init() {
  hydrateIcons();
  initTooltips();
  try {
    await openDB();
  } catch {
    toast('Este navegador no permite guardar datos locales');
    return;
  }
  await Promise.all([loadMaterials(), HW.loadProfile()]);
  HW.loadDictionary().then((n) => console.info(`Diccionario: ${n} palabras`));
  // Botones de tema (biblioteca y editor)
  const paintThemeBtns = () => document.querySelectorAll('.theme-btn').forEach((b) => { b.innerHTML = iconSvg(themeIcon()); b.dataset.tip = `Tema: ${themeLabel()}`; });
  paintThemeBtns();
  document.querySelectorAll('.theme-btn').forEach((b) => (b.onclick = () => { cycleTheme(); paintThemeBtns(); toast(themeLabel()); }));
  initLibrary();
  await initEditor();
  on('open', (nb) => openNotebook(nb));
  on('library', () => showLibrary());
  await showLibrary();

  // Plantillas del corrector (se generan en el dispositivo a partir de tipografías manuscritas)
  HW.buildFontTemplates().then((n) => console.info(`Corrector listo: ${n} plantillas de letra`));

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
