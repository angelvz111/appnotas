// Dibujo de trazos y reconocimiento de figuras (mantener presionado = figura perfecta).
// Un trazo: { tool, color, size, points: [[x, y, presión], ...], shape?, closed?, straight? }

export function tracePath(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  if (pts.length === 1) { ctx.lineTo(pts[0][0] + 0.01, pts[0][1]); return; }
  for (let i = 1; i < pts.length - 1; i++) {
    ctx.quadraticCurveTo(pts[i][0], pts[i][1], (pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2);
  }
  const last = pts[pts.length - 1];
  ctx.lineTo(last[0], last[1]);
}

const penWidth = (s, p) => s.size * (0.3 + 0.95 * p);

// Vista: página en modo oscuro. No cambia tus notas, sólo cómo se ven (tinta oscura → clara).
export const view = { dark: false };
function lum(hex) {
  if (!hex || hex[0] !== '#' || hex.length < 7) return 0.5;
  const n = parseInt(hex.slice(1, 7), 16);
  return ((n >> 16) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114) / 255;
}
export function inkColor(c) {
  if (!view.dark) return c;
  const l = lum(c);
  if (l < 0.22) return '#f2f2f5';                       // negro/gris oscuro → blanco
  if (l < 0.45) {                                         // colores oscuros → versión clara
    const n = parseInt(c.slice(1, 7), 16);
    const up = (v) => Math.round(v + (255 - v) * 0.45);
    return `rgb(${up(n >> 16)},${up((n >> 8) & 255)},${up(n & 255)})`;
  }
  return c;
}

export function drawStroke(ctx, s) {
  const pts = s.points;
  if (!pts.length) return;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const color = s.tool === 'highlighter' ? s.color : inkColor(s.color);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  const straight = () => {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    if (s.closed) ctx.closePath();
  };

  if (s.tool === 'highlighter') {
    // En hoja oscura "multiply" no se vería: se pinta encima con transparencia
    ctx.globalCompositeOperation = view.dark ? 'source-over' : 'multiply';
    ctx.globalAlpha = view.dark ? 0.38 : 0.45;
    ctx.lineWidth = s.size;
    if (s.straight) ctx.lineCap = 'butt';
    s.shape ? straight() : tracePath(ctx, pts);
    ctx.stroke();
  } else if (s.tool === 'fineliner' || s.shape) {
    ctx.lineWidth = s.tool === 'fineliner' ? s.size : penWidth(s, 0.6);
    s.shape ? straight() : tracePath(ctx, pts);
    ctx.stroke();
  } else if (pts.length === 1) {
    ctx.beginPath();
    ctx.arc(pts[0][0], pts[0][1], penWidth(s, pts[0][2]) / 2, 0, Math.PI * 2);
    ctx.fill();
  } else {
    let prev = pts[0], prevMid = pts[0];
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i];
      const mid = [(prev[0] + p[0]) / 2, (prev[1] + p[1]) / 2];
      ctx.beginPath();
      ctx.moveTo(prevMid[0], prevMid[1]);
      ctx.quadraticCurveTo(prev[0], prev[1], mid[0], mid[1]);
      ctx.lineWidth = penWidth(s, (prev[2] + p[2]) / 2);
      ctx.stroke();
      prevMid = mid; prev = p;
    }
    ctx.beginPath();
    ctx.moveTo(prevMid[0], prevMid[1]);
    ctx.lineTo(prev[0], prev[1]);
    ctx.lineWidth = penWidth(s, prev[2]);
    ctx.stroke();
  }
  ctx.restore();
}

/* ================= Geometría ================= */
export const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
export function pathLen(P) { let L = 0; for (let i = 1; i < P.length; i++) L += dist(P[i - 1], P[i]); return L; }
export function bboxOf(P) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of P) { if (p[0] < x0) x0 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[0] > x1) x1 = p[0]; if (p[1] > y1) y1 = p[1]; }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
}
export function distToSeg(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy;
  const t = L ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L)) : 0;
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}
export function resample(P, n) {
  const L = pathLen(P);
  if (!L) return Array.from({ length: n }, () => [P[0][0], P[0][1]]);
  const I = L / (n - 1), out = [[P[0][0], P[0][1]]];
  let D = 0, prev = [P[0][0], P[0][1]];
  for (let i = 1; i < P.length; i++) {
    const cur = [P[i][0], P[i][1]];
    let d = dist(prev, cur);
    while (D + d >= I && d > 0) {
      const t = (I - D) / d;
      const q = [prev[0] + t * (cur[0] - prev[0]), prev[1] + t * (cur[1] - prev[1])];
      out.push(q); prev = q; d = dist(prev, cur); D = 0;
    }
    D += d; prev = cur;
  }
  while (out.length < n) out.push([P[P.length - 1][0], P[P.length - 1][1]]);
  return out.slice(0, n);
}
function douglas(P, eps) {
  if (P.length < 3) return P.slice();
  let max = 0, idx = 0;
  for (let i = 1; i < P.length - 1; i++) {
    const d = distToSeg(P[i], P[0], P[P.length - 1]);
    if (d > max) { max = d; idx = i; }
  }
  if (max <= eps) return [P[0], P[P.length - 1]];
  return douglas(P.slice(0, idx + 1), eps).slice(0, -1).concat(douglas(P.slice(idx), eps));
}
const turn = (a, b, c) => {
  const a1 = Math.atan2(b[1] - a[1], b[0] - a[0]), a2 = Math.atan2(c[1] - b[1], c[0] - b[0]);
  let d = Math.abs(a2 - a1); if (d > Math.PI) d = 2 * Math.PI - d; return d;
};
function cleanPolygon(v, diag) {
  let pts = v.slice();
  let changed = true;
  while (changed && pts.length > 3) {
    changed = false;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[(i - 1 + pts.length) % pts.length], b = pts[i], c = pts[(i + 1) % pts.length];
      if (dist(a, b) < diag * 0.12 || turn(a, b, c) < 0.38) { pts.splice(i, 1); changed = true; break; }
    }
  }
  return pts;
}

// Devuelve { name, points, closed } con la figura perfecta, o null si no parece una figura.
export function perfectShape(points) {
  if (points.length < 4) return null;
  const P = points.map((p) => [p[0], p[1]]);
  const L = pathLen(P);
  if (L < 40) return null;
  const a = P[0], b = P[P.length - 1];
  const box = bboxOf(P);
  const diag = Math.hypot(box.w, box.h);
  const pr = 0.6;
  const pts = (arr) => arr.map((p) => [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10, pr]);

  // Línea recta (se endereza a 0°/45°/90° si está cerca)
  if (dist(a, b) / L > 0.9) {
    const len = dist(a, b), ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const snap = Math.round(ang / (Math.PI / 4)) * (Math.PI / 4);
    const end = Math.abs(ang - snap) < 0.12 ? [a[0] + Math.cos(snap) * len, a[1] + Math.sin(snap) * len] : b;
    return { name: 'Línea', points: pts([a, end]), closed: false };
  }
  // Figura abierta con una esquina: ángulo / flecha simple
  if (dist(a, b) > 0.3 * diag) {
    const v = douglas(P, 0.07 * diag);
    if (v.length === 3 && turn(v[0], v[1], v[2]) > 0.5) return { name: 'Ángulo', points: pts(v), closed: false };
    return null;
  }
  // Figura cerrada
  const R = resample(P, 64);
  const cx = box.cx, cy = box.cy, rx = box.w / 2, ry = box.h / 2;
  if (rx < 8 || ry < 8) return null;
  let ell = 0;
  for (const p of R) ell += Math.abs(Math.hypot((p[0] - cx) / rx, (p[1] - cy) / ry) - 1);
  ell /= R.length;

  let far = 0;
  R.forEach((p, i) => { if (dist(p, R[0]) > dist(R[far], R[0])) far = i; });
  const raw = douglas(R.slice(0, far + 1), 0.06 * diag).slice(0, -1)
    .concat(douglas(R.slice(far).concat([R[0]]), 0.06 * diag).slice(0, -1));
  const verts = cleanPolygon(raw, diag);
  let polyErr = 0;
  for (const p of R) {
    let m = Infinity;
    for (let i = 0; i < verts.length; i++) m = Math.min(m, distToSeg(p, verts[i], verts[(i + 1) % verts.length]));
    polyErr += m;
  }
  polyErr /= R.length * diag;

  if ((verts.length === 3 || verts.length === 4) && polyErr < 0.04 && ell > 0.07) {
    if (verts.length === 3) return { name: 'Triángulo', points: pts([...verts, verts[0]]), closed: false };
    const right = verts.every((v, i) => {
      const p0 = verts[(i + 3) % 4], p2 = verts[(i + 1) % 4];
      const v1 = [p0[0] - v[0], p0[1] - v[1]], v2 = [p2[0] - v[0], p2[1] - v[1]];
      return Math.abs((v1[0] * v2[0] + v1[1] * v2[1]) / (Math.hypot(...v1) * Math.hypot(...v2))) < 0.3;
    });
    const edgeAng = Math.abs(Math.atan2(verts[1][1] - verts[0][1], verts[1][0] - verts[0][0])) % (Math.PI / 2);
    const axis = Math.min(edgeAng, Math.PI / 2 - edgeAng) < 0.2;
    if (right && axis) {
      const r = [[box.x0, box.y0], [box.x1, box.y0], [box.x1, box.y1], [box.x0, box.y1]];
      return { name: 'Rectángulo', points: pts([...r, r[0]]), closed: false };
    }
    return { name: right ? 'Rectángulo' : 'Cuadrilátero', points: pts([...verts, verts[0]]), closed: false };
  }
  if (ell < 0.13) {
    const circle = Math.abs(box.w - box.h) / Math.max(box.w, box.h) < 0.18;
    const r1 = circle ? (box.w + box.h) / 4 : rx, r2 = circle ? (box.w + box.h) / 4 : ry;
    const out = [];
    for (let i = 0; i <= 72; i++) { const t = (i / 72) * Math.PI * 2; out.push([cx + Math.cos(t) * r1, cy + Math.sin(t) * r2]); }
    return { name: circle ? 'Círculo' : 'Elipse', points: pts(out), closed: false };
  }
  return null;
}
