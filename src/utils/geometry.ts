export function getNumberCoords(n: number, gridCols: number): { row: number; col: number } {
  return { row: Math.floor((n - 1) / gridCols), col: (n - 1) % gridCols };
}

export function isLine(coords: { row: number; col: number }[]): boolean {
  if (coords.length === 0) return false;
  const allSameRow = coords.every(c => c.row === coords[0].row);
  const allSameCol = coords.every(c => c.col === coords[0].col);
  return allSameRow || allSameCol;
}

export function isDiagonal(coords: { row: number; col: number }[]): boolean {
  if (coords.length === 0) return false;
  const mainDiagValue = coords[0].row - coords[0].col;
  if (coords.every(c => c.row - c.col === mainDiagValue)) return true;
  const antiDiagValue = coords[0].row + coords[0].col;
  if (coords.every(c => c.row + c.col === antiDiagValue)) return true;
  return false;
}

export function isSpaced(combination: number[], gridCols: number): boolean {
  const coords = combination.map(n => getNumberCoords(n, gridCols));
  for (let i = 0; i < coords.length; i++) {
    for (let j = i + 1; j < coords.length; j++) {
      if (Math.abs(coords[i].col - coords[j].col) <= 1 && Math.abs(coords[i].row - coords[j].row) <= 1) {
        return false;
      }
    }
  }
  return true;
}

export function hasGeometricPattern(combination: number[], patternsToExclude: string[], gridCols: number): boolean {
  const coords = combination.map(n => getNumberCoords(n, gridCols));
  const patternChecks: { [key: string]: () => boolean } = {
    lineas: () => isLine(coords),
    diagonales: () => isDiagonal(coords),
    triangulos: () => false,
    circulos: () => false,
    cruces: () => false,
  };
  for (const pattern of patternsToExclude) {
    if (patternChecks[pattern] && patternChecks[pattern]()) return true;
  }
  return false;
}

export function generateRandomCombination(universe: number[], count: number, gameId?: string): number[] {
  if (gameId === 'nacional') {
    const combination: number[] = [];
    const cols: number[][] = [[], [], [], [], []];
    universe.forEach(n => {
      const colIdx = Math.floor(n / 10) - 1;
      if (colIdx >= 0 && colIdx < 5) {
        cols[colIdx].push(n);
      }
    });

    let colsToUse = [0, 1, 2, 3, 4];
    if (count < 5) {
      colsToUse = colsToUse.sort(() => Math.random() - 0.5).slice(0, count);
    }

    colsToUse.forEach(colIdx => {
      const pool = cols[colIdx];
      if (pool && pool.length > 0) {
        const randomIndex = Math.floor(Math.random() * pool.length);
        combination.push(pool[randomIndex]);
      } else {
        const randVal = Math.floor(Math.random() * 10);
        combination.push((colIdx + 1) * 10 + randVal);
      }
    });

    return combination.sort((a, b) => a - b);
  }

  let tempUniverse = [...universe];
  let combination: number[] = [];
  while (combination.length < count && tempUniverse.length > 0) {
    const randomIndex = Math.floor(Math.random() * tempUniverse.length);
    combination.push(tempUniverse.splice(randomIndex, 1)[0]);
  }
  return combination.sort((a, b) => a - b);
}
