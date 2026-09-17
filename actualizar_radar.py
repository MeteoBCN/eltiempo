#!/usr/bin/env python3
"""
actualizar_radar.py
--------------------
Descarga la última imagen del radar meteorológico regional de Barcelona
(estación de Gelida) publicada por AEMET OpenData, le aplica un zoom
moderado centrado en Barcelona, compone el resultado sobre un mapa base
de calles/costa (generado una vez por generar_fondo_mapa.py), mantiene
un histórico acotado de los últimos NUM_FRAMES fotogramas y los monta
en un GIF animado en bucle: 'radar_barcelona_animado.gif'.

Flujo de la API de AEMET (patrón común a casi todos sus endpoints):
  1. Se hace una petición GET al endpoint "descriptor", pasando la API Key
     en la cabecera 'api_key'. AEMET no devuelve el binario directamente:
     devuelve un JSON intermedio con (entre otros) un campo "datos" que
     contiene la URL real donde vive el fichero.
  2. Se hace una segunda petición GET, esta vez binaria, contra esa URL de
     "datos", y ahí sí se obtiene el fichero de imagen definitivo.

Composición sobre el mapa base:
  - La imagen de AEMET se separa en dos partes: el "mapa" (el círculo de
    cobertura del radar) y la "leyenda" (la franja inferior con la
    escala de colores y la fecha/hora), usando LEGEND_FRACTION.
  - Al "mapa" se le aplica un recorte centrado (zoom) y se reescala de
    vuelta a su tamaño original.
  - Se calcula una máscara de transparencia: los píxeles sin color
    (grises/negros — es decir, sin eco de lluvia) se consideran "fondo"
    y dejan pasar el mapa base de Geoapify; los píxeles con color
    (ecos de lluvia, líneas amarillas de fronteras, texto blanco) se
    mantienen opacos.
  - El resultado se reensambla con la leyenda original debajo, sin
    tocar, para que la escala de colores siga siendo legible.

Gestión del histórico de fotogramas:
  - Cada fotograma compuesto se guarda en radar_frames/ con un nombre
    basado en su timestamp UTC. Tras cada descarga se conservan solo
    los NUM_FRAMES más recientes; los sobrantes se eliminan del disco.
  - Con NUM_FRAMES=10 y una ejecución cada 10 minutos, la animación
    cubre aproximadamente los últimos 100 minutos.

Variables de entorno requeridas:
  AEMET_API_KEY   Tu API Key de AEMET OpenData.

Requisito previo: que exista 'radar_fondo_mapa.png' en la raíz del
proyecto (generado una vez con generar_fondo_mapa.py / el workflow
"Generar Fondo Mapa"). Si no existe, este script falla con un mensaje
claro indicando que hay que generarlo primero.

Dependencias: requests, Pillow, numpy.
"""

import io
import os
import sys
from datetime import datetime, timezone

import numpy as np
import requests
from PIL import Image, ImageFilter, UnidentifiedImageError

# ─────────────────────────── Configuración ────────────────────────────

RADAR_CODIGO = "ba"
URL_DESCRIPTOR = f"https://opendata.aemet.es/opendata/api/red/radar/regional/{RADAR_CODIGO}"

DIRECTORIO_FRAMES = "radar_frames"
ARCHIVO_ESTATICO = "radar_barcelona.png"
ARCHIVO_ANIMADO = "radar_barcelona_animado.gif"
FONDO_MAPA = "radar_fondo_mapa.png"

NUM_FRAMES = 10
DURACION_FRAME_MS = 600
TIMEOUT_SEGUNDOS = 20

# Fracción inferior de la imagen ocupada por la leyenda de colores
# (no es geografía, así que se conserva tal cual, sin zoom ni mapa
# de fondo detrás). Ajusta este valor si ves que se corta de más o
# de menos una vez veas un fotograma real.
LEGEND_FRACTION = 0.10

# 'Moderado': se conserva el 50% central de ancho y alto (zoom ~2x).
ZOOM_FACTOR = 0.50

# Umbral de saturación: por debajo se considera "sin color" (gris o
# negro), candidato a hacerse transparente para dejar ver el mapa.
S_UMBRAL = 0.18
# Por encima de este brillo, un píxel sin color se considera "blanco"
# (texto, logotipos) y se mantiene opaco en vez de transparentarse.
V_UMBRAL_ALTO = 0.78
# Suaviza los bordes de la máscara de transparencia para que no quede
# un recorte con dientes de sierra.
DESENFOQUE_MASCARA_PX = 1.2


def obtener_api_key() -> str:
    api_key = os.getenv("AEMET_API_KEY")
    if not api_key:
        raise RuntimeError(
            "No se ha encontrado la variable de entorno AEMET_API_KEY. "
            "Defínela localmente (export AEMET_API_KEY=...) o como "
            "GitHub Secret en el workflow."
        )
    return api_key


def obtener_url_datos(api_key: str) -> str:
    headers = {"api_key": api_key}

    respuesta = requests.get(
        URL_DESCRIPTOR, headers=headers, timeout=TIMEOUT_SEGUNDOS
    )
    respuesta.raise_for_status()

    cuerpo = respuesta.json()
    url_datos = cuerpo.get("datos")

    if not url_datos:
        estado = cuerpo.get("estado", "desconocido")
        descripcion = cuerpo.get("descripcion", "sin descripción")
        raise RuntimeError(
            f"La respuesta de AEMET no contiene el campo 'datos'. "
            f"Estado: {estado}. Descripción: {descripcion}."
        )

    return url_datos


def descargar_imagen(url_datos: str) -> bytes:
    respuesta = requests.get(url_datos, timeout=TIMEOUT_SEGUNDOS)
    respuesta.raise_for_status()

    if not respuesta.content:
        raise RuntimeError("La descarga de la imagen del radar llegó vacía.")

    return respuesta.content


def cargar_fondo_mapa() -> Image.Image:
    """Carga el mapa base pre-generado. Falla con un mensaje claro si no existe."""
    if not os.path.isfile(FONDO_MAPA):
        raise RuntimeError(
            f"No se encuentra '{FONDO_MAPA}'. Genera el mapa base primero "
            f"lanzando el workflow 'Generar Fondo Mapa' (Actions → "
            f"Generar Fondo Mapa → Run workflow)."
        )
    try:
        return Image.open(FONDO_MAPA).convert("RGB")
    except UnidentifiedImageError as error:
        raise RuntimeError(f"'{FONDO_MAPA}' no es una imagen válida: {error}")


def separar_mapa_y_leyenda(imagen: Image.Image):
    """Divide la imagen de AEMET en la zona de mapa (arriba) y la leyenda (abajo)."""
    ancho, alto = imagen.size
    alto_leyenda = int(alto * LEGEND_FRACTION)
    alto_mapa = alto - alto_leyenda

    mapa = imagen.crop((0, 0, ancho, alto_mapa))
    leyenda = imagen.crop((0, alto_mapa, ancho, alto))
    return mapa, leyenda


def aplicar_zoom(mapa: Image.Image) -> Image.Image:
    """Recorta el centro del mapa (zoom moderado) y reescala al tamaño original."""
    ancho, alto = mapa.size
    recorte_ancho = int(ancho * ZOOM_FACTOR)
    recorte_alto = int(alto * ZOOM_FACTOR)

    izquierda = (ancho - recorte_ancho) // 2
    arriba = (alto - recorte_alto) // 2

    recorte = mapa.crop(
        (izquierda, arriba, izquierda + recorte_ancho, arriba + recorte_alto)
    )
    return recorte.resize((ancho, alto), Image.LANCZOS)


def calcular_mascara_transparencia(mapa_zoom: Image.Image) -> np.ndarray:
    """
    Devuelve una máscara (0..1, tamaño HxW) donde 1 = mantener el píxel
    del radar (tiene color o es texto blanco) y 0 = dejar ver el mapa
    de fondo (era gris/negro, sin eco de lluvia).
    """
    arr = np.asarray(mapa_zoom.convert("RGB"), dtype=np.float32) / 255.0

    maxc = arr.max(axis=-1)
    minc = arr.min(axis=-1)
    delta = maxc - minc

    saturacion = np.divide(delta, maxc, out=np.zeros_like(maxc), where=maxc != 0)
    valor = maxc

    es_fondo = (saturacion < S_UMBRAL) & (valor < V_UMBRAL_ALTO)
    mascara = np.where(es_fondo, 0.0, 1.0).astype(np.float32)

    if DESENFOQUE_MASCARA_PX > 0:
        mascara_img = Image.fromarray((mascara * 255).astype(np.uint8))
        mascara_img = mascara_img.filter(
            ImageFilter.GaussianBlur(DESENFOQUE_MASCARA_PX)
        )
        mascara = np.asarray(mascara_img, dtype=np.float32) / 255.0

    return mascara


def componer_con_fondo(mapa_zoom: Image.Image, fondo: Image.Image) -> Image.Image:
    """Superpone el mapa del radar (con transparencia en el 'sin eco') sobre el fondo."""
    mascara = calcular_mascara_transparencia(mapa_zoom)

    fondo_redim = fondo.resize(mapa_zoom.size, Image.LANCZOS)
    fondo_arr = np.asarray(fondo_redim, dtype=np.float32)
    mapa_arr = np.asarray(mapa_zoom.convert("RGB"), dtype=np.float32)

    alpha3 = mascara[..., None]
    compuesta_arr = fondo_arr * (1 - alpha3) + mapa_arr * alpha3
    compuesta_arr = np.clip(compuesta_arr, 0, 255).astype(np.uint8)

    return Image.fromarray(compuesta_arr, mode="RGB")


def ensamblar_frame(mapa_compuesto: Image.Image, leyenda: Image.Image) -> Image.Image:
    """Vuelve a unir el mapa (ya compuesto con el fondo) con la leyenda original."""
    ancho, alto_mapa = mapa_compuesto.size
    alto_leyenda = leyenda.size[1]

    canvas = Image.new("RGB", (ancho, alto_mapa + alto_leyenda))
    canvas.paste(mapa_compuesto, (0, 0))
    canvas.paste(leyenda, (0, alto_mapa))
    return canvas


def guardar_nuevo_frame(frame: Image.Image) -> str:
    os.makedirs(DIRECTORIO_FRAMES, exist_ok=True)
    marca_tiempo = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    ruta_frame = os.path.join(DIRECTORIO_FRAMES, f"radar_{marca_tiempo}.png")
    frame.save(ruta_frame, format="PNG")
    return ruta_frame


def listar_frames_ordenados() -> list:
    if not os.path.isdir(DIRECTORIO_FRAMES):
        return []
    nombres = sorted(
        f for f in os.listdir(DIRECTORIO_FRAMES) if f.lower().endswith(".png")
    )
    return [os.path.join(DIRECTORIO_FRAMES, nombre) for nombre in nombres]


def podar_frames_antiguos(frames_ordenados: list) -> list:
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
    with open(ruta_ultimo_frame, "rb") as origen, open(ARCHIVO_ESTATICO, "wb") as destino:
        destino.write(origen.read())


def construir_gif_animado(frames_ordenados: list) -> None:
    if not frames_ordenados:
        raise RuntimeError("No hay fotogramas disponibles para montar la animación.")

    imagenes = []
    for ruta in frames_ordenados:
        try:
            imagenes.append(Image.open(ruta).convert("RGB"))
        except UnidentifiedImageError:
            print(
                f"[AVISO] El fotograma {ruta} no se pudo decodificar; se omite.",
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
        loop=0,
        optimize=True,
    )


def main() -> int:
    try:
        api_key = obtener_api_key()
        url_datos = obtener_url_datos(api_key)
        contenido = descargar_imagen(url_datos)

        imagen_original = Image.open(io.BytesIO(contenido)).convert("RGB")

        fondo = cargar_fondo_mapa()

        mapa, leyenda = separar_mapa_y_leyenda(imagen_original)
        mapa_zoom = aplicar_zoom(mapa)
        mapa_compuesto = componer_con_fondo(mapa_zoom, fondo)
        frame_final = ensamblar_frame(mapa_compuesto, leyenda)

        guardar_nuevo_frame(frame_final)

        frames = listar_frames_ordenados()
        frames = podar_frames_antiguos(frames)

        actualizar_archivo_estatico(frames[-1])
        construir_gif_animado(frames)

    except requests.exceptions.Timeout:
        print(
            f"[ERROR] Tiempo de espera agotado al contactar con AEMET "
            f"(>{TIMEOUT_SEGUNDOS}s). Se reintentará en la próxima ejecución.",
            file=sys.stderr,
        )
        return 1

    except requests.exceptions.HTTPError as error:
        codigo = error.response.status_code if error.response is not None else "?"
        print(f"[ERROR] AEMET respondió con un error HTTP {codigo}: {error}", file=sys.stderr)
        return 1

    except requests.exceptions.RequestException as error:
        print(f"[ERROR] Fallo de red al comunicar con AEMET: {error}", file=sys.stderr)
        return 1

    except UnidentifiedImageError as error:
        print(f"[ERROR] No se pudo decodificar la imagen descargada de AEMET: {error}", file=sys.stderr)
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
