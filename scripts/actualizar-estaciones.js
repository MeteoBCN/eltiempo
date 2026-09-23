#!/usr/bin/env node
/**
 * ═══ Recogida centralizada de las 4 estaciones "en directo" ═══
 *
 * Esta es la ÚNICA pieza que llama a Meteoclimatic y a Weathercloud.
 * Se ejecuta desde GitHub Actions (ver
 * .github/workflows/actualizar-estaciones.yml) cada pocos minutos y
 * guarda el resultado en datos/estaciones.json. La web (index.html) solo
 * lee ese JSON, así que los visitantes NUNCA llaman directamente a
 * Meteoclimatic ni a Weathercloud.
 *
 * Colócalo en la carpeta scripts/ del repo, junto al resto de scripts
 * (actualizar-datos.js, actualizar_radar.py, etc.).
 *
 * Requiere Node 18+ (usa fetch nativo).
 */
const fs = require('fs');
const path = require('path');

const METEOCLIMATIC_PROXY = 'https://proxy-meteoclimatic.lojasergi.workers.dev';
const WEATHERCLOUD_WORKER = 'https://proxy-weathercloud.lojasergi.workers.dev';

const ESTACIONES = [
    { key: 'tibidabo', fuente: 'meteoclimatic', code: 'ESCAT0800000008023C' },
    { key: 'lescorts', fuente: 'weathercloud',  code: '1618006537' },
    { key: 'gracia',   fuente: 'meteoclimatic', code: 'ESCAT0800000008023I' },
    { key: 'costa',    fuente: 'weathercloud',  code: '9415750150' }
];

// Ajusta esta ruta si tu script no vive en scripts/ dentro del repo.
const SALIDA = path.join(__dirname, '..', 'datos', 'estaciones.json');

let feedMeteoclimaticCache = null;

async function obtenerFeedMeteoclimatic() {
    // El feed trae TODAS las estaciones de la demarcación en una sola
    // respuesta, así que se pide una vez y se reutiliza para Tibidabo y
    // Gràcia dentro de esta misma ejecución.
    if (feedMeteoclimaticCache) return feedMeteoclimaticCache;
    const resp = await fetch(METEOCLIMATIC_PROXY, { signal: AbortSignal.timeout(10000) });
    if (!resp.ok) throw new Error('Respuesta no OK del proxy Meteoclimatic (' + resp.status + ')');
    feedMeteoclimaticCache = await resp.text();
    return feedMeteoclimaticCache;
}

function extraerEstacionMeteoclimatic(xml, code) {
    const marcador = '[[<' + code + ';';
    const inicio = xml.indexOf(marcador);
    if (inicio === -1) throw new Error('Estación ' + code + ' no encontrada en el feed');
    const fin = xml.indexOf('>]]', inicio);
    const bloque = xml.slice(inicio + marcador.length, fin);
    const grupos = bloque.match(/\(([^)]*)\)/g);
    if (!grupos || grupos.length < 5) throw new Error('Formato inesperado para ' + code);
    // grupos[0] = (temp;max;min;icono) · grupos[4] = (precip del día)
    const temp = parseFloat(grupos[0].replace(/[()]/g, '').split(';')[0].replace(',', '.'));
    const lluvia = parseFloat(grupos[4].replace(/[()]/g, '').replace(',', '.'));
    return {
        temp: Number.isNaN(temp) ? null : Math.round(temp),
        lluvia: Number.isNaN(lluvia) ? null : lluvia
    };
}

async function obtenerDatoMeteoclimatic(code) {
    const xml = await obtenerFeedMeteoclimatic();
    return extraerEstacionMeteoclimatic(xml, code);
}

async function obtenerDatoWeathercloud(code) {
    const resp = await fetch(`${WEATHERCLOUD_WORKER}?code=${code}`, { signal: AbortSignal.timeout(8000) });
    if (!resp.ok) throw new Error('Respuesta no OK del proxy Weathercloud (' + code + ')');
    const data = await resp.json();
    const v = data.values || data;
    const temp = v.temp ?? v.temperature;
    const lluvia = v.rain ?? v.rainDay ?? v.rainday ?? v.rainrate ?? v.rain_day;
    if (temp === undefined || temp === null) throw new Error('Sin dato de temperatura (' + code + ')');
    return {
        temp: Math.round(temp),
        lluvia: (lluvia === undefined || lluvia === null) ? null : Number(lluvia)
    };
}

async function main() {
    const estaciones = {};

    for (const estacion of ESTACIONES) {
        try {
            estaciones[estacion.key] = estacion.fuente === 'meteoclimatic'
                ? await obtenerDatoMeteoclimatic(estacion.code)
                : await obtenerDatoWeathercloud(estacion.code);
        } catch (err) {
            console.warn(`[estaciones] No se pudo obtener el dato de "${estacion.key}":`, err.message);
            // Si falla una estación puntual, se guarda como null en vez de
            // reventar todo el JSON: así las otras 3 sí se actualizan.
            estaciones[estacion.key] = { temp: null, lluvia: null };
        }
    }

    const salida = {
        generado: new Date().toISOString(),
        estaciones
    };

    fs.mkdirSync(path.dirname(SALIDA), { recursive: true });
    fs.writeFileSync(SALIDA, JSON.stringify(salida, null, 2) + '\n');
    console.log('[estaciones] Guardado en', SALIDA);
    console.log(JSON.stringify(salida, null, 2));
}

main().catch(err => {
    console.error('[estaciones] Error fatal:', err);
    process.exit(1);
});
