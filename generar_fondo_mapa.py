#!/usr/bin/env python3
"""
generar_fondo_mapa.py
----------------------
Descarga UNA ÚNICA VEZ un mapa base de calles/costa (Geoapify Static
Maps API) centrado en la zona de cobertura del radar de Barcelona
(Gelida) y lo guarda como 'radar_fondo_mapa.png' en la raíz del
proyecto.

Este script NO forma parte de la ejecución periódica cada 10 minutos:
se lanza a mano (workflow 'Generar Fondo Mapa', disparo manual) una
vez, o cada vez que quieras cambiar el encuadre/estilo del fondo. A
partir de ahí, actualizar_radar.py reutiliza siempre ese mismo archivo
ya guardado en el repo — no hace falta volver a llamar a Geoapify en
cada ejecución del radar.

Variables de entorno requeridas:
  GEOAPIFY_API_KEY   Tu API Key gratuita de Geoapify
                      (myprojects.geoapify.com).

Nota sobre el encuadre: AEMET no publica la proyección/geolocalización
exacta de sus imágenes de radar, así que el centro y el zoom de aquí
abajo son una aproximación razonable (centrados entre Gelida y
Barcelona). Cuando veas el resultado compuesto (radar + mapa), si la
costa dibujada en amarillo por el propio radar no encaja bien con la
costa del mapa de fondo, ajusta CENTRO_LON / CENTRO_LAT / ZOOM_MAPA
aquí abajo y vuelve a lanzar este script.
"""

import os
import sys

import requests

# ─────────────────────────── Configuración ────────────────────────────

# Punto medio aproximado entre el radar de Gelida (1.8637, 41.4344) y
# el centro de Barcelona (2.1686, 41.3874), con algo más de peso hacia
# Barcelona por ser el punto de interés.
CENTRO_LON = 1.98
CENTRO_LAT = 41.40
ZOOM_MAPA = 9.3   # aproximación: cobertura regional tipo "provincia"

ANCHO_MAPA = 900
ALTO_MAPA = 900
ESTILO_MAPA = "osm-bright"  # otros estilos: apidocs.geoapify.com/docs/maps/static/

ARCHIVO_SALIDA = "radar_fondo_mapa.png"
TIMEOUT_SEGUNDOS = 30


def main() -> int:
    api_key = os.getenv("GEOAPIFY_API_KEY")
    if not api_key:
        print(
            "[ERROR] No se ha encontrado la variable de entorno "
            "GEOAPIFY_API_KEY. Defínela como GitHub Secret en el workflow.",
            file=sys.stderr,
        )
        return 1

    url = (
        "https://maps.geoapify.com/v1/staticmap"
        f"?style={ESTILO_MAPA}&width={ANCHO_MAPA}&height={ALTO_MAPA}"
        f"&center=lonlat:{CENTRO_LON},{CENTRO_LAT}&zoom={ZOOM_MAPA}"
        f"&apiKey={api_key}"
    )

    try:
        respuesta = requests.get(url, timeout=TIMEOUT_SEGUNDOS)
        respuesta.raise_for_status()

        content_type = respuesta.headers.get("Content-Type", "")
        if "image" not in content_type:
            # Geoapify devuelve JSON de error (p.ej. clave inválida o
            # cuota agotada) con Content-Type distinto de imagen.
            print(
                f"[ERROR] Geoapify no devolvió una imagen "
                f"(Content-Type: {content_type}). "
                f"Respuesta: {respuesta.text[:300]}",
                file=sys.stderr,
            )
            return 1

        with open(ARCHIVO_SALIDA, "wb") as f:
            f.write(respuesta.content)

    except requests.exceptions.RequestException as error:
        print(f"[ERROR] Fallo al descargar el mapa base: {error}", file=sys.stderr)
        return 1

    print(f"Mapa base guardado correctamente en '{ARCHIVO_SALIDA}'.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
