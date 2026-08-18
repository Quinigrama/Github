import { Ticket, Draw } from '../types';
import { GAMES, getGameConfig } from '../../game-configs';

/**
 * Calculates combinations n choose r (nCr)
 */
export function nCr(n: number, r: number): number {
  if (r > n) return 0;
  if (r === 0 || r === n) return 1;
  let res = 1;
  for (let i = 1; i <= r; i++) {
    res = (res * (n - i + 1)) / i;
  }
  return Math.round(res);
}

/**
 * Generates all k-combinations from a source array
 */
export function getCombinations(source: number[], k: number): number[][] {
  if (k > source.length || k <= 0) return [];
  if (k === source.length) return [source];
  if (k === 1) return source.map(item => [item]);

  const result: number[][] = [];
  const stack: [number, number[]][] = [[0, []]];
  while (stack.length > 0) {
    const [index, currentCombo] = stack.pop()!;

    if (currentCombo.length === k) {
      result.push(currentCombo);
      continue;
    }
    if (index >= source.length) continue;

    stack.push([index + 1, currentCombo]);
    stack.push([index + 1, [...currentCombo, source[index]]]);
  }
  return result;
}

/**
 * Calculates total bets, unit cost, total cost and formatted cost string for a ticket
 */
export function calculateTicketCost(
  ticket: { gameId?: string; strategy?: string; combinations: number[][]; stars?: number[][]; hasPowerPlay?: boolean },
  defaultGameId: string = 'bonoloto'
): {
  totalBets: number;
  costPerBet: number;
  totalCost: number;
  currency: string;
  formattedCost: string;
} {
  const gameId = ticket.gameId || defaultGameId;
  const game = getGameConfig(gameId);
  const currency = game.currency;
  const costPerBet = game.costPerBet;

  let totalBets = 0;

  if (ticket.strategy === 'multiple' && ticket.combinations.length > 0) {
    const whiteCount = ticket.combinations[0].length;
    const k = game.maxNumbers || 5;

    let whiteCombos = 1;
    if ((gameId === 'primitiva' || gameId === 'bonoloto') && whiteCount === 5) {
      whiteCombos = 44;
    } else if (whiteCount >= k) {
      for (let i = 1; i <= k; i++) {
        whiteCombos *= (whiteCount - i + 1);
        whiteCombos /= i;
      }
      whiteCombos = Math.round(whiteCombos);
    }

    let starCombos = 1;
    const maxStars = game.maxStars || 0;
    if (maxStars > 0 && ticket.stars && ticket.stars.length > 0) {
      const starCount = ticket.stars[0].length;
      if (starCount >= maxStars) {
        for (let i = 1; i <= maxStars; i++) {
          starCombos *= (starCount - i + 1);
          starCombos /= i;
        }
        starCombos = Math.round(starCombos);
      }
    }

    totalBets = whiteCombos * starCombos;
  } else {
    totalBets = ticket.combinations.length;
  }

  const totalCost = totalBets * costPerBet;
  const formattedCost = `${currency}${totalCost.toFixed(2)}`;

  return {
    totalBets,
    costPerBet,
    totalCost,
    currency,
    formattedCost
  };
}

/**
 * Calculates Powerball cascade breakdown
 */
export function calculatePowerballCascade(
  ticket: Ticket,
  winningNumbers: number[],
  winningStars: number[] = []
) {
  const winningWhiteSet = new Set(winningNumbers);
  const winningRedSet = new Set(winningStars);

  const tierDefs = [
    { key: '5+1', name: '5 Blancas + Powerball (Jackpot)', h: 5, s: 1, base: 100000000 },
    { key: '5+0', name: '5 Blancas ($1.000.000)', h: 5, s: 0, base: 1000000 },
    { key: '4+1', name: '4 Blancas + Powerball', h: 4, s: 1, base: 50000 },
    { key: '4+0', name: '4 Blancas', h: 4, s: 0, base: 100 },
    { key: '3+1', name: '3 Blancas + Powerball', h: 3, s: 1, base: 100 },
    { key: '3+0', name: '3 Blancas', h: 3, s: 0, base: 7 },
    { key: '2+1', name: '2 Blancas + Powerball', h: 2, s: 1, base: 7 },
    { key: '1+1', name: '1 Blanca + Powerball', h: 1, s: 1, base: 4 },
    { key: '0+1', name: 'Powerball sola', h: 0, s: 1, base: 4 }
  ];

  const counts: { [key: string]: number } = {};
  tierDefs.forEach(td => counts[td.key] = 0);

  let subWhiteCombos: number[][] = [];
  let subRedCombos: number[][] = [];

  const isMultiple = ticket.strategy === 'multiple' || (ticket.combinations.length > 0 && ticket.combinations[0].length > 5);

  if (isMultiple && ticket.combinations.length > 0) {
    const whiteSuperset = ticket.combinations[0];
    subWhiteCombos = getCombinations(whiteSuperset, 5);
    const redSuperset = (ticket.stars && ticket.stars.length > 0) ? ticket.stars[0] : [1];
    subRedCombos = redSuperset.map(r => [r]);
  } else {
    subWhiteCombos = ticket.combinations;
    if (ticket.stars && ticket.stars.length > 0) {
      subRedCombos = ticket.stars;
    } else {
      subRedCombos = ticket.combinations.map(() => [1]);
    }
  }

  let totalSubBets = 0;

  if (isMultiple) {
    for (const wCombo of subWhiteCombos) {
      const wHits = wCombo.filter(n => winningWhiteSet.has(n)).length;
      for (const rCombo of subRedCombos) {
        totalSubBets++;
        const rHits = rCombo.filter(r => winningRedSet.has(r)).length;
        const matchingTier = tierDefs.find(td => td.h === wHits && td.s === rHits);
        if (matchingTier) {
          counts[matchingTier.key]++;
        }
      }
    }
  } else {
    subWhiteCombos.forEach((wCombo, idx) => {
      totalSubBets++;
      const wHits = wCombo.filter(n => winningWhiteSet.has(n)).length;
      const rCombo = subRedCombos[idx] || subRedCombos[0] || [1];
      const rHits = rCombo.filter(r => winningRedSet.has(r)).length;
      const matchingTier = tierDefs.find(td => td.h === wHits && td.s === rHits);
      if (matchingTier) {
        counts[matchingTier.key]++;
      }
    });
  }

  let totalPayout = 0;
  const tiersResult: {
    category: string;
    name: string;
    hits: number;
    starHits: number;
    basePrize: number;
    multiplierPrize: number;
    count: number;
    totalPrize: number;
  }[] = [];

  tierDefs.forEach(td => {
    const count = counts[td.key] || 0;
    const unitPrize = td.base;
    const totalForTier = count * unitPrize;
    totalPayout += totalForTier;

    if (count > 0 || isMultiple) {
      tiersResult.push({
        category: td.key,
        name: td.name,
        hits: td.h,
        starHits: td.s,
        basePrize: td.base,
        multiplierPrize: unitPrize,
        count,
        totalPrize: totalForTier
      });
    }
  });

  return {
    tiers: tiersResult,
    totalPayout,
    totalSubBets
  };
}

/**
 * Calculates Mega Millions cascade breakdown
 */
export function calculateMegaMillionsCascade(
  ticket: Ticket,
  winningNumbers: number[],
  winningStars: number[] = []
) {
  const winningWhiteSet = new Set(winningNumbers);
  const winningGoldSet = new Set(winningStars);

  const tierDefs = [
    { key: '5+1', name: '5 Blancas + Mega Ball (Jackpot)', h: 5, s: 1, base: 100000000 },
    { key: '5+0', name: '5 Blancas ($1.000.000)', h: 5, s: 0, base: 1000000 },
    { key: '4+1', name: '4 Blancas + Mega Ball ($10.000)', h: 4, s: 1, base: 10000 },
    { key: '4+0', name: '4 Blancas ($500)', h: 4, s: 0, base: 500 },
    { key: '3+1', name: '3 Blancas + Mega Ball ($200)', h: 3, s: 1, base: 200 },
    { key: '3+0', name: '3 Blancas ($10)', h: 3, s: 0, base: 10 },
    { key: '2+1', name: '2 Blancas + Mega Ball ($10)', h: 2, s: 1, base: 10 },
    { key: '1+1', name: '1 Blanca + Mega Ball ($4)', h: 1, s: 1, base: 4 },
    { key: '0+1', name: 'Mega Ball sola ($2)', h: 0, s: 1, base: 2 }
  ];

  const counts: { [key: string]: number } = {};
  tierDefs.forEach(td => counts[td.key] = 0);

  let subWhiteCombos: number[][] = [];
  let subGoldCombos: number[][] = [];

  const isMultiple = ticket.strategy === 'multiple' || (ticket.combinations.length > 0 && ticket.combinations[0].length > 5);

  if (isMultiple && ticket.combinations.length > 0) {
    const whiteSuperset = ticket.combinations[0];
    subWhiteCombos = getCombinations(whiteSuperset, 5);
    const goldSuperset = (ticket.stars && ticket.stars.length > 0) ? ticket.stars[0] : [1];
    subGoldCombos = goldSuperset.map(r => [r]);
  } else {
    subWhiteCombos = ticket.combinations;
    if (ticket.stars && ticket.stars.length > 0) {
      subGoldCombos = ticket.stars;
    } else {
      subGoldCombos = ticket.combinations.map(() => [1]);
    }
  }

  let totalSubBets = 0;

  if (isMultiple) {
    for (const wCombo of subWhiteCombos) {
      const wHits = wCombo.filter(n => winningWhiteSet.has(n)).length;
      for (const gCombo of subGoldCombos) {
        totalSubBets++;
        const gHits = gCombo.filter(r => winningGoldSet.has(r)).length;
        const matchingTier = tierDefs.find(td => td.h === wHits && td.s === gHits);
        if (matchingTier) {
          counts[matchingTier.key]++;
        }
      }
    }
  } else {
    subWhiteCombos.forEach((wCombo, idx) => {
      totalSubBets++;
      const wHits = wCombo.filter(n => winningWhiteSet.has(n)).length;
      const gCombo = subGoldCombos[idx] || subGoldCombos[0] || [1];
      const gHits = gCombo.filter(r => winningGoldSet.has(r)).length;
      const matchingTier = tierDefs.find(td => td.h === wHits && td.s === gHits);
      if (matchingTier) {
        counts[matchingTier.key]++;
      }
    });
  }

  let totalPayout = 0;
  const tiersResult: {
    category: string;
    name: string;
    hits: number;
    starHits: number;
    basePrize: number;
    multiplierPrize: number;
    count: number;
    totalPrize: number;
  }[] = [];

  tierDefs.forEach(td => {
    const count = counts[td.key] || 0;
    const unitPrize = td.base;
    const totalForTier = count * unitPrize;
    totalPayout += totalForTier;

    if (count > 0 || isMultiple) {
      tiersResult.push({
        category: td.key,
        name: td.name,
        hits: td.h,
        starHits: td.s,
        basePrize: td.base,
        multiplierPrize: unitPrize,
        count,
        totalPrize: totalForTier
      });
    }
  });

  return {
    tiers: tiersResult,
    totalPayout,
    totalSubBets
  };
}

/**
 * Calculates Euromillones cascade breakdown
 */
export function calculateEuromillonesCascade(
  ticket: Ticket,
  winningNumbers: number[],
  winningStars: number[] = []
) {
  const winningWhiteSet = new Set(winningNumbers);
  const winningStarSet = new Set(winningStars);

  const tierDefs = [
    { key: '5+2', name: '1ª Cat: 5 Números + 2 Estrellas (Jackpot)', h: 5, s: 2, base: 17000000, isJackpot: true },
    { key: '5+1', name: '2ª Cat: 5 Números + 1 Estrella', h: 5, s: 1, base: 200000 },
    { key: '5+0', name: '3ª Cat: 5 Números + 0 Estrellas', h: 5, s: 0, base: 20000 },
    { key: '4+2', name: '4ª Cat: 4 Números + 2 Estrellas', h: 4, s: 2, base: 1500 },
    { key: '4+1', name: '5ª Cat: 4 Números + 1 Estrella', h: 4, s: 1, base: 120 },
    { key: '3+2', name: '6ª Cat: 3 Números + 2 Estrellas', h: 3, s: 2, base: 60 },
    { key: '4+0', name: '7ª Cat: 4 Números + 0 Estrellas', h: 4, s: 0, base: 40 },
    { key: '2+2', name: '8ª Cat: 2 Números + 2 Estrellas', h: 2, s: 2, base: 15 },
    { key: '3+1', name: '9ª Cat: 3 Números + 1 Estrella', h: 3, s: 1, base: 12 },
    { key: '3+0', name: '10ª Cat: 3 Números + 0 Estrellas', h: 3, s: 0, base: 10 },
    { key: '1+2', name: '11ª Cat: 1 Número + 2 Estrellas', h: 1, s: 2, base: 9 },
    { key: '2+1', name: '12ª Cat: 2 Números + 1 Estrella', h: 2, s: 1, base: 7 },
    { key: '2+0', name: '13ª Cat: 2 Números + 0 Estrellas', h: 2, s: 0, base: 4 }
  ];

  const counts: { [key: string]: number } = {};
  tierDefs.forEach(td => counts[td.key] = 0);

  let subWhiteCombos: number[][] = [];
  let subStarCombos: number[][] = [];

  const isMultiple = ticket.strategy === 'multiple' || (ticket.combinations.length > 0 && (
    ticket.combinations[0].length > 5 ||
    (ticket.stars && ticket.stars.length > 0 && ticket.stars[0].length > 2)
  ));

  if (isMultiple && ticket.combinations.length > 0) {
    const whiteSuperset = ticket.combinations[0];
    subWhiteCombos = whiteSuperset.length >= 5 ? getCombinations(whiteSuperset, 5) : [whiteSuperset];

    const starSuperset = (ticket.stars && ticket.stars.length > 0) ? ticket.stars[0] : [1, 2];
    subStarCombos = starSuperset.length >= 2 ? getCombinations(starSuperset, 2) : [starSuperset];
  } else {
    subWhiteCombos = ticket.combinations;
    if (ticket.stars && ticket.stars.length > 0) {
      subStarCombos = ticket.stars;
    } else {
      subStarCombos = ticket.combinations.map(() => [1, 2]);
    }
  }

  let totalSubBets = 0;

  if (isMultiple) {
    for (const wCombo of subWhiteCombos) {
      const wHits = wCombo.filter(n => winningWhiteSet.has(n)).length;
      for (const sCombo of subStarCombos) {
        totalSubBets++;
        const sHits = sCombo.filter(s => winningStarSet.has(s)).length;
        const matchingTier = tierDefs.find(td => td.h === wHits && td.s === sHits);
        if (matchingTier) {
          counts[matchingTier.key]++;
        }
      }
    }
  } else {
    subWhiteCombos.forEach((wCombo, idx) => {
      totalSubBets++;
      const wHits = wCombo.filter(n => winningWhiteSet.has(n)).length;
      const sCombo = subStarCombos[idx] || subStarCombos[0] || [];
      const sHits = sCombo.filter(s => winningStarSet.has(s)).length;
      const matchingTier = tierDefs.find(td => td.h === wHits && td.s === sHits);
      if (matchingTier) {
        counts[matchingTier.key]++;
      }
    });
  }

  let totalPayout = 0;
  const tiersResult: {
    category: string;
    name: string;
    hits: number;
    starHits: number;
    basePrize: number;
    count: number;
    totalPrize: number;
  }[] = [];

  tierDefs.forEach(td => {
    const count = counts[td.key] || 0;
    const totalForTier = count * td.base;
    totalPayout += totalForTier;

    if (count > 0 || isMultiple) {
      tiersResult.push({
        category: td.key,
        name: td.name,
        hits: td.h,
        starHits: td.s,
        basePrize: td.base,
        count,
        totalPrize: totalForTier
      });
    }
  });

  return {
    tiers: tiersResult,
    totalPayout,
    totalSubBets
  };
}

/**
 * Calculates Eurodreams cascade breakdown
 */
export function calculateEurodreamsCascade(
  ticket: { strategy?: string; combinations: number[][]; stars?: number[][] },
  winningNumbers: number[],
  winningStars: number[] = []
) {
  const winningWhiteSet = new Set(winningNumbers);
  const winningDreamSet = new Set(winningStars);

  const tierDefs = [
    { key: '6+1', name: '1ª Cat: 6 Números + 1 Sueño (20.000 €/mes 30 años)', h: 6, s: 1, base: 7200000 },
    { key: '6+0', name: '2ª Cat: 6 Números + 0 Sueños (2.000 €/mes 5 años)', h: 6, s: 0, base: 120000 },
    { key: '5+0', name: '3ª Cat: 5 Números', h: 5, s: 0, base: 120 },
    { key: '4+0', name: '4ª Cat: 4 Números', h: 4, s: 0, base: 40 },
    { key: '3+0', name: '5ª Cat: 3 Números', h: 3, s: 0, base: 15 },
    { key: '2+0', name: '6ª Cat: 2 Números (Reintegro)', h: 2, s: 0, base: 2.50 }
  ];

  const counts: { [key: string]: number } = {};
  tierDefs.forEach(td => counts[td.key] = 0);

  let subWhiteCombos: number[][] = [];
  let subStarCombos: number[][] = [];

  const isMultiple = ticket.strategy === 'multiple' || ticket.strategy === 'reducida' || (ticket.combinations.length > 0 && (
    ticket.combinations[0].length > 6 ||
    (ticket.stars && ticket.stars.length > 0 && ticket.stars[0].length > 1)
  ));

  if (isMultiple && ticket.combinations.length > 0) {
    if (ticket.strategy === 'reducida') {
      subWhiteCombos = ticket.combinations;
      subStarCombos = (ticket.stars && ticket.stars.length > 0) ? ticket.stars : ticket.combinations.map(() => [1]);
    } else {
      const whiteSuperset = ticket.combinations[0];
      subWhiteCombos = whiteSuperset.length >= 6 ? getCombinations(whiteSuperset, 6) : [whiteSuperset];

      const starSuperset = (ticket.stars && ticket.stars.length > 0) ? ticket.stars[0] : [1];
      subStarCombos = starSuperset.length >= 1 ? getCombinations(starSuperset, 1) : [starSuperset];
    }
  } else {
    subWhiteCombos = ticket.combinations;
    if (ticket.stars && ticket.stars.length > 0) {
      subStarCombos = ticket.stars;
    } else {
      subStarCombos = ticket.combinations.map(() => [1]);
    }
  }

  let totalSubBets = 0;

  for (const wCombo of subWhiteCombos) {
    const wHits = wCombo.filter(n => winningWhiteSet.has(n)).length;
    for (const sCombo of subStarCombos) {
      totalSubBets++;
      const sHits = sCombo.filter(s => winningDreamSet.has(s)).length;

      if (wHits === 6 && sHits === 1) counts['6+1']++;
      else if (wHits === 6 && sHits === 0) counts['6+0']++;
      else if (wHits === 5) counts['5+0']++;
      else if (wHits === 4) counts['4+0']++;
      else if (wHits === 3) counts['3+0']++;
      else if (wHits === 2) counts['2+0']++;
    }
  }

  let totalPayout = 0;
  const tiersResult: {
    category: string;
    name: string;
    hits: number;
    starHits: number;
    basePrize: number;
    count: number;
    totalPrize: number;
  }[] = [];

  tierDefs.forEach(td => {
    const count = counts[td.key] || 0;
    const totalForTier = count * td.base;
    totalPayout += totalForTier;

    if (count > 0 || isMultiple) {
      tiersResult.push({
        category: td.key,
        name: td.name,
        hits: td.h,
        starHits: td.s,
        basePrize: td.base,
        count,
        totalPrize: totalForTier
      });
    }
  });

  return {
    tiers: tiersResult,
    totalPayout,
    totalSubBets
  };
}

/**
 * Calculates El Gordo de la Primitiva cascade breakdown
 */
export function calculateGordoCascade(
  ticket: { strategy?: string; combinations: number[][]; stars?: number[][] },
  winningNumbers: number[],
  winningStars: number[] = []
) {
  const winningWhiteSet = new Set(winningNumbers);
  const winningClaveSet = new Set(winningStars);

  const tierDefs = [
    { key: '5+1', name: '1ª Cat: 5 Números + Clave (Jackpot)', h: 5, c: 1, base: 5000000 },
    { key: '5+0', name: '2ª Cat: 5 Números + 0 Clave', h: 5, c: 0, base: 150000 },
    { key: '4+1', name: '3ª Cat: 4 Números + Clave', h: 4, c: 1, base: 2000 },
    { key: '4+0', name: '4ª Cat: 4 Números + 0 Clave', h: 4, c: 0, base: 200 },
    { key: '3+1', name: '5ª Cat: 3 Números + Clave', h: 3, c: 1, base: 50 },
    { key: '3+0', name: '6ª Cat: 3 Números + 0 Clave', h: 3, c: 0, base: 15 },
    { key: '2+1', name: '7ª Cat: 2 Números + Clave', h: 2, c: 1, base: 10 },
    { key: '2+0', name: '8ª Cat: 2 Números + 0 Clave', h: 2, c: 0, base: 3 },
    { key: '0+1', name: 'Reintegro: Clave (0 ó 1 nºs + Clave)', h: 0, c: 1, base: 1.50 }
  ];

  const counts: { [key: string]: number } = {};
  tierDefs.forEach(td => counts[td.key] = 0);

  let subWhiteCombos: number[][] = [];
  let subStarCombos: number[][] = [];

  const isMultiple = ticket.strategy === 'multiple' || ticket.strategy === 'reducida' || (ticket.combinations.length > 0 && (
    ticket.combinations[0].length > 5 ||
    (ticket.stars && ticket.stars.length > 0 && ticket.stars[0].length > 1)
  ));

  if (isMultiple && ticket.combinations.length > 0) {
    if (ticket.strategy === 'reducida') {
      subWhiteCombos = ticket.combinations;
      subStarCombos = (ticket.stars && ticket.stars.length > 0) ? ticket.stars : ticket.combinations.map(() => [0]);
    } else {
      const whiteSuperset = ticket.combinations[0];
      subWhiteCombos = whiteSuperset.length >= 5 ? getCombinations(whiteSuperset, 5) : [whiteSuperset];

      const starSuperset = (ticket.stars && ticket.stars.length > 0) ? ticket.stars[0] : [0];
      subStarCombos = starSuperset.length >= 1 ? getCombinations(starSuperset, 1) : [starSuperset];
    }
  } else {
    subWhiteCombos = ticket.combinations;
    if (ticket.stars && ticket.stars.length > 0) {
      subStarCombos = ticket.stars;
    } else {
      subStarCombos = ticket.combinations.map(() => [0]);
    }
  }

  let totalSubBets = 0;

  for (const wCombo of subWhiteCombos) {
    const wHits = wCombo.filter(n => winningWhiteSet.has(n)).length;
    for (const sCombo of subStarCombos) {
      totalSubBets++;
      const cHits = sCombo.filter(s => winningClaveSet.has(s)).length;

      if (wHits === 5 && cHits === 1) counts['5+1']++;
      else if (wHits === 5 && cHits === 0) counts['5+0']++;
      else if (wHits === 4 && cHits === 1) counts['4+1']++;
      else if (wHits === 4 && cHits === 0) counts['4+0']++;
      else if (wHits === 3 && cHits === 1) counts['3+1']++;
      else if (wHits === 3 && cHits === 0) counts['3+0']++;
      else if (wHits === 2 && cHits === 1) counts['2+1']++;
      else if (wHits === 2 && cHits === 0) counts['2+0']++;
      else if ((wHits === 0 || wHits === 1) && cHits === 1) counts['0+1']++;
    }
  }

  let totalPayout = 0;
  const tiersResult: {
    category: string;
    name: string;
    hits: number;
    starHits: number;
    basePrize: number;
    count: number;
    totalPrize: number;
  }[] = [];

  tierDefs.forEach(td => {
    const count = counts[td.key] || 0;
    const totalForTier = count * td.base;
    totalPayout += totalForTier;

    if (count > 0 || isMultiple) {
      tiersResult.push({
        category: td.key,
        name: td.name,
        hits: td.h,
        starHits: td.c,
        basePrize: td.base,
        count,
        totalPrize: totalForTier
      });
    }
  });

  return {
    tiers: tiersResult,
    totalPayout,
    totalSubBets
  };
}

/**
 * Calculates prize amount for a draw and combination
 */
export function calculateDrawPrize(
  hits: number,
  starHits: number,
  draw: Draw,
  combo: number[],
  gameId: string,
  dataType: string
): number {
  if (gameId === 'powerball') {
    if (hits === 5 && starHits === 1) return 100000000;
    if (hits === 5 && starHits === 0) return 1000000;
    if (hits === 4 && starHits === 1) return 50000;
    if (hits === 4 && starHits === 0) return 100;
    if (hits === 3 && starHits === 1) return 100;
    if (hits === 3 && starHits === 0) return 7;
    if (hits === 2 && starHits === 1) return 7;
    if (hits === 1 && starHits === 1) return 4;
    if (hits === 0 && starHits === 1) return 4;
    return 0;
  }

  if (gameId === 'megamillions') {
    if (hits === 5 && starHits === 1) return 100000000;
    if (hits === 5 && starHits === 0) return 1000000;
    if (hits === 4 && starHits === 1) return 10000;
    if (hits === 4 && starHits === 0) return 500;
    if (hits === 3 && starHits === 1) return 200;
    if (hits === 3 && starHits === 0) return 10;
    if (hits === 2 && starHits === 1) return 10;
    if (hits === 1 && starHits === 1) return 4;
    if (hits === 0 && starHits === 1) return 2;
    return 0;
  }

  if (gameId === 'nacional') {
    const colMatches = [false, false, false, false, false];
    combo.forEach(n => {
      const colIdx = Math.floor(n / 10) - 1;
      if (colIdx >= 0 && colIdx < 5) {
        if (draw.numbers.includes(n)) {
          colMatches[colIdx] = true;
        }
      }
    });

    if (colMatches[0] && colMatches[1] && colMatches[2] && colMatches[3] && colMatches[4]) {
      return 30000;
    }
    if (colMatches[1] && colMatches[2] && colMatches[3] && colMatches[4]) {
      return 75;
    }
    if (colMatches[2] && colMatches[3] && colMatches[4]) {
      return 15;
    }
    if (colMatches[3] && colMatches[4]) {
      return 6;
    }
    if (colMatches[4]) {
      return 3.00;
    }
    return 0;
  }

  if (gameId === 'euromillones') {
    if (hits === 5 && starHits === 2) return 40000000;
    if (hits === 5 && starHits === 1) return 150000;
    if (hits === 5 && starHits === 0) return 20000;
    if (hits === 4 && starHits === 2) return 1200;
    if (hits === 4 && starHits === 1) return 120;
    if (hits === 3 && starHits === 2) return 50;
    if (hits === 4 && starHits === 0) return 40;
    if (hits === 2 && starHits === 2) return 14;
    if (hits === 3 && starHits === 1) return 11;
    if (hits === 3 && starHits === 0) return 9;
    if (hits === 1 && starHits === 2) return 7;
    if (hits === 2 && starHits === 1) return 6;
    if (hits === 2 && starHits === 0) return 4;
    return 0;
  }

  if (gameId === 'eurodreams') {
    if (hits === 6 && starHits === 1) return 7200000;
    if (hits === 6 && starHits === 0) return 120000;
    if (hits === 5 && starHits === 0) return 120;
    if (hits === 4 && starHits === 0) return 40;
    if (hits === 3 && starHits === 0) return 5;
    if (hits === 2 && starHits === 0) return 2.50;
    return 0;
  }

  if (gameId === 'gordo') {
    if (hits === 5 && starHits === 1) return 5000000;
    if (hits === 5 && starHits === 0) return 18000;
    if (hits === 4 && starHits === 1) return 900;
    if (hits === 4 && starHits === 0) return 120;
    if (hits === 3 && starHits === 1) return 45;
    if (hits === 3 && starHits === 0) return 12;
    if (hits === 2 && starHits === 1) return 8;
    if (hits === 2 && starHits === 0) return 3;
    if (hits === 1 && starHits === 1) return 3;
    if (hits === 0 && starHits === 1) return 1.50;
    return 0;
  }

  // Default 6/49 (Bonoloto or Primitiva)
  const isBonoloto = dataType === 'bonoloto';
  const jackpot = isBonoloto ? 800000 : 1500000;
  const rVal = isBonoloto ? 0.50 : 1.00;

  if (hits === 6) return jackpot;

  if (hits === 5) {
    if (draw.complementario && combo.includes(draw.complementario)) {
      return isBonoloto ? 25000 : 45000;
    }
    return 1000;
  }

  if (hits === 4) return isBonoloto ? 25 : 45;
  if (hits === 3) return isBonoloto ? 4 : 8;

  // Simular reintegro con un 10% de probabilidad asignada
  if (draw.reintegro !== undefined) {
    if (Math.random() < 0.10) {
      return rVal;
    }
  }

  return 0;
}

export function getCombinationStats(
  combination: number[],
  stars: number[] = [],
  currentGame: { maxNumbers: number; numberRange: number; starRange: number },
  primes: Set<number>
) {
  const maxNumbers = currentGame.maxNumbers;
  if (combination.length !== maxNumbers) return {};

  const sum = combination.reduce((a, b) => a + b, 0);
  const evens = combination.filter(n => n % 2 === 0).length;
  const midPoint = Math.floor(currentGame.numberRange / 2);
  const lows = combination.filter(n => n <= midPoint).length;
  const primesCount = combination.filter(n => primes.has(n)).length;

  const sorted = [...combination].sort((a, b) => a - b);
  let consecutivePattern = '';
  let count = 1;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === sorted[i - 1] + 1) {
      count++;
    } else {
      consecutivePattern += count;
      count = 1;
    }
  }
  consecutivePattern += count;
  const consecPatternSorted = consecutivePattern.split('').sort((a, b) => Number(b) - Number(a)).join('/');

  const tens: { [key: number]: number } = {};
  combination.forEach(n => {
    const ten = Math.floor((n - 1) / 10);
    tens[ten] = (tens[ten] || 0) + 1;
  });
  const tensGroups = Object.values(tens).sort((a, b) => b - a).join('/');

  const digitSum = combination.reduce((sum, num) => sum + (num < 10 ? num : (num % 10 + Math.floor(num / 10))), 0);

  const mean = sum / maxNumbers;
  const stdDev = Math.sqrt(combination.reduce((sq, n) => sq + Math.pow(n - mean, 2), 0) / maxNumbers);

  const endingCounts: { [key: number]: number } = {};
  combination.forEach(n => {
    const ending = n % 10;
    endingCounts[ending] = (endingCounts[ending] || 0) + 1;
  });
  const entropyTerm = -Object.values(endingCounts).reduce((s, countVal) => {
    const p = countVal / maxNumbers;
    return s + p * Math.log2(p);
  }, 0);

  const intervalCounts: { [key: number]: number } = {};
  for (let idx = 0; idx < sorted.length - 1; idx++) {
    const diff = sorted[idx + 1] - sorted[idx];
    intervalCounts[diff] = (intervalCounts[diff] || 0) + 1;
  }
  const numIntervals = maxNumbers - 1;
  const entropyInt = -Object.values(intervalCounts).reduce((s, countVal) => {
    const p = countVal / numIntervals;
    return s + p * Math.log2(p);
  }, 0);

  let stats: any = {
    suma: sum,
    parImpar: `${evens}/${maxNumbers - evens}`,
    bajosAltos: `${lows}/${maxNumbers - lows}`,
    primos: primesCount,
    consecutivos: consecPatternSorted,
    agrupDecenas: tensGroups,
    sumaDigitos: digitSum,
    desviacion: stdDev.toFixed(2),
    entropiaTerminaciones: entropyTerm.toFixed(3),
    entropiaIntervalos: entropyInt.toFixed(3),
    _desviacion: stdDev,
    _entropiaTerminaciones: entropyTerm,
    _entropiaIntervalos: entropyInt,
  };

  if (stars.length > 0) {
    const starSum = stars.reduce((a, b) => a + b, 0);
    const starEvens = stars.filter(n => n % 2 === 0).length;
    const starMid = Math.floor(currentGame.starRange / 2);
    const starLows = stars.filter(n => n <= starMid).length;
    const starPrimos = stars.filter(n => primes.has(n)).length;

    const sortedStars = [...stars].sort((a, b) => a - b);
    let starConsecPattern = '';
    let sCount = 1;
    for (let i = 1; i < sortedStars.length; i++) {
      if (sortedStars[i] === sortedStars[i - 1] + 1) {
        sCount++;
      } else {
        starConsecPattern += sCount;
        sCount = 1;
      }
    }
    starConsecPattern += sCount;
    const starConsecPatternSorted = starConsecPattern.split('').sort((a, b) => Number(b) - Number(a)).join('/');

    let minStarDist = 99;
    for (let i = 0; i < sortedStars.length - 1; i++) {
      const d = sortedStars[i + 1] - sortedStars[i];
      if (d < minStarDist) minStarDist = d;
    }

    let starDigitSum = 0;
    stars.forEach(s => {
      const sStr = s.toString();
      for (let i = 0; i < sStr.length; i++) starDigitSum += parseInt(sStr[i]);
    });

    stats.estrellas = {
      suma: starSum,
      parImpar: `${starEvens}/${stars.length - starEvens}`,
      bajosAltos: `${starLows}/${stars.length - starLows}`,
      sumaDigitos: starDigitSum,
      primos: starPrimos,
      consecutivos: starConsecPatternSorted,
      distancia: minStarDist === 99 ? 0 : minStarDist
    };
  }

  return stats;
}

export function calculateTicketMetrics(ticket: Ticket, currentGameId?: string) {
  const gameId = ticket.gameId || currentGameId || 'bonoloto';
  const game = GAMES[gameId] || GAMES['bonoloto'];
  const maxNumbers = game?.maxNumbers || 6;
  const maxStars = game?.maxStars || 0;

  let betType: 'simple' | 'multiple' | 'reducida' = 'simple';
  if (ticket.strategy === 'reducida') {
    betType = 'reducida';
  } else if (
    ticket.strategy === 'multiple' ||
    (ticket.combinations.length > 0 && ticket.combinations[0].length > maxNumbers) ||
    (ticket.stars && ticket.stars.length > 0 && ticket.stars[0].length > maxStars)
  ) {
    betType = 'multiple';
  } else {
    betType = 'simple';
  }

  let combinationsCount = 0;
  let numbersCount = maxNumbers;
  let starsCount = maxStars;

  const nCrLocal = (n: number, r: number): number => {
    if (r <= 0 || n < r) return 1;
    let res = 1;
    for (let i = 1; i <= r; i++) {
      res = (res * (n - i + 1)) / i;
    }
    return Math.round(res);
  };

  if (betType === 'simple' || betType === 'reducida') {
    combinationsCount = ticket.combinations.length;
    numbersCount = ticket.combinations.length > 0 ? ticket.combinations[0].length : maxNumbers;
    starsCount = (ticket.stars && ticket.stars.length > 0) ? ticket.stars[0].length : maxStars;
  } else if (betType === 'multiple') {
    const N = ticket.combinations.length > 0 ? ticket.combinations[0].length : maxNumbers;
    numbersCount = N;

    if (gameId === 'euromillones') {
      const E = (ticket.stars && ticket.stars.length > 0) ? ticket.stars[0].length : maxStars;
      starsCount = E;
      const numCombos = nCrLocal(N, 5);
      const starCombos = nCrLocal(E, 2);
      combinationsCount = numCombos * starCombos;
    } else if (gameId === 'gordo') {
      const E = (ticket.stars && ticket.stars.length > 0) ? ticket.stars[0].length : 1;
      starsCount = E;
      combinationsCount = nCrLocal(N, 5);
    } else if (gameId === 'eurodreams') {
      const E = (ticket.stars && ticket.stars.length > 0) ? ticket.stars[0].length : 1;
      starsCount = E;
      combinationsCount = nCrLocal(N, 6);
    } else {
      combinationsCount = nCrLocal(N, 6);
      starsCount = 0;
    }
  }

  return {
    gameId,
    combinationsCount,
    betType,
    numbersCount,
    starsCount
  };
}

export function getMultipleCombinationsCount(n: number, maxNumbers: number = 6): number {
  const k = maxNumbers;
  let result = 1;
  for (let i = 1; i <= k; i++) {
    result *= (n - i + 1);
    result /= i;
  }
  return Math.round(result);
}

export function getCommonConsecutivePatterns(maxNumbers: number): string[] {
  if (maxNumbers === 6) {
      return ["6", "5/1", "4/2", "4/1/1", "3/3", "3/2/1", "3/1/1/1", "2/2/2", "2/2/1/1", "2/1/1/1/1", "1/1/1/1/1/1"];
  } else if (maxNumbers === 5) {
      return ["5", "4/1", "3/2", "3/1/1", "2/2/1", "2/1/1/1", "1/1/1/1/1"];
  } else if (maxNumbers === 2) {
      return ["2", "1/1"];
  }
  return [String(maxNumbers)];
}

export function getTicketValidationData(
  ticket: Ticket,
  winningNumbers: number[],
  winningStars: number[] = [],
  defaultGameId: string = 'bonoloto'
) {
  const gameId = ticket.gameId || defaultGameId;
  const game = GAMES[gameId] || GAMES['bonoloto'];
  const maxNumbers = game?.maxNumbers || 6;
  const maxStars = game?.maxStars || 0;

  const isMultiple = ticket.strategy === 'multiple' || 
    (ticket.combinations.length > 0 && (ticket.combinations[0].length > maxNumbers || (ticket.combinations[0].length === 5 && maxNumbers === 6))) ||
    (ticket.stars && ticket.stars.length > 0 && ticket.stars[0].length > maxStars);

  let allHits: number[] = [];
  let starHits: number[] | undefined = undefined;

  if (isMultiple && ticket.combinations.length > 0) {
    const numSuperset = ticket.combinations[0];
    let expandedCombos: number[][] = [];
    if (numSuperset.length === 5 && maxNumbers === 6) {
      const remainingNumbers = Array.from({ length: 49 }, (_, i) => i + 1).filter(n => !numSuperset.includes(n));
      expandedCombos = remainingNumbers.map(extra => [...numSuperset, extra].sort((a, b) => a - b));
    } else if (numSuperset.length >= maxNumbers) {
      expandedCombos = getCombinations(numSuperset, maxNumbers);
    } else {
      expandedCombos = [numSuperset];
    }

    let expandedStars: number[][] | undefined = undefined;
    if (maxStars > 0 && ticket.stars && ticket.stars.length > 0) {
      const starSuperset = ticket.stars[0];
      expandedStars = starSuperset.length >= maxStars ? getCombinations(starSuperset, maxStars) : [starSuperset];
    }

    if (expandedStars && expandedStars.length > 0) {
      for (const combo of expandedCombos) {
        const cHits = combo.filter(n => winningNumbers.includes(n)).length;
        for (const sCombo of expandedStars) {
          const sHits = sCombo.filter(s => winningStars.includes(s)).length;
          allHits.push(cHits);
          if (!starHits) starHits = [];
          starHits.push(sHits);
        }
      }
    } else {
      allHits = expandedCombos.map(combo => combo.filter(n => winningNumbers.includes(n)).length);
    }
  } else {
    allHits = ticket.combinations.map(combo => combo.filter(n => winningNumbers.includes(n)).length);
    if (ticket.stars) {
      starHits = ticket.stars.map(stars => stars.filter(s => winningStars.includes(s)).length);
    }
  }

  const maxHits = allHits.length > 0 ? Math.max(...allHits) : 0;
  const maxStarsHit = starHits && starHits.length > 0 ? Math.max(...starHits) : 0;

  return { allHits, starHits, maxHits, maxStars: maxStarsHit, gameId };
}

export function getTicketWinningTiers(ticket: Ticket): { label: string; count: number }[] {
  if (!ticket.validation) {
    return [];
  }

  const v = ticket.validation;
  const gameId = ticket.gameId || 'bonoloto';

  if (gameId === 'powerball') {
    const cascade = calculatePowerballCascade(ticket, v.winningNumbers, v.stars || []);
    const winningTiers = cascade.tiers.filter(t => t.count > 0);
    return winningTiers.map(t => ({ label: `${t.hits}+${t.starHits}🔴`, count: t.count }));
  } else if (gameId === 'megamillions') {
    const cascade = calculateMegaMillionsCascade(ticket, v.winningNumbers, v.stars || []);
    const winningTiers = cascade.tiers.filter(t => t.count > 0);
    return winningTiers.map(t => ({ label: `${t.hits}+${t.starHits}🟡`, count: t.count }));
  } else if (gameId === 'euromillones') {
    const cascade = calculateEuromillonesCascade(ticket, v.winningNumbers, v.stars || []);
    const winningTiers = cascade.tiers.filter(t => t.count > 0);
    return winningTiers.map(t => ({ label: `${t.hits}+${t.starHits}⭐`, count: t.count }));
  } else if (gameId === 'eurodreams') {
    const cascade = calculateEurodreamsCascade(ticket, v.winningNumbers, v.stars || []);
    const winningTiers = cascade.tiers.filter(t => t.count > 0);
    return winningTiers.map(t => ({ label: `${t.hits}+${t.starHits}🌙`, count: t.count }));
  } else if (gameId === 'gordo') {
    const cascade = calculateGordoCascade(ticket, v.winningNumbers, v.stars || []);
    const winningTiers = cascade.tiers.filter(t => t.count > 0);
    return winningTiers.map(t => ({ label: `${t.hits}+${t.starHits}🔑`, count: t.count }));
  } else {
    const tierMap: { [key: string]: number } = {};

    ticket.combinations.forEach((combo, idx) => {
      const hits = v.hits ? v.hits[idx] || 0 : 0;
      const starHits = v.starHits ? v.starHits[idx] || 0 : 0;

      let isComboWinning = false;
      let label = '';

      if (gameId === 'nacional') {
        if (hits >= 1) {
          isComboWinning = true;
          label = `${hits} acierto${hits > 1 ? 's' : ''}`;
        }
      } else if (starHits > 0) {
        if (hits >= 2 || starHits >= 2 || (hits >= 1 && starHits >= 2)) {
          isComboWinning = true;
          label = `${hits}+${starHits}⭐`;
        }
      } else {
        if (hits >= 3) {
          isComboWinning = true;
          label = `${hits} aciertos`;
        }
      }

      if (isComboWinning) {
        tierMap[label] = (tierMap[label] || 0) + 1;
      }
    });

    return Object.entries(tierMap).map(([label, count]) => ({ label, count }));
  }
}

export function getWinningTicketInfo(ticket: Ticket): { isWinning: boolean; prizeSummary: string } {
  const tiers = getTicketWinningTiers(ticket);
  if (tiers.length > 0) {
    const summaryText = tiers.map(t => `${t.count}x (${t.label})`).join(', ');
    return { isWinning: true, prizeSummary: summaryText };
  }

  return { isWinning: false, prizeSummary: '' };
}

export function getTicketPrizeSummary(ticket: Ticket): { hasPrize: boolean; prizeLabel: string } {
  const winInfo = getWinningTicketInfo(ticket);
  return {
    hasPrize: winInfo.isWinning,
    prizeLabel: winInfo.prizeSummary
  };
}

export function classifyNumbers(
  historicalData: Draw[],
  numberStats: Record<number, { frequency: number; lastSeen: number }>,
  starStats: Record<number, { frequency: number; lastSeen: number }>,
  currentGame: any
): {
  hotNumbers: Set<number>;
  coldNumbers: Set<number>;
  absentNumbers: Set<number>;
  hotStars: Set<number>;
  coldStars: Set<number>;
  absentStars: Set<number>;
} {
  const hotNumbers = new Set<number>();
  const coldNumbers = new Set<number>();
  const absentNumbers = new Set<number>();
  const hotStars = new Set<number>();
  const coldStars = new Set<number>();
  const absentStars = new Set<number>();

  if (historicalData.length === 0) {
    return {
      hotNumbers,
      coldNumbers,
      absentNumbers,
      hotStars,
      coldStars,
      absentStars
    };
  }

  const startNum = currentGame.id === 'nacional' ? 10 : 1;
  // Classify Numbers
  const freqs = Object.values(numberStats).map(s => s.frequency);
  const sortedFreqs = [...freqs].sort((a, b) => a - b);
  const hotThreshold = sortedFreqs[Math.floor(sortedFreqs.length * 0.7)];
  const coldThreshold = sortedFreqs[Math.floor(sortedFreqs.length * 0.3)];

  if (hotThreshold > 0) {
    for (let num = startNum; num <= currentGame.numberRange; num++) {
      const freq = numberStats[num] ? numberStats[num].frequency : 0;
      if (freq >= hotThreshold) hotNumbers.add(num);
      if (freq <= coldThreshold && freq < hotThreshold) coldNumbers.add(num);
    }
  }

  // Classify Stars
  if (currentGame.maxStars > 0) {
    const isGordo = currentGame.id === 'gordo';
    const minStar = isGordo ? 0 : 1;
    const maxStar = isGordo ? 9 : currentGame.starRange;

    const starFreqs = Object.values(starStats).map(s => s.frequency);
    const sortedStarFreqs = [...starFreqs].sort((a, b) => a - b);
    const hotStarThreshold = sortedStarFreqs[Math.floor(sortedStarFreqs.length * 0.7)];
    const coldStarThreshold = sortedStarFreqs[Math.floor(sortedStarFreqs.length * 0.3)];

    if (hotStarThreshold > 0) {
      for (let star = minStar; star <= maxStar; star++) {
        const freq = starStats[star] ? starStats[star].frequency : 0;
        if (freq >= hotStarThreshold) hotStars.add(star);
        if (freq <= coldStarThreshold && freq < hotStarThreshold) coldStars.add(star);
      }
    }
  }

  // Calcular números ausentes
  if (historicalData.length > 0) {
    const totalDraws = historicalData[historicalData.length - 1].id;

    // Numbers absence
    const numberAbsences: { num: number; absence: number }[] = [];
    for (let num = startNum; num <= currentGame.numberRange; num++) {
      const absence = totalDraws - (numberStats[num] ? numberStats[num].lastSeen : 0);
      numberAbsences.push({ num, absence });
    }
    numberAbsences.sort((a, b) => b.absence - a.absence);
    for (let i = 0; i < 5 && i < numberAbsences.length; i++) {
      const num = numberAbsences[i].num;
      if (numberStats[num] && numberStats[num].lastSeen > 0) {
        absentNumbers.add(num);
      }
    }

    // Stars absence
    if (currentGame.maxStars > 0) {
      const isGordo = currentGame.id === 'gordo';
      const minStar = isGordo ? 0 : 1;
      const maxStar = isGordo ? 9 : currentGame.starRange;

      const starAbsences: { num: number; absence: number }[] = [];
      for (let star = minStar; star <= maxStar; star++) {
        const absence = totalDraws - (starStats[star] ? starStats[star].lastSeen : 0);
        starAbsences.push({ num: star, absence });
      }
      starAbsences.sort((a, b) => b.absence - a.absence);
      for (let i = 0; i < 2 && i < starAbsences.length; i++) {
        const star = starAbsences[i].num;
        if (starStats[star] && starStats[star].lastSeen > 0) {
          absentStars.add(star);
        }
      }
    }
  }

  return {
    hotNumbers,
    coldNumbers,
    absentNumbers,
    hotStars,
    coldStars,
    absentStars
  };
}

