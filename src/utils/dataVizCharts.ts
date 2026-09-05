import { Draw } from '../types';
import { GameConfig } from '../../game-configs';
import { t } from './i18n';
import { analizarTodosLosNumeros, calcularGaps, percentilHueco, construirHistogramaGaps } from './gapFilter';
import { construirMatrizPares, rankingPares, rankingTrios } from './coocurrencia';

export interface DataVizChartContext {
  dataLoaded: boolean;
  historicalData: Draw[];
  currentGame: GameConfig;
  vizMode: 'heatmap' | 'ranking' | 'trend' | 'chi' | 'gaps' | 'coocurrencia' | 'rachas';
  selectedGapNumber: number;
  coocurrenciaModo: 'pares' | 'trios';
  vizTarget: 'number' | 'star';
  getFrequencyStats: () => any;
  renderChiSquareCard: () => void;
  renderTrendScatterChart: () => void;
}

export function renderGapHistogramChart(ctx: DataVizChartContext) {
  const container = document.getElementById('frequencyChartContainer');
  const summary = document.getElementById('dataVizSummary');
  if (!container) return;

  if (!ctx.dataLoaded || !ctx.historicalData || ctx.historicalData.length < 30) {
    container.innerHTML = `<div style="color:#666; text-align: center; width: 100%; padding: 40px 10px; font-weight: 500;">⚠️ ${t('dataviz.gaps.sinDatos')}</div>`;
    if (summary) {
      summary.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 4px; width: 100%;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <div style="font-weight: 700; color: #1e293b;">📐 ${t('dataviz.gaps.titulo')}</div>
            <button type="button" class="position-range-info-btn dataviz-info-btn" data-info-key="gaps" title="${t('datavizHelp.gaps.modalTitle')}" aria-label="Información">ℹ️</button>
          </div>
          <div style="font-size: 0.85rem; color: #64748b;">${t('dataviz.gaps.subtitulo')}</div>
        </div>
      `;
    }
    return;
  }

  const numberRange = ctx.currentGame?.numberRange || 49;
  const maxNumbers = ctx.currentGame?.maxNumbers || 6;

  if (ctx.selectedGapNumber < 1 || ctx.selectedGapNumber > numberRange) {
    ctx.selectedGapNumber = 1;
  }

  const num = ctx.selectedGapNumber;
  const { gaps, huecoActual } = calcularGaps(ctx.historicalData, num);
  const percentil = percentilHueco(gaps, huecoActual);
  const p = maxNumbers / numberRange;
  const mediaTeorica = 1 / p;
  const mediaEmpirica = gaps.length > 0 ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 0;
  const histogramData = construirHistogramaGaps(gaps, maxNumbers, numberRange);

  if (summary) {
    let optionsHtml = '';
    for (let i = 1; i <= numberRange; i++) {
      optionsHtml += `<option value="${i}" ${i === num ? 'selected' : ''}>${i}</option>`;
    }

    summary.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 10px; width: 100%;">
        <div style="display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 10px;">
          <div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <div style="font-weight: 700; font-size: 1.05rem; color: #1e293b;">📐 ${t('dataviz.gaps.titulo')}</div>
              <button type="button" class="position-range-info-btn dataviz-info-btn" data-info-key="gaps" title="${t('datavizHelp.gaps.modalTitle')}" aria-label="Información">ℹ️</button>
            </div>
            <div style="font-size: 0.82rem; color: #64748b;">${t('dataviz.gaps.subtitulo')}</div>
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <label for="datavizGapNumberSelect" style="font-weight: 600; font-size: 0.88rem; color: #334155;">${t('dataviz.gaps.seleccionarNumero')}</label>
            <select id="datavizGapNumberSelect" class="modal-filter-select" style="min-width: 80px; padding: 4px 8px; font-weight: bold; border-color: var(--primary);">
              ${optionsHtml}
            </select>
          </div>
        </div>
        <div style="font-size: 0.8rem; color: #64748b; font-style: italic; background: #f8fafc; padding: 8px 12px; border-radius: 8px; border: 1px solid #e2e8f0; line-height: 1.4;">
          ${t('dataviz.gaps.aviso')}
        </div>
      </div>
    `;

    const selectEl = document.getElementById('datavizGapNumberSelect') as HTMLSelectElement;
    if (selectEl) {
      selectEl.addEventListener('change', (e) => {
        ctx.selectedGapNumber = parseInt((e.target as HTMLSelectElement).value, 10);
        renderGapHistogramChart(ctx);
      });
    }
  }

  const svgWidth = 800;
  const svgHeight = 360;
  const marginTop = 30;
  const marginBottom = 60;
  const marginLeft = 55;
  const marginRight = 25;

  const chartW = svgWidth - marginLeft - marginRight;
  const chartH = svgHeight - marginTop - marginBottom;

  const maxVal = Math.max(...histogramData.map(d => Math.max(d.empirico, d.teorico)), 1) * 1.15;

  const nBuckets = histogramData.length;
  const colWidth = chartW / nBuckets;
  const barWidth = Math.max(8, colWidth * 0.55);

  let yTicksHTML = '';
  const ySteps = 4;
  for (let i = 0; i <= ySteps; i++) {
    const val = Math.round((i / ySteps) * maxVal);
    const yPos = marginTop + chartH - (val / maxVal) * chartH;
    yTicksHTML += `
      <line x1="${marginLeft}" y1="${yPos.toFixed(1)}" x2="${(svgWidth - marginRight).toFixed(1)}" y2="${yPos.toFixed(1)}" stroke="#f1f5f9" stroke-width="1" stroke-dasharray="4" />
      <text x="${(marginLeft - 8).toFixed(1)}" y="${(yPos + 4).toFixed(1)}" font-size="11" fill="#64748b" text-anchor="end">${val}</text>
    `;
  }

  let barsHTML = '';
  let linePoints: { x: number; y: number }[] = [];

  histogramData.forEach((row, idx) => {
    const cx = marginLeft + (idx + 0.5) * colWidth;
    const barH = (row.empirico / maxVal) * chartH;
    const barY = marginTop + chartH - barH;
    const barX = cx - barWidth / 2;

    const teoricoY = marginTop + chartH - (row.teorico / maxVal) * chartH;
    linePoints.push({ x: cx, y: teoricoY });

    const tooltipText = `Rango ${row.rangoLabel}: Real = ${row.empirico}, Teórico = ${row.teorico}`;

    barsHTML += `
      <rect x="${barX.toFixed(1)}" y="${barY.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${barH.toFixed(1)}" fill="#3b82f6" rx="3" opacity="0.85">
        <title>${tooltipText}</title>
      </rect>
    `;
  });

  let linePathD = '';
  linePoints.forEach((pt, i) => {
    if (i === 0) {
      linePathD += `M ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`;
    } else {
      linePathD += ` L ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`;
    }
  });

  const lineHTML = `<path d="${linePathD}" fill="none" stroke="#ef4444" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`;

  const pointsHTML = linePoints.map((pt, i) => {
    const row = histogramData[i];
    return `<circle cx="${pt.x.toFixed(1)}" cy="${pt.y.toFixed(1)}" r="4" fill="#ef4444"><title>Rango ${row.rangoLabel}: Teórico = ${row.teorico}</title></circle>`;
  }).join('');

  let xTicksHTML = '';
  histogramData.forEach((row, idx) => {
    const cx = marginLeft + (idx + 0.5) * colWidth;
    xTicksHTML += `<text x="${cx.toFixed(1)}" y="${(svgHeight - 20).toFixed(1)}" font-size="10" fill="#64748b" text-anchor="middle">${row.rangoLabel}</text>`;
  });

  const axesHTML = `
    <line x1="${marginLeft}" y1="${marginTop}" x2="${marginLeft}" y2="${marginTop + chartH}" stroke="#cbd5e1" stroke-width="1.5" />
    <line x1="${marginLeft}" y1="${marginTop + chartH}" x2="${svgWidth - marginRight}" y2="${marginTop + chartH}" stroke="#cbd5e1" stroke-width="1.5" />
  `;

  container.innerHTML = `
    <div id="gapsHistogramContainer" style="padding: 10px; display: flex; flex-direction: column; gap: 16px;">
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px;">
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px; text-align: center;">
          <div style="font-size: 0.78rem; color: #64748b; font-weight: 600; text-transform: uppercase;">${t('dataviz.gaps.huecoActual')}</div>
          <div style="font-size: 1.5rem; font-weight: 800; color: #1e293b; margin-top: 4px;">${huecoActual} <span style="font-size: 0.85rem; font-weight: normal; color: #64748b;">sorteos</span></div>
        </div>
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px; text-align: center;">
          <div style="font-size: 0.78rem; color: #64748b; font-weight: 600; text-transform: uppercase;">${t('dataviz.gaps.percentilActual')}</div>
          <div style="font-size: 1.5rem; font-weight: 800; color: ${percentil >= 90 ? '#dc2626' : '#1e293b'}; margin-top: 4px;">P${percentil}%</div>
        </div>
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px; text-align: center;">
          <div style="font-size: 0.78rem; color: #64748b; font-weight: 600; text-transform: uppercase;">${t('dataviz.gaps.mediaComparada')}</div>
          <div style="font-size: 1.3rem; font-weight: 800; color: #1e293b; margin-top: 4px;">${mediaEmpirica.toFixed(1)} / ${mediaTeorica.toFixed(1)}</div>
        </div>
      </div>

      <div style="display: flex; justify-content: center; gap: 20px; align-items: center; font-size: 0.82rem; color: #475569;">
        <div style="display: flex; align-items: center; gap: 6px;">
          <span style="width: 12px; height: 12px; background-color: #3b82f6; border-radius: 2px;"></span>
          <span>${t('dataviz.gaps.leyendaEmpirico')}</span>
        </div>
        <div style="display: flex; align-items: center; gap: 6px;">
          <span style="width: 16px; height: 3px; background-color: #ef4444; border-radius: 2px;"></span>
          <span>${t('dataviz.gaps.leyendaTeorico')}</span>
        </div>
      </div>

      <div style="width: 100%; overflow-x: auto;">
        <svg viewBox="0 0 ${svgWidth} ${svgHeight}" style="width: 100%; height: auto; max-height: 380px; display: block; background: #ffffff; font-family: system-ui, sans-serif;">
          ${yTicksHTML}
          ${axesHTML}
          ${barsHTML}
          ${lineHTML}
          ${pointsHTML}
          ${xTicksHTML}
        </svg>
      </div>
    </div>
  `;
}

export function renderRachasOverviewChart(ctx: DataVizChartContext) {
  const container = document.getElementById('frequencyChartContainer');
  const summary = document.getElementById('dataVizSummary');
  if (!container) return;

  if (!ctx.dataLoaded || !ctx.historicalData || ctx.historicalData.length < 30) {
    container.innerHTML = `<div style="color:#666; text-align: center; width: 100%; padding: 40px 10px; font-weight: 500;">⚠️ ${t('dataviz.rachas.sinDatos')}</div>`;
    if (summary) {
      summary.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 4px; width: 100%;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <div style="font-weight: 700; color: #1e293b;">🔥 ${t('dataviz.rachas.titulo')}</div>
            <button type="button" class="position-range-info-btn dataviz-info-btn" data-info-key="rachas" title="${t('datavizHelp.rachas.modalTitle')}" aria-label="Información">ℹ️</button>
          </div>
          <div style="font-size: 0.85rem; color: #64748b;">${t('dataviz.rachas.subtitulo')}</div>
        </div>
      `;
    }
    return;
  }

  const numberRange = ctx.currentGame?.numberRange || 49;
  const analisis = analizarTodosLosNumeros(ctx.historicalData, numberRange);
  const ordenado = [...analisis].sort((a, b) => b.huecoActual - a.huecoActual);
  const minGapsRequeridos = 8;

  if (summary) {
    summary.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 4px; width: 100%;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <div style="font-weight: 700; font-size: 1.05rem; color: #1e293b;">🔥 ${t('dataviz.rachas.titulo')}</div>
          <button type="button" class="position-range-info-btn dataviz-info-btn" data-info-key="rachas" title="${t('datavizHelp.rachas.modalTitle')}" aria-label="Información">ℹ️</button>
        </div>
        <div style="font-size: 0.82rem; color: #64748b;">${t('dataviz.rachas.subtitulo')}</div>
      </div>
    `;
  }

  let rowsHtml = '';
  ordenado.forEach((item, idx) => {
    const insuficiente = item.nGaps < minGapsRequeridos;
    let badgeBg = '#f1f5f9';
    let badgeColor = '#334155';
    if (!insuficiente) {
      if (item.percentil >= 90) {
        badgeBg = '#fee2e2';
        badgeColor = '#b91c1c';
      } else if (item.percentil <= 10) {
        badgeBg = '#dcfce7';
        badgeColor = '#15803d';
      }
    }

    rowsHtml += `
      <tr style="border-bottom: 1px solid #f1f5f9; background: ${idx % 2 === 0 ? '#ffffff' : '#fafafa'}; font-size: 0.88rem;">
        <td style="padding: 8px 14px; font-weight: 700; color: #1e293b;">
          <span style="background: var(--primary, #2563eb); color: #fff; padding: 2px 9px; border-radius: 12px; font-size: 0.8rem;">${item.numero}</span>
        </td>
        <td style="padding: 8px 14px; text-align: center; font-weight: 600; color: #334155;">${item.huecoActual}</td>
        <td style="padding: 8px 14px; text-align: center;">
          ${insuficiente
            ? `<span style="background: #f1f5f9; color: #94a3b8; padding: 3px 10px; border-radius: 6px; font-size: 0.78rem; font-style: italic;">${t('dataviz.rachas.insuficiente')}</span>`
            : `<span style="background: ${badgeBg}; color: ${badgeColor}; padding: 3px 10px; border-radius: 6px; font-weight: 700; font-size: 0.85rem;">${item.percentil}%</span>`
          }
        </td>
        <td style="padding: 8px 14px; text-align: center; color: #64748b;">${item.nGaps}</td>
      </tr>
    `;
  });

  container.innerHTML = `
    <div style="display: flex; flex-direction: column; gap: 12px; width: 100%;">
      <div style="overflow-x: auto;">
        <table style="width: 100%; border-collapse: collapse;">
          <thead>
            <tr style="border-bottom: 2px solid #e2e8f0; font-size: 0.78rem; color: #64748b; text-transform: uppercase; text-align: left;">
              <th style="padding: 8px 14px;">${t('dataviz.rachas.colNumero')}</th>
              <th style="padding: 8px 14px; text-align: center;">${t('dataviz.rachas.colHuecoActual')}</th>
              <th style="padding: 8px 14px; text-align: center;">${t('dataviz.rachas.colPercentil')}</th>
              <th style="padding: 8px 14px; text-align: center;">${t('dataviz.rachas.colHuecos')}</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </div>

      <div style="font-size: 0.82rem; color: #64748b; font-style: italic; background: #f8fafc; padding: 10px 14px; border-radius: 8px; border: 1px solid #e2e8f0; line-height: 1.4;">
        ${t('dataviz.rachas.aviso')}
      </div>
    </div>
  `;
}

export function renderCoocurrenciaChart(ctx: DataVizChartContext) {
  const container = document.getElementById('frequencyChartContainer');
  const summary = document.getElementById('dataVizSummary');
  if (!container) return;

  if (!ctx.dataLoaded || !ctx.historicalData || ctx.historicalData.length === 0) {
    container.innerHTML = `<div style="color:#666; text-align: center; width: 100%; padding: 40px 10px; font-weight: 500;">⚠️ ${t('coocurrencia.sinDatos')}</div>`;
    if (summary) {
      summary.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 4px; width: 100%;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <div style="font-weight: 700; color: #1e293b;">🔢 ${t('coocurrencia.titulo')}</div>
            <button type="button" class="position-range-info-btn dataviz-info-btn" data-info-key="coocurrencia" title="${t('datavizHelp.coocurrencia.modalTitle')}" aria-label="Información">ℹ️</button>
          </div>
          <div style="font-size: 0.85rem; color: #64748b;">${t('coocurrencia.subtitulo')}</div>
        </div>
      `;
    }
    return;
  }

  const numberRange = ctx.currentGame?.numberRange || 49;
  const maxNumbers = ctx.currentGame?.maxNumbers || 6;

  if (maxNumbers < 3 && ctx.coocurrenciaModo === 'trios') {
    ctx.coocurrenciaModo = 'pares';
  }

  if (summary) {
    const triosDisabled = maxNumbers < 3;
    summary.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 10px; width: 100%;">
        <div style="display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 10px;">
          <div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <div style="font-weight: 700; font-size: 1.05rem; color: #1e293b;">🔢 ${t('coocurrencia.titulo')}</div>
              <button type="button" class="position-range-info-btn dataviz-info-btn" data-info-key="coocurrencia" title="${t('datavizHelp.coocurrencia.modalTitle')}" aria-label="Información">ℹ️</button>
            </div>
            <div style="font-size: 0.82rem; color: #64748b;">${t('coocurrencia.subtitulo')}</div>
          </div>
          <div style="display: flex; align-items: center; gap: 6px; background: #f1f5f9; padding: 4px; border-radius: 8px;">
            <button id="coocurrenciaModeParesBtn" type="button" class="modal-toggle-btn ${ctx.coocurrenciaModo === 'pares' ? 'active' : ''}" style="padding: 4px 12px; font-size: 0.85rem;">
              ${t('coocurrencia.modoPares')}
            </button>
            <button id="coocurrenciaModeTriosBtn" type="button" class="modal-toggle-btn ${ctx.coocurrenciaModo === 'trios' ? 'active' : ''}" ${triosDisabled ? 'disabled style="opacity: 0.5; cursor: not-allowed; padding: 4px 12px; font-size: 0.85rem;"' : 'style="padding: 4px 12px; font-size: 0.85rem;"'} title="${triosDisabled ? t('coocurrencia.triosNoDisponible') : ''}">
              ${t('coocurrencia.modoTrios')}
            </button>
          </div>
        </div>
      </div>
    `;

    document.getElementById('coocurrenciaModeParesBtn')?.addEventListener('click', () => {
      ctx.coocurrenciaModo = 'pares';
      renderCoocurrenciaChart(ctx);
    });

    document.getElementById('coocurrenciaModeTriosBtn')?.addEventListener('click', () => {
      if (!triosDisabled) {
        ctx.coocurrenciaModo = 'trios';
        renderCoocurrenciaChart(ctx);
      }
    });
  }

  let rowsHtml = '';
  let isTriosLimited = false;

  if (ctx.coocurrenciaModo === 'pares') {
    const matriz = construirMatrizPares(ctx.historicalData, numberRange);
    const pares = rankingPares(matriz, ctx.historicalData.length, maxNumbers, numberRange, 20);

    pares.forEach((p, idx) => {
      let ratioBg = '#f1f5f9';
      let ratioColor = '#334155';
      if (p.ratio > 1.15) {
        ratioBg = '#dcfce7';
        ratioColor = '#15803d';
      } else if (p.ratio < 0.85) {
        ratioBg = '#fee2e2';
        ratioColor = '#b91c1c';
      }

      rowsHtml += `
        <tr style="border-bottom: 1px solid #f1f5f9; background: ${idx % 2 === 0 ? '#ffffff' : '#fafafa'}; font-size: 0.88rem;">
          <td style="padding: 10px 14px; font-weight: 700; color: #1e293b;">
            <span style="display: inline-flex; gap: 6px; align-items: center;">
              <span style="background: var(--primary, #2563eb); color: #fff; padding: 2px 8px; border-radius: 12px; font-size: 0.8rem;">${p.a}</span>
              <span style="color: #94a3b8;">+</span>
              <span style="background: var(--primary, #2563eb); color: #fff; padding: 2px 8px; border-radius: 12px; font-size: 0.8rem;">${p.b}</span>
            </span>
          </td>
          <td style="padding: 10px 14px; text-align: center; font-weight: 600; color: #334155;">${p.count}</td>
          <td style="padding: 10px 14px; text-align: center; color: #475569;">${p.pctSobreSorteos}%</td>
          <td style="padding: 10px 14px; text-align: center; color: #64748b;">${p.esperado}</td>
          <td style="padding: 10px 14px; text-align: center;">
            <span style="background: ${ratioBg}; color: ${ratioColor}; padding: 3px 10px; border-radius: 6px; font-weight: 700; font-size: 0.85rem;">
              ${p.ratio.toFixed(2)}x
            </span>
          </td>
        </tr>
      `;
    });
  } else {
    if (ctx.historicalData.length > 2000) {
      isTriosLimited = true;
    }
    const trios = rankingTrios(ctx.historicalData, maxNumbers, numberRange, 20);

    trios.forEach((tItem, idx) => {
      let ratioBg = '#f1f5f9';
      let ratioColor = '#334155';
      if (tItem.ratio > 1.15) {
        ratioBg = '#dcfce7';
        ratioColor = '#15803d';
      } else if (tItem.ratio < 0.85) {
        ratioBg = '#fee2e2';
        ratioColor = '#b91c1c';
      }

      rowsHtml += `
        <tr style="border-bottom: 1px solid #f1f5f9; background: ${idx % 2 === 0 ? '#ffffff' : '#fafafa'}; font-size: 0.88rem;">
          <td style="padding: 10px 14px; font-weight: 700; color: #1e293b;">
            <span style="display: inline-flex; gap: 6px; align-items: center;">
              <span style="background: #0d9488; color: #fff; padding: 2px 8px; border-radius: 12px; font-size: 0.8rem;">${tItem.a}</span>
              <span style="color: #94a3b8;">+</span>
              <span style="background: #0d9488; color: #fff; padding: 2px 8px; border-radius: 12px; font-size: 0.8rem;">${tItem.b}</span>
              <span style="color: #94a3b8;">+</span>
              <span style="background: #0d9488; color: #fff; padding: 2px 8px; border-radius: 12px; font-size: 0.8rem;">${tItem.c}</span>
            </span>
          </td>
          <td style="padding: 10px 14px; text-align: center; font-weight: 600; color: #334155;">${tItem.count}</td>
          <td style="padding: 10px 14px; text-align: center; color: #475569;">${tItem.pctSobreSorteos}%</td>
          <td style="padding: 10px 14px; text-align: center; color: #64748b;">${tItem.esperado}</td>
          <td style="padding: 10px 14px; text-align: center;">
            <span style="background: ${ratioBg}; color: ${ratioColor}; padding: 3px 10px; border-radius: 6px; font-weight: 700; font-size: 0.85rem;">
              ${tItem.ratio.toFixed(2)}x
            </span>
          </td>
        </tr>
      `;
    });
  }

  container.innerHTML = `
    <div id="coocurrenciaContainer" style="padding: 10px; display: flex; flex-direction: column; gap: 16px;">
      ${isTriosLimited ? `
        <div style="font-size: 0.8rem; color: #b45309; background: #fffbeb; border: 1px solid #fde68a; padding: 8px 12px; border-radius: 8px; font-weight: 500;">
          ℹ️ ${t('coocurrencia.limiteTrios')}
        </div>
      ` : ''}

      <div style="width: 100%; overflow-x: auto; border: 1px solid #e2e8f0; border-radius: 10px; background: #ffffff;">
        <table style="width: 100%; border-collapse: collapse; text-align: left;">
          <thead>
            <tr style="background: #f8fafc; border-bottom: 2px solid #e2e8f0; font-size: 0.8rem; text-transform: uppercase; color: #64748b;">
              <th style="padding: 12px 14px;">${t('coocurrencia.colNumeros')}</th>
              <th style="padding: 12px 14px; text-align: center;">${t('coocurrencia.colVeces')}</th>
              <th style="padding: 12px 14px; text-align: center;">${t('coocurrencia.colPct')}</th>
              <th style="padding: 12px 14px; text-align: center;">${t('coocurrencia.colEsperado')}</th>
              <th style="padding: 12px 14px; text-align: center;">${t('coocurrencia.colRatio')}</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </div>

      <div style="font-size: 0.82rem; color: #64748b; font-style: italic; background: #f8fafc; padding: 10px 14px; border-radius: 8px; border: 1px solid #e2e8f0; line-height: 1.4;">
        ${t('coocurrencia.aviso')}
      </div>
    </div>
  `;
}

export function renderFrequencyChart(ctx: DataVizChartContext) {
  const container = document.getElementById('frequencyChartContainer');
  const summary = document.getElementById('dataVizSummary');
  const targetSelectorContainer = document.getElementById('vizTargetSelectorContainer');
  const gapsBtn = document.getElementById('vizModeGapsBtn');
  const coocurrenciaBtn = document.getElementById('vizModeCoocurrenciaBtn');
  const rachasBtn = document.getElementById('vizModeRachasBtn');

  if (gapsBtn) {
    gapsBtn.style.display = ctx.currentGame?.id === 'nacional' ? 'none' : '';
  }
  if (coocurrenciaBtn) {
    coocurrenciaBtn.style.display = ctx.currentGame?.id === 'nacional' ? 'none' : '';
  }
  if (rachasBtn) {
    rachasBtn.style.display = ctx.currentGame?.id === 'nacional' ? 'none' : '';
  }

  if (ctx.currentGame?.id === 'nacional' && (ctx.vizMode === 'gaps' || ctx.vizMode === 'coocurrencia' || ctx.vizMode === 'rachas')) {
    ctx.vizMode = 'heatmap';
    const heatmapBtn = document.getElementById('vizModeHeatmapBtn');
    if (heatmapBtn) heatmapBtn.classList.add('active');
    if (gapsBtn) gapsBtn.classList.remove('active');
    if (coocurrenciaBtn) coocurrenciaBtn.classList.remove('active');
    if (rachasBtn) rachasBtn.classList.remove('active');
  }

  if (!container) return;
  container.innerHTML = '';

  if (!ctx.dataLoaded || ctx.historicalData.length === 0) {
      container.innerHTML = `<div style="color:#666; text-align: center; width: 100%; padding-top: 50px;">${t('dataviz.cargaGrafico')}</div>`;
      if (summary) {
          summary.innerHTML = `<div style="color:#666; text-align: center; width: 100%;">${t('dataviz.cargaResumen')}</div>`;
      }
      return;
  }

  if (ctx.vizMode === 'gaps') {
    if (targetSelectorContainer) targetSelectorContainer.style.display = 'none';
    renderGapHistogramChart(ctx);
    return;
  }

  if (ctx.vizMode === 'coocurrencia') {
    if (targetSelectorContainer) targetSelectorContainer.style.display = 'none';
    renderCoocurrenciaChart(ctx);
    return;
  }

  if (ctx.vizMode === 'rachas') {
    if (targetSelectorContainer) targetSelectorContainer.style.display = 'none';
    renderRachasOverviewChart(ctx);
    return;
  }

  if (ctx.vizMode === 'trend') {
    if (targetSelectorContainer) targetSelectorContainer.style.display = 'none';
    ctx.renderTrendScatterChart();
    return;
  }

  if (ctx.vizMode === 'chi') {
    if (ctx.currentGame.maxStars > 0 && targetSelectorContainer) {
      targetSelectorContainer.style.display = 'flex';
    }
    ctx.renderChiSquareCard();
    return;
  }

  // Toggle target selector visibility and update star option text
  if (ctx.currentGame.maxStars > 0) {
      if (targetSelectorContainer) targetSelectorContainer.style.display = 'flex';
      const select = document.getElementById('vizTargetSelect') as HTMLSelectElement;
      if (select) {
          const starOption = select.querySelector('option[value="star"]') as HTMLOptionElement;
          if (starOption) {
              if (ctx.currentGame.id === 'gordo') {
                  starOption.textContent = t('dataviz.estrellaLabel.gordo');
              } else if (ctx.currentGame.id === 'eurodreams') {
                  starOption.textContent = t('dataviz.estrellaLabel.eurodreams');
              } else if (ctx.currentGame.id === 'powerball') {
                  starOption.textContent = t('dataviz.estrellaLabel.powerball');
              } else if (ctx.currentGame.id === 'megamillions') {
                  starOption.textContent = t('dataviz.estrellaLabel.megamillions');
              } else {
                  starOption.textContent = t('dataviz.estrellaLabel.generico');
              }
          }
      }
  } else {
      if (targetSelectorContainer) targetSelectorContainer.style.display = 'none';
      ctx.vizTarget = 'number';
      const select = document.getElementById('vizTargetSelect') as HTMLSelectElement;
      if (select) select.value = 'number';
  }

  const { N, activeFreqs, minKey, maxKey, mean, sd, isNacional, isGordo } = ctx.getFrequencyStats();

  // Calculate min/max actual frequencies
  let maxActualFreq = -1;
  let minActualFreq = Infinity;
  const maxFreqNum: number[] = [];
  const minFreqNum: number[] = [];

  Object.entries(activeFreqs).forEach(([keyStr, freq]: [string, any]) => {
      if (freq > maxActualFreq) maxActualFreq = freq;
      if (freq < minActualFreq) minActualFreq = freq;
  });

  Object.entries(activeFreqs).forEach(([keyStr, freq]: [string, any]) => {
      const key = parseInt(keyStr);
      if (freq === maxActualFreq) maxFreqNum.push(key);
      if (freq === minActualFreq) minFreqNum.push(key);
  });

  const formatKey = (key: number) => {
      if (isNacional) {
          const colIdx = Math.floor(key / 10);
          const digit = key % 10;
          const columnsLabels = [
              t('dataviz.cifraCorta.1'),
              t('dataviz.cifraCorta.2'),
              t('dataviz.cifraCorta.3'),
              t('dataviz.cifraCorta.4'),
              t('dataviz.cifraCorta.5')
          ];
          return `${columnsLabels[colIdx - 1]} (${digit})`;
      }
      if (ctx.vizTarget === 'star') {
          return isGordo ? `🔑 C${key}` : `★${key}`;
      }
      return `${key}`;
  };

  const maxFreqStr = maxFreqNum.map(formatKey).join(', ');
  const minFreqStr = minFreqNum.map(formatKey).join(', ');

  if (summary) {
      const modeKey = ctx.vizMode === 'heatmap' ? 'heatmap' : 'ranking';
      const modeTitle = ctx.vizMode === 'heatmap' ? '🗺️ ' + t('dataviz.modoMapaCalor') : '📊 ' + t('dataviz.modoRanking');
      summary.innerHTML = `
          <div style="display: flex; flex-direction: column; gap: 8px; width: 100%;">
              <div style="display: flex; justify-content: space-between; align-items: center; width: 100%; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px;">
                  <div style="display: flex; align-items: center; gap: 8px;">
                      <span style="font-weight: 700; font-size: 1.05rem; color: #1e293b;">${modeTitle}</span>
                      <button type="button" class="position-range-info-btn dataviz-info-btn" data-info-key="${modeKey}" title="${t('datavizHelp.' + modeKey + '.modalTitle')}" aria-label="Información">ℹ️</button>
                  </div>
                  <div style="font-size: 0.85rem; color: #64748b;">
                      ${t('dataviz.analizar')}: <strong>${ctx.vizTarget === 'star' ? t('dataviz.estrellasGenerico') : t('dataviz.numerosPrincipales')}</strong> | ${t('dataviz.nSorteos', { n: N })}
                  </div>
              </div>
              <div style="display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 10px; width: 100%;">
                  <div style="flex: 1; min-width: 220px;">
                      🔥 <strong>${t('dataviz.masFrecuente')}</strong> <span style="color: #ef4444; font-weight: bold;">${maxFreqStr}</span> (${t('backtest.economico.vecesCount', { count: maxActualFreq })})
                  </div>
                  <div style="flex: 1; min-width: 220px;">
                      ❄️ <strong>${t('dataviz.menosFrecuente')}</strong> <span style="color: #3b82f6; font-weight: bold;">${minFreqStr}</span> (${t('backtest.economico.vecesCount', { count: minActualFreq })})
                  </div>
                  <div style="flex: 1; min-width: 250px; text-align: right;" class="mean-indicator">
                      📈 <strong>${t('dataviz.mediaEsperada')}</strong> <span style="color: #10b981; font-weight: bold;">${mean.toFixed(2)}</span>
                      <span style="color: #64748b; font-size: 0.85rem; margin-left: 5px;">${t('dataviz.desviacionEst', { sd: sd.toFixed(2) })}</span>
                  </div>
              </div>
          </div>
      `;
  }

  if (ctx.vizMode === 'heatmap') {
      if (isNacional) {
          const columnsLabels = [
              t('dataviz.cifraLarga.1'),
              t('dataviz.cifraLarga.2'),
              t('dataviz.cifraLarga.3'),
              t('dataviz.cifraLarga.4'),
              t('dataviz.cifraLarga.5')
          ];
          
          let html = `<div style="display: flex; flex-direction: column; gap: 20px; width: 100%;">`;
          
          for (let colIdx = 0; colIdx < 5; colIdx++) {
              html += `
                  <div>
                      <div style="font-size: 0.85rem; font-weight: bold; color: #475569; margin-bottom: 8px; border-left: 3px solid var(--primary); padding-left: 8px;">
                          ${columnsLabels[colIdx]}
                      </div>
                      <div style="display: grid; grid-template-columns: repeat(10, 1fr); gap: 6px;">
              `;
              
              for (let digit = 0; digit < 10; digit++) {
                  const key = (colIdx + 1) * 10 + digit;
                  const freq = activeFreqs[key] || 0;
                  
                  const z = sd > 0 ? (freq - mean) / sd : 0;
                  const ratio = Math.min(Math.abs(z) / 2.5, 1.0);
                  let bg = 'rgba(226, 232, 240, 0.4)';
                  let color = 'var(--dark)';
                  let border = '1px solid #cbd5e1';
                  
                  if (z > 0.2) {
                      bg = `rgba(239, 68, 68, ${0.1 + 0.7 * ratio})`;
                      color = ratio > 0.6 ? '#ffffff' : '#991b1b';
                      border = `1px solid rgba(220, 38, 38, ${0.2 + 0.8 * ratio})`;
                  } else if (z < -0.2) {
                      bg = `rgba(59, 130, 246, ${0.1 + 0.7 * ratio})`;
                      color = ratio > 0.6 ? '#ffffff' : '#1e3a8a';
                      border = `1px solid rgba(37, 99, 235, ${0.2 + 0.8 * ratio})`;
                  }
                  
                  html += `
                      <div style="background: ${bg}; color: ${color}; border: ${border}; border-radius: 8px; padding: 10px 4px; text-align: center; display: flex; flex-direction: column; gap: 4px; justify-content: center; align-items: center; min-height: 55px;" title="${t('dataviz.tooltipCifra', { digit, freq, z: z.toFixed(2) })}">
                          <span style="font-size: 1.1rem; font-weight: bold;">${digit}</span>
                          <span style="font-size: 0.7rem; font-weight: 500; opacity: 0.95;">${t('dataviz.freqAbbrev', { freq })}</span>
                      </div>
                  `;
              }
              
              html += `
                      </div>
                  </div>
              `;
          }
          
          html += `</div>`;
          container.innerHTML = html;
      } else {
          const starCols = isGordo ? 10 : Math.min(ctx.currentGame.starRange, 6);
          const gridCols = ctx.vizTarget === 'star' ? starCols : ctx.currentGame.gridCols;
          let html = `
              <div style="display: grid; grid-template-columns: repeat(${gridCols}, 1fr); gap: 8px; width: 100%;">
          `;
          
          for (let i = minKey; i <= maxKey; i++) {
              const freq = activeFreqs[i] || 0;
              const z = sd > 0 ? (freq - mean) / sd : 0;
              const ratio = Math.min(Math.abs(z) / 2.5, 1.0);
              let bg = 'rgba(226, 232, 240, 0.4)';
              let color = 'var(--dark)';
              let border = '1px solid #cbd5e1';
              
              if (z > 0.2) {
                  bg = `rgba(239, 68, 68, ${0.1 + 0.7 * ratio})`;
                  color = ratio > 0.6 ? '#ffffff' : '#991b1b';
                  border = `1px solid rgba(220, 38, 38, ${0.2 + 0.8 * ratio})`;
              } else if (z < -0.2) {
                  bg = `rgba(59, 130, 246, ${0.1 + 0.7 * ratio})`;
                  color = ratio > 0.6 ? '#ffffff' : '#1e3a8a';
                  border = `1px solid rgba(37, 99, 235, ${0.2 + 0.8 * ratio})`;
              }
              
              const labelStr = ctx.vizTarget === 'star' ? (isGordo ? `🔑 ${i}` : `★${i}`) : `${i}`;
              const titleTypeName = ctx.vizTarget === 'star' ? (isGordo ? t('dataviz.tipoClave') : t('dataviz.tipoEstrella')) : t('dataviz.tipoNumero');
              
              html += `
                  <div style="background: ${bg}; color: ${color}; border: ${border}; border-radius: 8px; padding: 10px 4px; text-align: center; display: flex; flex-direction: column; gap: 4px; justify-content: center; align-items: center; min-height: 55px;" title="${t('dataviz.tooltipGenerico', { tipo: titleTypeName, i, freq, z: z.toFixed(2) })}">
                      <span style="font-size: 1.1rem; font-weight: bold;">${labelStr}</span>
                      <span style="font-size: 0.7rem; font-weight: 500; opacity: 0.95;">${t('dataviz.freqAbbrev', { freq })}</span>
                  </div>
              `;
          }
          
          html += `</div>`;
          
          html += `
              <div style="display: flex; justify-content: center; gap: 20px; margin-top: 20px; padding-top: 15px; border-top: 1px solid #f1f5f9; font-size: 0.8rem; color: #64748b; flex-wrap: wrap;">
                  <div style="display: flex; align-items: center; gap: 6px;">
                      <div style="width: 14px; height: 14px; background: rgba(59, 130, 246, 0.4); border: 1px solid rgba(37, 99, 235, 0.4); border-radius: 3px;"></div>
                      <span>${t('dataviz.leyendaFrio')}</span>
                  </div>
                  <div style="display: flex; align-items: center; gap: 6px;">
                      <div style="width: 14px; height: 14px; background: rgba(226, 232, 240, 0.4); border: 1px solid #cbd5e1; border-radius: 3px;"></div>
                      <span>${t('dataviz.leyendaNeutro')}</span>
                  </div>
                  <div style="display: flex; align-items: center; gap: 6px;">
                      <div style="width: 14px; height: 14px; background: rgba(239, 68, 68, 0.4); border: 1px solid rgba(220, 38, 38, 0.4); border-radius: 3px;"></div>
                      <span>${t('dataviz.leyendaCaliente')}</span>
                  </div>
              </div>
          `;
          
          container.innerHTML = html;
      }
  } else {
      // Ranking View
      const sortedItems = Object.entries(activeFreqs)
          .map(([keyStr, freq]: [string, any]) => ({ key: parseInt(keyStr), freq }))
          .sort((a, b) => b.freq - a.freq);
          
      const maxFreqAcrossAll = Math.max(...Object.values(activeFreqs).map((f: any) => Number(f)), 1);
      const showMeanLine = mean > 0 && maxFreqAcrossAll > 0 && mean <= maxFreqAcrossAll;
      const meanLeftPercent = showMeanLine ? (mean / maxFreqAcrossAll * 80).toFixed(2) : '0';
      
      let html = `
          <div style="position: relative; padding: 25px 0 10px 0; width: 100%;">
              ${showMeanLine ? `
              <!-- Contenedor alineado con las barras de progreso (offset de 125px a la izquierda) -->
              <div style="position: absolute; top: 25px; bottom: 10px; left: 125px; right: 0; pointer-events: none; z-index: 10;">
                  <!-- Línea vertical para la Media Esperada dentro del contenedor alineado -->
                  <div style="position: absolute; top: 0; bottom: 0; left: ${meanLeftPercent}%; border-left: 2px dashed #10b981; height: 100%;">
                      <span style="position: absolute; top: -20px; transform: translateX(-50%); font-size: 0.7rem; font-weight: bold; color: #10b981; background: #ffffff; padding: 0 4px; border-radius: 4px; border: 1px solid #10b981; white-space: nowrap;">${t('dataviz.mediaLinea', { mean: mean.toFixed(1) })}</span>
                  </div>
              </div>
              ` : ''}
              
              <div style="display: flex; flex-direction: column; gap: 10px; position: relative; z-index: 1;">
      `;
      
      sortedItems.forEach((item, index) => {
          const barWidth = (item.freq / maxFreqAcrossAll) * 80; // keep some room at the right for label
          const formatted = formatKey(item.key);
          
          let barColor = 'linear-gradient(to right, #64748b, #94a3b8)';
          if (item.freq > mean + sd) {
              barColor = 'linear-gradient(to right, #ef4444, #f87171)';
          } else if (item.freq < mean - sd) {
              barColor = 'linear-gradient(to right, #3b82f6, #60a5fa)';
          }
          
          html += `
              <div style="display: flex; align-items: center; gap: 10px; position: relative;">
                  <div style="width: 30px; font-size: 0.8rem; font-weight: bold; color: #94a3b8; text-align: right;">#${index + 1}</div>
                  <div style="width: 75px; font-size: 0.8rem; font-weight: bold; color: var(--dark); text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${formatted}">${formatted}</div>
                  <div style="flex: 1; height: 26px; background: #f1f5f9; border-radius: 6px; overflow: hidden; position: relative; display: flex; align-items: center;">
                      <div style="width: ${barWidth}%; height: 100%; background: ${barColor}; border-radius: 6px 0 0 6px; transition: width 0.5s ease-out;"></div>
                      <span style="position: absolute; left: 8px; font-size: 0.8rem; font-weight: 700; color: ${barWidth > 12 ? '#ffffff' : 'var(--dark)'}; text-shadow: ${barWidth > 12 ? '0 1px 2px rgba(0,0,0,0.4)' : 'none'};">${t('backtest.economico.vecesCount', { count: item.freq })}</span>
                  </div>
              </div>
          `;
      });
      
      html += `
              </div>
          </div>
      `;
      container.innerHTML = html;
  }
}
