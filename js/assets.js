// Materiales incluidos: stickers de odontología, portadas, tipografías y pinceles del corrector.
// Todo está dibujado en SVG dentro de la app, así funciona sin internet.

const svg = (body, vb = '0 0 100 100') =>
  'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}">${body}</svg>`);
const INK = '#3a2e39';
const O = `stroke="${INK}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"`;
const MOLAR = 'M24 30C24 15 38 12 50 20C62 12 76 15 76 30C76 45 71 52 69 65C67 79 63 89 57 89C51 89 53 70 50 70C47 70 49 89 43 89C37 89 33 79 31 65C29 52 24 45 24 30Z';
const INCISOR = 'M33 20Q50 10 67 20L64 50Q61 72 54 90Q50 95 46 90Q39 72 36 50Z';
const CANINE = 'M50 10L67 27L63 52Q58 75 52 92Q50 95 48 92Q42 75 37 52L33 27Z';
const face = (mood = 'happy', y = 40) => {
  const eyes = `<circle cx="41" cy="${y}" r="3.2" fill="${INK}"/><circle cx="59" cy="${y}" r="3.2" fill="${INK}"/>`;
  const cheeks = `<ellipse cx="35" cy="${y + 8}" rx="4.5" ry="3" fill="#ffb3c7"/><ellipse cx="65" cy="${y + 8}" rx="4.5" ry="3" fill="#ffb3c7"/>`;
  const mouth = mood === 'sad'
    ? `<path d="M44 ${y + 14}Q50 ${y + 8} 56 ${y + 14}" fill="none" ${O}/>`
    : `<path d="M44 ${y + 9}Q50 ${y + 15} 56 ${y + 9}" fill="none" ${O}/>`;
  return eyes + cheeks + mouth;
};
const spark = (x, y, r, c = '#facc15') =>
  `<path d="M${x} ${y - r}Q${x} ${y} ${x + r} ${y}Q${x} ${y} ${x} ${y + r}Q${x} ${y} ${x - r} ${y}Q${x} ${y} ${x} ${y - r}Z" fill="${c}"/>`;

export const PACKS = [
  {
    id: 'dientes', name: 'Dientes adorables', desc: 'Muelas, incisivos, caninos, coronas e implantes',
    stickers: [
      ['muela', 'Muela feliz', `<path d="${MOLAR}" fill="#fff" ${O}/>${face()}`],
      ['caries', 'Muela con caries', `<path d="${MOLAR}" fill="#fff" ${O}/><circle cx="63" cy="30" r="6" fill="#8b5e3c"/><circle cx="68" cy="42" r="3" fill="#8b5e3c"/>${face('sad', 42)}<path d="M28 34q-4 7 0 9q4-2 0-9z" fill="#7dd3fc"/>`],
      ['brillo', 'Muela limpia', `<path d="${MOLAR}" fill="#fff" ${O}/>${face()}${spark(14, 22, 8)}${spark(86, 20, 6)}${spark(88, 62, 7)}`],
      ['incisivo', 'Incisivo', `<path d="${INCISOR}" fill="#fff" ${O}/>${face('happy', 38)}`],
      ['canino', 'Canino', `<path d="${CANINE}" fill="#fff" ${O}/>${face('happy', 42)}`],
      ['corona', 'Corona', `<g transform="translate(0 8)"><path d="${MOLAR}" fill="#fff" ${O}/>${face()}</g><path d="M28 24L33 8L42 18L50 4L58 18L67 8L72 24Z" fill="#fbbf24" ${O}/>`],
      ['implante', 'Implante', `<path d="M26 24C26 11 38 9 50 15C62 9 74 11 74 24C74 35 69 39 67 44H33C31 39 26 35 26 24Z" fill="#fff" ${O}/><rect x="41" y="44" width="18" height="8" fill="#cbd5e1" ${O}/><path d="M37 52H63L58 88Q50 95 42 88Z" fill="#94a3b8" ${O}/><path d="M38 60H62M39 68H61M40 76H60M42 84H58" stroke="${INK}" stroke-width="2.5"/>`],
      ['brackets', 'Brackets', `<path d="${INCISOR}" fill="#fff" ${O}/><path d="M18 52H82" stroke="#64748b" stroke-width="3"/><rect x="42" y="46" width="16" height="12" rx="2" fill="#cbd5e1" ${O}/>${face('happy', 34)}`],
      ['encia', 'Sonrisa', `<path d="M8 40Q50 22 92 40Q90 60 50 64Q10 60 8 40Z" fill="#fda4af" ${O}/><path d="M20 38h12v14q-6 4-12 0zM34 34h14v18q-7 4-14 0zM52 34h14v18q-7 4-14 0zM68 38h12v14q-6 4-12 0z" fill="#fff" ${O}/>`],
    ],
  },
  {
    id: 'instrumental', name: 'Instrumental', desc: 'Espejo, explorador, carpule, fresa y más',
    stickers: [
      ['espejo', 'Espejo dental', `<path d="M18 88L58 42" stroke="#94a3b8" stroke-width="8" stroke-linecap="round"/><path d="M18 88L58 42" ${O} fill="none" opacity=".25"/><circle cx="68" cy="30" r="17" fill="#bae6fd" ${O}/><path d="M60 24q6-6 13-3" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round"/>`],
      ['explorador', 'Explorador', `<path d="M16 88L58 44" stroke="#94a3b8" stroke-width="8" stroke-linecap="round"/><path d="M58 44L72 28Q82 16 74 10" fill="none" stroke="${INK}" stroke-width="3.5" stroke-linecap="round"/>`],
      ['carpule', 'Jeringa carpule', `<g transform="rotate(-38 50 50)"><circle cx="11" cy="50" r="6" fill="none" ${O}/><rect x="17" y="47" width="14" height="6" fill="#94a3b8" ${O}/><rect x="30" y="41" width="40" height="18" rx="3" fill="#e2e8f0" ${O}/><rect x="40" y="45" width="20" height="10" rx="2" fill="#fca5a5"/><rect x="70" y="46" width="7" height="8" fill="#94a3b8" ${O}/><path d="M77 50H96" stroke="#64748b" stroke-width="2.5"/></g>`],
      ['fresa', 'Fresa', `<g transform="rotate(-38 50 50)"><rect x="14" y="45" width="50" height="10" rx="3" fill="#cbd5e1" ${O}/><ellipse cx="76" cy="50" rx="14" ry="10" fill="#fbbf24" ${O}/><circle cx="72" cy="47" r="1.6" fill="${INK}"/><circle cx="79" cy="52" r="1.6" fill="${INK}"/><circle cx="82" cy="46" r="1.6" fill="${INK}"/></g>`],
      ['cepillo', 'Cepillo', `<g transform="rotate(-32 50 50)"><rect x="6" y="46" width="64" height="11" rx="5.5" fill="#60a5fa" ${O}/><rect x="66" y="44" width="24" height="14" rx="4" fill="#60a5fa" ${O}/><rect x="68" y="30" width="20" height="14" fill="#fff" ${O}/><path d="M73 31v12M78 31v12M83 31v12" stroke="#93c5fd" stroke-width="2"/></g>`],
      ['hilo', 'Hilo dental', `<rect x="20" y="42" width="48" height="40" rx="10" fill="#5eead4" ${O}/><rect x="20" y="34" width="48" height="14" rx="6" fill="#2dd4bf" ${O}/><path d="M60 36Q74 20 90 14" fill="none" stroke="#94a3b8" stroke-width="2.5" stroke-linecap="round"/><path d="M32 60h24" stroke="#fff" stroke-width="4" stroke-linecap="round"/>`],
      ['pasta', 'Pasta dental', `<path d="M12 40H68L82 46V56L68 62H12Q7 51 12 40Z" fill="#fff" ${O}/><path d="M28 41v20M40 41v20" stroke="#ef4444" stroke-width="4"/><path d="M52 41v20" stroke="#60a5fa" stroke-width="4"/><rect x="82" y="44" width="10" height="14" rx="2" fill="#ef4444" ${O}/><path d="M76 34q6-10 12-2q-3-10 6-14" fill="none" stroke="#7dd3fc" stroke-width="6" stroke-linecap="round"/>`],
      ['cubrebocas', 'Cubrebocas', `<path d="M10 40Q4 52 12 60M90 40Q96 52 88 60" fill="none" stroke="${INK}" stroke-width="3"/><rect x="18" y="32" width="64" height="38" rx="12" fill="#7dd3fc" ${O}/><path d="M24 44h52M24 52h52M24 60h52" stroke="#38bdf8" stroke-width="3"/>`],
      ['guantes', 'Guante', `<path d="M30 92V60L20 44Q16 38 22 36Q27 35 32 44V22Q32 16 37 16T42 22V40V14Q42 8 47 8T52 14V40V16Q52 10 57 10T62 16V42V26Q62 20 67 20T72 26V62Q72 80 66 92Z" fill="#c4b5fd" ${O}/>`],
    ],
  },
  {
    id: 'estudio', name: 'Estudio', desc: 'Post-its, avisos de examen, flechas y marcadores',
    stickers: [
      ['postit', 'Post-it', `<path d="M14 14H86V70L70 86H14Z" fill="#fde68a" ${O}/><path d="M70 86V70H86" fill="#fcd34d" ${O}/><path d="M26 34H72M26 46H72M26 58H58" stroke="#d97706" stroke-width="2.5" stroke-linecap="round"/>`],
      ['importante', '¡Importante!', `<path d="M14 12H186L176 35L186 58H14L24 35Z" fill="#ef4444" ${O}/><text x="100" y="44" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="20" fill="#fff">¡IMPORTANTE!</text>`, '0 0 200 70'],
      ['examen', 'Examen', `<path d="M8 12H130L152 35L130 58H8Z" fill="#6366f1" ${O}/><circle cx="132" cy="35" r="5" fill="#fff"/><text x="66" y="44" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="21" fill="#fff">EXAMEN</text>`, '0 0 160 70'],
      ['dato', 'Dato clave', `<path d="M12 10H168Q176 10 176 18V58Q176 66 168 66H60L40 84L44 66H12Q4 66 4 58V18Q4 10 12 10Z" fill="#fff" ${O}/><g transform="translate(10 14) scale(.5)"><path d="${MOLAR}" fill="#e0f2fe" ${O}/></g><text x="108" y="46" text-anchor="middle" font-family="Arial Rounded MT Bold, Arial, sans-serif" font-weight="800" font-size="24" fill="${INK}">Dato clave</text>`, '0 0 180 90'],
      ['ojo', '¡Ojo!', `<circle cx="50" cy="50" r="40" fill="#facc15" ${O}/><text x="50" y="60" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="28" fill="${INK}">¡Ojo!</text>`],
      ['flecha', 'Flecha', `<path d="M14 72Q30 22 80 30" fill="none" stroke="#f97316" stroke-width="8" stroke-linecap="round"/><path d="M66 16L84 30L64 42" fill="none" stroke="#f97316" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>`],
      ['estrella', 'Estrella', `<path d="M50 8L61 36L91 37L67 55L76 85L50 68L24 85L33 55L9 37L39 36Z" fill="#facc15" ${O}/>`],
      ['check', 'Listo', `<circle cx="50" cy="50" r="38" fill="#22c55e" ${O}/><path d="M32 51L45 64L69 38" fill="none" stroke="#fff" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>`],
      ['chincheta', 'Chincheta', `<path d="M50 62L44 92" stroke="#64748b" stroke-width="4" stroke-linecap="round"/><path d="M30 46Q50 34 70 46L64 62H36Z" fill="#ef4444" ${O}/><circle cx="50" cy="28" r="18" fill="#f87171" ${O}/><circle cx="44" cy="22" r="5" fill="#fecaca"/>`],
    ],
  },
].map((p) => ({ ...p, stickers: p.stickers.map(([id, name, body, vb]) => ({ id: `${p.id}:${id}`, name, src: svg(body, vb) })) }));

const stickerIndex = new Map(PACKS.flatMap((p) => p.stickers.map((s) => [s.id, s.src])));
export const customStickers = new Map(); // id -> dataURL (los carga main.js)
export const stickerSrc = (id) => stickerIndex.get(id) || customStickers.get(id) || '';

/* ================= Portadas ================= */
const spine = '<rect width="20" height="400" fill="rgba(0,0,0,.14)"/><rect x="20" width="3" height="400" fill="rgba(255,255,255,.18)"/>';
const cover = (body) => svg(body + spine, '0 0 300 400');
export const COVERS = [
  ['rosa', 'Muela rosa', `<rect width="300" height="400" fill="#f9c6d6"/><g opacity=".5" fill="#fff"><circle cx="60" cy="60" r="6"/><circle cx="250" cy="90" r="8"/><circle cx="230" cy="330" r="6"/><circle cx="70" cy="320" r="9"/></g><g transform="translate(75 105) scale(1.5)"><path d="${MOLAR}" fill="#fff" ${O}/>${face()}</g>`],
  ['esmalte', 'Esmalte', `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5b8def"/><stop offset="1" stop-color="#7dd3fc"/></linearGradient><path id="t" d="${MOLAR}" fill="none" stroke="#fff" stroke-width="5" opacity=".45"/></defs><rect width="300" height="400" fill="url(#g)"/>${[[40, 30], [160, 70], [70, 170], [190, 200], [40, 290], [170, 310]].map(([x, y]) => `<use href="#t" transform="translate(${x} ${y}) scale(.7)"/>`).join('')}`],
  ['kraft', 'Kraft', `<rect width="300" height="400" fill="#c9a27e"/>${Array.from({ length: 40 }, (_, i) => `<circle cx="${(i * 73) % 290 + 5}" cy="${(i * 131) % 390 + 5}" r="${1 + (i % 3)}" fill="#a37f5d"/>`).join('')}<rect x="60" y="130" width="190" height="96" rx="10" fill="#fffaf0" stroke="#7c5a3c" stroke-width="3"/><path d="M80 166H230M80 194H200" stroke="#c9a27e" stroke-width="3"/>`],
  ['noche', 'Noche', `<rect width="300" height="400" fill="#1f2a48"/>${Array.from({ length: 30 }, (_, i) => `<circle cx="${(i * 97) % 280 + 20}" cy="${(i * 53) % 380 + 10}" r="${(i % 3) * 0.8 + 1}" fill="#fff" opacity=".8"/>`).join('')}<circle cx="200" cy="110" r="46" fill="#fef3c7"/><circle cx="222" cy="96" r="44" fill="#1f2a48"/><g transform="translate(90 220) scale(1)"><path d="${MOLAR}" fill="#e0e7ff" ${O}/>${face()}</g>`],
  ['menta', 'Menta', `<defs><pattern id="d" width="26" height="26" patternUnits="userSpaceOnUse"><circle cx="13" cy="13" r="4" fill="#8fd9bd"/></pattern></defs><rect width="300" height="400" fill="#c4f1df"/><rect width="300" height="400" fill="url(#d)"/>`],
  ['lavanda', 'Lavanda', `<defs><pattern id="s" width="28" height="28" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><rect width="12" height="28" fill="#cbb9f2"/></pattern></defs><rect width="300" height="400" fill="#e1d7f8"/><rect width="300" height="400" fill="url(#s)"/>`],
  ['clinica', 'Clínica', `<rect width="300" height="400" fill="#f8fafc"/><rect y="0" width="300" height="120" fill="#14b8a6"/><path d="M150 40v40M130 60h40" stroke="#fff" stroke-width="12" stroke-linecap="round"/><g transform="translate(90 170) scale(1.2)"><path d="${MOLAR}" fill="#fff" stroke="#14b8a6" stroke-width="4"/></g>`],
  ['marmol', 'Mármol', `<rect width="300" height="400" fill="#f1efe9"/><g fill="none" stroke="#b9b5ab" stroke-width="2" opacity=".8"><path d="M-10 80Q80 40 140 110T310 120"/><path d="M-10 220Q100 160 170 240T310 260"/><path d="M40 400Q90 300 200 330T300 290"/></g><g fill="none" stroke="#d4af37" stroke-width="1.5"><path d="M-10 150Q120 120 200 170T310 180"/></g>`],
  ['negro', 'Negro elegante', `<rect width="300" height="400" fill="#1f2937"/><rect x="40" y="24" width="236" height="352" rx="8" fill="none" stroke="#d4af37" stroke-width="2"/>`],
  ['coral', 'Coral', `<rect width="300" height="400" fill="#fb7185"/><circle cx="240" cy="340" r="90" fill="#fda4af" opacity=".6"/>`],
  ['indigo', 'Índigo', `<rect width="300" height="400" fill="#4f46e5"/><circle cx="60" cy="60" r="110" fill="#6366f1" opacity=".6"/>`],
  ['salvia', 'Salvia', `<rect width="300" height="400" fill="#a3b18a"/><path d="M150 330Q150 220 150 110M150 280Q110 260 100 220Q140 230 150 280M150 230Q190 210 200 170Q160 180 150 230M150 180Q115 160 110 125Q145 135 150 180" fill="#dad7cd" stroke="#588157" stroke-width="3"/>`],
].map(([id, name, body]) => ({ id, name, src: cover(body) }));

export function coverSrc(c) {
  if (!c) return COVERS[0].src;
  if (c.kind === 'image') return c.src;
  if (c.kind === 'color') return cover(`<rect width="300" height="400" fill="${c.value}"/>`);
  return (COVERS.find((x) => x.id === c.id) || COVERS[0]).src;
}

/* ================= Tipografías y pinceles ================= */
// Agrupadas para el selector: manuscritas, cursivas bonitas, lettering y "de libro"
export const FONT_GROUPS = [
  ['Manuscritas', ['Patrick Hand', 'Caveat', 'Kalam', 'Shadows Into Light', 'Indie Flower', 'Gochi Hand', 'Architects Daughter', 'Schoolbell', 'Neucha']],
  ['Cursiva bonita', ['Dancing Script', 'Great Vibes', 'Sacramento', 'Satisfy']],
  ['Lettering / títulos', ['Kaushan Script', 'Lobster', 'Pacifico', 'Fredoka', 'Comfortaa']],
  ['Clásicas', ['Poppins', 'Nunito', 'Quicksand', 'Playfair Display', 'Georgia', 'system-ui']],
];
export const BUILTIN_FONTS = FONT_GROUPS.flatMap(([, f]) => f);

export const DEFAULT_BRUSHES = [
  { id: 'titulo', name: 'Título', font: 'Playfair Display', weight: 700, scale: 1.1 },
  { id: 'subtitulo', name: 'Subtítulo', font: 'Poppins', weight: 600, scale: 0.82 },
  { id: 'texto', name: 'Texto', font: 'Patrick Hand', weight: 400, scale: 0.72 },
  { id: 'nota', name: 'Nota', font: 'Caveat', weight: 700, scale: 0.85 },
  { id: 'cursiva', name: 'Cursiva', font: 'Dancing Script', weight: 700, scale: 0.85 },
  { id: 'lettering', name: 'Lettering', font: 'Kaushan Script', weight: 400, scale: 1.2, effect: 'lettering' },
];

/* El vocabulario del corrector vive en dict.js */
