// Plantillas de página. Todo se dibuja en coordenadas lógicas fijas (A4 a 150 ppp),
// y rulings() expone los renglones para que el corrector alinee la escritura.
export const W = 1240, H = 1754;
const TOP = 170, MARGIN = 150, ODO_END = 500;

export const TEMPLATES = [
  { id: 'blanco', name: 'Sin formato', group: 'basic' },
  { id: 'rayado', name: 'Línea', group: 'basic' },
  { id: 'cuadricula', name: 'Cuadrícula', group: 'basic' },
  { id: 'puntos', name: 'Punto', group: 'basic' },
  { id: 'cornell', name: 'Cornell', group: 'edu' },
  { id: 'universitaria', name: 'Regla universitaria', group: 'edu' },
  { id: 'columnas', name: 'Dos columnas', group: 'edu' },
  { id: 'odontograma', name: 'Odontograma', group: 'edu' },
];
export const PAPER_COLORS = ['#ffffff', '#fbf6e9', '#eef1f5', '#2a2b30'];
export const LINE_COLORS = ['#b8c4d8', '#a9d9cb', '#f0b4b4', '#c9c9c9'];
export const defaultPaper = (type = 'cuadricula') => ({ type, color: '#ffffff', line: '#b8c4d8', spacing: 48 });

export function lineStep(p) { return p.type === 'universitaria' ? Math.round(p.spacing * 0.8) : p.spacing; }

export function rulings(p) {
  const ys = [];
  const run = (a, b, s) => { for (let y = a; y <= b; y += s) ys.push(y); };
  const s = lineStep(p);
  switch (p.type) {
    case 'rayado': case 'columnas': run(TOP, H - 50, s); break;
    case 'universitaria': run(250, H - 50, s); break;
    case 'cornell': run(200 + s, H - 340, s); break;
    case 'odontograma': run(ODO_END + s, H - 50, s); break;
    case 'cuadricula': case 'puntos': run(s, H - 1, s); break;
  }
  return ys;
}

export function snapBaseline(p, y) {
  const ys = rulings(p);
  if (!ys.length) return y;
  let best = ys[0];
  for (const v of ys) if (Math.abs(v - y) < Math.abs(best - y)) best = v;
  return Math.abs(best - y) < lineStep(p) * 0.8 ? best : y;
}

export function snapX(p, x) {
  if (p.type === 'cuadricula' || p.type === 'puntos') return Math.max(p.spacing, Math.round(x / p.spacing) * p.spacing);
  if ((p.type === 'rayado' || p.type === 'universitaria') && x < MARGIN + 24) return MARGIN + 14;
  return x;
}

export function isDark(hex) {
  const n = parseInt(hex.slice(1), 16);
  return ((n >> 16) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000 < 128;
}
export function withAlpha(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
}

// k = multiplicador de grosor (para miniaturas)
export function drawPaper(ctx, p0, k = 1, darkMode = false) {
  // Hoja en modo oscuro: papel casi negro y líneas suaves
  const p = darkMode && !isDark(p0.color) ? { ...p0, color: '#18191d' } : p0;
  ctx.save();
  ctx.fillStyle = p.color;
  ctx.fillRect(0, 0, W, H);
  const dark = isDark(p.color);
  const line = withAlpha(p.line, dark ? 0.45 : 0.85);
  const strong = withAlpha(p.line, 1);
  const red = dark ? 'rgba(248,113,113,.5)' : 'rgba(220,38,38,.38)';
  const s = lineStep(p);
  ctx.strokeStyle = line;
  ctx.fillStyle = line;
  ctx.lineWidth = 1.5 * k;
  const h = (y, a = 0, b = W) => { ctx.moveTo(a, y); ctx.lineTo(b, y); };
  const v = (x, a = 0, b = H) => { ctx.moveTo(x, a); ctx.lineTo(x, b); };
  const stroke = (style = line, w = 1.5) => { ctx.strokeStyle = style; ctx.lineWidth = w * k; ctx.stroke(); ctx.beginPath(); };
  const label = (t, x, y, size = 22) => {
    ctx.save(); ctx.fillStyle = strong; ctx.font = `700 ${size}px Nunito, system-ui, sans-serif`; ctx.fillText(t, x, y); ctx.restore();
  };
  ctx.beginPath();

  switch (p.type) {
    case 'rayado':
      rulings(p).forEach((y) => h(y)); stroke();
      v(MARGIN); stroke(red);
      break;
    case 'cuadricula':
      for (let x = s; x < W; x += s) v(x);
      for (let y = s; y < H; y += s) h(y);
      stroke(line, 1);
      break;
    case 'puntos':
      for (let x = s; x < W; x += s)
        for (let y = s; y < H; y += s) { ctx.moveTo(x + 2.4 * k, y); ctx.arc(x, y, 2.4 * k, 0, Math.PI * 2); }
      ctx.fill();
      ctx.beginPath();
      break;
    case 'universitaria':
      label('Tema:', 70, 100); label('Fecha:', W - 400, 100);
      h(112, 70, W - 70); stroke();
      label('Materia:', 70, 172);
      h(184, 70, W - 70); stroke();
      h(214, 0, W); stroke(strong, 3);
      rulings(p).forEach((y) => h(y)); stroke();
      v(120, 214, H); stroke(red);
      break;
    case 'columnas':
      rulings(p).forEach((y) => { h(y, 60, W / 2 - 24); h(y, W / 2 + 24, W - 60); }); stroke();
      v(W / 2, TOP - s, H - 50); stroke(strong, 2);
      break;
    case 'cornell':
      label('Tema:', 50, 110); h(122, 50, W - 50); stroke();
      h(200, 0, W); stroke(strong, 3);
      rulings(p).forEach((y) => h(y, 380, W)); stroke();
      v(380, 200, H - 340); stroke(strong, 3);
      h(H - 340, 0, W); stroke(strong, 3);
      label('Ideas clave', 30, 240, 20); label('Notas', 400, 240, 20); label('Resumen', 30, H - 300, 20);
      break;
    case 'odontograma':
      drawOdontogram(ctx, strong, line, k);
      rulings(p).forEach((y) => h(y)); stroke();
      break;
  }
  ctx.restore();
}

function drawOdontogram(ctx, strong, line, k) {
  const up = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
  const lo = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];
  const x0 = 80, cw = (W - 160) / 16, s = 50;
  ctx.save();
  ctx.fillStyle = strong;
  ctx.font = '800 30px Nunito, system-ui, sans-serif';
  ctx.fillText('Odontograma', x0, 66);
  ctx.font = '700 22px Nunito, system-ui, sans-serif';
  ctx.fillText('Paciente:', 520, 66);
  ctx.fillText('Fecha:', 940, 66);
  ctx.strokeStyle = line; ctx.lineWidth = 1.5 * k;
  ctx.beginPath(); ctx.moveTo(630, 72); ctx.lineTo(920, 72); ctx.moveTo(1020, 72); ctx.lineTo(W - 80, 72); ctx.stroke();
  const tooth = (cx, y, n, numBelow) => {
    const x = cx - s / 2, i = s * 0.3;
    ctx.strokeStyle = strong; ctx.lineWidth = 2 * k;
    ctx.strokeRect(x, y, s, s);
    ctx.strokeRect(x + i, y + i, s - 2 * i, s - 2 * i);
    ctx.beginPath();
    ctx.moveTo(x, y); ctx.lineTo(x + i, y + i);
    ctx.moveTo(x + s, y); ctx.lineTo(x + s - i, y + i);
    ctx.moveTo(x, y + s); ctx.lineTo(x + i, y + s - i);
    ctx.moveTo(x + s, y + s); ctx.lineTo(x + s - i, y + s - i);
    ctx.stroke();
    ctx.font = '700 20px Nunito, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(String(n), cx, numBelow ? y + s + 28 : y - 12);
    ctx.textAlign = 'start';
  };
  up.forEach((n, i) => tooth(x0 + cw * i + cw / 2, 140, n, false));
  lo.forEach((n, i) => tooth(x0 + cw * i + cw / 2, 300, n, true));
  ctx.setLineDash([8 * k, 8 * k]);
  ctx.strokeStyle = line;
  ctx.beginPath();
  ctx.moveTo(x0 + cw * 8, 110); ctx.lineTo(x0 + cw * 8, 390);
  ctx.moveTo(x0, 245); ctx.lineTo(W - x0, 245);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.font = '600 18px Nunito, system-ui, sans-serif';
  ctx.fillText('M mesial · D distal · O oclusal/incisal · V vestibular · L/P lingual/palatino', x0, 440);
  ctx.lineWidth = 3 * k; ctx.strokeStyle = strong;
  ctx.beginPath(); ctx.moveTo(0, 470); ctx.lineTo(W, 470); ctx.stroke();
  ctx.restore();
}

export function paperThumb(p, w = 120) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = Math.round((w * H) / W);
  const ctx = c.getContext('2d');
  ctx.scale(w / W, w / W);
  drawPaper(ctx, p, Math.max(1, W / w / 3.5));
  return c;
}
