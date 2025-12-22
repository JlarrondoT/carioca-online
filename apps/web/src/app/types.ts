export type Suit = 'S' | 'H' | 'D' | 'C';
export type Rank = 1|2|3|4|5|6|7|8|9|10|11|12|13;

export type Card =
  | { id: string; isJoker: true }
  | { id: string; isJoker: false; suit: Suit; rank: Rank };

export type MeldType = 'SET'|'RUN';

export type Meld = { id: string; type: MeldType; cards: Card[] };

export type Phase = 'DRAW'|'MELD'|'DISCARD';

export type Contract = { sets: number; runs: number; runLength: number };

export type PublicState = {
  roomCode: string;
  status: 'LOBBY'|'PLAYING'|'FINISHED';
  hostPlayerId: string;
  players: Array<{ id: string; name: string; connected: boolean }>;

  contractIndex: number;
  contractsTotal: number;
  currentContract: Contract;
  scores: Record<string, number>;
  roundWinnerId: string | null;

  turnPlayerId: string | null;
  phase: Phase;

  deckCount: number;
  topDiscard?: Card;

  handsCount: Record<string, number>;
  table: Record<string, Meld[]>;
  hasLaidDown: Record<string, boolean>;
  canLayoff: Record<string, boolean>;
};

export type ClientAction =
  | { type: 'DRAW_DECK' }
  | { type: 'DRAW_DISCARD' }
  | { type: 'LAYDOWN'; melds: Array<{ type: MeldType; cardIds: string[] }> }
  | { type: 'MELD_EXTRA'; melds: Array<{ type: MeldType; cardIds: string[] }> }
  | { type: 'LAYOFF'; targetPlayerId: string; meldId: string; cardIds: string[] }
  | { type: 'END_MELD' }
  | { type: 'DISCARD'; cardId: string };


// --- Reactions chat (preset phrases) ---
export const REACTION_TEXTS = [
  'Excelente jugada!',
  'Buen intento 😅',
  '¡Noooo!',
  'Te estás tardando en jugar ⏳',
  'Dale, apúrate 🙏',
  'GG',
  'Jajaja 😂',
  'Suerte 🍀',
] as const;
export type ReactionText = (typeof REACTION_TEXTS)[number];

export type ReactionMessage = {
  id: string;
  playerId: string;
  name: string;
  text: ReactionText;
  ts: number;
};
