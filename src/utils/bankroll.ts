import { Ticket, BankrollConfig } from '../types';
import { GAMES } from '../../game-configs';
import { calculateTicketCost } from './combinatorial';

export type Semaforo = 'green' | 'yellow' | 'red';

export interface BankrollStats {
  totalSpent: number;
  totalWon: number;
  balance: number;
  roi: number; // rentabilidad neta en %: (ganado - gastado) / gastado * 100. 0 = empate, negativo = pérdida.
  weeklyBudget: number;
  pctUsed: number; // 0-100+
  semaforo: Semaforo;       // el peor de los dos siguientes
  budgetSemaforo: Semaforo; // según pctUsed (presupuesto usado)
  roiSemaforo: Semaforo;    // según roi (rentabilidad)
}

export interface WeeklyBankrollEntry {
  weekKey: string;   // ej. "2026-W37"
  weekLabel: string; // ej. "8/9–14/9"
  spent: number;
  won: number;
  balance: number;
}

export interface BankrollAlert {
  level: 'warning' | 'danger';
  messageKey: string;
  params?: Record<string, any>;
}

export function getTicketRelevantDate(ticket: Ticket): Date {
  if (ticket.drawDate) return new Date(ticket.drawDate + 'T00:00:00');
  return new Date(ticket.date);
}

function getIsoWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

function getIsoWeekLabel(date: Date): string {
  const start = new Date(date);
  const day = start.getDay() || 7;
  start.setDate(start.getDate() - day + 1);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const fmt = (d: Date) => `${d.getDate()}/${d.getMonth() + 1}`;
  return `${fmt(start)}–${fmt(end)}`;
}

/** Nº de semanas ISO distintas que toca el mes (para repartir el presupuesto mensual). */
export function getWeeksInMonth(year: number, monthIndex0: number): number {
  const firstDay = new Date(year, monthIndex0, 1);
  const lastDay = new Date(year, monthIndex0 + 1, 0);
  const weeks = new Set<string>();
  const cursor = new Date(firstDay);
  while (cursor <= lastDay) {
    weeks.add(getIsoWeekKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return weeks.size;
}

/** Boletos relevantes: mismo currency que la config del bankroll, dentro del mes indicado. */
export function getBankrollTicketsForMonth(tickets: Ticket[], config: BankrollConfig, monthDate: Date = new Date()): Ticket[] {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  return tickets.filter(ticket => {
    const game = GAMES[ticket.gameId];
    if (!game || game.currency !== config.currency) return false;
    const d = getTicketRelevantDate(ticket);
    return d.getFullYear() === year && d.getMonth() === month;
  });
}

export function calculateBankrollStats(tickets: Ticket[], config: BankrollConfig, monthDate: Date = new Date()): BankrollStats {
  const monthTickets = getBankrollTicketsForMonth(tickets, config, monthDate);
  let totalSpent = 0;
  let totalWon = 0;
  monthTickets.forEach(ticket => {
    totalSpent += calculateTicketCost(ticket, ticket.gameId).totalCost;
    if (ticket.validation?.totalPayout) totalWon += ticket.validation.totalPayout;
  });
  const balance = totalWon - totalSpent;
  // Rentabilidad neta: 0% = empate, negativo = pérdida (antes era ganado/gastado*100, que nunca bajaba de 0
  // y confundía "empate" con "100%"). Con esta definición el signo tiene sentido intuitivo.
  const roi = totalSpent > 0 ? ((totalWon - totalSpent) / totalSpent) * 100 : 0;
  const weeksInMonth = getWeeksInMonth(monthDate.getFullYear(), monthDate.getMonth());
  const weeklyBudget = weeksInMonth > 0 ? config.monthlyBudget / weeksInMonth : config.monthlyBudget;
  const pctUsed = config.monthlyBudget > 0 ? (totalSpent / config.monthlyBudget) * 100 : 0;

  let budgetSemaforo: Semaforo = 'green';
  if (pctUsed >= 100) budgetSemaforo = 'red';
  else if (pctUsed >= 60) budgetSemaforo = 'yellow';

  let roiSemaforo: Semaforo = 'green';
  if (roi <= -85) roiSemaforo = 'red';
  else if (roi <= -60) roiSemaforo = 'yellow';

  const semaforoRank: { [k in Semaforo]: number } = { green: 0, yellow: 1, red: 2 };
  const semaforo: Semaforo = semaforoRank[roiSemaforo] > semaforoRank[budgetSemaforo] ? roiSemaforo : budgetSemaforo;

  return { totalSpent, totalWon, balance, roi, weeklyBudget, pctUsed, semaforo, budgetSemaforo, roiSemaforo };
}

/** Agrupa los boletos del mes por semana ISO, para el histórico/gráfico. */
export function groupTicketsByWeek(tickets: Ticket[], config: BankrollConfig, monthDate: Date = new Date()): WeeklyBankrollEntry[] {
  const monthTickets = getBankrollTicketsForMonth(tickets, config, monthDate);
  const map = new Map<string, WeeklyBankrollEntry>();
  monthTickets.forEach(ticket => {
    const d = getTicketRelevantDate(ticket);
    const key = getIsoWeekKey(d);
    if (!map.has(key)) {
      map.set(key, { weekKey: key, weekLabel: getIsoWeekLabel(d), spent: 0, won: 0, balance: 0 });
    }
    const entry = map.get(key)!;
    entry.spent += calculateTicketCost(ticket, ticket.gameId).totalCost;
    if (ticket.validation?.totalPayout) entry.won += ticket.validation.totalPayout;
    entry.balance = entry.won - entry.spent;
  });
  return Array.from(map.values()).sort((a, b) => a.weekKey.localeCompare(b.weekKey));
}

/**
 * Últimas 8 semanas ISO completas (lunes a domingo), terminando en la semana que contiene
 * referenceDate — independiente del mes natural. A diferencia de groupTicketsByWeek(), aquí
 * se generan siempre los 8 slots aunque alguna semana no tenga boletos (quedan a 0).
 */
export function getLast8WeeksEntries(tickets: Ticket[], config: BankrollConfig, referenceDate: Date = new Date()): WeeklyBankrollEntry[] {
  const slots: WeeklyBankrollEntry[] = [];
  const cursor = new Date(referenceDate);
  cursor.setDate(cursor.getDate() - 7 * 7);
  for (let i = 0; i < 8; i++) {
    slots.push({ weekKey: getIsoWeekKey(cursor), weekLabel: getIsoWeekLabel(cursor), spent: 0, won: 0, balance: 0 });
    cursor.setDate(cursor.getDate() + 7);
  }
  const slotMap = new Map(slots.map(s => [s.weekKey, s]));

  tickets.forEach(ticket => {
    const game = GAMES[ticket.gameId];
    if (!game || game.currency !== config.currency) return;
    const d = getTicketRelevantDate(ticket);
    const slot = slotMap.get(getIsoWeekKey(d));
    if (!slot) return; // fuera de las últimas 8 semanas
    slot.spent += calculateTicketCost(ticket, ticket.gameId).totalCost;
    if (ticket.validation?.totalPayout) slot.won += ticket.validation.totalPayout;
    slot.balance = slot.won - slot.spent;
  });

  return slots;
}

/** Cuenta la racha de semanas consecutivas en negativo, desde la más reciente hacia atrás. */
export function countConsecutiveNegativeWeeks(weeklyEntries: WeeklyBankrollEntry[]): number {
  let count = 0;
  for (let i = weeklyEntries.length - 1; i >= 0; i--) {
    if (weeklyEntries[i].balance < 0) count++;
    else break;
  }
  return count;
}

/** Alertas puramente informativas — nunca consejos de staking (ver INSTRUCCIONES arriba). */
export function getBankrollAlerts(stats: BankrollStats, consecutiveNegativeWeeks: number): BankrollAlert[] {
  const alerts: BankrollAlert[] = [];
  if (stats.pctUsed >= 100) {
    alerts.push({ level: 'danger', messageKey: 'bankroll.alerta.superado100' });
  } else if (stats.pctUsed >= 80) {
    alerts.push({ level: 'warning', messageKey: 'bankroll.alerta.superado80' });
  }
  if (consecutiveNegativeWeeks >= 3) {
    alerts.push({ level: 'warning', messageKey: 'bankroll.alerta.rachaNegativa', params: { weeks: consecutiveNegativeWeeks } });
  }
  return alerts;
}

/** CSV del informe con dos secciones: resumen del mes natural, y detalle de las últimas 8 semanas ISO. */
export function buildBankrollReportCsv(config: BankrollConfig, stats: BankrollStats, last8WeeksEntries: WeeklyBankrollEntry[]): string {
  const sectionA: string[][] = [
    ['Resumen del mes natural'],
    ['Presupuesto mensual', config.monthlyBudget.toFixed(2)],
    ['Presupuesto semanal', stats.weeklyBudget.toFixed(2)],
    ['Gastado total', stats.totalSpent.toFixed(2)],
    ['Ganado total', stats.totalWon.toFixed(2)],
    ['Balance neto', stats.balance.toFixed(2)],
    ['ROI (%)', stats.roi.toFixed(1)],
    ['% presupuesto usado', stats.pctUsed.toFixed(0)],
  ];
  const sectionB: string[][] = [
    [],
    ['Últimas 8 semanas ISO'],
    ['Semana', 'Gastado', 'Ganado', 'Balance'],
    ...last8WeeksEntries.map(w => [w.weekLabel, w.spent.toFixed(2), w.won.toFixed(2), w.balance.toFixed(2)]),
  ];
  const lines = [...sectionA, ...sectionB].map(row =>
    row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
  );
  return lines.join('\n');
}

/** Barras semanales gasto/ganado como divs, con etiqueta de balance por semana y línea de referencia en cero. */
export function renderBankrollWeeklyChart(container: HTMLElement, weeklyEntries: WeeklyBankrollEntry[], currency: string) {
  container.innerHTML = '';
  if (weeklyEntries.length === 0) {
    container.innerHTML = `<div style="color:#666; text-align:center; padding: 20px; font-size: 0.85rem;">Sin datos todavía.</div>`;
    return;
  }
  const maxVal = Math.max(1, ...weeklyEntries.flatMap(w => [w.spent, w.won]));
  container.style.cssText = 'position:relative; display:flex; align-items:flex-end; gap:12px; height:190px; padding: 26px 5px 10px 5px; overflow-x:auto;';

  const zeroLine = document.createElement('div');
  zeroLine.style.cssText = 'position:absolute; left:0; right:0; bottom:30px; height:1px; background:#e2e8f0;';
  container.appendChild(zeroLine);

  weeklyEntries.forEach(w => {
    const col = document.createElement('div');
    col.style.cssText = 'display:flex; flex-direction:column; align-items:center; gap:4px; min-width:56px; position:relative;';

    const balanceLabel = document.createElement('div');
    balanceLabel.style.cssText = `font-size:0.7rem; font-weight:700; color:${w.balance >= 0 ? '#16a34a' : '#dc2626'}; white-space:nowrap;`;
    balanceLabel.textContent = `${w.balance >= 0 ? '+' : ''}${w.balance.toFixed(2)}${currency}`;

    const bars = document.createElement('div');
    bars.style.cssText = 'display:flex; align-items:flex-end; gap:3px; height:110px;';
    const spentBar = document.createElement('div');
    spentBar.style.cssText = `width:14px; background:#ef4444; border-radius:3px 3px 0 0; height:${Math.max(2, (w.spent / maxVal) * 110)}px;`;
    spentBar.title = `Gastado: ${w.spent.toFixed(2)}${currency}`;
    const wonBar = document.createElement('div');
    wonBar.style.cssText = `width:14px; background:#10b981; border-radius:3px 3px 0 0; height:${Math.max(2, (w.won / maxVal) * 110)}px;`;
    wonBar.title = `Ganado: ${w.won.toFixed(2)}${currency}`;
    bars.appendChild(spentBar);
    bars.appendChild(wonBar);

    const label = document.createElement('div');
    label.style.cssText = 'font-size:0.7rem; color:#64748b; text-align:center;';
    label.textContent = w.weekLabel;

    col.appendChild(balanceLabel);
    col.appendChild(bars);
    col.appendChild(label);
    container.appendChild(col);
  });
}
