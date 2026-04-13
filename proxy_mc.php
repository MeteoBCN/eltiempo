<?php
// proxy_mc.php — Proxy para el RSS de Meteoclimatic
// Coloca este archivo en la misma carpeta que tu index.html

header('Access-Control-Allow-Origin: *');
header('Content-Type: application/xml; charset=utf-8');
header('Cache-Control: max-age=300'); // cachear 5 minutos

$url = isset($_GET['url']) ? $_GET['url'] : 'https://www.meteoclimatic.net/feed/RSS/ESCAT08';

// Solo permitir URLs de Meteoclimatic (seguridad)
if (strpos($url, 'meteoclimatic.net') === false) {
    http_response_code(403);
    echo '<?xml version="1.0"?><error>URL no permitida</error>';
    exit;
}

$context = stream_context_create([
    'http' => [
        'method'  => 'GET',
        'timeout' => 15,
        'header'  => implode("\r\n", [
            'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
            'Accept: application/rss+xml, application/xml, text/xml, */*',
            'Accept-Language: es-ES,es;q=0.9',
            'Referer: https://www.meteoclimatic.net/',
        ]),
    ],
    'ssl' => [
        'verify_peer'      => true,
        'verify_peer_name' => true,
    ],
]);

$content = @file_get_contents($url, false, $context);

if ($content === false) {
    http_response_code(502);
    echo '<?xml version="1.0"?><error>No se pudo conectar con Meteoclimatic</error>';
    exit;
}

echo $content;
