/**
 * Cloudflare Worker: proxy-weathercloud
 * ---------------------------------------------------------------
 * Hace de intermediario (server-side) hacia el endpoint NO OFICIAL
 * de Weathercloud para poder leerlo desde el navegador sin problemas
 * de CORS. Pensado para la estación "Observatori Fabra"
 * (código d0931380607), pero sirve para cualquier estación pública
 * de Weathercloud pasando el parámetro ?code=.
 *
 * Endpoint real que consulta:
 *   https://app.weathercloud.net/device/values?code=d0931380607
 *
 * Despliegue:
 *   1. Ve a https://dash.cloudflare.com -> Workers & Pages -> Create Worker
 *   2. Pega este código y despliega.
 *   3. Copia la URL resultante (algo como
 *      https://proxy-weathercloud.TU-USUARIO.workers.dev) y úsala
 *      en el index.html en la constante WEATHERCLOUD_WORKER.
 */

const DEFAULT_CODE = '0931380607'; // Observatori Fabra (código SIN el prefijo "d")

export default {
  async fetch(request) {
    // Solo permitimos GET
    if (request.method !== 'GET') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    const url = new URL(request.url);
    const code = url.searchParams.get('code') || DEFAULT_CODE;

    const target = `https://app.weathercloud.net/device/values?code=${encodeURIComponent(code)}`;

    try {
      const upstream = await fetch(target, {
        headers: {
          // Algunos endpoints de Weathercloud comprueban esta cabecera
          'X-Requested-With': 'XMLHttpRequest',
          'User-Agent': 'Mozilla/5.0 (compatible; ProxyWorker/1.0)',
          'Accept': 'application/json, text/plain, */*'
        },
        cf: { cacheTtl: 0, cacheEverything: false }
      });

      const bodyText = await upstream.text();

      return new Response(bodyText, {
        status: upstream.status,
        headers: {
          'Content-Type': 'application/json; charset=UTF-8',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Cache-Control': 'public, max-age=120' // cachea 2 min para no saturar Weathercloud
        }
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: 'proxy_error', message: err.message }), {
        status: 502,
        headers: {
          'Content-Type': 'application/json; charset=UTF-8',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }
  }
};
