import { Ticket, BankrollConfig } from '../types';
import { GAMES } from '../../game-configs';
import { calculateTicketCost } from './combinatorial';

export type Semaforo = 'green' | 'yellow' | 'red';

export interface BankrollStats {
  totalSpent: number;
  totalWon: number;
  balance: number;
  roi: number; // porcentaje
  weeklyBudget: number;
  pctUsed: number; // 0-100+
  semaforo: Semaforo;
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
  const roi = totalSpent > 0 ? (totalWon / totalSpent) * 100 : 0;
  const weeksInMonth = getWeeksInMonth(monthDate.getFullYear(), monthDate.getMonth());
  const weeklyBudget = weeksInMonth > 0 ? config.monthlyBudget / weeksInMonth : config.monthlyBudget;
  const pctUsed = config.monthlyBudget > 0 ? (totalSpent / config.monthlyBudget) * 100 : 0;
  let semaforo: Semaforo = 'green';
  if (pctUsed >= 100) semaforo = 'red';
  else if (pctUsed >= 60) semaforo = 'yellow';
  return { totalSpent, totalWon, balance, roi, weeklyBudget, pctUsed, semaforo };
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

/** CSV del informe mensual como texto puro; el Blob/descarga lo hace index.tsx (igual que exportTicketsHistoryToCsv). */
export function buildBankrollReportCsv(config: BankrollConfig, stats: BankrollStats, weeklyEntries: WeeklyBankrollEntry[]): string {
  const headers = ['Semana', 'Gastado', 'Ganado', 'Balance'];
  const rows = weeklyEntries.map(w => [w.weekLabel, w.spent.toFixed(2), w.won.toFixed(2), w.balance.toFixed(2)]);
  const summaryRows: string[][] = [
    [],
    ['Presupuesto mensual', config.monthlyBudget.toFixed(2)],
    ['Gastado total', stats.totalSpent.toFixed(2)],
    ['Ganado total', stats.totalWon.toFixed(2)],
    ['Balance neto', stats.balance.toFixed(2)],
    ['ROI (%)', stats.roi.toFixed(1)],
  ];
  const lines = [headers, ...rows, ...summaryRows].map(row =>
    row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
  );
  return lines.join('\n');
}

/** Barras semanales gasto/ganado como divs — sin librería externa, mismo espíritu visual que el resto de la app. */
export function renderBankrollWeeklyChart(container: HTMLElement, weeklyEntries: WeeklyBankrollEntry[], currency: string) {
  container.innerHTML = '';
  if (weeklyEntries.length === 0) {
    container.innerHTML = `<div style="color:#666; text-align:center; padding: 20px; font-size: 0.85rem;">Sin datos este mes todavía.</div>`;
    return;
  }
  const maxVal = Math.max(1, ...weeklyEntries.flatMap(w => [w.spent, w.won]));
  container.style.cssText = 'display:flex; align-items:flex-end; gap:12px; height:160px; padding: 10px 5px; overflow-x:auto;';
  weeklyEntries.forEach(w => {
    const col = document.createElement('div');
    col.style.cssText = 'display:flex; flex-direction:column; align-items:center; gap:4px; min-width:56px;';
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
    col.appendChild(bars);
    col.appendChild(label);
    container.appendChild(col);
  });
}
