import { t } from './i18n';
import { nCr } from './combinatorial';
import { Draw } from '../types';
import { GameConfig } from '../../game-configs';

export function buildTerminacionesStatsHtml(windowSize: number, currentGame: GameConfig, historicalData: Draw[]): string {
  const maxNumbers = currentGame.maxNumbers || 6;
  const totalDraws = historicalData.length;
  const recentData = historicalData.slice(-windowSize);
  const recentDrawsCount = recentData.length;

  const fullTotalNums = totalDraws * maxNumbers;
  const recentTotalNums = recentDrawsCount * maxNumbers;

  const fullCounts = Array(10).fill(0);
  const recentCounts = Array(10).fill(0);
  const lastSeenIndex = Array(10).fill(-1);

  historicalData.forEach((draw, idx) => {
    draw.numbers.forEach(num => {
      const digit = Math.abs(num) % 10;
      fullCounts[digit]++;
      lastSeenIndex[digit] = idx;
    });
  });

  recentData.forEach(draw => {
    draw.numbers.forEach(num => {
      const digit = Math.abs(num) % 10;
      recentCounts[digit]++;
    });
  });

  const digitsData = Array.from({ length: 10 }, (_, d) => {
    const drawsSince = lastSeenIndex[d] === -1 ? totalDraws : (totalDraws - 1) - lastSeenIndex[d];
    const fullPct = fullTotalNums > 0 ? (fullCounts[d] / fullTotalNums) * 100 : 0;
    const recentPct = recentTotalNums > 0 ? (recentCounts[d] / recentTotalNums) * 100 : 0;
    return { digit: d, fullPct, recentPct, drawsSince };
  });

  digitsData.sort((a, b) => b.drawsSince - a.drawsSince);

  let html = `
    <div style="display: flex; gap: 16px; margin-bottom: 12px; font-size: 0.85rem; color: #475569; background: #f8fafc; padding: 8px 12px; border-radius: 6px;">
      <span><strong>${t('filterStats.historicoCompleto', { n: totalDraws })}</strong></span>
      <span><strong>${t('filterStats.ventanaReciente', { n: recentDrawsCount })}</strong></span>
    </div>
    <table style="width: 100%; border-collapse: collapse; font-size: 0.85rem;">
      <thead>
        <tr style="background: #f1f5f9; color: #334155;">
          <th style="padding: 8px; border-bottom: 2px solid #cbd5e1; text-align: center;">${t('filterStats.colDigito')}</th>
          <th style="padding: 8px; border-bottom: 2px solid #cbd5e1; text-align: center;">${t('filterStats.colFrecHist')}</th>
          <th style="padding: 8px; border-bottom: 2px solid #cbd5e1; text-align: center;">${t('filterStats.colFrecReciente')}</th>
          <th style="padding: 8px; border-bottom: 2px solid #cbd5e1; text-align: center;">${t('filterStats.colSinAparecer')}</th>
        </tr>
      </thead>
      <tbody>
  `;

  digitsData.forEach(item => {
    html += `
      <tr style="border-bottom: 1px solid #e2e8f0;">
        <td style="padding: 6px 8px; text-align: center; font-weight: 600;">${item.digit}</td>
        <td style="padding: 6px 8px; text-align: center;">${item.fullPct.toFixed(1)}%</td>
        <td style="padding: 6px 8px; text-align: center;">${item.recentPct.toFixed(1)}%</td>
        <td style="padding: 6px 8px; text-align: center; ${item.drawsSince > 5 ? 'color: #dc2626; font-weight: bold;' : ''}">${item.drawsSince}</td>
      </tr>
    `;
  });

  html += `</tbody></table>`;
  return html;
}

export function buildParImparStatsHtml(windowSize: number, currentGame: GameConfig, historicalData: Draw[]): string {
  const k = currentGame.maxNumbers || 6;
  const N = currentGame.numberRange || 49;
  const totalEvensInUniverse = Math.floor(N / 2);
  const totalOddsInUniverse = N - totalEvensInUniverse;
  const totalWays = nCr(N, k);

  const totalDraws = historicalData.length;
  const recentData = historicalData.slice(-windowSize);
  const recentDrawsCount = recentData.length;

  const fullCounts: Record<string, number> = {};
  const recentCounts: Record<string, number> = {};

  for (let e = k; e >= 0; e--) {
    const cat = `${e}/${k - e}`;
    fullCounts[cat] = 0;
    recentCounts[cat] = 0;
  }

  historicalData.forEach(draw => {
    const evens = draw.numbers.filter(n => n % 2 === 0).length;
    const cat = `${evens}/${k - evens}`;
    if (fullCounts[cat] !== undefined) fullCounts[cat]++;
  });

  recentData.forEach(draw => {
    const evens = draw.numbers.filter(n => n % 2 === 0).length;
    const cat = `${evens}/${k - evens}`;
    if (recentCounts[cat] !== undefined) recentCounts[cat]++;
  });

  const categoriesData = [];
  for (let e = k; e >= 0; e--) {
    const cat = `${e}/${k - e}`;
    const ways = nCr(totalEvensInUniverse, e) * nCr(totalOddsInUniverse, k - e);
    const theoPct = totalWays > 0 ? (ways / totalWays) * 100 : 0;
    const fullPct = totalDraws > 0 ? (fullCounts[cat] / totalDraws) * 100 : 0;
    const recentPct = recentDrawsCount > 0 ? (recentCounts[cat] / recentDrawsCount) * 100 : 0;
    categoriesData.push({ cat, theoPct, fullPct, recentPct });
  }

  const last10 = historicalData.slice(-10).map(draw => {
    const evens = draw.numbers.filter(n => n % 2 === 0).length;
    return `${evens}/${k - evens}`;
  });

  let html = `
    <div style="display: flex; gap: 16px; margin-bottom: 12px; font-size: 0.85rem; color: #475569; background: #f8fafc; padding: 8px 12px; border-radius: 6px;">
      <span><strong>${t('filterStats.historicoCompleto', { n: totalDraws })}</strong></span>
      <span><strong>${t('filterStats.ventanaReciente', { n: recentDrawsCount })}</strong></span>
    </div>
    <table style="width: 100%; border-collapse: collapse; font-size: 0.85rem;">
      <thead>
        <tr style="background: #f1f5f9; color: #334155;">
          <th style="padding: 8px; border-bottom: 2px solid #cbd5e1; text-align: center;">${t('filterStats.colCategoria')}</th>
          <th style="padding: 8px; border-bottom: 2px solid #cbd5e1; text-align: center;">${t('filterStats.colFrecHist')}</th>
          <th style="padding: 8px; border-bottom: 2px solid #cbd5e1; text-align: center;">${t('filterStats.colFrecReciente')}</th>
          <th style="padding: 8px; border-bottom: 2px solid #cbd5e1; text-align: center;">${t('filterStats.colTeorico')}</th>
        </tr>
      </thead>
      <tbody>
  `;

  categoriesData.forEach(item => {
    html += `
      <tr style="border-bottom: 1px solid #e2e8f0;">
        <td style="padding: 6px 8px; text-align: center; font-weight: 600;">${item.cat}</td>
        <td style="padding: 6px 8px; text-align: center;">${item.fullPct.toFixed(1)}%</td>
        <td style="padding: 6px 8px; text-align: center;">${item.recentPct.toFixed(1)}%</td>
        <td style="padding: 6px 8px; text-align: center; color: #64748b;">${item.theoPct.toFixed(1)}%</td>
      </tr>
    `;
  });

  html += `
    </tbody></table>
    <div style="margin-top: 14px; font-weight: 600; font-size: 0.85rem; color: #1e293b;">${t('filterStats.secuenciaReciente')}</div>
    <div style="margin-top: 6px; padding: 8px 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; font-family: monospace; font-size: 0.85rem; color: #334155;">
      ${last10.join(', ')}
    </div>
  `;

  return html;
}

export function buildSumaStatsHtml(windowSize: number, historicalData: Draw[]): string {
  const totalDraws = historicalData.length;
  const recentData = historicalData.slice(-windowSize);
  const recentDrawsCount = recentData.length;

  const allSums = historicalData.map(d => d.numbers.reduce((a, b) => a + b, 0));
  const recentSums = allSums.slice(-recentDrawsCount);

  const minFull = Math.min(...allSums);
  const maxFull = Math.max(...allSums);
  const avgFull = allSums.reduce((a, b) => a + b, 0) / totalDraws;

  const minRecent = Math.min(...recentSums);
  const maxRecent = Math.max(...recentSums);
  const avgRecent = recentSums.reduce((a, b) => a + b, 0) / recentDrawsCount;

  const lastSum = allSums[allSums.length - 1];
  const countLessOrEqual = allSums.filter(s => s <= lastSum).length;
  const percentile = (countLessOrEqual / totalDraws) * 100;

  const last10Sums = allSums.slice(-10);

  let html = `
    <table style="width: 100%; border-collapse: collapse; font-size: 0.85rem; margin-bottom: 12px;">
      <thead>
        <tr style="background: #f1f5f9; color: #334155;">
          <th style="padding: 8px; border-bottom: 2px solid #cbd5e1; text-align: left;">Métrica</th>
          <th style="padding: 8px; border-bottom: 2px solid #cbd5e1; text-align: center;">${t('filterStats.historicoCompleto', { n: totalDraws })}</th>
          <th style="padding: 8px; border-bottom: 2px solid #cbd5e1; text-align: center;">${t('filterStats.ventanaReciente', { n: recentDrawsCount })}</th>
        </tr>
      </thead>
      <tbody>
        <tr style="border-bottom: 1px solid #e2e8f0;">
          <td style="padding: 6px 8px; font-weight: 600;">Suma Mínima</td>
          <td style="padding: 6px 8px; text-align: center;">${minFull}</td>
          <td style="padding: 6px 8px; text-align: center;">${minRecent}</td>
        </tr>
        <tr style="border-bottom: 1px solid #e2e8f0;">
          <td style="padding: 6px 8px; font-weight: 600;">Suma Media</td>
          <td style="padding: 6px 8px; text-align: center;">${avgFull.toFixed(1)}</td>
          <td style="padding: 6px 8px; text-align: center;">${avgRecent.toFixed(1)}</td>
        </tr>
        <tr style="border-bottom: 1px solid #e2e8f0;">
          <td style="padding: 6px 8px; font-weight: 600;">Suma Máxima</td>
          <td style="padding: 6px 8px; text-align: center;">${maxFull}</td>
          <td style="padding: 6px 8px; text-align: center;">${maxRecent}</td>
        </tr>
      </tbody>
    </table>

    <div style="padding: 10px 12px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; color: #166534; font-size: 0.85rem; margin-bottom: 12px;">
      📌 <strong>Último sorteo:</strong> Suma <strong>${lastSum}</strong> (Percentil <strong>${percentile.toFixed(1)}%</strong> del histórico).
    </div>

    <div style="font-weight: 600; font-size: 0.85rem; color: #1e293b;">Sumas de los últimos 10 sorteos:</div>
    <div style="margin-top: 6px; padding: 8px 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; font-family: monospace; font-size: 0.85rem; color: #334155;">
      ${last10Sums.join(', ')}
    </div>
  `;

  return html;
}

export function buildDecenasStatsHtml(windowSize: number, historicalData: Draw[]): string {
  const totalDraws = historicalData.length;
  const recentData = historicalData.slice(-windowSize);
  const recentDrawsCount = recentData.length;

  const getDecadePatternKey = (nums: number[]) => {
    const tens: Record<number, number> = {};
    nums.forEach(n => {
      const ten = Math.floor((n - 1) / 10);
      tens[ten] = (tens[ten] || 0) + 1;
    });
    return Object.values(tens).sort((a, b) => b - a).join('/');
  };

  const fullCounts: Record<string, number> = {};
  const recentCounts: Record<string, number> = {};

  historicalData.forEach(draw => {
    const key = getDecadePatternKey(draw.numbers);
    fullCounts[key] = (fullCounts[key] || 0) + 1;
  });

  recentData.forEach(draw => {
    const key = getDecadePatternKey(draw.numbers);
    recentCounts[key] = (recentCounts[key] || 0) + 1;
  });

  const topPatterns = Object.keys(fullCounts)
    .sort((a, b) => fullCounts[b] - fullCounts[a])
    .slice(0, 5);

  let html = `
    <div style="display: flex; gap: 16px; margin-bottom: 12px; font-size: 0.85rem; color: #475569; background: #f8fafc; padding: 8px 12px; border-radius: 6px;">
      <span><strong>${t('filterStats.historicoCompleto', { n: totalDraws })}</strong></span>
      <span><strong>${t('filterStats.ventanaReciente', { n: recentDrawsCount })}</strong></span>
    </div>
    <table style="width: 100%; border-collapse: collapse; font-size: 0.85rem;">
      <thead>
        <tr style="background: #f1f5f9; color: #334155;">
          <th style="padding: 8px; border-bottom: 2px solid #cbd5e1; text-align: center;">${t('filterStats.colPatron')}</th>
          <th style="padding: 8px; border-bottom: 2px solid #cbd5e1; text-align: center;">${t('filterStats.colFrecHist')}</th>
          <th style="padding: 8px; border-bottom: 2px solid #cbd5e1; text-align: center;">${t('filterStats.colFrecReciente')}</th>
        </tr>
      </thead>
      <tbody>
  `;

  topPatterns.forEach(pattern => {
    const fullPct = (fullCounts[pattern] / totalDraws) * 100;
    const recentPct = ((recentCounts[pattern] || 0) / recentDrawsCount) * 100;
    html += `
      <tr style="border-bottom: 1px solid #e2e8f0;">
        <td style="padding: 6px 8px; text-align: center; font-weight: 600;">${pattern}</td>
        <td style="padding: 6px 8px; text-align: center;">${fullPct.toFixed(1)}%</td>
        <td style="padding: 6px 8px; text-align: center;">${recentPct.toFixed(1)}%</td>
      </tr>
    `;
  });

  html += `</tbody></table>`;
  return html;
}

export function buildConsecutivosStatsHtml(windowSize: number, historicalData: Draw[]): string {
  const totalDraws = historicalData.length;
  const recentData = historicalData.slice(-windowSize);
  const recentDrawsCount = recentData.length;

  const getConsecutivePatternKey = (nums: number[]) => {
    const sorted = [...nums].sort((a, b) => a - b);
    let pattern = '';
    let count = 1;
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] === sorted[i - 1] + 1) {
        count++;
      } else {
        pattern += count;
        count = 1;
      }
    }
    pattern += count;
    return pattern.split('').sort((a, b) => Number(b) - Number(a)).join('/');
  };

  const fullCounts: Record<string, number> = {};
  const recentCounts: Record<string, number> = {};

  historicalData.forEach(draw => {
    const key = getConsecutivePatternKey(draw.numbers);
    fullCounts[key] = (fullCounts[key] || 0) + 1;
  });

  recentData.forEach(draw => {
    const key = getConsecutivePatternKey(draw.numbers);
    recentCounts[key] = (recentCounts[key] || 0) + 1;
  });

  const topPatterns = Object.keys(fullCounts)
    .sort((a, b) => fullCounts[b] - fullCounts[a])
    .slice(0, 5);

  let html = `
    <div style="display: flex; gap: 16px; margin-bottom: 12px; font-size: 0.85rem; color: #475569; background: #f8fafc; padding: 8px 12px; border-radius: 6px;">
      <span><strong>${t('filterStats.historicoCompleto', { n: totalDraws })}</strong></span>
      <span><strong>${t('filterStats.ventanaReciente', { n: recentDrawsCount })}</strong></span>
    </div>
    <table style="width: 100%; border-collapse: collapse; font-size: 0.85rem;">
      <thead>
        <tr style="background: #f1f5f9; color: #334155;">
          <th style="padding: 8px; border-bottom: 2px solid #cbd5e1; text-align: center;">${t('filterStats.colPatron')}</th>
          <th style="padding: 8px; border-bottom: 2px solid #cbd5e1; text-align: center;">${t('filterStats.colFrecHist')}</th>
          <th style="padding: 8px; border-bottom: 2px solid #cbd5e1; text-align: center;">${t('filterStats.colFrecReciente')}</th>
        </tr>
      </thead>
      <tbody>
  `;

  topPatterns.forEach(pattern => {
    const fullPct = (fullCounts[pattern] / totalDraws) * 100;
    const recentPct = ((recentCounts[pattern] || 0) / recentDrawsCount) * 100;
    html += `
      <tr style="border-bottom: 1px solid #e2e8f0;">
        <td style="padding: 6px 8px; text-align: center; font-weight: 600;">${pattern}</td>
        <td style="padding: 6px 8px; text-align: center;">${fullPct.toFixed(1)}%</td>
        <td style="padding: 6px 8px; text-align: center;">${recentPct.toFixed(1)}%</td>
      </tr>
    `;
  });

  html += `</tbody></table>`;
  return html;
}

export function buildBajosAltosStatsHtml(windowSize: number, currentGame: GameConfig, historicalData: Draw[]): string {
  const k = currentGame.maxNumbers || 6;
  const numberRange = currentGame.numberRange || 49;
  const midPoint = Math.floor(numberRange / 2);
  const totalDraws = historicalData.length;
  const recentData = historicalData.slice(-windowSize);
  const recentDrawsCount = recentData.length;

  const totalLowsInUniverse = midPoint;
  const totalHighsInUniverse = numberRange - midPoint;
  const totalWays = nCr(numberRange, k);

  const fullCounts: Record<string, number> = {};
  const recentCounts: Record<string, number> = {};

  for (let l = k; l >= 0; l--) {
    const cat = `${l}/${k - l}`;
    fullCounts[cat] = 0;
    recentCounts[cat] = 0;
  }

  historicalData.forEach(draw => {
    const lows = draw.numbers.filter(n => n <= midPoint).length;
    const cat = `${lows}/${k - lows}`;
    if (fullCounts[cat] !== undefined) fullCounts[cat]++;
  });

  recentData.forEach(draw => {
    const lows = draw.numbers.filter(n => n <= midPoint).length;
    const cat = `${lows}/${k - lows}`;
    if (recentCounts[cat] !== undefined) recentCounts[cat]++;
  });

  const categoriesData = [];
  for (let l = k; l >= 0; l--) {
    const cat = `${l}/${k - l}`;
    const ways = nCr(totalLowsInUniverse, l) * nCr(totalHighsInUniverse, k - l);
    const theoPct = totalWays > 0 ? (ways / totalWays) * 100 : 0;
    const fullPct = totalDraws > 0 ? (fullCounts[cat] / totalDraws) * 100 : 0;
    const recentPct = recentDrawsCount > 0 ? (recentCounts[cat] / recentDrawsCount) * 100 : 0;
    categoriesData.push({ cat, theoPct, fullPct, recentPct });
  }

  const last10 = historicalData.slice(-10).map(draw => {
    const lows = draw.numbers.filter(n => n <= midPoint).length;
    return `${lows}/${k - lows}`;
  });

  let html = `
    <div style="display: flex; gap: 16px; margin-bottom: 12px; font-size: 0.85rem; color: #475569; background: #f8fafc; padding: 8px 12px; border-radius: 6px;">
      <span><strong>${t('filterStats.historicoCompleto', { n: totalDraws })}</strong></span>
      <span><strong>${t('filterStats.ventanaReciente', { n: recentDrawsCount })}</strong></span>
    </div>
    <table style="width: 100%; border-collapse: collapse; font-size: 0.85rem;">
      <thead>
        <tr style="background: #f1f5f9; color: #334155;">
          <th style="padding: 8px; border-bottom: 2px solid #cbd5e1; text-align: center;">${t('filterStats.colCategoria')}</th>
          <th style="padding: 8px; border-bottom: 2px solid #cbd5e1; text-align: center;">${t('filterStats.colFrecHist')}</th>
          <th style="padding: 8px; border-bottom: 2px solid #cbd5e1; text-align: center;">${t('filterStats.colFrecReciente')}</th>
          <th style="padding: 8px; border-bottom: 2px solid #cbd5e1; text-align: center;">${t('filterStats.colTeorico')}</th>
        </tr>
      </thead>
      <tbody>
  `;

  categoriesData.forEach(item => {
    html += `
      <tr style="border-bottom: 1px solid #e2e8f0;">
        <td style="padding: 6px 8px; text-align: center; font-weight: 600;">${item.cat}</td>
        <td style="padding: 6px 8px; text-align: center;">${item.fullPct.toFixed(1)}%</td>
        <td style="padding: 6px 8px; text-align: center;">${item.recentPct.toFixed(1)}%</td>
        <td style="padding: 6px 8px; text-align: center; color: #64748b;">${item.theoPct.toFixed(1)}%</td>
      </tr>
    `;
  });

  html += `
    </tbody></table>
    <div style="margin-top: 14px; font-weight: 600; font-size: 0.85rem; color: #1e293b;">${t('filterStats.secuenciaReciente')}</div>
    <div style="margin-top: 6px; padding: 8px 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; font-family: monospace; font-size: 0.85rem; color: #334155;">
      ${last10.join(', ')}
    </div>
  `;

  return html;
}

export function buildDecenasExclusionStatsHtml(windowSize: number, currentGame: GameConfig, historicalData: Draw[]): string {
  const totalDraws = historicalData.length;
  const recentData = historicalData.slice(-windowSize);
  const recentDrawsCount = recentData.length;
  const numberRange = currentGame.numberRange || 49;
  const numDecades = Math.ceil(numberRange / 10);

  const decadesData = [];
  for (let d = 0; d < numDecades; d++) {
    const startNum = d * 10 + 1;
    const endNum = Math.min((d + 1) * 10, numberRange);
    const label = `${startNum}-${endNum}`;

    let fullCount = 0;
    let lastSeenIdx = -1;
    historicalData.forEach((draw, idx) => {
      if (draw.numbers.some(n => Math.floor((n - 1) / 10) === d)) {
        fullCount++;
        lastSeenIdx = idx;
      }
    });

    let recentCount = 0;
    recentData.forEach(draw => {
      if (draw.numbers.some(n => Math.floor((n - 1) / 10) === d)) {
        recentCount++;
      }
    });

    const fullPct = totalDraws > 0 ? (fullCount / totalDraws) * 100 : 0;
    const recentPct = recentDrawsCount > 0 ? (recentCount / recentDrawsCount) * 100 : 0;
    const drawsSince = lastSeenIdx >= 0 ? (totalDraws - 1 - lastSeenIdx) : totalDraws;

    decadesData.push({ label, fullPct, recentPct, drawsSince });
  }

  let html = `
    <div style="display: flex; gap: 16px; margin-bottom: 12px; font-size: 0.85rem; color: #475569; background: #f8fafc; padding: 8px 12px; border-radius: 6px;">
      <span><strong>${t('filterStats.historicoCompleto', { n: totalDraws })}</strong></span>
      <span><strong>${t('filterStats.ventanaReciente', { n: recentDrawsCount })}</strong></span>
    </div>
    <table style="width: 100%; border-collapse: collapse; font-size: 0.85rem;">
      <thead>
        <tr style="background: #f1f5f9; color: #334155;">
          <th style="padding: 8px; border-bottom: 2px solid #cbd5e1; text-align: center;">${t('filterStats.colDecena')}</th>
          <th style="padding: 8px; border-bottom: 2px solid #cbd5e1; text-align: center;">${t('filterStats.colFrecHist')}</th>
          <th style="padding: 8px; border-bottom: 2px solid #cbd5e1; text-align: center;">${t('filterStats.colFrecReciente')}</th>
          <th style="padding: 8px; border-bottom: 2px solid #cbd5e1; text-align: center;">${t('filterStats.colSinAparecer')}</th>
        </tr>
      </thead>
      <tbody>
  `;

  decadesData.forEach(item => {
    html += `
      <tr style="border-bottom: 1px solid #e2e8f0;">
        <td style="padding: 6px 8px; text-align: center; font-weight: 600;">${item.label}</td>
        <td style="padding: 6px 8px; text-align: center;">${item.fullPct.toFixed(1)}%</td>
        <td style="padding: 6px 8px; text-align: center;">${item.recentPct.toFixed(1)}%</td>
        <td style="padding: 6px 8px; text-align: center; font-weight: 600; color: ${item.drawsSince > 10 ? '#dc2626' : '#1e293b'};">${item.drawsSince}</td>
      </tr>
    `;
  });

  html += `</tbody></table>`;
  return html;
}

export function buildVariedadTerminacionesStatsHtml(windowSize: number, currentGame: GameConfig, historicalData: Draw[]): string {
  const totalDraws = historicalData.length;
  const recentData = historicalData.slice(-windowSize);
  const recentDrawsCount = recentData.length;
  const maxNumbers = currentGame.maxNumbers || 6;

  const fullCounts: Record<number, number> = {};
  const recentCounts: Record<number, number> = {};

  for (let v = 1; v <= maxNumbers; v++) {
    fullCounts[v] = 0;
    recentCounts[v] = 0;
  }

  historicalData.forEach(draw => {
    const uniqueEndings = new Set(draw.numbers.map(n => Math.abs(n) % 10)).size;
    if (fullCounts[uniqueEndings] !== undefined) fullCounts[uniqueEndings]++;
  });

  recentData.forEach(draw => {
    const uniqueEndings = new Set(draw.numbers.map(n => Math.abs(n) % 10)).size;
    if (recentCounts[uniqueEndings] !== undefined) recentCounts[uniqueEndings]++;
  });

  const last10 = historicalData.slice(-10).map(draw => {
    return new Set(draw.numbers.map(n => Math.abs(n) % 10)).size;
  });

  let html = `
    <div style="display: flex; gap: 16px; margin-bottom: 12px; font-size: 0.85rem; color: #475569; background: #f8fafc; padding: 8px 12px; border-radius: 6px;">
      <span><strong>${t('filterStats.historicoCompleto', { n: totalDraws })}</strong></span>
      <span><strong>${t('filterStats.ventanaReciente', { n: recentDrawsCount })}</strong></span>
    </div>
    <table style="width: 100%; border-collapse: collapse; font-size: 0.85rem;">
      <thead>
        <tr style="background: #f1f5f9; color: #334155;">
          <th style="padding: 8px; border-bottom: 2px solid #cbd5e1; text-align: center;">${t('filterStats.colVariedad')}</th>
          <th style="padding: 8px; border-bottom: 2px solid #cbd5e1; text-align: center;">${t('filterStats.colFrecHist')}</th>
          <th style="padding: 8px; border-bottom: 2px solid #cbd5e1; text-align: center;">${t('filterStats.colFrecReciente')}</th>
        </tr>
      </thead>
      <tbody>
  `;

  for (let v = maxNumbers; v >= 1; v--) {
    const fullPct = totalDraws > 0 ? (fullCounts[v] / totalDraws) * 100 : 0;
    const recentPct = recentDrawsCount > 0 ? (recentCounts[v] / recentDrawsCount) * 100 : 0;
    html += `
      <tr style="border-bottom: 1px solid #e2e8f0;">
        <td style="padding: 6px 8px; text-align: center; font-weight: 600;">${v}</td>
        <td style="padding: 6px 8px; text-align: center;">${fullPct.toFixed(1)}%</td>
        <td style="padding: 6px 8px; text-align: center;">${recentPct.toFixed(1)}%</td>
      </tr>
    `;
  }

  html += `
    </tbody></table>
    <div style="margin-top: 14px; font-weight: 600; font-size: 0.85rem; color: #1e293b;">${t('filterStats.secuenciaReciente')}</div>
    <div style="margin-top: 6px; padding: 8px 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; font-family: monospace; font-size: 0.85rem; color: #334155;">
      ${last10.join(', ')}
    </div>
  `;

  return html;
}

function buildContinuousMetricStatsHtml(
  allValues: number[],
  windowSize: number,
  decimals: number,
  historicalData: Draw[]
): string {
  const totalDraws = historicalData.length;
  const recentData = historicalData.slice(-windowSize);
  const recentDrawsCount = recentData.length;
  const recentValues = allValues.slice(-recentDrawsCount);

  const minFull = Math.min(...allValues);
  const maxFull = Math.max(...allValues);
  const avgFull = allValues.reduce((a, b) => a + b, 0) / totalDraws;

  const minRecent = Math.min(...recentValues);
  const maxRecent = Math.max(...recentValues);
  const avgRecent = recentValues.reduce((a, b) => a + b, 0) / recentDrawsCount;

  const lastVal = allValues[allValues.length - 1];
  const countLessOrEqual = allValues.filter(v => v <= lastVal).length;
  const percentile = (countLessOrEqual / totalDraws) * 100;

  const last10Values = allValues.slice(-10);

  const fmt = (v: number) => decimals > 0 ? v.toFixed(decimals) : String(Math.round(v));
  const fmtAvg = (v: number) => decimals > 0 ? v.toFixed(decimals) : v.toFixed(1);

  return `
    <table style="width: 100%; border-collapse: collapse; font-size: 0.85rem; margin-bottom: 12px;">
      <thead>
        <tr style="background: #f1f5f9; color: #334155;">
          <th style="padding: 8px; border-bottom: 2px solid #cbd5e1; text-align: left;">${t('filterStats.colCategoria')}</th>
          <th style="padding: 8px; border-bottom: 2px solid #cbd5e1; text-align: center;">${t('filterStats.historicoCompleto', { n: totalDraws })}</th>
          <th style="padding: 8px; border-bottom: 2px solid #cbd5e1; text-align: center;">${t('filterStats.ventanaReciente', { n: recentDrawsCount })}</th>
        </tr>
      </thead>
      <tbody>
        <tr style="border-bottom: 1px solid #e2e8f0;">
          <td style="padding: 6px 8px; font-weight: 600;">${t('filterStats.colMin')}</td>
          <td style="padding: 6px 8px; text-align: center;">${fmt(minFull)}</td>
          <td style="padding: 6px 8px; text-align: center;">${fmt(minRecent)}</td>
        </tr>
        <tr style="border-bottom: 1px solid #e2e8f0;">
          <td style="padding: 6px 8px; font-weight: 600;">${t('filterStats.colMedia')}</td>
          <td style="padding: 6px 8px; text-align: center;">${fmtAvg(avgFull)}</td>
          <td style="padding: 6px 8px; text-align: center;">${fmtAvg(avgRecent)}</td>
        </tr>
        <tr style="border-bottom: 1px solid #e2e8f0;">
          <td style="padding: 6px 8px; font-weight: 600;">${t('filterStats.colMax')}</td>
          <td style="padding: 6px 8px; text-align: center;">${fmt(maxFull)}</td>
          <td style="padding: 6px 8px; text-align: center;">${fmt(maxRecent)}</td>
        </tr>
      </tbody>
    </table>

    <div style="padding: 10px 12px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; color: #166534; font-size: 0.85rem; margin-bottom: 12px;">
      📌 <strong>${t('filterStats.percentilUltimo', { p: percentile.toFixed(1) })}</strong> (Valor: <strong>${fmt(lastVal)}</strong>)
    </div>

    <div style="font-weight: 600; font-size: 0.85rem; color: #1e293b;">${t('filterStats.ultimos10Valores')}</div>
    <div style="margin-top: 6px; padding: 8px 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; font-family: monospace; font-size: 0.85rem; color: #334155;">
      ${last10Values.map(v => fmt(v)).join(', ')}
    </div>
  `;
}

export function buildPrimosStatsHtml(windowSize: number, historicalData: Draw[], primes: Set<number>): string {
  const allValues = historicalData.map(d => d.numbers.filter(n => primes.has(n)).length);
  return buildContinuousMetricStatsHtml(allValues, windowSize, 0, historicalData);
}

export function buildEntropiaIntervalosStatsHtml(windowSize: number, historicalData: Draw[]): string {
  const calculateIntervalsEntropy = (nums: number[]) => {
    const sorted = [...nums].sort((a, b) => a - b);
    const intervalCounts: Record<number, number> = {};
    for (let idx = 0; idx < sorted.length - 1; idx++) {
      const diff = sorted[idx + 1] - sorted[idx];
      intervalCounts[diff] = (intervalCounts[diff] || 0) + 1;
    }
    const numIntervals = nums.length - 1;
    if (numIntervals <= 0) return 0;
    return -Object.values(intervalCounts).reduce((s, countVal) => {
      const p = countVal / numIntervals;
      return s + p * Math.log2(p);
    }, 0);
  };
  const allValues = historicalData.map(d => calculateIntervalsEntropy(d.numbers));
  return buildContinuousMetricStatsHtml(allValues, windowSize, 3, historicalData);
}

export function buildEntropiaTerminacionesStatsHtml(windowSize: number, historicalData: Draw[]): string {
  const calculateEndingsEntropy = (nums: number[]) => {
    const endingCounts: Record<number, number> = {};
    nums.forEach(n => {
      const ending = Math.abs(n) % 10;
      endingCounts[ending] = (endingCounts[ending] || 0) + 1;
    });
    return -Object.values(endingCounts).reduce((s, countVal) => {
      const p = countVal / nums.length;
      return s + p * Math.log2(p);
    }, 0);
  };
  const allValues = historicalData.map(d => calculateEndingsEntropy(d.numbers));
  return buildContinuousMetricStatsHtml(allValues, windowSize, 3, historicalData);
}

export function buildDistanciaStatsHtml(windowSize: number, historicalData: Draw[]): string {
  const getDist = (nums: number[]) => {
    const s = [...nums].sort((a, b) => a - b);
    let minD = Infinity;
    for (let i = 0; i < s.length - 1; i++) {
      const diff = s[i + 1] - s[i];
      if (diff < minD) minD = diff;
    }
    return minD === Infinity ? 1 : minD;
  };
  const allValues = historicalData.map(d => getDist(d.numbers));
  return buildContinuousMetricStatsHtml(allValues, windowSize, 0, historicalData);
}

export function buildSumaDigitosStatsHtml(windowSize: number, historicalData: Draw[]): string {
  const getDigitSum = (nums: number[]) => nums.reduce((s, n) => s + (n < 10 ? n : Math.floor(n / 10) + (n % 10)), 0);
  const allValues = historicalData.map(d => getDigitSum(d.numbers));
  return buildContinuousMetricStatsHtml(allValues, windowSize, 0, historicalData);
}

export function buildDesviacionStatsHtml(windowSize: number, historicalData: Draw[]): string {
  const getStdDev = (nums: number[]) => {
    const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
    const variance = nums.reduce((s, n) => s + Math.pow(n - mean, 2), 0) / nums.length;
    return Math.sqrt(variance);
  };
  const allValues = historicalData.map(d => getStdDev(d.numbers));
  return buildContinuousMetricStatsHtml(allValues, windowSize, 2, historicalData);
}
