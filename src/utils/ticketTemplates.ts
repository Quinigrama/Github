import { Ticket } from "../types";
import { GameColorPalette, GAMES, GAME_COLORS, SHARED_BALL_COLORS } from "../../game-configs";
import { calculateTicketCost, getCombinations, getTicketWinningTiers } from "./combinatorial";
import { t } from "./i18n";
import type { SecondaryMatrixBehavior } from "../../index";

export function renderCascadeSummaryTable(cascade: { tiers: { name: string; hits: number; starHits: number; count: number }[] }, colors: GameColorPalette): string {
  const tierRows = cascade.tiers.map(tRow => `
    <tr style="${tRow.count > 0 ? `background: ${colors.rowHighlightBg}; font-weight: bold; color: ${colors.headerText};` : `color: ${colors.neutralText};`}">
      <td style="padding: 6px 10px; border: 1px solid ${colors.tableBorder}; font-weight: 600;">${tRow.name}</td>
      <td style="padding: 6px 10px; border: 1px solid ${colors.tableBorder}; text-align: center;">${tRow.hits} + ${tRow.starHits}${colors.secondaryEmoji}</td>
      <td style="padding: 6px 10px; border: 1px solid ${colors.tableBorder}; text-align: center; font-weight: 800; font-size: 0.9rem; color: ${tRow.count > 0 ? colors.accentText : colors.neutralText};">${tRow.count}</td>
    </tr>
  `).join('');

  const totalWinningBets = cascade.tiers.reduce((acc, tRow) => acc + tRow.count, 0);

  return `
    <table class="validation-summary-table" style="width: 100%; border-collapse: collapse; font-size: 0.82rem; margin-bottom: 8px;">
      <thead>
        <tr style="background: ${colors.tableHeaderBg}; color: ${colors.tableHeaderColor}; font-size: 0.8rem;">
          <th style="padding: 6px 10px; border: 1px solid ${colors.tableBorder}; text-align: left;">${t('tickets.categoria')}</th>
          <th style="padding: 6px 10px; border: 1px solid ${colors.tableBorder}; text-align: center;">${t('tickets.aciertosRequeridos')}</th>
          <th style="padding: 6px 10px; border: 1px solid ${colors.tableBorder}; text-align: center;">${t('tickets.apuestasGanadoras')}</th>
        </tr>
      </thead>
      <tbody>
        ${tierRows}
      </tbody>
    </table>

    <div style="padding: 10px 12px; background: ${colors.totalBannerBg}; color: ${colors.totalBannerText}; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; font-weight: 800; font-size: 0.9rem;">
      <span>${t('tickets.totalApuestasPremiadas')}</span>
      <span style="font-size: 1.1rem; color: ${colors.totalBannerValue};">${totalWinningBets} ${t('tickets.apuestaSufijo')}</span>
    </div>
  `;
}



export function renderStandardTicketCard(
  ticket: Ticket,
  currentGameId: string | undefined,
  secondaryMatrixBehavior: { [gameId: string]: SecondaryMatrixBehavior },
  secondaryLabelKeyByGame: { [gameId: string]: string }
): string {
  const gameId = ticket.gameId || 'bonoloto';
  const colors = GAME_COLORS[gameId] || GAME_COLORS['bonoloto'];
  const costData = calculateTicketCost(ticket, currentGameId);
  const hasSecondaryMatrix = (GAMES[gameId]?.maxStars || 0) > 0;

  let combinationsListHTML = '';
  let summaryTableHTML = '';

  if (ticket.validation) {
    const winningWhiteSet = new Set(ticket.validation.winningNumbers);
    const winningStarsSet = new Set(ticket.validation.stars || []);

    combinationsListHTML = ticket.combinations.map((combo, index) => {
      const hits = ticket.validation!.hits ? ticket.validation!.hits[index] : 0;
      const starHits = ticket.validation!.starHits ? ticket.validation!.starHits[index] : 0;

      let comboHTML = '';
      if (gameId === 'nacional') {
        const digits = [0, 0, 0, 0, 0];
        combo.forEach(n => {
          const col = Math.floor(n / 10) - 1;
          if (col >= 0 && col < 5) digits[col] = n % 10;
        });
        comboHTML = digits.map((digit, col) => {
          const encodedNum = (col + 1) * 10 + digit;
          const isSelected = winningWhiteSet.has(encodedNum);
          return `<div class="saved-combination-number ${isSelected ? 'selected' : ''}" style="border-radius: 4px; font-weight: bold; background: ${isSelected ? colors.ballWinningBg : SHARED_BALL_COLORS.defaultBg}; border: 1px solid #cbd5e1; width: 30px; height: 30px; display: inline-flex; align-items: center; justify-content: center; margin: 0 2px; color: ${isSelected ? colors.ballWinningText : SHARED_BALL_COLORS.defaultText};">${digit}</div>`;
        }).join('');
      } else {
        comboHTML = combo.map(n => `<div class="saved-combination-number ${winningWhiteSet.has(n) ? 'selected' : ''}" style="background: ${winningWhiteSet.has(n) ? colors.ballWinningBg : SHARED_BALL_COLORS.defaultBg}; color: ${winningWhiteSet.has(n) ? colors.ballWinningText : SHARED_BALL_COLORS.defaultText};">${n}</div>`).join('');
      }

      if (hasSecondaryMatrix) {
        const behavior = secondaryMatrixBehavior[gameId];
        const fallbackStars = behavior ? behavior.defaultSecondary : [1];
        const currentStars = (ticket.stars && ticket.stars[index]) ? ticket.stars[index] : (ticket.stars && ticket.stars[0] ? ticket.stars[0] : fallbackStars);
        const starBalls = currentStars.map(r => `<div class="saved-combination-number" style="background: ${winningStarsSet.has(r) ? colors.secondaryWinningBg : colors.secondaryDefaultBg}; color: ${winningStarsSet.has(r) ? colors.secondaryWinningText : colors.secondaryDefaultText}; font-weight: bold;">${r}</div>`).join('');

        const secondaryLabelKey = secondaryLabelKeyByGame[gameId];
        const secondaryLabel = secondaryLabelKey ? t(secondaryLabelKey) : '';

        const hitClass = behavior ? behavior.getHitClass(hits, starHits) : (hits >= 3 ? 'high-hits' : (hits > 0 ? 'low-hits' : 'no-hits'));

        return `
          <div class="saved-combination" style="margin-bottom: 8px;">
            <div class="saved-combination-content" style="flex-wrap: wrap; gap: 4px;">
              ${comboHTML}
              <span style="margin: 0 4px; color: ${colors.secondaryLabelColor}; font-weight: bold; align-self: center;">${secondaryLabel}</span>
              ${starBalls}
            </div>
            <div class="hit-count ${hitClass}">${hits} + ${starHits}${colors.secondaryEmoji} ${t('tickets.aciertos')}</div>
          </div>
        `;
      } else {
        if (ticket.stars && ticket.stars[index] && ticket.stars[index].length > 0) {
          comboHTML += `<span style="margin: 0 4px; color: #9ca3af; font-weight: bold;">+</span>`;
          comboHTML += ticket.stars[index].map(n => `<div class="saved-combination-number ${winningStarsSet.has(n) ? 'selected' : ''}" style="background: ${winningStarsSet.has(n) ? SHARED_BALL_COLORS.starWinningGradient : SHARED_BALL_COLORS.starDefaultBg}; color: ${SHARED_BALL_COLORS.starDefaultText};">${n}</div>`).join('');
        }
        const starHitsText = starHits > 0 ? ` + ${starHits}⭐` : '';
        const hitClass = hits >= 3 ? 'high-hits' : hits > 0 ? 'low-hits' : 'no-hits';

        return `
          <div class="saved-combination" style="margin-bottom: 8px;">
            <div class="saved-combination-content">${comboHTML}</div>
            <div class="hit-count ${hitClass}">${hits}${starHitsText} ${t('tickets.aciertos')}</div>
          </div>
        `;
      }
    }).join('');

    let showBreakdownBadge = false;

    if (hasSecondaryMatrix) {
      const behavior = secondaryMatrixBehavior[gameId];
      const cascade = behavior ? behavior.calculateCascade(ticket, ticket.validation.winningNumbers, ticket.validation.stars || []) : null;

      if (cascade) {
        showBreakdownBadge = true;
        summaryTableHTML = renderCascadeSummaryTable(cascade, colors);
      }
    } else {
      const winningTiers = getTicketWinningTiers(ticket);
      if (winningTiers.length > 0) {
        showBreakdownBadge = true;
        const totalWinningBets = winningTiers.reduce((acc, tRow) => acc + tRow.count, 0);
        const tierRows = winningTiers.map(tRow => `
          <tr style="background: ${colors.rowHighlightBg}; font-weight: bold; color: ${colors.headerText};">
            <td style="padding: 6px 10px; border: 1px solid ${colors.tableBorder}; font-weight: 600;">${tRow.label}</td>
            <td style="padding: 6px 10px; border: 1px solid ${colors.tableBorder}; text-align: center; font-weight: 800; font-size: 0.9rem; color: ${colors.accentText};">${tRow.count}</td>
          </tr>
        `).join('');

        summaryTableHTML = `
          <table class="validation-summary-table" style="width: 100%; border-collapse: collapse; font-size: 0.82rem; margin-top: 10px; margin-bottom: 8px;">
            <thead>
              <tr style="background: ${colors.tableHeaderBg}; color: ${colors.tableHeaderColor}; font-size: 0.8rem;">
                <th style="padding: 6px 10px; border: 1px solid ${colors.tableBorder}; text-align: left;">${t('tickets.categoria')}</th>
                <th style="padding: 6px 10px; border: 1px solid ${colors.tableBorder}; text-align: center;">${t('tickets.apuestasGanadoras')}</th>
              </tr>
            </thead>
            <tbody>
              ${tierRows}
            </tbody>
          </table>
          <div style="padding: 10px 12px; background: ${colors.totalBannerBg}; color: ${colors.totalBannerText}; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; font-weight: 800; font-size: 0.9rem;">
            <span>${t('tickets.totalApuestasPremiadas')}</span>
            <span style="font-size: 1.1rem; color: ${colors.totalBannerValue};">${totalWinningBets} ${t('tickets.apuestaSufijo')}</span>
          </div>
        `;
      }
    }

    return `
      <div style="background: ${colors.cardBg}; border: 1.5px solid ${colors.cardBorderThick}; border-radius: 10px; padding: 12px; margin-bottom: 8px;">
        <div style="font-weight: 700; color: ${colors.headerText}; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px;">
          <span>${t(`tickets.${gameId}.nombre`)} (${costData.totalBets} ${t('tickets.apuestasParentesis')})</span>
          ${showBreakdownBadge ? `<span style="background: ${colors.badgeBg}; color: ${colors.badgeText}; padding: 2px 8px; border-radius: 12px; font-size: 0.75rem; font-weight: bold;">${t('tickets.desgloseCategorias')}</span>` : ''}
        </div>
        ${combinationsListHTML}
        ${summaryTableHTML}
      </div>
    `;

  } else {
    // Non-validated state
    combinationsListHTML = ticket.combinations.map((combo, index) => {
      let comboHTML = '';
      if (gameId === 'nacional') {
        const digits = [0, 0, 0, 0, 0];
        combo.forEach(n => {
          const col = Math.floor(n / 10) - 1;
          if (col >= 0 && col < 5) digits[col] = n % 10;
        });
        comboHTML = digits.map(digit => `<div class="saved-combination-number" style="border-radius: 4px; font-weight: bold; background: ${SHARED_BALL_COLORS.defaultBg}; border: 1px solid #cbd5e1; width: 30px; height: 30px; display: inline-flex; align-items: center; justify-content: center; margin: 0 2px; color: #1f2937;">${digit}</div>`).join('');
      } else {
        comboHTML = combo.map(n => `<div class="saved-combination-number">${n}</div>`).join('');
      }

      if (hasSecondaryMatrix) {
        const behavior = secondaryMatrixBehavior[gameId];
        const fallbackStars = behavior ? behavior.defaultSecondary : [1];
        const currentStars = (ticket.stars && ticket.stars[index]) ? ticket.stars[index] : (ticket.stars && ticket.stars[0] ? ticket.stars[0] : fallbackStars);
        const starBalls = currentStars.map(r => `<div class="saved-combination-number" style="background: ${gameId === 'powerball' ? colors.ballWinningBg : colors.secondaryWinningBg}; color: ${colors.secondaryWinningText}; font-weight: bold;">${r}</div>`).join('');

        const secondaryLabelKey = secondaryLabelKeyByGame[gameId];
        const secondaryLabel = secondaryLabelKey ? t(secondaryLabelKey) : '';

        return `
          <div class="saved-combination" style="margin-bottom: 6px;">
            <div class="saved-combination-content" style="flex-wrap: wrap; gap: 4px;">
              ${comboHTML}
              <span style="margin: 0 4px; color: ${colors.secondaryLabelColor}; font-weight: bold; align-self: center;">${secondaryLabel}</span>
              ${starBalls}
            </div>
          </div>
        `;
      } else {
        if (ticket.stars && ticket.stars[index] && ticket.stars[index].length > 0) {
          comboHTML += `<span style="margin: 0 4px; color: #9ca3af; font-weight: bold;">+</span>`;
          comboHTML += ticket.stars[index].map(n => `<div class="saved-combination-number" style="background: ${SHARED_BALL_COLORS.starDefaultBg}; color: ${SHARED_BALL_COLORS.starDefaultText};">${n}</div>`).join('');
        }
        return `<div class="saved-combination" style="margin-bottom: 6px;"><div class="saved-combination-content">${comboHTML}</div></div>`;
      }
    }).join('');

    return `
      <div style="background: ${colors.cardBg}; border: 1px solid ${colors.cardBorderThin}; border-radius: 10px; padding: 12px; margin-bottom: 8px;">
        <div style="font-weight: 700; color: ${colors.headerText}; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px;">
          <span>${t(`tickets.${gameId}.nombre`)} (${costData.totalBets} ${t('tickets.apuestasParentesis')})</span>
        </div>
        ${combinationsListHTML}
      </div>
    `;
  }
}



export function renderMultipleTicketCard(
  ticket: Ticket,
  currentGameId: string | undefined,
  secondaryMatrixBehavior: { [gameId: string]: SecondaryMatrixBehavior },
  secondaryLabelKeyByGame: { [gameId: string]: string }
): string {
  const gameId = ticket.gameId || 'bonoloto';
  const colors = GAME_COLORS[gameId] || GAME_COLORS['bonoloto'];
  const hasSecondaryMatrix = (GAMES[gameId]?.maxStars || 0) > 0;
  const superset = ticket.combinations[0] || [];

  if (hasSecondaryMatrix) {
    const costData = calculateTicketCost(ticket, currentGameId);
    const defaultSecondary = secondaryMatrixBehavior[gameId]?.defaultSecondary || [1];
    const secondarySuperset = ticket.stars && ticket.stars[0] ? ticket.stars[0] : defaultSecondary;

    const secondaryLabelKey = secondaryLabelKeyByGame[gameId];
    const secondaryLabel = secondaryLabelKey ? t(secondaryLabelKey) : '';

    if (ticket.validation) {
      const winningWhiteSet = new Set(ticket.validation.winningNumbers);
      const winningStarsSet = new Set(ticket.validation.stars || []);

      const behavior = secondaryMatrixBehavior[gameId];
      const cascade = behavior ? behavior.calculateCascade(ticket, ticket.validation.winningNumbers, ticket.validation.stars || []) : null;

      let summaryTableHTML = '';
      if (cascade) {
        summaryTableHTML = renderCascadeSummaryTable(cascade, colors);
      }

      const combinationsListHTML = `
        <div class="saved-combination" style="flex-wrap: wrap; justify-content: center; margin-bottom: 10px;">
          <div class="saved-combination-content" style="flex-wrap: wrap; justify-content: center; gap: 6px;">
            ${superset.map(n => `<div class="saved-combination-number ${winningWhiteSet.has(n) ? 'selected' : ''}" style="background: ${winningWhiteSet.has(n) ? colors.ballWinningBg : SHARED_BALL_COLORS.defaultBg}; color: ${winningWhiteSet.has(n) ? colors.ballWinningText : SHARED_BALL_COLORS.defaultText};">${n}</div>`).join('')}
            <span style="margin: 0 4px; color: ${colors.secondaryLabelColor}; font-weight: bold; align-self: center;">${secondaryLabel}</span>
            ${secondarySuperset.map(r => `<div class="saved-combination-number" style="background: ${winningStarsSet.has(r) ? colors.secondaryWinningBg : colors.secondaryDefaultBg}; color: ${winningStarsSet.has(r) ? colors.secondaryWinningText : colors.secondaryDefaultText}; font-weight: bold;">${r}</div>`).join('')}
          </div>
        </div>
      `;

      return `
        <div style="background: ${colors.cardBg}; border: 1.5px solid ${colors.cardBorderThick}; border-radius: 10px; padding: 12px; margin-bottom: 8px;">
          <div style="font-weight: 700; color: ${colors.headerText}; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px;">
            <span>${t(`tickets.${gameId}.nombre`)} (${costData.totalBets} ${t('tickets.apuestasParentesis')})</span>
            <span style="background: ${colors.badgeBg}; color: ${colors.badgeText}; padding: 2px 8px; border-radius: 12px; font-size: 0.75rem; font-weight: bold;">${t('tickets.desgloseCategorias')}</span>
          </div>
          ${combinationsListHTML}
          ${summaryTableHTML}
        </div>
      `;

    } else {
      const combinationsListHTML = `
        <div class="saved-combination" style="flex-wrap: wrap; justify-content: center;">
          <div class="saved-combination-content" style="flex-wrap: wrap; justify-content: center; gap: 6px;">
            ${superset.map(n => `<div class="saved-combination-number" style="background: ${SHARED_BALL_COLORS.defaultBg}; color: ${SHARED_BALL_COLORS.defaultText};">${n}</div>`).join('')}
            <span style="margin: 0 4px; color: ${colors.secondaryLabelColor}; font-weight: bold; align-self: center;">${secondaryLabel}</span>
            ${secondarySuperset.map(r => `<div class="saved-combination-number" style="background: ${gameId === 'powerball' ? colors.ballWinningBg : colors.secondaryWinningBg}; color: ${colors.secondaryWinningText}; font-weight: bold;">${r}</div>`).join('')}
          </div>
        </div>
      `;

      return `
        <div style="background: ${colors.cardBg}; border: 1px solid ${colors.cardBorderThin}; border-radius: 10px; padding: 12px; margin-bottom: 8px;">
          <div style="font-weight: 700; color: ${colors.headerText}; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px;">
            <span>${t(`tickets.${gameId}.nombre`)} (${costData.totalBets} ${t('tickets.apuestasParentesis')})</span>
          </div>
          ${combinationsListHTML}
        </div>
      `;
    }

  } else {
    const explodedCombos = getCombinations(superset, 6);

    if (ticket.validation) {
      const winningNumbersSet = new Set(ticket.validation.winningNumbers);
      const breakdown = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
      explodedCombos.forEach(c => {
        const hits = c.filter(n => winningNumbersSet.has(n)).length;
        (breakdown as any)[hits]++;
      });

      const totalMatchesInSuperset = superset.filter(n => winningNumbersSet.has(n)).length;

      const summaryTableHTML = `
        <div style="margin-top: 10px; margin-bottom: 8px; font-weight: bold; color: ${colors.accentText};">
          🎯 ${totalMatchesInSuperset} aciertos sobre los ${superset.length} números seleccionados.
        </div>
        <table class="validation-summary-table" style="width: 100%; border-collapse: collapse; font-size: 0.82rem; margin-bottom: 8px;">
          <thead>
            <tr style="background: ${colors.tableHeaderBg}; color: ${colors.tableHeaderColor}; font-size: 0.8rem;">
              <th style="padding: 6px 10px; border: 1px solid ${colors.tableBorder}; text-align: left;">${t('tickets.aciertosColumna')}</th>
              <th style="padding: 6px 10px; border: 1px solid ${colors.tableBorder}; text-align: center;">${t('tickets.cantidadColumna')}</th>
            </tr>
          </thead>
          <tbody>
            <tr style="${breakdown[6] > 0 ? `background: ${colors.rowHighlightBg}; font-weight: bold; color: ${colors.headerText};` : `color: ${colors.neutralText};`}"><td style="padding: 6px 10px; border: 1px solid ${colors.tableBorder};">6 Aciertos</td><td style="padding: 6px 10px; border: 1px solid ${colors.tableBorder}; text-align: center; font-weight: 800; color: ${breakdown[6] > 0 ? colors.accentText : colors.neutralText};">${breakdown[6]}</td></tr>
            <tr style="${breakdown[5] > 0 ? `background: ${colors.rowHighlightBg}; font-weight: bold; color: ${colors.headerText};` : `color: ${colors.neutralText};`}"><td style="padding: 6px 10px; border: 1px solid ${colors.tableBorder};">5 Aciertos</td><td style="padding: 6px 10px; border: 1px solid ${colors.tableBorder}; text-align: center; font-weight: 800; color: ${breakdown[5] > 0 ? colors.accentText : colors.neutralText};">${breakdown[5]}</td></tr>
            <tr style="${breakdown[4] > 0 ? `background: ${colors.rowHighlightBg}; font-weight: bold; color: ${colors.headerText};` : `color: ${colors.neutralText};`}"><td style="padding: 6px 10px; border: 1px solid ${colors.tableBorder};">4 Aciertos</td><td style="padding: 6px 10px; border: 1px solid ${colors.tableBorder}; text-align: center; font-weight: 800; color: ${breakdown[4] > 0 ? colors.accentText : colors.neutralText};">${breakdown[4]}</td></tr>
            <tr style="${breakdown[3] > 0 ? `background: ${colors.rowHighlightBg}; font-weight: bold; color: ${colors.headerText};` : `color: ${colors.neutralText};`}"><td style="padding: 6px 10px; border: 1px solid ${colors.tableBorder};">3 Aciertos</td><td style="padding: 6px 10px; border: 1px solid ${colors.tableBorder}; text-align: center; font-weight: 800; color: ${breakdown[3] > 0 ? colors.accentText : colors.neutralText};">${breakdown[3]}</td></tr>
            <tr style="color: ${colors.neutralText};"><td style="padding: 6px 10px; border: 1px solid ${colors.tableBorder};">0-2 Aciertos</td><td style="padding: 6px 10px; border: 1px solid ${colors.tableBorder}; text-align: center; font-weight: 800;">${breakdown[0] + breakdown[1] + breakdown[2]}</td></tr>
          </tbody>
        </table>
      `;

      return `
        <div style="background: ${colors.cardBg}; border: 1.5px solid ${colors.cardBorderThick}; border-radius: 10px; padding: 12px; margin-bottom: 8px;">
          <div style="font-weight: 700; color: ${colors.headerText}; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px;">
            <span>${t(`tickets.${gameId}.nombre`)} (${explodedCombos.length} ${t('tickets.apuestasParentesis')})</span>
            <span style="background: ${colors.badgeBg}; color: ${colors.badgeText}; padding: 2px 8px; border-radius: 12px; font-size: 0.75rem; font-weight: bold;">${t('tickets.multipleDe')} ${superset.length}</span>
          </div>
          <div class="saved-combination" style="flex-wrap: wrap; justify-content: center; margin-bottom: 10px;">
            <div class="saved-combination-content" style="flex-wrap: wrap; justify-content: center; gap: 6px;">
              ${superset.map(n => `<div class="saved-combination-number ${winningNumbersSet.has(n) ? 'selected' : ''}">${n}</div>`).join('')}
            </div>
          </div>
          ${summaryTableHTML}
        </div>
      `;

    } else {
      return `
        <div style="background: ${colors.cardBg}; border: 1px solid ${colors.cardBorderThin}; border-radius: 10px; padding: 12px; margin-bottom: 8px;">
          <div style="font-weight: 700; color: ${colors.headerText}; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px;">
            <span>${t(`tickets.${gameId}.nombre`)} (${explodedCombos.length} ${t('tickets.apuestasParentesis')})</span>
            <span style="background: ${colors.badgeBg}; color: ${colors.badgeText}; padding: 2px 8px; border-radius: 12px; font-size: 0.75rem; font-weight: bold;">${t('tickets.multipleDe')} ${superset.length}</span>
          </div>
          <div class="saved-combination" style="flex-wrap: wrap; justify-content: center;">
            <div class="saved-combination-content" style="flex-wrap: wrap; justify-content: center; gap: 6px;">
              ${superset.map(n => `<div class="saved-combination-number">${n}</div>`).join('')}
            </div>
          </div>
        </div>
      `;
    }
  }
}

