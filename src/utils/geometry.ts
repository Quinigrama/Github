export type GridLayout =
  | { type: 'decade-column' }
  | { type: 'column-chunk'; chunkSize: number }
  | { type: 'sequential'; columns: number }
  | { type: 'wrap-offset'; columns: number; rowOffsets: number[] };

export function getLayoutDimensions(layout: GridLayout, numberRange: number, startAt: number): { columns: number; rows: number } {
  if (layout.type === 'decade-column') {
    return { columns: Math.floor(numberRange / 10) + 1, rows: 10 };
  }
  if (layout.type === 'column-chunk') {
    return { columns: Math.ceil(numberRange / layout.chunkSize), rows: layout.chunkSize };
  }
  if (layout.type === 'sequential') {
    const count = numberRange - startAt + 1;
    return { columns: layout.columns, rows: Math.ceil(count / layout.columns) };
  }
  // wrap-offset
  let remaining = numberRange - startAt + 1;
  let rows = 0;
  for (let row = 0; row < 20 && remaining > 0; row++) {
    const offset = layout.rowOffsets[row] ?? 0;
    remaining -= (layout.columns - offset);
    rows++;
  }
  return { columns: layout.columns, rows };
}

export function getNumberAtPosition(row: number, col: number, layout: GridLayout, startAt: number, numberRange: number): number | null {
  let n: number;
  if (layout.type === 'decade-column') {
    n = col * 10 + row;
    if (n === 0) return null;
  } else if (layout.type === 'column-chunk') {
    n = col * layout.chunkSize + row + 1;
  } else if (layout.type === 'sequential') {
    n = row * layout.columns + col + startAt;
  } else {
    const offset = layout.rowOffsets[row] ?? 0;
    if (col < offset) return null;
    let base = startAt;
    for (let r = 0; r < row; r++) {
      base += layout.columns - (layout.rowOffsets[r] ?? 0);
    }
    n = base + (col - offset);
  }
  if (n < startAt || n > numberRange) return null;
  return n;
}

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
