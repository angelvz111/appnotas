// Tema de la interfaz: automático (como tu tablet), claro u oscuro.
// La preferencia es sólo una comodidad de este dispositivo (localStorage).
const mq = window.matchMedia('(prefers-color-scheme: dark)');
let mode = 'auto';
try { mode = localStorage.getItem('fn-theme') || 'auto'; } catch { /* modo privado */ }

export const themeMode = () => mode;
export function applyTheme() {
  const t = mode === 'auto' ? (mq.matches ? 'dark' : 'light') : mode;
  document.documentElement.dataset.theme = t;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t === 'dark' ? '#16171b' : '#f3f4f8');
  window.dispatchEvent(new CustomEvent('themechange', { detail: t }));
  return t;
}
export function cycleTheme() {
  mode = { auto: 'light', light: 'dark', dark: 'auto' }[mode] || 'auto';
  try { localStorage.setItem('fn-theme', mode); } catch { /* */ }
  applyTheme();
  return mode;
}
export const themeLabel = () => ({ auto: 'Automático (como tu tablet)', light: 'Modo claro', dark: 'Modo oscuro' })[mode];
export const themeIcon = () => ({ auto: 'contrast', light: 'sun', dark: 'moon' })[mode];
mq.addEventListener?.('change', () => { if (mode === 'auto') applyTheme(); });
applyTheme();
