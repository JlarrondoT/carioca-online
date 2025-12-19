import { nanoid } from 'nanoid';
import {
  Card,
  Contract,
  Meld,
  MeldType,
  PublicState,
  Rank,
  RoomState,
  Suit,
  ClientAction,
} from './types';

export function defaultContracts(): Contract[] {
  // Contratos clásicos de 7 rondas (Carioca Chile):
  // 1) 2 tríos
  // 2) 1 escala (4) + 1 trío
  // 3) 2 escalas (4)
  // 4) 3 tríos
  // 5) 2 tríos + 1 escala (4)
  // 6) 2 escalas (4) + 1 trío
  // 7) 3 escalas (4)
  return [
    { sets: 2, runs: 0, runLength: 0 },
    { sets: 1, runs: 1, runLength: 4 },
    { sets: 0, runs: 2, runLength: 4 },
    { sets: 3, runs: 0, runLength: 0 },
    { sets: 2, runs: 1, runLength: 4 },
    { sets: 1, runs: 2, runLength: 4 },
    { sets: 0, runs: 3, runLength: 4 },
  ];
}

export function createDeck(opts: { decks: number; jokersPerDeck: number }): Card[] {
  const deck: Card[] = [];
  const suits: Suit[] = ['S', 'H', 'D', 'C'];
  const ranks: Rank[] = [1,2,3,4,5,6,7,8,9,10,11,12,13];

  for (let d = 0; d < opts.decks; d++) {
    for (const s of suits) {
      for (const r of ranks) {
        deck.push({ id: nanoid(12), isJoker: false, suit: s, rank: r });
      }
    }
    for (let j = 0; j < opts.jokersPerDeck; j++) {
      deck.push({ id: nanoid(12), isJoker: true });
    }
  }

  shuffle(deck);
  return deck;
}

export function dealHands(room: RoomState, cardsPerPlayer: number) {
  for (let i = 0; i < cardsPerPlayer; i++) {
    for (const p of room.players) {
      const c = room.deck.pop();
      if (!c) throw new Error('Deck empty while dealing');
      room.hands[p.id].push(c);
    }
  }
  // sort hands for nicer UI
  for (const p of room.players) {
    room.hands[p.id] = sortHand(room.hands[p.id]);
  }
}

export function applyAction(room: RoomState, playerId: string, action: ClientAction) {
  if (room.status !== 'PLAYING') throw new Error('Game is not playing');
  if (!room.turnPlayerId) throw new Error('No active turn');
  if (room.turnPlayerId !== playerId) throw new Error('Not your turn');

  switch (action.type) {
    case 'DRAW_DECK': {
      ensurePhase(room, 'DRAW');
      const card = drawFromDeck(room);
      room.hands[playerId].push(card);
      room.hands[playerId] = sortHand(room.hands[playerId]);
      room.phase = 'MELD';
      return;
    }
    case 'DRAW_DISCARD': {
      ensurePhase(room, 'DRAW');
      const card = room.discard.pop();
      if (!card) throw new Error('Discard pile empty');
      room.hands[playerId].push(card);
      room.hands[playerId] = sortHand(room.hands[playerId]);
      room.phase = 'MELD';
      return;
    }
    case 'LAYDOWN': {
      ensurePhase(room, 'MELD');
      laydown(room, playerId, action.melds);
      return;
    }
    case 'MELD_EXTRA': {
      ensurePhase(room, 'MELD');
      addExtraMelds(room, playerId, action.melds);
      return;
    }
    case 'LAYOFF': {
      ensurePhase(room, 'MELD');
      layoff(room, playerId, action.targetPlayerId, action.meldId, action.cardIds);
      return;
    }
    case 'END_MELD': {
      ensurePhase(room, 'MELD');
      room.phase = 'DISCARD';
      return;
    }
    case 'DISCARD': {
      ensurePhase(room, 'DISCARD');
      discard(room, playerId, action.cardId);
      // If you run out of cards after discarding, you win the round.
      if ((room.hands[playerId]?.length ?? 0) === 0) {
        endRound(room, playerId);
      } else {
        advanceTurn(room);
      }
      return;
    }
    default: {
      // Exhaustive
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const _never: never = action;
      return;
    }
  }
}

function ensurePhase(room: RoomState, phase: RoomState['phase']) {
  if (room.phase !== phase) throw new Error(`Invalid phase. Expected ${phase}`);
}

function drawFromDeck(room: RoomState): Card {
  if (room.deck.length === 0) {
    reshuffleFromDiscard(room);
  }
  const card = room.deck.pop();
  if (!card) throw new Error('Deck empty');
  return card;
}

function reshuffleFromDiscard(room: RoomState) {
  // Keep top discard, shuffle the rest into deck
  if (room.discard.length <= 1) {
    throw new Error('Cannot reshuffle: not enough cards in discard');
  }
  const top = room.discard.pop()!;
  const toShuffle = room.discard.splice(0, room.discard.length);
  shuffle(toShuffle);
  room.deck.push(...toShuffle);
  room.discard.push(top);
}

function discard(room: RoomState, playerId: string, cardId: string) {
  const hand = room.hands[playerId];
  const idx = hand.findIndex(c => c.id === cardId);
  if (idx === -1) throw new Error('Card not in your hand');
  const [card] = hand.splice(idx, 1);
  room.discard.push(card);
}

function advanceTurn(room: RoomState) {
  room.turnCounter = (room.turnCounter ?? 0) + 1;
  const idx = room.players.findIndex(p => p.id === room.turnPlayerId);
  const next = (idx + 1) % room.players.length;
  room.turnPlayerId = room.players[next].id;
  room.phase = 'DRAW';
}

export function publicStateForRoom(room: RoomState): PublicState {
  const handsCount: Record<string, number> = {};
  for (const p of room.players) handsCount[p.id] = room.hands[p.id]?.length ?? 0;

  const currentContract = room.contracts[room.contractIndex] ?? room.contracts[0];

  const canLayoff: Record<string, boolean> = {};
  for (const p of room.players) {
    canLayoff[p.id] = canLayoffNow(room, p.id);
  }

  return {
    roomCode: room.roomCode,
    status: room.status,
    hostPlayerId: room.hostPlayerId,
    players: room.players.map(p => ({ id: p.id, name: p.name, connected: p.connected })),

    contractIndex: room.contractIndex,
    contractsTotal: room.contracts.length,
    currentContract,
    scores: room.scores,
    roundWinnerId: room.roundWinnerId,

    turnPlayerId: room.turnPlayerId,
    phase: room.phase,

    deckCount: room.deck.length,
    topDiscard: room.discard[room.discard.length - 1],
    handsCount,
    table: room.table,
    hasLaidDown: room.hasLaidDown,
    canLayoff,
  };
}

/**
 * --- Meld / Contratos ---
 * Jokers son comodines. As = 1 (no 14).
 */
function laydown(room: RoomState, playerId: string, meldSpecs: Array<{ type: MeldType; cardIds: string[] }>) {
  if (room.hasLaidDown[playerId]) throw new Error('You already laid down this round');

  const contract = room.contracts[room.contractIndex];
  if (!contract) throw new Error('Invalid contract');

  const sets = meldSpecs.filter(m => m.type === 'SET');
  const runs = meldSpecs.filter(m => m.type === 'RUN');

  if (sets.length !== contract.sets) throw new Error(`Contract needs ${contract.sets} SET(s)`);
  if (runs.length !== contract.runs) throw new Error(`Contract needs ${contract.runs} RUN(s)`);

  const allIds = meldSpecs.flatMap(m => m.cardIds ?? []);
  if (new Set(allIds).size !== allIds.length) throw new Error('A card was used more than once');


  const hand = room.hands[playerId];
  const handMap = new Map(hand.map(c => [c.id, c]));

  const melds: Meld[] = [];
  for (const spec of meldSpecs) {
    // Según reglas comunes: trío = 3 cartas, escala = 4 cartas.
    if (spec.type === 'SET' && spec.cardIds.length !== 3) {
      throw new Error('SET must be exactly 3 cards (trío)');
    }
    if (spec.type === 'RUN' && spec.cardIds.length !== (contract.runLength || 4)) {
      throw new Error(`RUN must be exactly ${contract.runLength || 4} cards (escala)`);
    }

    const cards: Card[] = spec.cardIds.map(id => {
      const c = handMap.get(id);
      if (!c) throw new Error('Some cards are not in your hand');
      return c;
    });

    if (spec.type === 'SET') {
      if (!isValidSet(cards)) throw new Error('Invalid SET');
    } else {
      if (!isValidRun(cards, contract.runLength || 4)) throw new Error('Invalid RUN');
    }

    melds.push({
      id: nanoid(10),
      type: spec.type,
      cards,
    });
  }

  // Remove cards from hand
  const used = new Set(meldSpecs.flatMap(m => m.cardIds));
  room.hands[playerId] = hand.filter(c => !used.has(c.id));
  room.table[playerId].push(...melds);
  room.hasLaidDown[playerId] = true;
  room.laidDownTurn[playerId] = room.turnCounter ?? 0;
}

function canLayoffNow(room: RoomState, playerId: string): boolean {
  if (!room.hasLaidDown?.[playerId]) return false;
  const laid = room.laidDownTurn?.[playerId];
  if (laid == null) return false;
  const now = room.turnCounter ?? 0;
  // Must have completed a full round (all other players took a turn) after laying down.
  return now - laid >= room.players.length;
}

function addExtraMelds(room: RoomState, playerId: string, meldSpecs: Array<{ type: MeldType; cardIds: string[] }>) {
  if (!room.hasLaidDown[playerId]) throw new Error('You must lay down the contract first');
  if (!canLayoffNow(room, playerId)) throw new Error('You can lay off / add melds starting from your next turn');

  if (!meldSpecs?.length) throw new Error('No melds');

  const allIds = meldSpecs.flatMap(m => m.cardIds ?? []);
  if (new Set(allIds).size !== allIds.length) throw new Error('A card was used more than once');


  const hand = room.hands[playerId];
  const handMap = new Map(hand.map(c => [c.id, c]));

  const melds: Meld[] = [];
  for (const spec of meldSpecs) {
    const cards: Card[] = (spec.cardIds ?? []).map(id => {
      const c = handMap.get(id);
      if (!c) throw new Error('Some cards are not in your hand');
      return c;
    });

    if (spec.type === 'SET') {
      if (cards.length < 3) throw new Error('SET must be at least 3 cards');
      if (!isValidSet(cards)) throw new Error('Invalid SET');
    } else {
      if (cards.length < 4) throw new Error('RUN must be at least 4 cards');
      if (!isValidRun(cards, 4)) throw new Error('Invalid RUN');
    }

    melds.push({ id: nanoid(10), type: spec.type, cards: sortMeld(spec.type, cards) });
  }

  const used = new Set(meldSpecs.flatMap(m => m.cardIds));
  room.hands[playerId] = hand.filter(c => !used.has(c.id));
  room.hands[playerId] = sortHand(room.hands[playerId]);
  room.table[playerId].push(...melds);
}

function layoff(room: RoomState, playerId: string, targetPlayerId: string, meldId: string, cardIds: string[]) {
  if (!room.hasLaidDown[playerId]) throw new Error('You must lay down the contract first');
  if (!canLayoffNow(room, playerId)) throw new Error('You can lay off starting from your next turn');
  if (!room.hasLaidDown[targetPlayerId]) throw new Error('Target player has not laid down yet');

  const targetMeld = (room.table[targetPlayerId] ?? []).find(m => m.id === meldId);
  if (!targetMeld) throw new Error('Meld not found');
  if (!cardIds?.length) throw new Error('No cards selected');
  if (new Set(cardIds).size !== cardIds.length) throw new Error('Duplicate cards');

  const hand = room.hands[playerId];
  const handMap = new Map(hand.map(c => [c.id, c]));
  const added: Card[] = cardIds.map(id => {
    const c = handMap.get(id);
    if (!c) throw new Error('Some cards are not in your hand');
    return c;
  });

  const nextCards = [...(targetMeld.cards ?? []), ...added];
  if (targetMeld.type === 'SET') {
    if (!isValidSet(nextCards)) throw new Error('Invalid SET after layoff');
  } else {
    if (!isValidRun(nextCards, 4)) throw new Error('Invalid RUN after layoff');
  }

  // Remove from hand
  const used = new Set(cardIds);
  room.hands[playerId] = hand.filter(c => !used.has(c.id));
  room.hands[playerId] = sortHand(room.hands[playerId]);

  targetMeld.cards = sortMeld(targetMeld.type, nextCards);
}

function endRound(room: RoomState, winnerId: string) {
  room.roundWinnerId = winnerId;

  // Add penalty points for remaining cards in hand
  for (const p of room.players) {
    if (p.id === winnerId) continue;
    const pts = (room.hands[p.id] ?? []).reduce((acc, c) => acc + cardPoints(c), 0);
    room.scores[p.id] = (room.scores[p.id] ?? 0) + pts;
  }

  // Advance contract / finish game
  if (room.contractIndex >= room.contracts.length - 1) {
    room.status = 'FINISHED';
    room.turnPlayerId = null;
    room.phase = 'DRAW';
    return;
  }

  room.contractIndex += 1;
  startNewRound(room, winnerId);
}

function startNewRound(room: RoomState, startingPlayerId: string) {
  room.turnCounter = 0;

  room.deck = createDeck({ decks: 2, jokersPerDeck: 2 });
  room.discard = [];
  room.table = {};
  room.hands = {};
  room.hasLaidDown = {};
  room.laidDownTurn = {};

  for (const p of room.players) {
    room.table[p.id] = [];
    room.hands[p.id] = [];
    room.hasLaidDown[p.id] = false;
    room.laidDownTurn[p.id] = null;
  }

  // 12 cartas por jugador
  dealHands(room, 12);

  // First discard (avoid joker when possible)
  let firstDiscard = room.deck.pop();
  if (firstDiscard?.isJoker) {
    room.deck.unshift(firstDiscard);
    for (let i = 0; i < 10; i++) {
      const c = room.deck.pop();
      if (!c) break;
      if (!c.isJoker) { firstDiscard = c; break; }
      room.deck.unshift(c);
    }
    if (firstDiscard?.isJoker) firstDiscard = room.deck.pop();
  }
  if (firstDiscard) room.discard.push(firstDiscard);

  // Winner starts next round (simple rule for prototype)
  room.turnPlayerId = room.players.find(p => p.id === startingPlayerId)?.id ?? room.players[0].id;
  room.phase = 'DRAW';
}

function cardPoints(card: Card): number {
  if (card.isJoker) return 30;
  const r = (card as Extract<Card, { isJoker: false }>).rank;
  if (r === 1) return 20;
  if (r >= 2 && r <= 10) return r;
  return 10; // J,Q,K
}

function sortMeld(type: MeldType, cards: Card[]): Card[] {
  if (type === 'SET') {
    // Keep jokers first, then suits
    const suitOrder: Record<string, number> = { S: 0, H: 1, D: 2, C: 3 };
    return [...cards].sort((a, b) => {
      if (a.isJoker && !b.isJoker) return -1;
      if (!a.isJoker && b.isJoker) return 1;
      if (a.isJoker && b.isJoker) return a.id.localeCompare(b.id);
      const aa = a as Extract<Card, { isJoker: false }>;
      const bb = b as Extract<Card, { isJoker: false }>;
      return suitOrder[aa.suit] - suitOrder[bb.suit];
    });
  }
  // RUN: sort by rank (jokers first)
  return [...cards].sort((a, b) => {
    if (a.isJoker && !b.isJoker) return -1;
    if (!a.isJoker && b.isJoker) return 1;
    if (a.isJoker && b.isJoker) return a.id.localeCompare(b.id);
    const aa = a as Extract<Card, { isJoker: false }>;
    const bb = b as Extract<Card, { isJoker: false }>;
    return aa.rank - bb.rank;
  });
}

export function isValidSet(cards: Card[]): boolean {
  // Según la guía de Conecta Games: "Los tríos son tres cartas del mismo número"
  // (no exige palos distintos). Con 2 mazos puede haber cartas duplicadas.
  if (cards.length < 3) return false;

  // En la guía: cada trío puede tener solo 1 comodín/joker
  if (cards.filter(c => c.isJoker).length > 1) return false;

  const normals = cards.filter(c => !c.isJoker) as Array<Extract<Card, { isJoker: false }>>;
  if (normals.length === 0) return false; // no permitir set de puros jokers

  const rank = normals[0].rank;
  if (normals.some(c => c.rank !== rank)) return false;

  return true;
}

export function isValidRun(cards: Card[], minLen: number): boolean {
  if (cards.length < minLen) return false;

  const jokers = cards.filter(c => c.isJoker).length;
  if (jokers > 1) return false;
  const normals = cards.filter(c => !c.isJoker) as Array<Extract<Card, { isJoker: false }>>;
  if (normals.length === 0) return false;

  const suit = normals[0].suit;
  if (normals.some(c => c.suit !== suit)) return false;

  const ranks = normals.map(c => c.rank).sort((a, b) => a - b);

  // No duplicados en el mismo palo
  if (new Set(ranks).size !== ranks.length) return false;

  let gaps = 0;
  for (let i = 1; i < ranks.length; i++) {
    const diff = ranks[i] - ranks[i - 1];
    if (diff <= 0) return false;
    gaps += diff - 1;
  }

  // As solo es 1: no hay wrap, y no se valida borde superior porque no generamos la secuencia completa aquí.
  return gaps <= jokers;
}

function sortHand(cards: Card[]): Card[] {
  // Jokers first, then suit, then rank
  const suitOrder: Record<string, number> = { S: 0, H: 1, D: 2, C: 3 };
  return [...cards].sort((a, b) => {
    if (a.isJoker && !b.isJoker) return -1;
    if (!a.isJoker && b.isJoker) return 1;
    if (a.isJoker && b.isJoker) return a.id.localeCompare(b.id);

    const aa = a as Extract<Card, { isJoker: false }>;
    const bb = b as Extract<Card, { isJoker: false }>;
    const sd = suitOrder[aa.suit] - suitOrder[bb.suit];
    if (sd !== 0) return sd;
    return aa.rank - bb.rank;
  });
}

function shuffle<T>(arr: T[]) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}
