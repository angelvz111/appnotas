# FreeNotas (appnotas) — guía para cualquier chat nuevo

App de notas a mano para **tablet Android con lápiz**, inspirada en FreeNotes, hecha para los apuntes de
**odontología** de la dueña/dueño del proyecto. **Responde siempre en español** (tono cercano, mexicano).
Versión actual: **alpha**.

## Cómo correrla
```bash
node serve.js
```
Abre http://localhost:5173 (en el panel del navegador usa la configuración `freenotas` de `.claude/launch.json`).
No hay build ni dependencias: HTML + CSS + JavaScript (módulos ES) puro. Todo se guarda en IndexedDB del dispositivo.

## Estructura
| Archivo | Qué hace |
|---|---|
| `index.html`, `styles.css` | Interfaz. Tema claro/oscuro con variables CSS (`:root` oscuro, `[data-theme=light]` claro). |
| `js/main.js` | Arranque: DB, materiales, perfil de letra, diccionario, biblioteca, editor, service worker. |
| `js/editor.js` | Lienzo y TODO lo del cuaderno: herramientas, barra flotante arrastrable, lazo, corrector en tiempo real (`runAI`, `placeLine`), texto (`openTextEditor`), stickers, capas, páginas, PDF, hoja oscura. |
| `js/handwriting.js` | **Corrector de letra local**: segmentación (renglones/palabras/letras), reconocimiento $P contra ~3,500 formas de letra (17 tipografías + inclinadas + letras del usuario), diccionario (`dictionaryDecode`), sugerencias, aprendizaje. |
| `js/dict.js` + `dict/es.txt`, `dict/en.txt` | Listas curadas (odontología, estudio, comunes) + 50k palabras por idioma (FrequencyWords, CC BY-SA, ver `CREDITOS.md`). |
| `js/library.js` | Biblioteca, carpetas, nuevo cuaderno (portadas, plantillas), importar PDF. |
| `js/assistant.js`, `js/summary.js` | Asistente sin internet: resumir (extractivo), buscar, índice, tarjetas, mis palabras, abreviaturas, mi letra. |
| `js/pdf.js` | Leer PDFs con PDF.js 2.16 (cdnjs): páginas como imagen fija + texto (`pdfText`). |
| `js/trainer.js` | Entrenamiento de letra: frases (lento/rápido/súper rápido), letras, abreviaturas. |
| `js/stickerize.js`, `js/materials.js`, `js/assets.js` | Stickers (paquetes dentales SVG, carpetas, imagen→sticker), portadas, tipografías, pinceles. |
| `js/paper.js`, `js/ink.js` | Plantillas de hoja (rayado, cuadrícula, Cornell, odontograma…) y dibujo de trazos/figuras perfectas/hoja oscura. |
| `serve.js`, `sw.js` | Servidor local con encabezados de seguridad y lista blanca; service worker para usarla sin internet. |

## Reglas que NO se rompen
1. **El corrector nunca inventa palabras**: el diccionario sólo desempata letras casi iguales, mismo número de letras,
   palabras raras sólo 1 letra, palabras cortas sólo lista curada. Si duda, marca la letra o deja el trazo original.
   Cualquier cambio al reconocimiento se prueba también con palabras falsas (zorbek, diagn, trat, molir, pacenta, kevan…).
2. **Las palabras no se juntan ni suben/bajan**: misma línea base por renglón y con el texto ya existente; nunca encimar.
3. **Sin llaves de API en el código** (ver `SEGURIDAD.md`). Si algún día se usa IA en la nube, va por un servidor
   intermediario con la llave como secreto.
4. Coordenadas lógicas fijas de página: **1240 × 1754** (A4). Los trazos se guardan así.
5. Si agregas archivos nuevos: súmalos a la lista de `sw.js` (y sube `CACHE`), y a la lista blanca de `serve.js`.
6. La CSP en `index.html` y `serve.js` bloquea `eval`; sólo se permite cdnjs para scripts.

## Probar el reconocimiento
En el panel del navegador se puede simular letra a mano dibujando el "esqueleto" de tipografías de Windows que no
están en la base (Segoe Print, Comic Sans MS, Ink Free) y pasando los trazos a `recognize()` de `js/handwriting.js`.
Última medición: Segoe Print 19/22 palabras (incluye "kevin"), 0 palabras falsas cambiadas.

## Pendiente / ideas
- Publicarla con https (GitHub Pages) para instalarla en la tablet; luego cada mejora = subir cambios.
- Cursiva continua, letra muy espaciada.
- IA que redacte resúmenes (hoy son extractivos) — sólo con servidor intermediario o modelo local pesado.
- Modo de dibujo tipo ibisPaint con pinceles especiales.
