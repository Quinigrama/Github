import { Draw } from "../types";
import { GameConfig } from "../../game-configs";

export function parseFlexibleDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  const clean = dateStr.trim().replace(/^["']|["']$/g, '');
  
  // Split by /, - or .
  const parts = clean.split(/[\/\-\.]/);
  if (parts.length === 3) {
    const p0 = parseInt(parts[0], 10);
    const p1 = parseInt(parts[1], 10);
    const p2 = parseInt(parts[2], 10);

    if (!isNaN(p0) && !isNaN(p1) && !isNaN(p2)) {
      if (p0 > 1000) {
        // Format YYYY-MM-DD
        return new Date(p0, p1 - 1, p2);
      } else if (p2 > 1000) {
        // Format DD/MM/YYYY (Spanish standard date)
        return new Date(p2, p1 - 1, p0);
      } else if (p2 >= 0 && p2 <= 99) {
        // Format DD/MM/YY
        const fullYear = p2 < 50 ? 2000 + p2 : 1900 + p2;
        return new Date(fullYear, p1 - 1, p0);
      }
    }
  }

  const d = new Date(clean);
  return isNaN(d.getTime()) ? null : d;
}



export function parseCSVData(content: string, gameConfig: GameConfig): Draw[] {
  const normalizedContent = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalizedContent.trim().split('\n').filter(line => line.trim());
  if (lines.length === 0) {
      return [];
  }

  const firstLine = lines.shift()!;
  const header = firstLine.toLowerCase().split(/[,;\t]+/).map(h => h.trim().replace(/^["']|["']$/g, '').trim());

  const isHeader = header.some(h => isNaN(parseInt(h)) && isNaN(parseFlexibleDate(h)?.getTime() || NaN));
  
  if (!isHeader) {
      lines.unshift(firstLine); 
  }
  
  if (gameConfig.id === 'nacional') {
      const parsedDraws: Draw[] = [];
      const originalLines = [...lines];

      // Auto-detect if CSV has prize categories
      let hasPrizeCategories = false;
      for (let i = 0; i < Math.min(1000, originalLines.length); i++) {
          const lineClean = originalLines[i].normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
          if (lineClean.includes('1er premio') || lineClean.includes('1o premio') || lineClean.includes('primer premio')) {
              hasPrizeCategories = true;
              break;
          }
      }

      // 1. Let's parse all lines into columns
      const rowsParts = originalLines.map(line => line.split(/[,;\t]/));
      
      // Find the maximum number of columns across rows
      let maxCols = 0;
      rowsParts.forEach(parts => {
          if (parts.length > maxCols) maxCols = parts.length;
      });

      // 2. Score each column index to find the winning number column
      let bestColIdx = -1;
      let highestScore = -1;

      if (maxCols > 0) {
          const colScores = Array(maxCols).fill(0);
          
          // Header bonus
          if (isHeader && header) {
              header.forEach((h, col) => {
                  const hClean = h.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
                  if (hClean.includes('primer') && hClean.includes('premio')) {
                      colScores[col] += 1000;
                  } else if (hClean.includes('1') && hClean.includes('premio')) {
                      colScores[col] += 1000;
                  } else if (hClean.includes('numero') || hClean.includes('decimo')) {
                      colScores[col] += 500;
                  } else if (hClean.includes('combinac') || hClean.includes('resultado')) {
                      colScores[col] += 400;
                  } else if (hClean.includes('sorteo') || hClean.includes('fecha') || hClean.includes('date') || hClean.includes('segundo') || hClean.includes('2')) {
                      colScores[col] -= 500; // negative bonus for columns that are clearly not the 1st prize
                  }
              });
          }

          // Analyze data rows (sample up to 200 rows matching 1st prize if categories are present)
          const sampleRows = rowsParts.filter(parts => {
              if (!hasPrizeCategories) return true;
              const lineClean = parts.join(' ').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
              return lineClean.includes('1er premio') || lineClean.includes('1o premio') || lineClean.includes('primer premio');
          }).slice(0, 200);

          for (let col = 0; col < maxCols; col++) {
              let validCount = 0;
              let sumOfVals = 0;
              const uniqueVals = new Set<number>();
              let hasLeadingZeroStr = false;

              sampleRows.forEach(parts => {
                  if (col >= parts.length) return;
                  const cell = parts[col].trim();
                  if (!cell) return;

                  // Remove dot separators if formatted like 35.072 or with spaces/quotes
                  const cleanCell = cell.replace(/[\.\s,'"]+/g, '');
                  if (/^\d+$/.test(cleanCell)) {
                      const num = parseInt(cleanCell, 10);
                      if (num >= 0 && num <= 99999) {
                          validCount++;
                          sumOfVals += num;
                          uniqueVals.add(num);
                          if (cell.length === 5 && cell.startsWith('0')) {
                              hasLeadingZeroStr = true;
                          }
                      }
                  }
              });

              if (validCount > 0) {
                  const avg = sumOfVals / validCount;
                  const uniquenessRatio = uniqueVals.size / validCount;

                  let colScore = colScores[col];
                  if (avg >= 500 && avg <= 99500) {
                      colScore += 100;
                  }
                  if (uniquenessRatio > 0.4) {
                      colScore += 150;
                  }
                  if (hasLeadingZeroStr) {
                      colScore += 300;
                  }
                  colScores[col] = colScore;
              } else {
                  colScores[col] = -9999;
              }
          }

          for (let col = 0; col < maxCols; col++) {
              if (colScores[col] > highestScore) {
                  highestScore = colScores[col];
                  bestColIdx = col;
              }
          }
      }

      const seenDates = new Set<string>();

      originalLines.forEach((line, i) => {
          const parts = line.split(/[,;\t]/);
          if (hasPrizeCategories) {
              const lineClean = line.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
              const matchesFirstPremio = lineClean.includes('1er premio') || lineClean.includes('1o premio') || lineClean.includes('primer premio');
              if (!matchesFirstPremio) {
                  return;
              }
          }

          let date: Date | null = null;
          let digits: number[] | null = null;

          for (let j = 0; j < parts.length; j++) {
              const p = parts[j].trim();
              if (p.includes('-') || p.includes('/')) {
                  const d = parseFlexibleDate(p);
                  if (d && !isNaN(d.getTime())) {
                      date = d;
                      break;
                  }
              }
          }

          if (bestColIdx > -1 && bestColIdx < parts.length) {
              const val = parts[bestColIdx].trim();
              const cleanVal = val.replace(/[\.\s,'"]+/g, '');
              const num = parseInt(cleanVal, 10);
              if (num >= 0 && num <= 99999) {
                  const paddedStr = String(num).padStart(5, '0');
                  digits = paddedStr.split('').map(Number);
              }
          }

          if (!digits) {
              for (let j = 0; j < parts.length; j++) {
                  const val = parts[j].trim();
                  const cleanVal = val.replace(/[\.\s,'"]+/g, '');
                  if (/^\d+$/.test(cleanVal)) {
                      const num = parseInt(cleanVal, 10);
                      if (num >= 0 && num <= 99999 && j !== bestColIdx) {
                          if (num > 250 && num !== new Date().getFullYear()) {
                              const paddedStr = String(num).padStart(5, '0');
                              digits = paddedStr.split('').map(Number);
                              break;
                          }
                      }
                  }
              }
          }

          if (digits && digits.length === 5) {
              let dType: 'navidad' | 'nino' | 'normal' = 'normal';
              
              for (let j = 0; j < parts.length; j++) {
                  const p = parts[j].trim().toLowerCase();
                  if (p.includes('navidad') || p.includes('navide')) {
                      dType = 'navidad';
                      break;
                  } else if (p.includes('niño') || p.includes('nino')) {
                      dType = 'nino';
                      break;
                  }
              }
              
              const finalDate = date || new Date(Date.now() - (originalLines.length - i) * 7 * 24 * 60 * 60 * 1000);
              if (finalDate) {
                  const month = finalDate.getMonth();
                  const day = finalDate.getDate();
                  if (month === 11 && day === 22) {
                      dType = 'navidad';
                  } else if (month === 0 && day === 6) {
                      dType = 'nino';
                  }
              }

              const dateStr = finalDate.toISOString().split('T')[0];
              if (seenDates.has(dateStr)) {
                  return;
              }
              seenDates.add(dateStr);

              const encodedNumbers = digits.map((digit, col) => (col + 1) * 10 + digit);
              parsedDraws.push({
                  id: parsedDraws.length + 1,
                  date: finalDate,
                  numbers: encodedNumbers,
                  sum: encodedNumbers.reduce((a, b) => a + b, 0),
                  drawType: dType
              });
          }
      });

      if (parsedDraws.length > 0) {
          parsedDraws.sort((a, b) => {
              const timeA = a.date instanceof Date ? a.date.getTime() : new Date(a.date).getTime();
              const timeB = b.date instanceof Date ? b.date.getTime() : new Date(b.date).getTime();
              return timeA - timeB;
          });
          parsedDraws.forEach((d, idx) => { d.id = idx + 1; });
          return parsedDraws;
      }
  }
  
  let dateIndex = -1;
  let numberIndices: number[] = [];
  let starIndices: number[] = [];
  let complementarioIndex = -1;
  let reintegroIndex = -1;

  const maxNumbers = gameConfig.maxNumbers;
  const maxStars = gameConfig.maxStars;
  const numberRange = gameConfig.numberRange;
  const starRange = gameConfig.starRange;

  if (isHeader) {
      const dateKeywords = ['fecha', 'date', 'sorteo'];
      dateIndex = header.findIndex(h => dateKeywords.some(k => h.includes(k)));

      const numberHeaderCandidates: {index: number, name: string}[] = [];
      const starHeaderCandidates: {index: number, name: string}[] = [];
      
      header.forEach((h, i) => {
          if (/^(n|bola|num|number|c)[\s_-]*\d+$/i.test(h)) {
              numberHeaderCandidates.push({index: i, name: h});
          } else if (/^(s|estrella|star|e|clave|powerbal|powerball|pb)[\s_-]*\d*$/i.test(h) || h.includes('clave') || h.includes('estrella') || h.includes('star') || h.includes('sueño') || h.includes('suno') || h.includes('powerbal') || h.includes('powerball') || h.includes('pb') || h.includes('mega ball') || h.includes('megaball') || h.includes('mega')) {
              starHeaderCandidates.push({index: i, name: h});
          } else if (h.includes('complementario') || h === 'c') {
              complementarioIndex = i;
          } else if (h.includes('reintegro') || h === 'r') {
              reintegroIndex = i;
          }
      });
      
      if (numberHeaderCandidates.length >= maxNumbers) {
          numberHeaderCandidates.sort((a, b) => {
              const matchA = a.name.match(/\d+$/);
              const matchB = b.name.match(/\d+$/);
              const numA = matchA ? parseInt(matchA[0]) : 0;
              const numB = matchB ? parseInt(matchB[0]) : 0;
              return numA - numB;
          });
          numberIndices = numberHeaderCandidates.map(c => c.index).slice(0, maxNumbers);
      }

      if (maxStars > 0 && starHeaderCandidates.length >= maxStars) {
          starHeaderCandidates.sort((a, b) => {
              const matchA = a.name.match(/\d+$/);
              const matchB = b.name.match(/\d+$/);
              const numA = matchA ? parseInt(matchA[0]) : 0;
              const numB = matchB ? parseInt(matchB[0]) : 0;
              return numA - numB;
          });
          starIndices = starHeaderCandidates.map(c => c.index).slice(0, maxStars);
      }
  }

  let parsedResults: Draw[] = [];

  if (numberIndices.length < maxNumbers) {
      parsedResults = lines.map((line, i) => {
          const parts = line.split(/[,;\t]+/).map(p => p.trim().replace(/^["']|["']$/g, '').trim());
          let date: Date | null = null;
          let startCol = 0;

          if (parts.length > 0) {
              if (parts[0].includes('-') || parts[0].includes('/') || isNaN(Number(parts[0]))) {
                  const d = parseFlexibleDate(parts[0]);
                  if (d && !isNaN(d.getTime())) {
                      date = d;
                  }
                  startCol = 1;
              }
          }
          
          const numericParts = parts.slice(startCol).filter(p => /^\d+$/.test(p.trim())).map(p => parseInt(p.trim(), 10));
          const numbers = numericParts.filter(n => n >= 1 && n <= numberRange).slice(0, maxNumbers);
          
          if (numbers.length < maxNumbers) {
              return null;
          }

          let stars: number[] | undefined = undefined;
          let complementario: number | undefined = undefined;
          let reintegro: number | undefined = undefined;

          if (maxStars > 0) {
              const isGordo = gameConfig.id === 'gordo';
              const minStar = isGordo ? 0 : 1;
              const maxStar = isGordo ? 9 : starRange;
              const starCandidates = numericParts.slice(maxNumbers);
              stars = starCandidates.filter(n => n >= minStar && n <= maxStar).slice(0, maxStars);
          } else if (gameConfig.id !== 'euromillones') {
              const remainingNumbers = numericParts.slice(maxNumbers);
              if (remainingNumbers.length >= 1) {
                  complementario = remainingNumbers[0];
              }
              if (remainingNumbers.length >= 2) {
                  reintegro = remainingNumbers[1];
              }
          }

          return {
              id: i + 1,
              date: date || new Date(Date.now() - (lines.length - i) * 3.5 * 24 * 60 * 60 * 1000),
              numbers: numbers.sort((a, b) => a - b),
              stars: stars,
              complementario,
              reintegro,
              sum: numbers.reduce((a, b) => a + b, 0)
          };
      }).filter(Boolean) as Draw[];
  } else {
      parsedResults = lines.map((line, i) => {
          try {
              const parts = line.split(/[,;\t]+/).map(p => p.trim().replace(/^["']|["']$/g, '').trim());
              if (parts.length <= Math.max(...numberIndices, dateIndex)) {
                  return null;
              }
              const numbers = numberIndices.map(index => parseInt(parts[index].trim()));
              if (numbers.some(isNaN)) return null;
              
              let stars: number[] | undefined = undefined;
              if (maxStars > 0 && starIndices.length === maxStars) {
                  stars = starIndices.map(index => parseInt(parts[index].trim()));
                  if (stars.some(isNaN)) stars = undefined;
              } else if (maxStars > 0) {
                  const usedIndices = new Set([...numberIndices, dateIndex, complementarioIndex, reintegroIndex]);
                  const isGordo = gameConfig.id === 'gordo';
                  const minStar = isGordo ? 0 : 1;
                  const maxStar = isGordo ? 9 : starRange;
                  const starCandidates: number[] = [];
                  parts.forEach((p, idx) => {
                      if (!usedIndices.has(idx) && /^\d+$/.test(p.trim())) {
                          const val = parseInt(p.trim(), 10);
                          if (val >= minStar && val <= maxStar) {
                              starCandidates.push(val);
                          }
                      }
                  });
                  if (starCandidates.length >= maxStars) {
                      stars = starCandidates.slice(0, maxStars);
                  }
              }

              let complementario: number | undefined = undefined;
              if (complementarioIndex > -1 && parts[complementarioIndex]) {
                  complementario = parseInt(parts[complementarioIndex].trim());
                  if (isNaN(complementario)) complementario = undefined;
              }

              let reintegro: number | undefined = undefined;
              if (reintegroIndex > -1 && parts[reintegroIndex]) {
                  reintegro = parseInt(parts[reintegroIndex].trim());
                  if (isNaN(reintegro)) reintegro = undefined;
              }

              let date: Date;
              if (dateIndex > -1 && parts[dateIndex]) {
                  const parsedDate = parseFlexibleDate(parts[dateIndex]);
                  date = (parsedDate && !isNaN(parsedDate.getTime())) ? parsedDate : new Date(Date.now() - (lines.length - i) * 3.5 * 24 * 60 * 60 * 1000);
              } else {
                  date = new Date(Date.now() - (lines.length - i) * 3.5 * 24 * 60 * 60 * 1000);
              }
              return {
                  id: i + 1,
                  date: date,
                  numbers: numbers.sort((a, b) => a - b),
                  stars: stars ? stars.sort((a, b) => a - b) : undefined,
                  complementario,
                  reintegro,
                  sum: numbers.reduce((a, b) => a + b, 0)
              };
          } catch (error: any) {
              return null;
          }
      }).filter(Boolean) as Draw[];
  }

  // Sort chronologically ascending (oldest first, newest last)
  parsedResults.sort((a, b) => {
      const timeA = a.date instanceof Date ? a.date.getTime() : new Date(a.date).getTime();
      const timeB = b.date instanceof Date ? b.date.getTime() : new Date(b.date).getTime();
      return timeA - timeB;
  });

  parsedResults.forEach((d, idx) => {
      d.id = idx + 1;
  });

  return parsedResults;
}

