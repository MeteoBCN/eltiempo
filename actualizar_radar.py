#!/usr/bin/env python3
"""
actualizar_radar.py
--------------------
Descarga la última imagen del radar meteorológico regional de Barcelona
(estación de Gelida) publicada por AEMET OpenData, mantiene un histórico
acotado de los últimos NUM_FRAMES fotogramas y los monta en un GIF
animado en bucle: 'radar_barcelona_animado.gif' en la raíz del proyecto.

Flujo de la API de AEMET (patrón común a casi todos sus endpoints):
  1. Se hace una petición GET al endpoint "descriptor", pasando la API Key
     en la cabecera 'api_key'. AEMET no devuelve el binario directamente:
     devuelve un JSON intermedio con (entre otros) un campo "datos" que
     contiene la URL real donde vive el fichero.
  2. Se hace una segunda petición GET, esta vez binaria, contra esa URL de
     "datos", y ahí sí se obtiene el fichero de imagen definitivo.

Gestión del histórico de fotogramas:
  - Cada fotograma nuevo se guarda en radar_frames/ con un nombre basado
    en su timestamp UTC (para que el orden alfabético sea también el
    orden cronológico).
  - Tras cada descarga se conservan solo los NUM_FRAMES más recientes;
    los sobrantes se eliminan del disco. El workflow de GitHub Actions
    se encarga de reflejar esas altas/bajas en el commit.
  - Con NUM_FRAMES=10 y una ejecución cada 10 minutos, la animación
    cubre aproximadamente los últimos 100 minutos.

Nota sobre el formato: el catálogo Swagger de AEMET no especifica el
content-type exacto de este endpoint (lo etiqueta solo como "Imagen").
En la práctica, el radar regional de AEMET se sirve tradicionalmente
como .gif; Pillow lo abre igualmente sin problema para componer la
animación, sea cual sea el formato real del binario.

Variables de entorno requeridas:
  AEMET_API_KEY   Tu API Key de AEMET OpenData.

Dependencias: requests, Pillow.
"""

import os
import sys
from datetime import datetime, timezone

import requests
from PIL import Image, UnidentifiedImageError

# ─────────────────────────── Configuración ────────────────────────────

# Código de radar regional de AEMET para Barcelona (estación de Gelida).
# Ver enum oficial en el Swagger de AEMET OpenData
# (/api/red/radar/regional/{radar}): am, sa, ba, ss, cc, co, pa, ca, ma,
# ml, mu, vd, se, va, za — 'ba' corresponde a Barcelona.
RADAR_CODIGO = "ba"

URL_DESCRIPTOR = f"https://opendata.aemet.es/opendata/api/red/radar/regional/{RADAR_CODIGO}"

DIRECTORIO_FRAMES = "radar_frames"
ARCHIVO_ESTATICO = "radar_barcelona.png"          # último fotograma suelto (fallback)
ARCHIVO_ANIMADO = "radar_barcelona_animado.gif"   # animación en bucle

NUM_FRAMES = 10               # fotogramas a conservar en el bucle
DURACION_FRAME_MS = 600       # duración de cada fotograma en la animación

TIMEOUT_SEGUNDOS = 20


def obtener_api_key() -> str:
    """Lee la API Key desde la variable de entorno AEMET_API_KEY."""
    api_key = os.getenv("AEMET_API_KEY")
    if not api_key:
        raise RuntimeError(
            "No se ha encontrado la variable de entorno AEMET_API_KEY. "
            "Defínela localmente (export AEMET_API_KEY=...) o como "
            "GitHub Secret en el workflow."
        )
    return api_key


def obtener_url_datos(api_key: str) -> str:
    """
    Primera petición: consulta el endpoint descriptor de AEMET y extrae
    la URL real de la imagen desde el campo 'datos' del JSON de respuesta.
    """
    headers = {"api_key": api_key}

    respuesta = requests.get(
        URL_DESCRIPTOR, headers=headers, timeout=TIMEOUT_SEGUNDOS
    )
    respuesta.raise_for_status()

    cuerpo = respuesta.json()
    url_datos = cuerpo.get("datos")

    if not url_datos:
        # AEMET normalmente incluye también 'estado' y 'descripcion' en
        # los JSON de error, así que los mostramos para facilitar el debug.
        estado = cuerpo.get("estado", "desconocido")
        descripcion = cuerpo.get("descripcion", "sin descripción")
        raise RuntimeError(
            f"La respuesta de AEMET no contiene el campo 'datos'. "
            f"Estado: {estado}. Descripción: {descripcion}."
        )

    return url_datos


def descargar_imagen(url_datos: str) -> bytes:
    """Segunda petición: descarga binaria del fichero de imagen real."""
    respuesta = requests.get(url_datos, timeout=TIMEOUT_SEGUNDOS)
    respuesta.raise_for_status()

    if not respuesta.content:
        raise RuntimeError("La descarga de la imagen del radar llegó vacía.")

    return respuesta.content


def guardar_nuevo_frame(contenido: bytes) -> str:
    """
    Guarda el binario descargado como un fotograma nuevo, con nombre
    basado en el timestamp UTC actual. Devuelve la ruta del archivo.
    """
    os.makedirs(DIRECTORIO_FRAMES, exist_ok=True)

    marca_tiempo = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    ruta_frame = os.path.join(DIRECTORIO_FRAMES, f"radar_{marca_tiempo}.png")

    with open(ruta_frame, "wb") as f:
        f.write(contenido)

    return ruta_frame


def listar_frames_ordenados() -> list:
    """Lista los fotogramas en radar_frames/, ordenados de más antiguo a más reciente."""
    if not os.path.isdir(DIRECTORIO_FRAMES):
        return []

    nombres = sorted(
        f for f in os.listdir(DIRECTORIO_FRAMES)
        if f.lower().endswith(".png")
    )
    return [os.path.join(DIRECTORIO_FRAMES, nombre) for nombre in nombres]


def podar_frames_antiguos(frames_ordenados: list) -> list:
    """
    Elimina del disco los fotogramas que sobran, conservando solo los
    NUM_FRAMES más recientes. Devuelve la lista resultante ya podada.
    """
    if len(frames_ordenados) <= NUM_FRAMES:
        return frames_ordenados

    sobrantes = frames_ordenados[:-NUM_FRAMES]
    restantes = frames_ordenados[-NUM_FRAMES:]

    for ruta in sobrantes:
        try:
            os.remove(ruta)
        except OSError as error:
            print(f"[AVISO] No se pudo borrar el fotograma antiguo {ruta}: {error}", file=sys.stderr)

    return restantes


def actualizar_archivo_estatico(ruta_ultimo_frame: str) -> None:
    """Copia el fotograma más reciente como imagen estática de fallback."""
    with open(ruta_ultimo_frame, "rb") as origen, open(ARCHIVO_ESTATICO, "wb") as destino:
        destino.write(origen.read())


def construir_gif_animado(frames_ordenados: list) -> None:
    """
    Monta radar_barcelona_animado.gif a partir de los fotogramas
    disponibles (de más antiguo a más reciente), en bucle infinito.
    """
    if not frames_ordenados:
        raise RuntimeError("No hay fotogramas disponibles para montar la animación.")

    imagenes = []
    for ruta in frames_ordenados:
        try:
            img = Image.open(ruta).convert("RGB")
            imagenes.append(img)
        except UnidentifiedImageError:
            print(
                f"[AVISO] El fotograma {ruta} no se pudo decodificar como "
                f"imagen; se omite de la animación.",
                file=sys.stderr,
            )

    if not imagenes:
        raise RuntimeError("Ningún fotograma pudo decodificarse; no se generó animación.")

    primero, resto = imagenes[0], imagenes[1:]
    primero.save(
        ARCHIVO_ANIMADO,
        format="GIF",
        save_all=True,
        append_images=resto,
        duration=DURACION_FRAME_MS,
        loop=0,          # 0 = bucle infinito
        optimize=True,
    )


def main() -> int:
    try:
        api_key = obtener_api_key()
        url_datos = obtener_url_datos(api_key)
        contenido = descargar_imagen(url_datos)

        guardar_nuevo_frame(contenido)

        frames = listar_frames_ordenados()
        frames = podar_frames_antiguos(frames)

        actualizar_archivo_estatico(frames[-1])
        construir_gif_animado(frames)

    except requests.exceptions.Timeout:
        print(
            f"[ERROR] Tiempo de espera agotado al contactar con AEMET "
            f"(>{TIMEOUT_SEGUNDOS}s). Puede ser un fallo temporal del "
            f"servicio; se reintentará en la próxima ejecución programada.",
            file=sys.stderr,
        )
        return 1

    except requests.exceptions.HTTPError as error:
        codigo = error.response.status_code if error.response is not None else "?"
        print(
            f"[ERROR] AEMET respondió con un error HTTP {codigo}: {error}",
            file=sys.stderr,
        )
        return 1

    except requests.exceptions.RequestException as error:
        print(
            f"[ERROR] Fallo de red al comunicar con AEMET: {error}",
            file=sys.stderr,
        )
        return 1

    except (RuntimeError, ValueError) as error:
        print(f"[ERROR] {error}", file=sys.stderr)
        return 1

    print(
        f"Radar de Barcelona actualizado: '{ARCHIVO_ESTATICO}' (último fotograma) "
        f"y '{ARCHIVO_ANIMADO}' ({NUM_FRAMES} fotogramas en bucle)."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
