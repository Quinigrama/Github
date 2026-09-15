import { t } from './i18n';

export type EstrategiaApuesta = 'martingala' | 'fibonacci' | 'dalembert' | 'fraccionFija';

const FIBONACCI_SEQ = [1, 1, 2, 3, 5, 8, 13, 21, 34, 55];

const ESTRATEGIAS_INFO: { id: EstrategiaApuesta; labelKey: string; blurbKey: string; color: string }[] = [
  { id: 'martingala', labelKey: 'martingalas.estrategia.martingala', blurbKey: 'martingalas.estrategia.martingala.resumenCorto', color: '#ef4444' },
  { id: 'fibonacci', labelKey: 'martingalas.estrategia.fibonacci', blurbKey: 'martingalas.estrategia.fibonacci.resumenCorto', color: '#f59e0b' },
  { id: 'dalembert', labelKey: 'martingalas.estrategia.dalembert', blurbKey: 'martingalas.estrategia.dalembert.resumenCorto', color: '#8b5cf6' },
  { id: 'fraccionFija', labelKey: 'martingalas.estrategia.fraccionFija', blurbKey: 'martingalas.estrategia.fraccionFija.resumenCorto', color: '#0ea5e9' },
];

// Cache memoizado para evitar recalcular 320.000 iteraciones cada vez que se abre el modal
let cachedSeriesList: { id: EstrategiaApuesta; labelKey: string; blurbKey: string; color: string; data: number[] }[] | null = null;

function simularUnTrial(estrategia: EstrategiaApuesta, rounds: number, capitalInicial: number, pGanar: number, baseBet: number): number[] {
  const capital: number[] = [capitalInicial];
  let cap = capitalInicial;
  let apuesta = baseBet;
  let fibIndex = 0;
  const fixedFraction = 0.01; // 1% del capital disponible en cada ronda

  for (let i = 0; i < rounds; i++) {
    if (cap <= 0) {
      capital.push(0);
      continue;
    }
    const stake = estrategia === 'fraccionFija' ? Math.max(0.1, cap * fixedFraction) : Math.min(apuesta, cap);
    const gana = Math.random() < pGanar;

    cap = gana ? cap + stake : cap - stake;
    if (cap < 0) cap = 0;

    if (estrategia === 'martingala') {
      apuesta = gana ? baseBet : Math.min(apuesta * 2, baseBet * 64);
    } else if (estrategia === 'fibonacci') {
      fibIndex = gana ? Math.max(0, fibIndex - 2) : Math.min(fibIndex + 1, FIBONACCI_SEQ.length - 1);
      apuesta = baseBet * FIBONACCI_SEQ[fibIndex];
    } else if (estrategia === 'dalembert') {
      apuesta = gana ? Math.max(baseBet, apuesta - baseBet) : apuesta + baseBet;
    }

    capital.push(cap);
  }
  return capital;
}

/**
 * Monte Carlo: promedia `trials` trayectorias independientes para aproximar el capital
 * esperado ronda a ronda. Con suficientes trials converge a la expectativa real.
 */
export function simularEstrategia(
  estrategia: EstrategiaApuesta,
  rounds: number = 40,
  trials: number = 2000,
  capitalInicial: number = 100,
  pGanar: number = 18 / 37,
  baseBet: number = 1
): number[] {
  const acumulado = new Array(rounds + 1).fill(0);
  for (let tr = 0; tr < trials; tr++) {
    const trial = simularUnTrial(estrategia, rounds, capitalInicial, pGanar, baseBet);
    for (let i = 0; i <= rounds; i++) acumulado[i] += trial[i];
  }
  return acumulado.map(v => v / trials);
}

function renderMartingalasChart(container: HTMLElement, seriesList: { labelKey: string; blurbKey: string; color: string; data: number[] }[]) {
  const rounds = seriesList[0]?.data.length ? seriesList[0].data.length - 1 : 0;
  const allValues = seriesList.flatMap(s => s.data);
  const minY = Math.min(0, ...allValues);
  const maxY = Math.max(...allValues, 100);

  const svgWidth = 800;
  const svgHeight = 420;
  const marginTop = 20;
  const marginBottom = 30;
  const marginLeft = 55;
  const marginRight = 130;
  const chartW = svgWidth - marginLeft - marginRight;
  const chartH = svgHeight - marginTop - marginBottom;

  const scaleX = (x: number) => marginLeft + (x / Math.max(1, rounds)) * chartW;
  const scaleY = (y: number) => marginTop + chartH - ((y - minY) / Math.max(1, maxY - minY)) * chartH;

  let yTicksHTML = '';
  const ySteps = 4;
  for (let i = 0; i <= ySteps; i++) {
    const val = Math.round(minY + (i / ySteps) * (maxY - minY));
    const yPos = scaleY(val);
    yTicksHTML += `<line x1="${marginLeft}" y1="${yPos.toFixed(1)}" x2="${svgWidth - marginRight}" y2="${yPos.toFixed(1)}" stroke="#f1f5f9" stroke-width="1" stroke-dasharray="4" /><text x="${(marginLeft - 8).toFixed(1)}" y="${(yPos + 4).toFixed(1)}" font-size="11" fill="#64748b" text-anchor="end">${val}€</text>`;
  }

  // Línea de referencia del capital inicial (100)
  const initialCapY = scaleY(100);
  const initialLineHTML = `
    <line x1="${marginLeft}" y1="${initialCapY.toFixed(1)}" x2="${svgWidth - marginRight}" y2="${initialCapY.toFixed(1)}" stroke="#94a3b8" stroke-width="1" stroke-dasharray="2,2" />
    <text x="${(marginLeft + 4).toFixed(1)}" y="${(initialCapY - 6).toFixed(1)}" font-size="10" fill="#94a3b8" text-anchor="start">Capital inicial (100€)</text>
  `;

  const linesHTML = seriesList.map(s => {
    const pts = s.data.map((v, i) => `${scaleX(i).toFixed(1)},${scaleY(v).toFixed(1)}`).join(' ');
    return `<polyline points="${pts}" fill="none" stroke="${s.color}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" />`;
  }).join('');

  // Etiqueta al final de cada línea (nombre + capital final), con separación mínima para que no se solapen
  const minGap = 15;
  const endPoints = seriesList.map(s => {
    const finalValue = s.data[s.data.length - 1];
    return { label: t(s.labelKey), color: s.color, y: scaleY(finalValue), value: finalValue };
  }).sort((a, b) => a.y - b.y);
  for (let i = 1; i < endPoints.length; i++) {
    if (endPoints[i].y - endPoints[i - 1].y < minGap) {
      endPoints[i].y = endPoints[i - 1].y + minGap;
    }
  }
  const endLabelsHTML = endPoints.map(p => `<text x="${(svgWidth - marginRight + 8).toFixed(1)}" y="${(p.y + 4).toFixed(1)}" font-size="11.5" font-weight="700" fill="${p.color}">${p.label}: ${p.value.toFixed(0)}€</text>`).join('');

  const axesHTML = `
    <line x1="${marginLeft}" y1="${marginTop}" x2="${marginLeft}" y2="${marginTop + chartH}" stroke="#cbd5e1" stroke-width="1.5" />
    <line x1="${marginLeft}" y1="${(marginTop + chartH).toFixed(1)}" x2="${svgWidth - marginRight}" y2="${(marginTop + chartH).toFixed(1)}" stroke="#cbd5e1" stroke-width="1.5" />
  `;

  const legendHTML = seriesList.map(s => `
    <div style="display:flex; flex-direction:column; gap:2px; min-width: 150px;">
      <div style="display:flex; align-items:center; gap:6px; font-size:0.82rem; color:#334155; font-weight:600;">
        <span style="width:14px; height:3px; background:${s.color}; display:inline-block; border-radius:2px;"></span>
        <span>${t(s.labelKey)}</span>
      </div>
      <div style="font-size: 0.72rem; color: #94a3b8; margin-left: 20px;">${t(s.blurbKey)}</div>
    </div>
  `).join('');

  container.innerHTML = `
    <div style="width: 100%; overflow-x: auto;">
      <svg viewBox="0 0 ${svgWidth} ${svgHeight}" style="width: 100%; height: auto; max-height: 440px; display: block; background: #ffffff; font-family: system-ui, sans-serif; border-radius: 8px;">
        ${yTicksHTML}
        ${initialLineHTML}
        ${axesHTML}
        ${linesHTML}
        ${endLabelsHTML}
      </svg>
      <div style="display:flex; gap:18px; flex-wrap:wrap; justify-content:center; margin-top:14px; padding: 6px 8px;">
        ${legendHTML}
      </div>
    </div>
  `;
}

/**
 * Panel del modal "Sistemas de Apuestas y Martingalas":
 * Simula 4 sistemas clásicos sobre una apuesta de ventaja negativa fija (tipo ruleta 48,6%)
 * demostrando que ningún sistema de gestión de apuestas cambia la esperanza negativa.
 */
export function renderMartingalasPanel(forceRecalculate: boolean = false) {
  const container = document.getElementById('martingalasChartContainer');
  const summary = document.getElementById('martingalasSummary');
  if (!container) return;

  const rounds = 40;
  const trials = 2000;
  const capitalInicial = 100;
  const pGanar = 18 / 37; // Apuesta equiprobable en ruleta europea (48,64%) con margen de la casa

  if (!cachedSeriesList || forceRecalculate) {
    cachedSeriesList = ESTRATEGIAS_INFO.map(info => ({
      id: info.id,
      labelKey: info.labelKey,
      blurbKey: info.blurbKey,
      color: info.color,
      data: simularEstrategia(info.id, rounds, trials, capitalInicial, pGanar, 1),
    }));
  }

  renderMartingalasChart(container, cachedSeriesList);

  if (summary) {
    summary.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 8px; width: 100%; text-align: left;">
        <div style="font-weight: 700; color: #1e293b; font-size: 0.95rem;">📉 ${t('martingalas.resumenTitulo')}</div>
        <div style="font-size: 0.85rem; color: #475569; line-height: 1.5;">${t('martingalas.resumenTexto')}</div>
        <div style="font-size: 0.8rem; color: #64748b; line-height: 1.4; background: #f8fafc; border-left: 3px solid #cbd5e1; padding: 8px 12px; border-radius: 0 6px 6px 0;">
          💡 <strong>${t('martingalas.notaAxiomaTitulo')}:</strong> ${t('martingalas.notaAxiomaTexto')}
        </div>
        <div style="font-size: 0.78rem; color: #94a3b8; font-style: italic; line-height: 1.4; margin-top: 4px;">
          ⚠️ ${t('martingalas.disclaimer')}
        </div>
      </div>
    `;
  }
}
