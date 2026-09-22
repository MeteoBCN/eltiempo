// ============================================================
//  server.js — Backend de caché y escalonamiento
//  Proyecto: Tiempo Barcelona · Sección "Las estaciones, en directo"
// ============================================================
//
//  QUÉ HACE ESTE SERVIDOR
//  ----------------------
//  1. Mantiene en memoria (y en disco, en estaciones.json) el último
//     dato conocido de cada una de las 15 estaciones meteorológicas.
//
//  2. Un temporizador de fondo actualiza UNA sola estación cada
//     40 segundos (nunca todas a la vez):
//
//         15 estaciones × 40 s = 600 s = 10 minutos exactos
//
//     que es justo el intervalo con el que Weathercloud refresca sus
//     propios servidores. Resultado: nunca se hace más de 1 petición
//     externa cada 40 s → cero riesgo de bloqueo/429 Too Many Requests,
//     y cada estación se refresca lo antes posible dentro de ese límite.
//
//  3. Expone GET /api/clima, que responde AL INSTANTE con la caché
//     en memoria (nunca espera a Weathercloud), para que la web cargue
//     en milisegundos para el visitante.
//
//  NOTA sobre "11 estaciones" del enunciado original: este proyecto
//  tiene realmente 15 estaciones activas (las mismas que ya usa tu
//  index.html). El cálculo de 40 s está adaptado a ese número real
//  (15 × 40 = 600 s), en vez de los 54 s de la plantilla genérica
//  (11 × 54 = 594 s). Si en algún momento reduces a 11, basta con
//  quitar 4 estaciones de la lista ESTACIONES: el intervalo se
//  recalcula solo (CICLO_TOTAL_SEG / TOTAL_ESTACIONES).
//
//  REQUISITOS: Node.js >= 18 (usa fetch nativo, no hace falta node-fetch)
// ============================================================

const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Archivo de caché local (persiste entre reinicios del proceso) ──
const CACHE_FILE = path.join(__dirname, 'estaciones.json');

// ── Proxy CORS que ya usa tu index.html para llamar a Weathercloud.
//    Si cambias de Worker/proxy, solo tienes que tocar esta línea. ──
const WEATHERCLOUD_PROXY = 'https://proxy-weathercloud.lojasergi.workers.dev';

// ── 1) Las 15 estaciones (mismos códigos que ya tenías en el front) ──
const ESTACIONES = [
  { key: 'tibidabo',   nombre: 'Tibidabo',      code: '7799270868', lat: 41.4214, lon: 2.1189 },
  { key: 'fabra',      nombre: 'Obs. Fabra',    code: '0931380607', lat: 41.4200, lon: 2.1100 },
  { key: 'ronda',      nombre: 'CosmoCaixa',    code: '0751853563', lat: 41.4130, lon: 2.1310 },
  { key: 'vallhebron', nombre: "Vall d'Hebron", code: '2673126653', lat: 41.4277, lon: 2.1461 },
  { key: 'horta',      nombre: 'Horta',         code: '9736148442', lat: 41.4283, lon: 2.1587 },
  { key: 'santandreu', nombre: 'Sant Andreu',   code: '4693750472', lat: 41.4335, lon: 2.1888 },
  { key: 'sagrera',    nombre: 'La Sagrera',    code: '0535343276', lat: 41.4136, lon: 2.1836 },
  { key: 'gracia',     nombre: 'Gràcia',        code: '7186451298', lat: 41.4036, lon: 2.1527 },
  { key: 'sarria',     nombre: 'Sarrià',        code: '7511856207', lat: 41.3944, lon: 2.1278 },
  { key: 'lescorts',   nombre: 'Les Corts',     code: '1618006537', lat: 41.3809, lon: 2.1228 },
  { key: 'eixample',   nombre: 'Eixample',      code: '8530132327', lat: 41.3888, lon: 2.1590 },
  { key: 'sants',      nombre: 'Sants',         code: '0385965238', lat: 41.3765, lon: 2.1345 },
  { key: 'verneda',    nombre: 'La Verneda',    code: '0725412820', lat: 41.4249, lon: 2.2003 },
  { key: 'costa',      nombre: 'Port Olímpic',  code: '9415750150', lat: 41.3860, lon: 2.2010 },
  { key: 'poblenou',   nombre: 'Poblenou',      code: '8654448286', lat: 41.4036, lon: 2.2044 }
];

const TOTAL_ESTACIONES = ESTACIONES.length;                    // 15
const CICLO_TOTAL_SEG  = 600;                                  // 10 min: lo que tarda Weathercloud en refrescar
const INTERVALO_SEG    = CICLO_TOTAL_SEG / TOTAL_ESTACIONES;   // 40 s exactos
const INTERVALO_MS     = INTERVALO_SEG * 1000;

// ── 2) Estado en memoria (la "caché") ──
// Al arrancar, si ya existe estaciones.json de una ejecución anterior,
// se carga para no empezar "en blanco" tras un reinicio del proceso.
let estado = {};
if (fs.existsSync(CACHE_FILE)) {
  try {
    estado = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
    console.log(`[caché] estaciones.json cargado (${Object.keys(estado).length} estaciones ya conocidas).`);
  } catch (err) {
    console.warn('[caché] No se pudo leer estaciones.json, se arranca vacío:', err.message);
  }
}

function guardarCache() {
  fs.writeFile(CACHE_FILE, JSON.stringify(estado, null, 2), (err) => {
    if (err) console.error('[caché] Error al escribir estaciones.json:', err.message);
  });
}

// ── 3) Llamada real a Weathercloud (a través del proxy) ──
async function obtenerDeWeathercloud(estacion) {
  const url = `${WEATHERCLOUD_PROXY}?code=${estacion.code}`;
  const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!resp.ok) throw new Error(`Proxy Weathercloud respondió ${resp.status}`);
  const data = await resp.json();
  const v = data.values || data; // según versión del proxy, el JSON viene plano o anidado en "values"
  const temp = v.temp ?? v.temperature;
  const hum = v.hum ?? v.humidity;
  const lluvia = v.rain ?? v.rainDay ?? v.rainday ?? v.rainrate ?? v.rain_day;
  if (temp === undefined || temp === null) throw new Error('Sin dato de temperatura en la respuesta');
  return {
    temp: Math.round(temp),
    hum: (hum === undefined || hum === null) ? null : Math.round(hum),
    lluvia: (lluvia === undefined || lluvia === null) ? null : Number(lluvia)
  };
}

// ── Fallback: Open-Meteo, por si Weathercloud falla puntualmente para 1 estación ──
async function obtenerFallback(estacion) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${estacion.lat}&longitude=${estacion.lon}` +
              `&current=temperature_2m,relative_humidity_2m,precipitation&timezone=Europe/Madrid`;
  const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!resp.ok) throw new Error(`Open-Meteo respondió ${resp.status}`);
  const data = await resp.json();
  return {
    temp: Math.round(data.current.temperature_2m),
    hum: Math.round(data.current.relative_humidity_2m),
    lluvia: data.current.precipitation
  };
}

// ── 4) Escalonamiento: se actualiza 1 sola estación cada INTERVALO_MS ──
let indice = 0;

async function actualizarSiguienteEstacion() {
  const estacion = ESTACIONES[indice];
  indice = (indice + 1) % TOTAL_ESTACIONES;

  const hora = new Date().toLocaleTimeString('es-ES');
  try {
    const dato = await obtenerDeWeathercloud(estacion);
    estado[estacion.key] = { nombre: estacion.nombre, ...dato, actualizado: new Date().toISOString(), fuente: 'weathercloud' };
    console.log(`[${hora}] ✓ ${estacion.nombre}: ${dato.temp}°C (Weathercloud)`);
  } catch (err) {
    console.warn(`[${hora}] ✗ ${estacion.nombre} — Weathercloud falló (${err.message}), probando fallback Open-Meteo…`);
    try {
      const fallback = await obtenerFallback(estacion);
      estado[estacion.key] = { nombre: estacion.nombre, ...fallback, actualizado: new Date().toISOString(), fuente: 'open-meteo' };
      console.log(`[${hora}] ✓ ${estacion.nombre}: ${fallback.temp}°C (fallback Open-Meteo)`);
    } catch (err2) {
      console.error(`[${hora}] ✗✗ ${estacion.nombre}: el fallback también falló (${err2.message}). Se conserva el último dato conocido.`);
      // No se toca estado[estacion.key]: el visitante sigue viendo el último valor válido.
    }
  }

  guardarCache();
}

// Primera actualización nada más arrancar el proceso, y luego una
// estación nueva cada INTERVALO_MS, en bucle continuo e infinito.
actualizarSiguienteEstacion();
setInterval(actualizarSiguienteEstacion, INTERVALO_MS);

console.log(`[servidor] Escalonamiento activo: 1 estación cada ${INTERVALO_SEG}s · ciclo completo de ${TOTAL_ESTACIONES} estaciones = ${CICLO_TOTAL_SEG}s (10 min)`);

// ── 5) Endpoint local: responde al instante con la caché, sin tocar Weathercloud ──
app.get('/api/clima', (req, res) => {
  res.json(estado);
});

// (Opcional pero recomendado) Sirve también los archivos estáticos del
// sitio — index.html, css, imágenes — desde esta misma carpeta, así con
// "node server.js" tienes la web completa funcionando en un solo proceso.
app.use(express.static(path.join(__dirname)));

app.listen(PORT, () => {
  console.log(`[servidor] Escuchando en http://localhost:${PORT}`);
  console.log(`[servidor] Endpoint de datos: http://localhost:${PORT}/api/clima`);
});
