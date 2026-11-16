# Seguridad de FreeNotas

## Estado actual
- **La app no tiene ninguna llave de API (API key) en el código.** Todo funciona en tu tablet:
  el corrector de letra, el diccionario, el asistente, los stickers y el guardado.
- Tus cuadernos se guardan sólo en tu dispositivo (IndexedDB). No se envían a ningún servidor.
- Lo único que se descarga de internet (la primera vez) son las tipografías de Google Fonts y el
  generador de PDF. Después quedan guardados y la app funciona sin wifi.

## Protecciones incluidas
- **Content-Security-Policy**: la página sólo puede ejecutar sus propios scripts (y el generador de PDF
  de cdnjs). Bloquea código inyectado, `eval`, iframes y formularios hacia otros sitios.
- **Encabezados del servidor** (`serve.js`): `nosniff`, sin referer, no se puede meter la app en un iframe,
  sin cámara/micrófono/ubicación, y sólo se sirven los archivos de la app (lista blanca).
- **Archivos que subes**: sólo se aceptan imágenes (máx. 15 MB) y tipografías `.ttf/.otf/.woff` (máx. 5 MB).
- El texto que escribes se muestra siempre como texto (nunca como HTML).
- `.gitignore` evita subir por accidente archivos `.env`, llaves o certificados.

## Si en el futuro usamos una IA en la nube (por ejemplo Claude)
Una llave de API **nunca** debe ir dentro de la app (cualquiera podría verla abriendo el código).
La forma correcta:
1. Crear un pequeño servidor intermediario (por ejemplo un Cloudflare Worker o una función de Vercel).
2. Guardar la llave **sólo** ahí, como variable secreta del entorno (`ANTHROPIC_API_KEY`), nunca en el repositorio.
3. La app llama a ese intermediario, que valida la petición, limita cuántas veces se puede usar
   (rate limit) y es quien habla con la IA.
4. Si una llave se filtra alguna vez: revocarla de inmediato en la consola del proveedor y crear otra.
