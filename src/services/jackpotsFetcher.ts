import { t } from "../utils/i18n";

export async function parseJackpotsCsvDirectly(): Promise<any[]> {
  const csvUrl = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRcKUCZOa3NM7dBYXOzWO94y51x6RFT6jUCrTYpoLBlKAztGTbbxnygcC8pg47RScEMuVquZOX8iLCt/pub?output=csv";
  const res = await fetch(csvUrl, { method: "GET", headers: { "Accept": "text/csv; charset=utf-8" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length <= 1) throw new Error("CSV vacío");

  const parseCsvRow = (rowStr: string): string[] => {
    const result: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < rowStr.length; i++) {
      const char = rowStr[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(cur.trim());
        cur = '';
      } else {
        cur += char;
      }
    }
    result.push(cur.trim());
    return result;
  };

  const parseBoteNumber = (boteStr: string): number => {
    if (!boteStr) return 0;
    const lower = boteStr.toLowerCase();
    if (lower.includes("no disponible") || lower.includes("consultar")) return 0;

    let multiplier = 1;
    if (lower.includes("billion") || lower.includes("billon") || lower.includes("billón")) {
      multiplier = 1000000000;
    } else if (lower.includes("million") || lower.includes("millon") || lower.includes("millón")) {
      multiplier = 1000000;
    }

    const cleanStr = lower.replace(/[^0-9,.]/g, "");
    if (!cleanStr) return 0;

    if (multiplier > 1) {
      const cleanNum = cleanStr.replace(',', '.');
      return (parseFloat(cleanNum) || 0) * multiplier;
    } else {
      const parts = cleanStr.split(',');
      const integerPart = parts[0].replace(/\./g, "");
      return parseInt(integerPart, 10) || 0;
    }
  };

  const jackpotsMap: { [id: string]: { id: string; juego: string; bote: number; fecha: string } } = {};
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvRow(lines[i]);
    if (cols.length < 3) continue;
    const juegoName = cols[0];
    const fecha = cols[1];
    const boteStr = cols[2];
    const lowerName = juegoName.toLowerCase();

    let id = "";
    if (lowerName.includes("powerball") || lowerName.includes("power")) id = "powerball";
    else if (lowerName.includes("mega") || lowerName.includes("millions")) id = "megamillions";
    else if (lowerName.includes("euromillones") || (lowerName.includes("euro") && lowerName.includes("mill"))) id = "euromillones";
    else if (lowerName.includes("primitiva") && !lowerName.includes("gordo")) id = "primitiva";
    else if (lowerName.includes("gordo")) id = "gordo";
    else if (lowerName.includes("eurodreams") || lowerName.includes("dreams")) id = "eurodreams";
    else if (lowerName.includes("bonoloto")) id = "bonoloto";
    else if (lowerName.includes("nacional")) id = "nacional";

    if (id) {
      const bote = parseBoteNumber(boteStr);
      jackpotsMap[id] = { id, juego: juegoName, bote, fecha };
    }
  }

  const supportedGameIds = ["powerball", "megamillions", "euromillones", "primitiva", "gordo", "eurodreams", "bonoloto", "nacional"];
  const gameNames: { [id: string]: string } = {
    powerball: "Powerball (EE. UU.)",
    megamillions: "Mega Millions (EE. UU.)",
    euromillones: "EuroMillones",
    primitiva: "La Primitiva",
    gordo: "El Gordo de la Primitiva",
    eurodreams: "EuroDreams",
    bonoloto: "BonoLoto",
    nacional: "Lotería Nacional"
  };

  const fallbackBotes: { [id: string]: number } = {
    powerball: 95000000,
    megamillions: 110000000,
    euromillones: 89000000,
    primitiva: 47000000,
    gordo: 11900000,
    eurodreams: 7200000,
    bonoloto: 2800000,
    nacional: 30000
  };

  return supportedGameIds.map(id => {
    if (jackpotsMap[id] && jackpotsMap[id].bote > 0) {
      return jackpotsMap[id];
    }
    return {
      id,
      juego: gameNames[id] || id,
      bote: jackpotsMap[id]?.bote || fallbackBotes[id] || 0,
      fecha: jackpotsMap[id]?.fecha || t('jackpots.proximoSorteoFallback')
    };
  });
}

