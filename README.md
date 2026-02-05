# Tiempo Barcelona - Web del Tiempo

Una página web minimalista para consultar el tiempo en Barcelona con diseño limpio y moderno, incluyendo una sección educativa sobre meteorología.

## 🌤️ Características

- **Tiempo actual**: Temperatura, sensación térmica, humedad y viento
- **Previsión horaria**: Próximas 12 horas con temperaturas y probabilidad de lluvia
- **Previsión 3 días**: Temperaturas máximas y mínimas
- **Webcams en directo**: 2 cámaras de Barcelona (Barceloneta y Port Vell)
- **Radar de lluvia**: Mapa meteorológico en tiempo real
- **Sección educativa**: Aprende sobre meteorología y el clima de Barcelona
- **Logo personalizado**: Espacio para tu marca
- **Diseño responsive**: Optimizado para móvil y escritorio
- **Iconos animados**: Animaciones sutiles en los iconos del tiempo

## 🚀 Instalación en GitHub Pages

### Paso 1: Preparar tu logo

Antes de subir los archivos, necesitas añadir tu logo:

1. Prepara tu imagen de logo (PNG o JPG recomendado)
2. Nómbrala exactamente como `logo.png` (o `logo.jpg` si es JPG)
3. Si usas JPG, edita el archivo `index.html` en la línea 249 y cambia `logo.png` por `logo.jpg`

**Tamaño recomendado del logo:**
- Ancho: 800-1200 píxeles
- Formato: PNG con fondo transparente (ideal) o JPG
- El logo se mostrará centrado y se adaptará automáticamente al ancho de la pantalla

### Paso 2: Subir a GitHub
### Paso 2: Subir a GitHub

1. Crea un nuevo repositorio en GitHub
2. Sube los archivos:
   - `index.html` (página principal)
   - `divulgacion.html` (página educativa)
   - `logo.png` (tu logo)
   - `README.md` (opcional)
3. Ve a Settings → Pages
4. En "Source" selecciona "main" branch
5. Guarda y espera unos minutos
6. Tu web estará en: `https://tu-usuario.github.io/nombre-repo/`

### Opción alternativa: Usando Git

```bash
# Asegúrate de tener tu logo.png en la carpeta
git init
git add index.html divulgacion.html logo.png README.md
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/tu-usuario/tu-repo.git
git push -u origin main
```

Luego activa GitHub Pages desde Settings → Pages.

## 📂 Estructura del Proyecto

```
tu-repositorio/
│
├── index.html          # Página principal con el tiempo
├── divulgacion.html    # Página educativa de meteorología
├── logo.png           # Tu logo (debes añadirlo)
└── README.md          # Este archivo
```

## 🔧 Personalización

### Cambiar la ciudad

En el archivo `index.html`, busca estas líneas (aproximadamente línea 361):

```javascript
const LAT = 41.3851;  // Latitud
const LON = 2.1734;   // Longitud
```

Cambia las coordenadas por las de tu ciudad deseada.

También actualiza el nombre en la línea:

```javascript
<div class="location">Barcelona</div>
```

### Ajustar tamaño del logo

Si quieres cambiar el tamaño máximo del logo, edita en `index.html` la línea del CSS (aproximadamente línea 24):

```css
#main-logo {
    max-width: 280px;  /* Cambia este valor */
    width: 80%;
    height: auto;
}
```

### Cambiar webcams

Reemplaza las URLs de los iframes en la sección de webcams (líneas 298-309) por tus webcams preferidas.

### Ajustar colores

Modifica estas variables en el CSS:

```css
background: #ebebeb;  /* Fondo gris claro */
color: #666;          /* Color del texto */
```

### Cambiar frecuencia de actualización

Por defecto se actualiza cada 10 minutos. Para cambiar esto, modifica:

```javascript
setInterval(loadWeatherData, 600000); // 600000 ms = 10 minutos
```

## 📡 API Utilizada

Esta web utiliza la API gratuita de **Open-Meteo**:
- No requiere clave de API
- Sin límites de uso para uso personal
- Datos meteorológicos precisos
- URL: https://open-meteo.com/

## 🎨 Diseño

- Fondo gris claro (#ebebeb)
- Texto en gris (#666)
- Sin bordes ni tarjetas
- Diseño limpio y minimalista
- Animaciones sutiles en iconos

## 📱 Compatibilidad

- ✅ Chrome, Firefox, Safari, Edge
- ✅ iOS y Android
- ✅ Responsive design
- ✅ No requiere instalación

## 🔄 Actualización automática

La página se actualiza automáticamente cada 10 minutos sin necesidad de recargar.

## 📝 Notas

- Las webcams requieren conexión a internet
- El radar meteorológico es proporcionado por Meteoblue
- Los datos se obtienen en tiempo real de Open-Meteo

## 🤝 Contribuir

Si encuentras algún error o quieres mejorar algo:
1. Haz un fork del repositorio
2. Crea una rama para tu mejora
3. Envía un pull request

## 📄 Licencia

Este proyecto es de código abierto y está disponible bajo la licencia MIT.

---

**Desarrollado con ❤️ para Barcelona**
