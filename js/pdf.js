// Leer PDFs con PDF.js (Mozilla): cada página se vuelve una imagen sobre la que puedes escribir,
// y su texto se guarda para buscar y hacer resúmenes sin internet.
import { el, toast, uid } from './util.js';
import { W } from './paper.js';
import { newLayer } from './model.js';

const BASE = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/';
const MAX_PDF = 80 * 1024 * 1024;
const MAX_PAGES = 300;

function loadScript(src) {
  return new Promise((res, rej) => {
    const s = el('script', { src });
    s.crossOrigin = 'anonymous';
    s.onload = res;
    s.onerror = () => rej(new Error('Necesitas internet la primera vez para preparar el lector de PDF'));
    document.head.append(s);
  });
}
async function lib() {
  if (!window.pdfjsLib) await loadScript(BASE + 'pdf.min.js');
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = BASE + 'pdf.worker.min.js';
  return window.pdfjsLib;
}

// Junta los fragmentos de texto de PDF.js en renglones legibles
function pageText(content) {
  let out = '', lastY = null, lastH = 10;
  for (const it of content.items) {
    const y = it.transform?.[5];
    const h = Math.abs(it.transform?.[3] || lastH);
    if (lastY !== null && y !== undefined && Math.abs(y - lastY) > 2 && !out.endsWith('\n')) {
      // salto de renglón; si el hueco es grande, es otro párrafo
      out += Math.abs(y - lastY) > h * 1.9 ? '\n\n' : '\n';
    }
    out += it.str;
    if (it.hasEOL && !out.endsWith('\n')) out += '\n';
    if (it.str.trim()) { lastY = y; lastH = h || lastH; }
  }
  return out.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** Lee un archivo PDF. onProgress(hechas, total). Devuelve { name, pages: [{ src, w, h, text }] } */
export async function readPdf(file, onProgress) {
  if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') throw new Error('Ese archivo no es un PDF');
  if (file.size > MAX_PDF) throw new Error('El PDF es muy grande (máx. 80 MB)');
  const pdfjs = await lib();
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false }).promise;
  const total = Math.min(pdf.numPages, MAX_PAGES);
  const pages = [];
  for (let i = 1; i <= total; i++) {
    const page = await pdf.getPage(i);
    const vp0 = page.getViewport({ scale: 1 });
    const scale = W / vp0.width;
    const vp = page.getViewport({ scale });
    const c = el('canvas');
    c.width = Math.round(vp.width);
    c.height = Math.round(vp.height);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    let text = '';
    try { text = pageText(await page.getTextContent()); } catch { /* PDF escaneado: sin texto */ }
    pages.push({ src: c.toDataURL('image/jpeg', 0.82), w: c.width, h: c.height, text });
    page.cleanup();
    onProgress?.(i, total);
  }
  if (pdf.numPages > MAX_PAGES) toast(`Importé las primeras ${MAX_PAGES} páginas`);
  return { name: file.name.replace(/\.pdf$/i, ''), pages };
}

// Crea páginas de cuaderno: capa "PDF" (fija) + capa "Mis notas" para escribir encima
export function pdfToNotebookPages(pdf, paper) {
  return pdf.pages.map((p) => {
    const base = newLayer('PDF');
    base.items = [{ id: uid(), kind: 'image', src: p.src, x: 0, y: 0, w: p.w, h: p.h, locked: true }];
    return { id: uid(), paper: { ...paper, type: 'blanco', color: '#ffffff' }, pdfText: p.text, pdfName: pdf.name, layers: [base, newLayer('Mis notas')] };
  });
}

export function progressToast(name) {
  return (i, n) => toast(`Leyendo “${name}”… página ${i} de ${n}`, 60000);
}
