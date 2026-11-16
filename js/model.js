// Estructura de datos de cuadernos, páginas y capas (+ migración de versiones anteriores).
import { uid } from './util.js';
import { defaultPaper } from './paper.js';

export const PAGES_START = 5;
export const newLayer = (name = 'Capa 1') => ({ id: uid(), name, visible: true, opacity: 1, strokes: [], items: [] });
export const newPage = (paper) => ({ id: uid(), paper: { ...paper }, layers: [newLayer()] });

export function newNotebook({ name, paper, cover, folderId = null }) {
  return {
    id: uid(), name, folderId, cover, paper: { ...paper },
    created: Date.now(), updated: Date.now(),
    pages: Array.from({ length: PAGES_START }, () => newPage(paper)),
  };
}

export function normalizeNotebook(nb) {
  if (typeof nb.cover === 'string') nb.cover = { kind: 'color', value: nb.cover };
  if (!nb.cover) nb.cover = { kind: 'preset', id: 'rosa' };
  if (nb.folderId === undefined) nb.folderId = null;
  const fix = (p) => ({ ...defaultPaper(p?.type || 'cuadricula'), ...p });
  nb.paper = fix(nb.paper || nb.pages?.[0]?.paper);
  for (const pg of nb.pages) {
    pg.paper = fix(pg.paper);
    for (const l of pg.layers) { l.items ||= []; l.strokes ||= []; }
  }
  return nb;
}
