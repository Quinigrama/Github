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

export function buildCoordsLookup(layout: GridLayout, numberRange: number, startAt: number = 1): Map<number, { row: number; col: number }> {
  const lookup = new Map<number, { row: number; col: number }>();
  const { columns, rows } = getLayoutDimensions(layout, numberRange, startAt);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      const n = getNumberAtPosition(row, col, layout, startAt, numberRange);
      if (n !== null) lookup.set(n, { row, col });
    }
  }
  return lookup;
}

const coordsLookupCache = new Map<string, Map<number, { row: number; col: number }>>();

export function getCoordsLookup(layout: GridLayout, numberRange: number, startAt: number = 1): Map<number, { row: number; col: number }> {
  const key = `${JSON.stringify(layout)}_${numberRange}_${startAt}`;
  let lookup = coordsLookupCache.get(key);
  if (!lookup) {
    lookup = buildCoordsLookup(layout, numberRange, startAt);
    coordsLookupCache.set(key, lookup);
  }
  return lookup;
}

export function getNumberCoords(n: number, gridCols: number): { row: number; col: number } {
  return { row: Math.floor((n - 1) / gridCols), col: (n - 1) % gridCols };
}

function resolveCoords(
  combination: number[],
  coordsLookupOrCols: Map<number, { row: number; col: number }> | number
): { row: number; col: number }[] {
  if (typeof coordsLookupOrCols === 'number') {
    return combination.map(n => getNumberCoords(n, coordsLookupOrCols));
  }
  return combination.map(n => coordsLookupOrCols.get(n)).filter((c): c is { row: number; col: number } => !!c);
}

export function isLine(coords: { row: number; col: number }[]): boolean {
  if (coords.length === 0) return false;
  const rowCounts: { [row: number]: number } = {};
  const colCounts: { [col: number]: number } = {};
  for (const c of coords) {
    rowCounts[c.row] = (rowCounts[c.row] || 0) + 1;
    colCounts[c.col] = (colCounts[c.col] || 0) + 1;
  }
  const threshold = Math.min(coords.length, 5);
  const maxRow = Math.max(...Object.values(rowCounts));
  const maxCol = Math.max(...Object.values(colCounts));
  return maxRow >= threshold || maxCol >= threshold;
}

export function isDiagonal(coords: { row: number; col: number }[]): boolean {
  if (coords.length === 0) return false;
  const mainDiagCounts: { [val: number]: number } = {};
  const antiDiagCounts: { [val: number]: number } = {};
  for (const c of coords) {
    const mainVal = c.row - c.col;
    const antiVal = c.row + c.col;
    mainDiagCounts[mainVal] = (mainDiagCounts[mainVal] || 0) + 1;
    antiDiagCounts[antiVal] = (antiDiagCounts[antiVal] || 0) + 1;
  }
  const threshold = Math.min(coords.length, 5);
  const maxMain = Math.max(...Object.values(mainDiagCounts));
  const maxAnti = Math.max(...Object.values(antiDiagCounts));
  return maxMain >= threshold || maxAnti >= threshold;
}

export function hasTriangle(coords: { row: number; col: number }[]): boolean {
  for (let i = 0; i < coords.length; i++) {
    for (let j = 0; j < coords.length; j++) {
      if (i === j) continue;
      for (let k = 0; k < coords.length; k++) {
        if (k === i || k === j) continue;
        const sameRow = coords[i].row === coords[j].row;
        const sameCol = coords[j].col === coords[k].col;
        const notColinear = !(coords[i].row === coords[k].row || coords[i].col === coords[k].col);
        if (sameRow && sameCol && notColinear) return true;
      }
    }
  }
  return false;
}

export function hasCross(coords: { row: number; col: number }[]): boolean {
  const coordSet = new Set(coords.map(c => `${c.row},${c.col}`));
  const candidateCenters = new Set<string>();
  for (const c of coords) {
    candidateCenters.add(`${c.row},${c.col}`);
    candidateCenters.add(`${c.row - 1},${c.col}`);
    candidateCenters.add(`${c.row + 1},${c.col}`);
    candidateCenters.add(`${c.row},${c.col - 1}`);
    candidateCenters.add(`${c.row},${c.col + 1}`);
    candidateCenters.add(`${c.row - 1},${c.col - 1}`);
    candidateCenters.add(`${c.row - 1},${c.col + 1}`);
    candidateCenters.add(`${c.row + 1},${c.col - 1}`);
    candidateCenters.add(`${c.row + 1},${c.col + 1}`);
  }
  for (const centerStr of candidateCenters) {
    const [r, co] = centerStr.split(',').map(Number);
    const plusPoints = [[r - 1, co], [r + 1, co], [r, co - 1], [r, co + 1]];
    const xPoints = [[r - 1, co - 1], [r - 1, co + 1], [r + 1, co - 1], [r + 1, co + 1]];
    const plusHits = plusPoints.filter(([pr, pco]) => coordSet.has(`${pr},${pco}`)).length;
    const xHits = xPoints.filter(([xr, xco]) => coordSet.has(`${xr},${xco}`)).length;
    if (plusHits >= 3 || xHits >= 3) return true;
  }
  return false;
}

export function hasCircle(coords: { row: number; col: number }[]): boolean {
  if (coords.length < 5) return false; // un círculo reconocible necesita al menos 5 puntos
  const circumcenter = (
    a: { row: number; col: number },
    b: { row: number; col: number },
    c: { row: number; col: number }
  ): { row: number; col: number } | null => {
    const ax = a.col, ay = a.row, bx = b.col, by = b.row, cx = c.col, cy = c.row;
    const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
    if (Math.abs(d) < 1e-6) return null; // colineales
    const ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / d;
    const uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / d;
    return { row: uy, col: ux };
  };
  for (let i = 0; i < coords.length; i++) {
    for (let j = i + 1; j < coords.length; j++) {
      for (let k = j + 1; k < coords.length; k++) {
        const center = circumcenter(coords[i], coords[j], coords[k]);
        if (!center) continue;
        const dist = (p: { row: number; col: number }) => Math.sqrt((p.row - center.row) ** 2 + (p.col - center.col) ** 2);
        const r = dist(coords[i]);
        const matching = coords.filter(p => Math.abs(dist(p) - r) <= 0.75).length;
        if (matching >= 5) return true;
      }
    }
  }
  return false;
}

export function isSpaced(
  combination: number[],
  coordsLookupOrCols: Map<number, { row: number; col: number }> | number
): boolean {
  const coords = resolveCoords(combination, coordsLookupOrCols);
  for (let i = 0; i < coords.length; i++) {
    for (let j = i + 1; j < coords.length; j++) {
      if (Math.abs(coords[i].col - coords[j].col) <= 1 && Math.abs(coords[i].row - coords[j].row) <= 1) {
        return false;
      }
    }
  }
  return true;
}

export function hasGeometricPattern(
  combination: number[],
  patternsToExclude: string[],
  coordsLookupOrCols: Map<number, { row: number; col: number }> | number
): boolean {
  const coords = resolveCoords(combination, coordsLookupOrCols);
  const patternChecks: { [key: string]: () => boolean } = {
    lineas: () => isLine(coords),
    diagonales: () => isDiagonal(coords),
    triangulos: () => hasTriangle(coords),
    circulos: () => hasCircle(coords),
    cruces: () => hasCross(coords),
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
