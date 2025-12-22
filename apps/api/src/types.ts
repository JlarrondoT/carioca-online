export type Suit = 'S' | 'H' | 'D' | 'C';
export type Rank = 1|2|3|4|5|6|7|8|9|10|11|12|12|13; // 1 = As (NOTE: keep as numeric ranks)

/** Discriminated union so TS can narrow on isJoker */
export type JokerCard = { id: string; isJoker: true };
export type NormalCard = { id: string; isJoker: false; suit: Suit; rank: Rank };
export type Card = JokerCard | NormalCard;

export type MeldType = 'SET' | 'RUN';

export type Meld = {
  id: string;
  type: MeldType;
  cards: Card[];
};

export type Phase = 'DRAW' | 'MELD' | 'DISCARD';
export type RoomStatus = 'LOBBY' | 'PLAYING' | 'FINISHED';

export type Contract = {
  sets: number;
  runs: number;
  runLength: number;
};

export type Player = {
  id: string;
  name: string;
  connected: boolean;
  /** Socket.IO socket id for private messages (hand updates). */
  socketId: string;
};

export type RoomState = {
  roomCode: string;
  hostPlayerId: string;
  status: RoomStatus;

  players: Player[];

  // Deck sizing rule: 2 players => 1 deck; 3+ => 2 decks
  numDecks?: 1 | 2;

  contracts: Contract[];
  contractIndex: number;

  turnPlayerId: string | null;
  phase: Phase;

  deck: Card[];
  /** Discard pile (pozo). Top is last element. */
  discard: Card[];

  hands: Record<string, Card[]>;
  table: Record<string, Meld[]>;

  hasLaidDown: Record<string, boolean>;

  // Round/score helpers used by rules.ts
  scores: Record<string, number>;
  roundWinnerId?: string | null;

  // Turn bookkeeping (some rules use this)
  turnCounter?: number;
  laidDownTurn?: Record<string, number | null>;
};

export type PublicPlayer = {
  id: string;
  name: string;
  connected: boolean;
  /** Optional to keep compatibility if your rules.ts isn't populating it yet */
  cardsCount?: number;
};

export type PublicState = {
  roomCode: string;
  hostPlayerId: string;
  status: RoomStatus;

  players: PublicPlayer[];

  contractIndex: number;
  contractsTotal?: number;

  turnPlayerId: string | null;
  phase: Phase;

  deckCount: number;
  topDiscard: Card | null;

  table: Record<string, Meld[]>;
  hasLaidDown: Record<string, boolean>;

  scores?: Record<string, number>;
  roundWinnerId?: string | null;
};

// WebSocket payloads (used by game.gateway.ts)
export type RoomCreatePayload = { name: string };
export type RoomJoinPayload = { roomCode: string; name: string };
export type GameStartPayload = { roomCode: string };
export type ActionPayload = { roomCode: string; action: ClientAction; actionId?: string };

// Client actions (used by rules.ts)
export type ClientAction =
  | { type: 'DRAW_DECK' }
  | { type: 'DRAW_DISCARD' }
  | { type: 'DISCARD'; cardId: string }
  | { type: 'LAYDOWN'; melds: Meld[] }
  | { type: 'END_MELD' }
  | { type: 'MELD_EXTRA'; melds: Meld[] }
  | { type: 'LAYOFF'; targetPlayerId: string; meldId: string; cardIds: string[] };