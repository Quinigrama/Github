import { getGameConfig } from "../../game-configs";

export function getGreedyCovering(N: number, K: number, T: number, C: number): number[][] {
  const targets: number[][] = [];
  function genTargets(start: number, current: number[]) {
    if (current.length === T) {
      targets.push([...current]);
      return;
    }
    for (let i = start; i < N; i++) {
      current.push(i);
      genTargets(i + 1, current);
      current.pop();
    }
  }
  genTargets(0, []);

  const candidates: number[][] = [];
  function genCandidates(start: number, current: number[]) {
    if (current.length === K) {
      candidates.push([...current]);
      return;
    }
    for (let i = start; i < N; i++) {
      current.push(i);
      genCandidates(i + 1, current);
      current.pop();
    }
  }
  genCandidates(0, []);

  const targetMasks = targets.map(t => {
    let mask = 0;
    for (const num of t) mask |= (1 << num);
    return mask;
  });

  const candidateMasks = candidates.map(c => {
    let mask = 0;
    for (const num of c) mask |= (1 << num);
    return mask;
  });

  const selectedIndices: number[] = [];
  const uncovered = new Set<number>(targetMasks.keys());

  for (let step = 0; step < C; step++) {
    let bestCandidateIdx = -1;
    let maxCoveredCount = -1;

    for (let i = 0; i < candidates.length; i++) {
      if (selectedIndices.includes(i)) continue;
      const cMask = candidateMasks[i];
      let coveredCount = 0;
      for (const tIdx of uncovered) {
        const tMask = targetMasks[tIdx];
        if ((cMask & tMask) === tMask) {
          coveredCount++;
        }
      }
      if (coveredCount > maxCoveredCount) {
        maxCoveredCount = coveredCount;
        bestCandidateIdx = i;
      }
    }

    if (bestCandidateIdx === -1) {
      for (let i = 0; i < candidates.length; i++) {
        if (!selectedIndices.includes(i)) {
          bestCandidateIdx = i;
          break;
        }
      }
    }

    if (bestCandidateIdx !== -1) {
      selectedIndices.push(bestCandidateIdx);
      const cMask = candidateMasks[bestCandidateIdx];
      for (const tIdx of Array.from(uncovered)) {
        const tMask = targetMasks[tIdx];
        if ((cMask & tMask) === tMask) {
          uncovered.delete(tIdx);
        }
      }
    } else {
      break;
    }
  }

  return selectedIndices.map(idx => candidates[idx]);
}


export function generateSyntheticCSV(gameKey: string): string {
  const game = getGameConfig(gameKey);
  const maxNumbers = game.maxNumbers;
  const maxStars = game.maxStars || 0;
  const numberRange = game.numberRange;
  const starRange = game.starRange || 0;
  
  let header = 'Fecha,N1,N2,N3,N4,N5';
  if (maxNumbers === 6) header += ',N6';
  if (maxStars === 1) header += ',Estrella 1';
  if (maxStars === 2) header += ',Estrella 1,Estrella 2';
  
  let csv = header + '\n';
  
  // Generar 100 sorteos históricos realistas (espaciados semanalmente)
  const now = new Date();
  for (let i = 0; i < 100; i++) {
    const date = new Date(now.getTime() - i * 7 * 24 * 60 * 60 * 1000);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const dateStr = `${day}/${month}/${year}`;
    
    // Combinación de números aleatoria sin repetición
    const nums: number[] = [];
    if (gameKey === 'nacional') {
      for (let col = 0; col < 5; col++) {
        const val = Math.floor(Math.random() * 10);
        nums.push((col + 1) * 10 + val);
      }
    } else {
      const numPool = Array.from({ length: numberRange }, (_, idx) => idx + 1);
      for (let n = 0; n < maxNumbers; n++) {
        const idx = Math.floor(Math.random() * numPool.length);
        nums.push(numPool.splice(idx, 1)[0]);
      }
      nums.sort((a, b) => a - b);
    }
    
    // Combinación de estrellas aleatoria sin repetición
    const stars: number[] = [];
    if (gameKey !== 'nacional') {
      const minStar = gameKey === 'gordo' ? 0 : 1;
      const starPool = Array.from({ length: starRange }, (_, idx) => minStar + idx);
      for (let s = 0; s < maxStars; s++) {
        const idx = Math.floor(Math.random() * starPool.length);
        stars.push(starPool.splice(idx, 1)[0]);
      }
      stars.sort((a, b) => a - b);
    }
    
    let row = dateStr + ',' + nums.join(',');
    if (stars.length > 0) {
      row += ',' + stars.join(',');
    }
    csv += row + '\n';
  }
  return csv;
}
