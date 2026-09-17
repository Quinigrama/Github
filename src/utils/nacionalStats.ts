import { t } from './i18n';
import { Draw } from '../types';

export interface NacionalHistoricalStats {
  totalDraws: number;
  reintegrosFreq: { digit: number; count: number; percentage: number; drawsSince: number }[];
  top2Endings: { ending: string; count: number; percentage: number }[];
  evenOddRatio: { even: number; odd: number };
  consecutiveEndingsRate: number;
}

/**
 * Calcula las estadísticas históricas de terminaciones (0-9) y últimas dos cifras (00-99)
 * para los sorteos de Lotería Nacional cargados.
 */
export function calculateNacionalHistoricalStats(historicalData: Draw[]): NacionalHistoricalStats | null {
  if (!historicalData || historicalData.length === 0) return null;

  const total = historicalData.length;
  const reintegroCounts = Array(10).fill(0);
  const lastSeenReintegro = Array(10).fill(-1);
  const twoDigitCounts = new Map<string, number>();

  let evenCount = 0;
  let oddCount = 0;
  let consecutiveDrawsCount = 0;
  let previousReintegro: number | null = null;

  historicalData.forEach((draw, idx) => {
    // Para Lotería Nacional, el número premiado se codifica como [10+d1, 20+d2, 30+d3, 40+d4, 50+d5]
    if (!draw.numbers || draw.numbers.length < 5) return;
    const d4 = draw.numbers[3] % 10;
    const d5 = draw.numbers[4] % 10; // Reintegro de las unidades

    reintegroCounts[d5]++;
    lastSeenReintegro[d5] = idx;

    if (d5 % 2 === 0) evenCount++;
    else oddCount++;

    if (previousReintegro !== null && Math.abs(d5 - previousReintegro) === 1) {
      consecutiveDrawsCount++;
    }
    previousReintegro = d5;

    const twoDigitStr = `${d4}${d5}`;
    twoDigitCounts.set(twoDigitStr, (twoDigitCounts.get(twoDigitStr) || 0) + 1);
  });

  const reintegrosFreq = Array.from({ length: 10 }, (_, d) => {
    const drawsSince = lastSeenReintegro[d] === -1 ? total : (total - 1) - lastSeenReintegro[d];
    return {
      digit: d,
      count: reintegroCounts[d],
      percentage: total > 0 ? (reintegroCounts[d] / total) * 100 : 0,
      drawsSince
    };
  });

  const top2Endings = Array.from(twoDigitCounts.entries())
    .map(([ending, count]) => ({
      ending,
      count,
      percentage: total > 0 ? (count / total) * 100 : 0
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    totalDraws: total,
    reintegrosFreq,
    top2Endings,
    evenOddRatio: {
      even: total > 0 ? (evenCount / total) * 100 : 50,
      odd: total > 0 ? (oddCount / total) * 100 : 50
    },
    consecutiveEndingsRate: total > 1 ? (consecutiveDrawsCount / (total - 1)) * 100 : 0
  };
}

/**
 * Genera el HTML para el panel estadístico especializado de Lotería Nacional
 */
export function renderNacionalStatsHtml(stats: NacionalHistoricalStats): string {
  // Ordenar los reintegros de mayor a menor frecuencia
  const sortedReintegros = [...stats.reintegrosFreq].sort((a, b) => b.count - a.count);
  const maxFreq = Math.max(...sortedReintegros.map(r => r.count), 1);

  const reintegrosCardsHtml = sortedReintegros.map((r, rank) => {
    const barWidth = Math.max(8, Math.round((r.count / maxFreq) * 100));
    const isHot = rank < 3;
    const isCold = rank >= 7;
    const badgeColor = isHot ? '#ef4444' : (isCold ? '#3b82f6' : '#64748b');
    const badgeBg = isHot ? '#fee2e2' : (isCold ? '#dbeafe' : '#f1f5f9');
    const badgeLabel = isHot ? '🔥 Top' : (isCold ? '❄️ Frío' : 'Neutro');

    return `
      <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px 10px; display: flex; flex-direction: column; gap: 4px; box-shadow: 0 1px 2px rgba(0,0,0,0.03);">
        <div style="display: flex; align-items: center; justify-content: space-between;">
          <div style="display: flex; align-items: center; gap: 6px;">
            <span style="font-size: 1.1rem; font-weight: 800; color: #1e3a8a; background: #eff6ff; width: 26px; height: 26px; display: inline-flex; align-items: center; justify-content: center; border-radius: 50%;">
              ${r.digit}
            </span>
            <span style="font-size: 0.7rem; font-weight: 700; color: ${badgeColor}; background: ${badgeBg}; padding: 1px 6px; border-radius: 9999px;">
              ${badgeLabel}
            </span>
          </div>
          <span style="font-size: 0.85rem; font-weight: 700; color: #0f172a;">${r.percentage.toFixed(1)}%</span>
        </div>
        <div style="background: #f1f5f9; border-radius: 4px; height: 6px; overflow: hidden; margin-top: 2px;">
          <div style="background: ${isHot ? '#ef4444' : (isCold ? '#3b82f6' : '#6366f1')}; height: 100%; width: ${barWidth}%;"></div>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 0.7rem; color: #64748b; margin-top: 2px;">
          <span>${r.count} ${t('stats.apariciones') || 'apariciones'}</span>
          <span>${r.drawsSince} s. ${t('stats.sinSalir') || 'sin salir'}</span>
        </div>
      </div>
    `;
  }).join('');

  const topEndingsHtml = stats.top2Endings.map((item, idx) => `
    <div style="display: flex; align-items: center; justify-content: space-between; padding: 4px 8px; background: ${idx % 2 === 0 ? '#f8fafc' : '#ffffff'}; border-radius: 4px; font-size: 0.8rem;">
      <span style="display: flex; align-items: center; gap: 6px;">
        <strong style="color: #4338ca; font-size: 0.9rem; font-family: monospace;">...${item.ending}</strong>
        <span style="color: #64748b; font-size: 0.75rem;">(${item.count} sorteos)</span>
      </span>
      <span style="font-weight: 700; color: #1e293b;">${item.percentage.toFixed(1)}%</span>
    </div>
  `).join('');

  return `
    <div id="nacionalHistoricalAnalysisWrapper" style="margin-top: 15px; background: #ffffff; border: 1.5px solid #c7d2fe; border-radius: 12px; padding: 14px 16px; box-shadow: 0 2px 4px rgba(79, 70, 229, 0.05);">
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; flex-wrap: wrap; gap: 8px;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="font-size: 1.25rem;">📊</span>
          <div>
            <h4 style="margin: 0; font-size: 0.95rem; font-weight: 700; color: #3730a3;">
              Análisis Histórico de Terminaciones y Reintegros (1er Premio)
            </h4>
            <div style="font-size: 0.75rem; color: #6366f1; margin-top: 1px;">
              Basado en los ${stats.totalDraws} sorteos del histórico cargado
            </div>
          </div>
        </div>
        <div style="display: flex; gap: 8px; font-size: 0.75rem; background: #e0e7ff; padding: 4px 8px; border-radius: 6px; color: #3730a3; font-weight: 600;">
          <span>⚖️ Pares: ${stats.evenOddRatio.even.toFixed(0)}%</span>
          <span>|</span>
          <span>Impares: ${stats.evenOddRatio.odd.toFixed(0)}%</span>
        </div>
      </div>

      <!-- Frecuencia de los 10 Reintegros (0 al 9) -->
      <div style="margin-bottom: 12px;">
        <div style="font-size: 0.8rem; font-weight: 600; color: #475569; margin-bottom: 8px;">
          🎯 Frecuencia de Reintegros (Unidades del Gordo 0-9):
        </div>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 8px;">
          ${reintegrosCardsHtml}
        </div>
      </div>

      <!-- Top Terminaciones de 2 Cifras -->
      <div style="border-top: 1px dashed #e2e8f0; padding-top: 10px; margin-top: 10px;">
        <div style="font-size: 0.8rem; font-weight: 600; color: #475569; margin-bottom: 6px;">
          ⭐ Terminaciones de 2 Cifras más repetidas en el Gordo:
        </div>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 6px;">
          ${topEndingsHtml}
        </div>
      </div>
    </div>
  `;
}
