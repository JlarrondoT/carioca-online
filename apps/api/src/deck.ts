import { randomUUID } from 'crypto';

export type Suit = 'S' | 'H' | 'D' | 'C';
export type Rank = 1|2|3|4|5|6|7|8|9|10|11|12|13; // 1 = As
export type Card = { id: string; suit?: Suit; rank?: Rank; isJoker: boolean };

/**
 * Build N standard 52-card decks plus 2 jokers per deck.
 * For 1 deck => 54 cards. For 2 decks => 108 cards.
 */
export function buildDeck(numDecks: 1|2 = 2): Card[] {
  const suits: Suit[] = ['S','H','D','C'];
  const cards: Card[] = [];

  for (let d = 0; d < numDecks; d++) {
    for (const suit of suits) {
      for (let rank = 1 as Rank; rank <= 13; rank = (rank + 1) as Rank) {
        cards.push({ id: randomUUID(), suit, rank, isJoker: false });
      }
    }
    // 2 fixed jokers per deck
    cards.push({ id: randomUUID(), isJoker: true });
    cards.push({ id: randomUUID(), isJoker: true });
  }

  // sanity
  const expected = numDecks === 1 ? 54 : 108;
  if (cards.length !== expected) {
    throw new Error(`buildDeck(${numDecks}) produced ${cards.length} cards; expected ${expected}`);
  }
  return cards;
}

export function shuffle<T>(arr: T[], rng: () => number = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}