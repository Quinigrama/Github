export interface Draw {
  id: number;
  date: Date;
  numbers: number[];
  stars?: number[]; // Added for Euromillones
  complementario?: number; // Added for 6/49
  reintegro?: number; // Added for 6/49
  sum: number;
  drawType?: 'navidad' | 'nino' | 'normal';
}

export interface Ticket {
  date: string; // Creation date
  combinations: number[][];
  stars?: number[][]; // Optional stars for Euromillones / Powerball
  strategy: string;
  gameId: string; // NEW: To identify the game this ticket belongs to
  systemName?: string; // Optional name of the reduced system used
  drawDate?: string; // Optional draw date for the ticket
  hasPowerPlay?: boolean; // Optional Power Play option for Powerball
  powerPlayMultiplier?: number; // Power Play multiplier (2X, 3X, 4X, 5X, 10X)
  validation?: { // Optional validation results
    winningNumbers: number[];
    stars?: number[];
    hits: number[];
    starHits?: number[];
    powerPlay?: number;
    totalPayout?: number;
  };
  seenWinning?: boolean; // Whether user has reviewed/seen the winning ticket
  seenValidation?: boolean; // Whether user has reviewed/seen the validated ticket
}

export interface PeniaAlert {
  id: string;
  type: 'ticket_created' | 'hit_significant' | 'jackpot_alert' | 'member_joined';
  title: string;
  message: string;
  timestamp: string;
  author: string;
  badgeColor?: string;
}

export interface PeniaChatMessage {
  id: string;
  author: string;
  text: string;
  timestamp: string;
  isTicketShare?: boolean;
  ticketData?: Ticket;
}

export interface Penia {
  id: string; // 6-char code e.g. AZ34Y2
  code: string; // 6-char code e.g. AZ34Y2
  name: string;
  gameId: string;
  creator: string;
  creatorUid?: string;
  createdAt: string;
  members: string[];
  tickets: Ticket[];
  alerts: PeniaAlert[];
  messages: PeniaChatMessage[];
  totalPrizes?: number;
}

export interface PositionRangeConfig {
  position: number;
  min: number;
  max: number;
  usedHistorical: boolean;
}

export interface PositionRangeFilter {
  enabled: boolean;
  confidenceLevel: number; // z-score: 1.645 (90%), 1.960 (95%), 2.576 (99%)
  ranges: PositionRangeConfig[];
}

