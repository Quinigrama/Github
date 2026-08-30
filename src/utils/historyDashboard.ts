import { Ticket } from "../types";
import { getGameConfig } from "../../game-configs";
import { t } from "./i18n";

export function updateHistoryDashboard(
  savedTickets: Ticket[],
  controlGroupStats: { [gameId: string]: { '6': number, '5': number, '4': number, '3': number, '<=2': number, totalValidated: number } } = {}
) {
  const hrGameFilter = document.getElementById('hrGameFilter') as HTMLSelectElement;
  const hrGameFilterVal = hrGameFilter ? hrGameFilter.value : 'all';

  // Filter tickets
  const filteredTickets = hrGameFilterVal === 'all'
    ? savedTickets
    : savedTickets.filter(tk => tk.gameId === hrGameFilterVal);

  // Calculate total combinations generated
  let totalCombinations = 0;
  filteredTickets.forEach(ticket => {
      if (ticket.strategy === 'multiple' && ticket.combinations[0].length > 6) {
           const n = ticket.combinations[0].length;
           let combos = 1;
           for(let i=0; i<6; i++) combos *= (n-i)/(i+1);
           totalCombinations += Math.round(combos);
      } else {
           totalCombinations += ticket.combinations.length;
      }
  });

  const elTotal = document.getElementById('hrTotalCombinations');
  if (elTotal) elTotal.innerHTML = String(totalCombinations);

  // Calculate validated combinations
  const validatedTickets = filteredTickets.filter(t => t.validation && Array.isArray(t.validation.hits));
  let validatedCombinations = 0;
  validatedTickets.forEach(ticket => {
      validatedCombinations += (ticket.validation?.hits?.length || 0);
  });

  const elValidated = document.getElementById('hrValidatedCombinations');
  if (elValidated) elValidated.innerHTML = String(validatedCombinations);

  // Calculate best combination (maximum hits)
  let maxHit = 0;
  let maxHitStars = 0;
  let hasStarsInBest = false;
  validatedTickets.forEach(ticket => {
      ticket.validation!.hits.forEach((hit, idx) => {
          const stars = ticket.validation!.starHits ? ticket.validation!.starHits[idx] : 0;
          if (hit > maxHit || (hit === maxHit && stars > maxHitStars)) {
              maxHit = hit;
              maxHitStars = stars;
              if (ticket.validation!.starHits) {
                  hasStarsInBest = true;
              }
          }
      });
  });

  const elBest = document.getElementById('hrBestCombination');
  if (elBest) {
      if (validatedCombinations > 0) {
          let bestText = `${maxHit} ${t('tickets.aciertos')}`;
          if (hasStarsInBest && maxHitStars > 0) {
              bestText += ` + ${maxHitStars} ⭐`;
          }
          elBest.innerHTML = bestText;
      } else {
          elBest.innerHTML = '-';
      }
  }

  // Comparison Table Body
  const tableBody = document.getElementById('hrComparisonTableBody');
  const warningEl = document.getElementById('hrNoValidationWarning');
  
  if (tableBody) {
      tableBody.innerHTML = '';
      
      if (validatedCombinations === 0) {
          if (warningEl) warningEl.style.display = 'block';
      } else {
          if (warningEl) warningEl.style.display = 'none';

          // Count actual hits
          const actualHitCounts: { [tier: string]: number } = { '6': 0, '5': 0, '4': 0, '3': 0, '<=2': 0 };
          const validatedCountsByGame: { [gameId: string]: number } = {};

          validatedTickets.forEach(ticket => {
              const gameId = ticket.gameId || 'bonoloto';
              const numCombos = ticket.validation!.hits.length;
              validatedCountsByGame[gameId] = (validatedCountsByGame[gameId] || 0) + numCombos;

              ticket.validation!.hits.forEach(hitCount => {
                  if (hitCount >= 6) {
                      actualHitCounts['6']++;
                  } else if (hitCount === 5) {
                      actualHitCounts['5']++;
                  } else if (hitCount === 4) {
                      actualHitCounts['4']++;
                  } else if (hitCount === 3) {
                      actualHitCounts['3']++;
                  } else {
                      actualHitCounts['<=2']++;
                  }
              });
          });

          // Adjust tiers depending on active game filter
          let activeTiers = ['6', '5', '4', '3', '<=2'];
          if (hrGameFilterVal !== 'all') {
              const cfg = getGameConfig(hrGameFilterVal);
              if (cfg && cfg.maxNumbers === 5) {
                  activeTiers = ['5', '4', '3', '<=2'];
              }
          }

          const getTheoreticalProb = (tier: string): number => {
              if (hrGameFilterVal !== 'all') {
                  const cfg = getGameConfig(hrGameFilterVal);
                  return cfg && cfg.theoreticalProbabilities ? (cfg.theoreticalProbabilities[tier] || 0) : 0;
              }
              
              // Weighted average for 'all'
              let sumWeightedProbs = 0;
              let totalWeight = 0;
              Object.entries(validatedCountsByGame).forEach(([gameId, count]) => {
                  const cfg = getGameConfig(gameId);
                  if (count > 0 && cfg && cfg.theoreticalProbabilities) {
                      const prob = cfg.theoreticalProbabilities[tier] || 0;
                      sumWeightedProbs += count * prob;
                      totalWeight += count;
                  }
              });
              if (totalWeight > 0) return sumWeightedProbs / totalWeight;
              return getGameConfig('bonoloto').theoreticalProbabilities[tier] || 0;
          };

          const tierLabels: { [key: string]: string } = {
              '6': t('history.tier.6'),
              '5': t('history.tier.5'),
              '4': t('history.tier.4'),
              '3': t('history.tier.3'),
              '<=2': t('history.tier.menos2')
          };

          // Aggregate control group counts across the currently relevant game(s)
          const relevantGameIds = hrGameFilterVal !== 'all' ? [hrGameFilterVal] : Object.keys(validatedCountsByGame);
          const controlTotals = { '6': 0, '5': 0, '4': 0, '3': 0, '<=2': 0, totalValidated: 0 };
          relevantGameIds.forEach(gid => {
              const gStats = controlGroupStats[gid];
              if (gStats) {
                  controlTotals['6'] += gStats['6'];
                  controlTotals['5'] += gStats['5'];
                  controlTotals['4'] += gStats['4'];
                  controlTotals['3'] += gStats['3'];
                  controlTotals['<=2'] += gStats['<=2'];
                  controlTotals.totalValidated += gStats.totalValidated;
              }
          });

          activeTiers.forEach(tier => {
              const count = actualHitCounts[tier] || 0;
              const actualFrequency = (count / validatedCombinations) * 100;
              const theoreticalFrequency = getTheoreticalProb(tier);
              const controlCount = controlTotals[tier as '6' | '5' | '4' | '3' | '<=2'] || 0;
              const controlFrequency = controlTotals.totalValidated > 0 ? (controlCount / controlTotals.totalValidated) * 100 : 0;

              let perfBadge = '';
              if (count === 0 && theoreticalFrequency === 0) {
                  perfBadge = `<span style="background: #f3f4f6; color: #4b5563; padding: 4px 8px; border-radius: 6px; font-size: 0.8rem; font-weight: 500;">${t('history.sinDatos')}</span>`;
              } else if (actualFrequency > theoreticalFrequency) {
                  const timesBetter = theoreticalFrequency > 0 ? (actualFrequency / theoreticalFrequency).toFixed(1) : 'N/A';
                  const percentBetter = theoreticalFrequency > 0 ? (((actualFrequency - theoreticalFrequency) / theoreticalFrequency) * 100).toFixed(0) : '0';
                  perfBadge = `<span style="background: #dcfce7; color: #15803d; padding: 4px 8px; border-radius: 6px; font-size: 0.8rem; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;">${t('history.superior', { timesBetter, percentBetter })}</span>`;
              } else if (actualFrequency === theoreticalFrequency) {
                  perfBadge = `<span style="background: #f3f4f6; color: #4b5563; padding: 4px 8px; border-radius: 6px; font-size: 0.8rem; font-weight: 500;">${t('history.esperado')}</span>`;
              } else {
                  const timesWorse = actualFrequency > 0 && theoreticalFrequency > 0 ? (theoreticalFrequency / actualFrequency).toFixed(1) : '∞';
                  perfBadge = `<span style="background: #fee2e2; color: #b91c1c; padding: 4px 8px; border-radius: 6px; font-size: 0.8rem; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;">📉 ${actualFrequency > 0 ? t('history.inferior', { timesWorse }) : t('history.ceroAciertos')}</span>`;
              }

              const hasControlData = controlTotals.totalValidated > 0;
              let realCellStyle = "padding: 12px 8px; text-align: center; font-weight: 600; color: var(--primary);";
              let controlCellHtml = `<td style="padding: 12px 8px; text-align: center; color: #9ca3af;">${t('history.sinDatos')}</td>`;

              // Provisional badge (vs theoretical probability) — used only while no control data exists yet.
              const provisionalBadge = perfBadge.replace(
                  /background: (#dcfce7|#fee2e2|#f3f4f6); color: (#15803d|#b91c1c|#4b5563);/,
                  'background: #fef3c7; color: #92400e;'
              ).replace('display: inline-flex;', 'display: inline-flex;').replace(
                  />/,
                  `>⏳ `
              );

              let finalBadge = provisionalBadge;

              if (hasControlData) {
                  const realWins = actualFrequency > controlFrequency;
                  const controlWins = controlFrequency > actualFrequency;
                  if (realWins) {
                      realCellStyle = "padding: 12px 8px; text-align: center; font-weight: 700; color: #15803d; background: #dcfce7; border-radius: 6px;";
                  }
                  const controlCellStyle = controlWins
                      ? "padding: 12px 8px; text-align: center; font-weight: 700; color: #15803d; background: #dcfce7; border-radius: 6px;"
                      : "padding: 12px 8px; text-align: center; color: #4b5563;";
                  controlCellHtml = `<td style="${controlCellStyle}">${controlFrequency.toFixed(4)}%</td>`;

                  // Rendimiento vs Control: compares actualFrequency against controlFrequency (not theoretical).
                  if (actualFrequency === 0 && controlFrequency === 0) {
                      finalBadge = `<span style="background: #f3f4f6; color: #4b5563; padding: 4px 8px; border-radius: 6px; font-size: 0.8rem; font-weight: 500;">${t('history.sinDatos')}</span>`;
                  } else if (actualFrequency > controlFrequency) {
                      const timesBetter = controlFrequency > 0 ? (actualFrequency / controlFrequency).toFixed(1) : 'N/A';
                      const percentBetter = controlFrequency > 0 ? (((actualFrequency - controlFrequency) / controlFrequency) * 100).toFixed(0) : '0';
                      finalBadge = `<span style="background: #dcfce7; color: #15803d; padding: 4px 8px; border-radius: 6px; font-size: 0.8rem; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;">${t('history.superior', { timesBetter, percentBetter })}</span>`;
                  } else if (actualFrequency === controlFrequency) {
                      finalBadge = `<span style="background: #f3f4f6; color: #4b5563; padding: 4px 8px; border-radius: 6px; font-size: 0.8rem; font-weight: 500;">${t('history.esperado')}</span>`;
                  } else {
                      const timesWorse = actualFrequency > 0 && controlFrequency > 0 ? (controlFrequency / actualFrequency).toFixed(1) : '∞';
                      finalBadge = `<span style="background: #fee2e2; color: #b91c1c; padding: 4px 8px; border-radius: 6px; font-size: 0.8rem; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;">📉 ${actualFrequency > 0 ? t('history.inferior', { timesWorse }) : t('history.ceroAciertos')}</span>`;
                  }
              }

              tableBody.innerHTML += `
                  <tr style="border-bottom: 1px solid #f3f4f6; hover:background-color: #fafafa;">
                      <td style="padding: 12px 8px; font-weight: 500; color: #111827;">${tierLabels[tier] || tier}</td>
                      <td style="padding: 12px 8px; text-align: center;">${count}</td>
                      <td style="${realCellStyle}">${actualFrequency.toFixed(4)}%</td>
                      ${controlCellHtml}
                      <td style="padding: 12px 8px; text-align: center; color: #4b5563;">${theoreticalFrequency.toFixed(4)}%</td>
                      <td style="padding: 12px 8px; text-align: right;">${finalBadge}</td>
                  </tr>
              `;
          });
      }
  }

  // Strategy Distribution
  const strategyCounts: { [key: string]: { total: number, validated: number, maxHits: number } } = {};
  const strategyMap: { [key: string]: string } = { simple: t('tickets.strategy.simple'), winning: t('history.estrategiaGanadora'), multiple: t('tickets.strategy.multiple') };

  filteredTickets.forEach(ticket => {
      const strat = ticket.strategy || 'simple';
      if (!strategyCounts[strat]) {
          strategyCounts[strat] = { total: 0, validated: 0, maxHits: 0 };
      }
      
      let combosCount = 0;
      if (ticket.strategy === 'multiple' && ticket.combinations[0].length > 6) {
           const n = ticket.combinations[0].length;
           let combos = 1;
           for(let i=0; i<6; i++) combos *= (n-i)/(i+1);
           combosCount = Math.round(combos);
      } else {
           combosCount = ticket.combinations.length;
      }

      strategyCounts[strat].total += combosCount;
      if (ticket.validation && Array.isArray(ticket.validation.hits) && ticket.validation.hits.length > 0) {
          strategyCounts[strat].validated += ticket.validation.hits.length;
          const ticketMax = Math.max(...ticket.validation.hits);
          if (ticketMax > strategyCounts[strat].maxHits) {
              strategyCounts[strat].maxHits = ticketMax;
          }
      }
  });

  const elStrategyDist = document.getElementById('hrStrategyDistribution');
  if (elStrategyDist) {
      let stratHtml = '';
      Object.entries(strategyCounts).forEach(([stratKey, data]) => {
          const name = strategyMap[stratKey] || stratKey;
          stratHtml += `
              <div style="background: #f9fafb; border: 1px solid #f3f4f6; border-radius: 8px; padding: 12px; display: flex; justify-content: space-between; align-items: center;">
                  <div>
                      <span style="font-weight: 600; color: #374151;">${name}</span>
                      <div style="font-size: 0.8rem; color: #6b7280;">${t('history.apuestasGeneradas', { total: data.total, validated: data.validated })}</div>
                  </div>
                  <div style="text-align: right;">
                      <div style="font-size: 0.8rem; color: #4b5563; font-weight: 500;">${t('history.mejorResultado')}</div>
                      <span style="background: #eff6ff; color: #1e40af; padding: 2px 8px; border-radius: 4px; font-size: 0.85rem; font-weight: 600;">${data.validated > 0 ? `${data.maxHits} ${t('tickets.aciertos')}` : t('history.sinDatos')}</span>
                  </div>
              </div>
          `;
      });
      if (!stratHtml) {
          stratHtml = `<div style="color: #6b7280; font-style: italic; text-align: center; padding: 10px;">${t('history.sinCombinaciones')}</div>`;
      }
      elStrategyDist.innerHTML = stratHtml;
  }
}
