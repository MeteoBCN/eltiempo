'https://api.open-meteo.com/v1/forecast',
  '/air-quality': 'https://air-quality-api.open-meteo.com/v1/air-quality',
  '/marine': 'https://marine-api.open-meteo.com/v1/marine',
};

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const target = ROUTES[url.pathname];
    if (!target) return new Response('Not found', { status: 404 });
    const res = await fetch(target + url.search);
    const data = await res.text();
    return new Response(data, {
      status: res.status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      }
    });
  }
};
