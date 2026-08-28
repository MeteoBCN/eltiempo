/**
 * ══════════════════════════════════════════════════════════════════
 *  METEOGRAMA SINTÉTICO DE INESTABILIDAD CONVECTIVA
 *  CAPE + CIN + Lifted Index (LI) fusionados en un único gráfico
 *  Requiere: Chart.js v4 y chartjs-plugin-datalabels ya cargados en la página
 *  (https://cdn.jsdelivr.net/npm/chart.js@4)
 *  (https://cdn.jsdelivr.net/npm/chartjs-plugin-datalabels@2)
 * ══════════════════════════════════════════════════════════════════
 *
 * Requiere además un contenedor HTML fijo, situado encima de la gráfica,
 * donde se inyecta el diagnóstico (franja actual, sin depender del ratón):
 *   <div id="texto-diagnostico"></div>
 *
 * Uso:
 *   const chart = drawMeteogramaInestabilidad('miCanvas', {
 *       time: ['00:00', '03:00', '06:00', ...],
 *       cape: [120, 480, 1600, 2400, ...],                 // J/kg
 *       convective_inhibition: [-180, -90, -40, -10, ...], // J/kg (con o sin signo, se normaliza)
 *       lifted_index: [2.1, 0.4, -2.0, -5.5, ...]           // °C
 *   });
 */

function drawMeteogramaInestabilidad(canvasId, hourly) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || typeof Chart === 'undefined') return null;

    // ── 1. Datos base ────────────────────────────────────────────────
    const labels   = hourly.time || hourly.labels || [];
    const capeData = hourly.cape || [];
    // El CIN puede llegar en signo negativo (convención meteorológica) o positivo (magnitud) -> se normaliza a magnitud
    const cinData  = (hourly.convective_inhibition || hourly.cin || []).map(v => Math.abs(v || 0));
    const liData   = hourly.lifted_index || hourly.li || [];

    const n = labels.length;

    // ── 2. Constantes de escala (Escala 10:1 y mapeo del LI) ──────────
    const CAPE_MAX   = 3200;                          // techo del eje yCAPE
    const CIN_SCALE  = 10;                             // proporción visual CIN -> escala CAPE
    const CIN_BAND   = 55;                              // semigrosor visual de la "cuchilla" del CIN
    const LI_MIN_C   = -8;                             // LI extremo -> tope visual (3200)
    const LI_TO_CAPE = CAPE_MAX / Math.abs(LI_MIN_C);   // factor de conversión LI(°C) -> escala CAPE (400)

    // ── 3. Construcción de las series visuales ────────────────────────
    const cinFloatBar  = []; // [min, max] flotante -> la "cuchilla" del CIN
    const capeAtrapado  = []; // tramo inferior CAPE (verde translúcido)
    const capeLibre     = []; // tramo superior CAPE (verde intenso)
    const liAtrapado     = []; // tramo inferior LI satélite (azul translúcido)
    const liActivo        = []; // tramo superior LI satélite (azul intenso)

    for (let i = 0; i < n; i++) {
        const cape = capeData[i] ?? 0;
        const cin  = cinData[i]  ?? 0;
        const li   = liData[i]   ?? 0;

        // Altura visual del CIN (centro de la "cuchilla" en la escala del CAPE)
        const cinH = cin * CIN_SCALE;
        cinFloatBar.push([Math.max(0, cinH - CIN_BAND), Math.min(CAPE_MAX, cinH + CIN_BAND)]);

        // Columna CAPE: se corta exactamente a la altura del CIN
        const capeAtrap = Math.min(cinH, cape);
        capeAtrapado.push(capeAtrap);
        capeLibre.push(Math.max(0, cape - capeAtrap));

        // Columna LI satélite: LI negativo (inestable) se traduce a altura visual positiva
        const liH = Math.max(0, Math.min(CAPE_MAX, -li * LI_TO_CAPE));
        const liAtrap = Math.min(cinH, liH);
        liAtrapado.push(liAtrap);
        liActivo.push(Math.max(0, liH - liAtrap));
    }

    // ── 4. Diagnóstico Convectivo Automatizado (texto puro, sin iconos) ─
    function diagnosticoConvectivo(cape, cin, li) {
        if (cape > 2000 && cin >= 150) {
            return 'DIAGNOSTICO: Olla a presión. Combustible extremo retenido por fuerte tapón. Monitorear orografía o frentes.';
        }
        if (cape > 1500 && cin < 50 && li <= -4) {
            return 'DIAGNOSTICO: Bomba convectiva activa. Vía libre para tormentas explosivas y severas.';
        }
        if (cape < 500 && cin > 100) {
            return 'DIAGNOSTICO: Atmósfera estable. El tapón anula cualquier amago de convección.';
        }
        return '';
    }

    // Inyecta el diagnóstico en el contenedor HTML externo fijo (#texto-diagnostico)
    function actualizarDiagnostico(i) {
        const contenedor = document.getElementById('texto-diagnostico');
        if (!contenedor) return;
        if (i === null || i === undefined || i < 0 || i >= n) {
            contenedor.textContent = '';
            return;
        }
        const cape = capeData[i] ?? 0;
        const cin  = cinData[i]  ?? 0;
        const li   = liData[i]   ?? 0;
        contenedor.textContent = diagnosticoConvectivo(cape, cin, li);
    }

    // ── 5. Datasets ────────────────────────────────────────────────────
    const datasets = [
        {
            label: 'CAPE atrapado',
            type: 'bar',
            data: capeAtrapado,
            backgroundColor: 'rgba(35, 177, 77, 0.25)',
            stack: 'cape',
            yAxisID: 'yCAPE',
            barPercentage: 0.5,
            categoryPercentage: 0.85,
            order: 3,
            datalabels: { display: false } // el valor real se muestra en "CAPE libre" (tope del stack)
        },
        {
            label: 'CAPE libre',
            type: 'bar',
            data: capeLibre,
            backgroundColor: '#23b14d',
            stack: 'cape',
            yAxisID: 'yCAPE',
            barPercentage: 0.5,
            categoryPercentage: 0.85,
            order: 3,
            datalabels: {
                color: '#ffffff',
                font: { weight: 'bold', size: 9 },
                anchor: 'end',
                align: 'top',
                offset: 2,
                formatter: (v, ctx) => `${Math.round(capeData[ctx.dataIndex] ?? 0)}`
            }
        },
        {
            label: 'LI atrapado',
            type: 'bar',
            data: liAtrapado,
            backgroundColor: 'rgba(47, 85, 205, 0.3)',
            stack: 'li',
            yAxisID: 'yCAPE',
            barPercentage: 0.5,
            categoryPercentage: 0.85,
            order: 2,
            datalabels: { display: false } // el valor real se muestra en "LI activo" (tope del stack)
        },
        {
            label: 'LI activo',
            type: 'bar',
            data: liActivo,
            backgroundColor: '#2f55cd',
            stack: 'li',
            yAxisID: 'yCAPE',
            barPercentage: 0.5,
            categoryPercentage: 0.85,
            order: 2,
            datalabels: {
                color: '#ffffff',
                font: { weight: 'bold', size: 9 },
                anchor: 'end',
                align: 'top',
                offset: 2,
                formatter: (v, ctx) => `${(liData[ctx.dataIndex] ?? 0).toFixed(1)}°`
            }
        },
        {
            // La "cuchilla" del CIN: barra flotante ancha que cruza ambas columnas
            label: 'CIN (cuchilla)',
            type: 'bar',
            data: cinFloatBar,
            backgroundColor: '#e61919',
            borderColor: '#e61919',
            borderWidth: 1,
            grouped: false,          // no comparte slot con los grupos "cape" / "li" -> ocupa todo el ancho de categoría
            barPercentage: 0.85,
            categoryPercentage: 0.9,
            yAxisID: 'yCAPE',
            order: 1,
            datalabels: {
                color: '#ffffff',
                font: { weight: 'bold', size: 9 },
                anchor: 'center',
                align: 'center',
                formatter: (v, ctx) => `-${Math.round(cinData[ctx.dataIndex] ?? 0)}`
            }
        }
    ];

    // ── 6. Configuración Chart.js ────────────────────────────────────
    if (typeof ChartDataLabels !== 'undefined') Chart.register(ChartDataLabels);
    const config = {
        type: 'bar',
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            events: [],   // sin interacción con el ratón (ni hover ni click)
            scales: {
                x: {
                    stacked: true,
                    grid: { display: false }
                },
                yCAPE: {
                    type: 'linear',
                    position: 'left',
                    min: 0,
                    max: CAPE_MAX,
                    stacked: true,
                    title: { display: true, text: 'CAPE / CIN (J/kg)' }
                }
            },
            plugins: {
                legend: {
                    labels: {
                        // Limpia la leyenda: solo un ítem representativo por variable
                        filter: item => ['CAPE libre', 'LI activo', 'CIN (cuchilla)'].includes(item.text)
                    }
                },
                tooltip: {
                    enabled: false
                }
            }
        }
    };

    // Diagnóstico fijo (franja actual, sin depender del ratón)
    actualizarDiagnostico(0);

    return new Chart(canvas.getContext('2d'), config);
}
