/**
 * ══════════════════════════════════════════════════════════════════
 *  METEOGRAMA SINTÉTICO DE INESTABILIDAD CONVECTIVA
 *  CAPE + CIN + Lifted Index (LI) fusionados en un único gráfico
 *  Requiere: Chart.js v4 ya cargado en la página
 *  (https://cdn.jsdelivr.net/npm/chart.js@4)
 * ══════════════════════════════════════════════════════════════════
 *
 * Requiere además un contenedor HTML fijo, situado encima de la gráfica,
 * donde se inyecta el diagnóstico en tiempo real al pasar el ratón:
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
    const LI_MAX_C   = 1;                               // LI estable -> base del eje yLI
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
            barPercentage: 0.35,
            categoryPercentage: 0.8,
            order: 3
        },
        {
            label: 'CAPE libre',
            type: 'bar',
            data: capeLibre,
            backgroundColor: '#23b14d',
            stack: 'cape',
            yAxisID: 'yCAPE',
            barPercentage: 0.35,
            categoryPercentage: 0.8,
            order: 3
        },
        {
            label: 'LI atrapado',
            type: 'bar',
            data: liAtrapado,
            backgroundColor: 'rgba(47, 85, 205, 0.3)',
            stack: 'li',
            yAxisID: 'yCAPE',
            barPercentage: 0.2,
            categoryPercentage: 0.8,
            order: 2
        },
        {
            label: 'LI activo',
            type: 'bar',
            data: liActivo,
            backgroundColor: '#2f55cd',
            stack: 'li',
            yAxisID: 'yCAPE',
            barPercentage: 0.2,
            categoryPercentage: 0.8,
            order: 2
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
            order: 1
        },
        {
            // Curva de tendencia del Lifted Index (eje derecho)
            label: 'Tendencia LI',
            type: 'line',
            data: liData,
            borderColor: '#2f55cd',
            backgroundColor: '#2f55cd',
            borderWidth: 2,
            pointRadius: 0,
            pointHoverRadius: 3,
            tension: 0.3,
            fill: false,
            yAxisID: 'yLI',
            order: 0
        }
    ];

    // ── 6. Configuración Chart.js ────────────────────────────────────
    const config = {
        type: 'bar',
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            // Captura la columna activa en tiempo real y actualiza el diagnóstico externo
            onHover: (event, elements) => {
                if (elements && elements.length) {
                    actualizarDiagnostico(elements[0].index);
                } else {
                    actualizarDiagnostico(null);
                }
            },
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
                },
                yLI: {
                    type: 'linear',
                    position: 'right',
                    min: LI_MIN_C,
                    max: LI_MAX_C,
                    reverse: true,                       // -8 arriba (inestable) / 1 abajo (estable)
                    grid: { drawOnChartArea: false },     // evita duplicar la cuadrícula de fondo
                    title: { display: true, text: 'Lifted Index (°C)' }
                }
            },
            plugins: {
                legend: {
                    labels: {
                        // Limpia la leyenda: solo un ítem representativo por variable
                        filter: item => ['CAPE libre', 'LI activo', 'CIN (cuchilla)', 'Tendencia LI'].includes(item.text)
                    }
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    callbacks: {
                        // Limpia los rangos matemáticos internos y muestra los valores reales del modelo
                        label: function (ctx) {
                            const i = ctx.dataIndex;
                            const cape = capeData[i] ?? 0;
                            const cin  = cinData[i]  ?? 0;

                            switch (ctx.dataset.label) {
                                case 'CAPE atrapado':
                                case 'LI atrapado':
                                case 'LI activo':
                                    return null; // se omiten: el valor real se muestra en las líneas combinadas
                                case 'CAPE libre':
                                    return `CAPE total: ${Math.round(cape)} J/kg`;
                                case 'CIN (cuchilla)':
                                    return `CIN: -${Math.round(cin)} J/kg`;
                                case 'Tendencia LI':
                                    return `Lifted Index: ${(liData[i] ?? 0).toFixed(1)} °C`;
                                default:
                                    return null;
                            }
                        }
                        // Nota: el diagnóstico ya NO se muestra en el footer del tooltip.
                        // Se inyecta dinámicamente en #texto-diagnostico vía onHover (ver arriba).
                    }
                }
            }
        }
    };

    return new Chart(canvas.getContext('2d'), config);
}
