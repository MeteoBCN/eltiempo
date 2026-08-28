# Web meteo — caché centralizada con GitHub Actions

Esta web ya no llama a la API de Open-Meteo directamente desde el navegador
de cada visitante. En su lugar:

1. `scripts/actualizar-datos.js` es la ÚNICA pieza que llama a Open-Meteo.
2. `.github/workflows/actualizar-datos.yml` ejecuta ese script cada 3 horas
   dentro de GitHub Actions y guarda el resultado en `datos/meteo.json`.
3. La web (`index2.html`) lee ese `datos/meteo.json` como un archivo
   estático propio — es lo mismo para todos los visitantes, sin volver a
   llamar a la API por cada persona que entra.

Si `datos/meteo.json` no existe todavía (por ejemplo justo después de subir
el repo, antes de la primera ejecución) o falla la lectura, la web usa
automáticamente el proxy antiguo como respaldo, así que nunca se queda sin
datos.

## Pasos para dejarlo funcionando en GitHub

1. **Crea el repositorio en GitHub** (puede ser público o privado) y sube
   todo el contenido de esta carpeta tal cual (conservando la estructura
   de carpetas `.github/`, `scripts/`, `datos/`).

2. **Activa permisos de escritura para las Actions**, para que el workflow
   pueda hacer commit del JSON actualizado:
   `Settings → Actions → General → Workflow permissions` → marca
   **"Read and write permissions"** → Guardar.

3. **Lanza la primera ejecución a mano** (no hace falta esperar 3 horas):
   pestaña `Actions` → selecciona el workflow **"Actualizar datos
   meteorológicos"** → botón **"Run workflow"**. Esto genera
   `datos/meteo.json` por primera vez y lo sube al repo.

4. A partir de ahí, el workflow se ejecuta solo cada 3 horas
   (`cron: '0 */3 * * *'`, en hora UTC) sin que tengas que hacer nada más.

5. **Publica la web** con GitHub Pages (o el hosting que prefieras) sirviendo
   `index2.html` junto con la carpeta `datos/` tal y como quedan en el repo.
   Si usas GitHub Pages: `Settings → Pages → Deploy from branch` → rama
   `main` (o la que uses) → carpeta `/ (root)`.

## Comprobar que funciona

- En la pestaña `Actions` de GitHub debes ver ejecuciones cada 3 horas con
  ✅ en verde, y el commit automático `"Actualiza datos meteorológicos
  [automático]"` apareciendo en el historial cada vez que cambian los datos.
- En el navegador, abre la consola (F12) al cargar la web: debería aparecer
  el mensaje `Datos meteo cargados desde caché propia (datos/meteo.json),
  generados: <fecha>`. Si en cambio ves `usando proxy en directo como
  respaldo`, es que `datos/meteo.json` no se ha generado aún o no se pudo
  leer (revisa el paso 3).

## Ejecutarlo en local (opcional, para probar el script)

```bash
node scripts/actualizar-datos.js
```

Esto genera/actualiza `datos/meteo.json` en tu máquina, usando la misma
lógica que usará GitHub Actions.
