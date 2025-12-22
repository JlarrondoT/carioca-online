export type Suit = 'S' | 'H' | 'D' | 'C';
export type Rank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13; // 1 = As

export type Card =
  | { id: string; isJoker: true }
  | { id: string; isJoker: false; suit: Suit; rank: Rank };

export type MeldType = 'SET' | 'RUN';

export type Meld = {
  id: string;
  type: MeldType;
  cards: Card[];
};

export type Phase = 'DRAW' | 'MELD' | 'DISCARD';

export type Contract = { sets: number; runs: number; runLength: number };

export type Player = {
  id: string;
  name: string;
  socketId: string;
  connected: boolean;
};

export type PublicPlayer = {
  id: string;
  name: string;
  connected: boolean;
};

export type RoomStatus = 'LOBBY' | 'PLAYING' | 'FINISHED';

export type RoomState = {
  roomCode: string;
  status: RoomStatus;

  hostPlayerId: string;
  players: Player[];

  // Game
  contracts: Contract[];
  contractIndex: number;

  turnPlayerId: string | null;
  phase: Phase;

  deck: Card[];
  discard: Card[];

  hands: Record<string, Card[]>;
  table: Record<string, Meld[]>;

  hasLaidDown: Record<string, boolean>;

  // Scoring / round flow
  scores: Record<string, number>;
  roundWinnerId: string | null;

  // Turn counter increments when a turn ends (after DISCARD)
  turnCounter: number;
  // The turnCounter value when the player laid down the contract in this round.
  // Used to enforce "botar a juegos" only after completing a full round.
  laidDownTurn: Record<string, number | null>;
};

export type PublicState = {
  roomCode: string;
  status: RoomStatus;
  hostPlayerId: string;
  players: PublicPlayer[];

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

export type RoomCreatePayload = { name: string };
export type RoomJoinPayload = { roomCode: string; name: string };
export type GameStartPayload = { roomCode: string; playerId: string };
export type ActionPayload = { roomCode: string; playerId: string; actionId: string; action: ClientAction };
