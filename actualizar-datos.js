/**
 * ══════════════════════════════════════════════════════════════════
 *  ACTUALIZADOR DE DATOS METEOROLÓGICOS (caché centralizada)
 *
 *  Este script lo ejecuta GitHub Actions cada 3 horas (ver
 *  .github/workflows/actualizar-datos.yml). Es la ÚNICA llamada real
 *  a la API de Open-Meteo: llama una vez, guarda el resultado en
 *  datos/meteo.json, y ese archivo es el que consulta la web desde
 *  cualquier dispositivo/visitante (fetch a un archivo estático propio,
 *  no a la API externa).
 *
 *  Ejecución local para pruebas:  node scripts/actualizar-datos.js
 * ══════════════════════════════════════════════════════════════════
 */

const fs = require('fs');
const path = require('path');

// Mismas coordenadas que usa index2.html (Barcelona)
const LAT = 41.3851;
const LON = 2.1734;

const FORECAST_URL =
    `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}` +
    `&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,wind_gusts_10m,wind_direction_10m,precipitation,pressure_msl,cloud_cover` +
    `&hourly=temperature_2m,apparent_temperature,relative_humidity_2m,pressure_msl,precipitation_probability,precipitation,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m,uv_index,cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,temperature_850hPa,temperature_500hPa,freezing_level_height,cape,lifted_index,convective_inhibition,total_column_integrated_water_vapour,relative_humidity_850hPa,relative_humidity_700hPa,wind_speed_850hPa,wind_direction_850hPa,wind_speed_500hPa,wind_direction_500hPa` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max,wind_direction_10m_dominant,relative_humidity_2m_max,relative_humidity_2m_min,pressure_msl_mean,cape_max` +
    `&timezone=Europe/Madrid&forecast_days=8`;

const AIR_QUALITY_URL =
    `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${LAT}&longitude=${LON}` +
    `&current=european_aqi,us_aqi,pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone,alder_pollen,birch_pollen,grass_pollen,mugwort_pollen,olive_pollen,ragweed_pollen` +
    `&hourly=pm10&forecast_days=2&timezone=Europe/Madrid`;

const MARINE_URL =
    `https://marine-api.open-meteo.com/v1/marine?latitude=${LAT}&longitude=${LON}` +
    `&current=wave_height,wave_direction,wave_period,sea_surface_temperature,wind_wave_height,wind_wave_direction` +
    `&hourly=wave_height,wave_period,wave_direction,wind_wave_height,wind_speed_10m,wind_direction_10m,sea_surface_temperature` +
    `&timezone=Europe/Madrid&forecast_days=4`;

async function fetchJson(url, nombre) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
        const r = await fetch(url, { signal: controller.signal });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return await r.json();
    } catch (e) {
        console.error(`Error obteniendo "${nombre}":`, e.message);
        return null;
    } finally {
        clearTimeout(timer);
    }
}

async function main() {
    console.log('Consultando Open-Meteo…');

    const [forecast, airQuality, marine] = await Promise.all([
        fetchJson(FORECAST_URL, 'forecast'),
        fetchJson(AIR_QUALITY_URL, 'air-quality'),
        fetchJson(MARINE_URL, 'marine')
    ]);

    // El forecast principal es imprescindible: si falla, no sobreescribimos
    // el JSON existente (mejor servir datos de hace 3h que dejar la web sin nada).
    if (!forecast || !forecast.hourly || !forecast.daily) {
        console.error('No se pudo obtener el forecast principal. Se aborta sin tocar datos/meteo.json.');
        process.exit(1);
    }

    const salida = {
        generated_at: new Date().toISOString(),
        forecast,
        air_quality: airQuality,   // puede quedar null si esa llamada concreta falla
        marine: marine             // puede quedar null si esa llamada concreta falla
    };

    const outDir = path.join(__dirname, '..', 'datos');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    const outPath = path.join(outDir, 'meteo.json');
    fs.writeFileSync(outPath, JSON.stringify(salida));

    console.log(`Guardado en ${outPath} (${salida.generated_at})`);
}

main();
