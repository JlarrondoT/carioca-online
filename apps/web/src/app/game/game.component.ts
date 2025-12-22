import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { GameService } from '../game.service';
import { Card, MeldType, PublicState, ReactionText, REACTION_TEXTS } from '../types';

type PendingMeld = { type: MeldType; cardIds: string[] };

@Component({
  selector: 'app-game',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './game.component.html',
})
export class GameComponent implements OnInit, OnDestroy {
  private sub = new Subscription();

  // Sorting + visual helpers
  sortMode: 'RANK' | 'SUIT' = 'RANK';
  recentlyDrawnId: string | null = null;
  private flashTimer: any = null;
  private prevHandIds = new Set<string>();

  // UI state
  selected = new Set<string>();
  pendingMelds: PendingMeld[] = [];
  /** Card ids already assigned to pending melds (so they can't be selected twice). */
  reserved = new Set<string>();
  /** Latest hand snapshot, used to render pending meld cards. */
  private handIndex = new Map<string, Card>();

  lastBuilderActionId: string | null = null;

  // Observables
  state$ = this.game.state$;
  reactions$ = this.game.reactions$;
  reactionOptions = REACTION_TEXTS;
  lastReactionAt = 0;
  hand$ = this.game.hand$;
  playerId$ = this.game.playerId$;
  roomCode$ = this.game.roomCode$;
  log$ = this.game.log$;
  rejected$ = this.game.actionRejected$;

  constructor(private game: GameService, private router: Router) {}

  ngOnInit(): void {
    // If user refreshes or hits /game directly without a room, send to lobby.
    this.sub.add(
      this.game.state$.subscribe((s) => {
        if (!s?.roomCode) {
          this.router.navigateByUrl('/');
          return;
        }

        // When phase returns to DRAW (next player's turn), clear local builder state.
        if (s.phase === 'DRAW') {
          this.clearBuilder();
        }
      })
    );


    this.sub.add(
      this.game.hand$.subscribe((hand) => {
        const nextHand = hand ?? [];
        this.handIndex = new Map(nextHand.map((c) => [c.id, c]));

        // Detect a newly drawn card and highlight it briefly.
        const nextIds = new Set(nextHand.map((c) => c.id));
        if (this.prevHandIds.size > 0) {
          const added = Array.from(nextIds).filter((id) => !this.prevHandIds.has(id));
          // During normal play, draw adds exactly 1 card. Avoid flashing on initial deal.
          if (added.length === 1) this.flashNewCard(added[0]);
        }
        this.prevHandIds = nextIds;
      })
    );

    this.sub.add(
      this.game.actionAccepted$.subscribe((p) => {
        if (!p) return;
        if (this.lastBuilderActionId && p.actionId === this.lastBuilderActionId) {
          this.clearBuilder();
        }
      })
    );
  }


canSendReaction() {
  return Date.now() - this.lastReactionAt > 1500;
}

sendReaction(text: ReactionText) {
  if (!this.canSendReaction()) return;
  this.lastReactionAt = Date.now();
  this.game.sendReaction(text);
}

  ngOnDestroy(): void {
    if (this.flashTimer) {
      clearTimeout(this.flashTimer);
      this.flashTimer = null;
    }
    this.sub.unsubscribe();
  }

  // --- Lobby / navigation ---
  backToLobby(): void {
    this.selected.clear();
    this.pendingMelds = [];
    this.lastBuilderActionId = null;
    this.recentlyDrawnId = null;
    this.prevHandIds.clear();
    this.game.resetLocal();
    this.router.navigateByUrl('/');
  }

  setSort(mode: 'RANK' | 'SUIT'): void {
    this.sortMode = mode;
  }

  private flashNewCard(cardId: string): void {
    this.recentlyDrawnId = cardId;
    if (this.flashTimer) clearTimeout(this.flashTimer);
    this.flashTimer = setTimeout(() => {
      if (this.recentlyDrawnId === cardId) this.recentlyDrawnId = null;
      this.flashTimer = null;
    }, 5000);
  }

  startGame(): void {
    this.game.startGame();
  }

  // --- Derived helpers ---
  isHost(state: PublicState | null, playerId: string | null): boolean {
    return !!state && !!playerId && state.hostPlayerId === playerId;
  }

  isMyTurn(state: PublicState | null, playerId: string | null): boolean {
    return !!state && !!playerId && state.turnPlayerId === playerId;
  }

  canStart(state: PublicState | null, playerId: string | null): boolean {
    return !!state && state.status === 'LOBBY' && this.isHost(state, playerId) && state.players.length >= 2;
  }

  contractText(state: PublicState | null): string {
    if (!state) return '—';
    const n = (state.contractIndex ?? 0) + 1;
    const labels = [
      '2 tríos',
      '1 escala (4) + 1 trío',
      '2 escalas (4)',
      '3 tríos',
      '2 tríos + 1 escala (4)',
      '2 escalas (4) + 1 trío',
      '3 escalas (4)',
    ];
    return labels[n - 1] ?? this.contractFallback(state);
  }

  private contractFallback(state: PublicState): string {
    const c = state.currentContract;
    const parts: string[] = [];
    if (c.sets) parts.push(`${c.sets} trío(s)`);
    if (c.runs) parts.push(`${c.runs} escala(s) de ${c.runLength}`);
    return parts.join(' + ') || '—';
  }

  contractHint(state: PublicState | null, pid: string | null): string {
    if (!state || !pid || state.status !== 'PLAYING') return '';
    const c = state.currentContract;
    const needSets = c.sets;
    const needRuns = c.runs;
    const haveSets = this.pendingMelds.filter(m => m.type === 'SET').length;
    const haveRuns = this.pendingMelds.filter(m => m.type === 'RUN').length;
    const missing: string[] = [];
    if (!state.hasLaidDown[pid]) {
      if (needSets - haveSets > 0) missing.push(`${needSets - haveSets} trío(s)`);
      if (needRuns - haveRuns > 0) missing.push(`${needRuns - haveRuns} escala(s) (4)`);
      return missing.length ? `Te falta agregar: ${missing.join(' y ')}.` : 'Listo para bajar el contrato.';
    }

    if (state.canLayoff?.[pid]) return 'Puedes botar cartas a juegos en la mesa (clic en un juego).';
    return 'Ya bajaste. Podrás botar cartas a juegos desde tu próximo turno.';
  }

  playerName(state: PublicState | null, id: string | null): string {
    if (!state || !id) return '—';
    return state.players.find((p) => p.id === id)?.name ?? id;
  }

  phaseLabel(p: any): string {
    switch (p) {
      case 'DRAW': return 'Robar';
      case 'MELD': return 'Armar';
      case 'DISCARD': return 'Botar';
      default: return String(p ?? '—');
    }
  }

  // --- UI gating ---
  canAct(state: PublicState | null, pid: string | null): boolean {
    return !!state && state.status === 'PLAYING' && !!pid && state.turnPlayerId === pid;
  }

  canDraw(state: PublicState | null, pid: string | null): boolean {
    return this.canAct(state, pid) && state!.phase === 'DRAW';
  }

  canDrawDiscard(state: PublicState | null, pid: string | null): boolean {
    return this.canAct(state, pid) && state!.phase === 'DRAW' && !!state!.topDiscard;
  }

  canBuildSet(state: PublicState | null, pid: string | null): boolean {
    if (!this.canAct(state, pid) || state!.phase !== 'MELD' || !pid) return false;
    const n = this.selected.size;
    if (!state!.hasLaidDown?.[pid]) return n === 3; // contrato: trío exacto
    // post-contrato: permite trío (3) o 4-of-a-kind (4)
    return n === 3 || n === 4;
  }

  canBuildRun(state: PublicState | null, pid: string | null): boolean {
    if (!this.canAct(state, pid) || state!.phase !== 'MELD' || !pid) return false;
    const n = this.selected.size;
    const runLen = state!.currentContract?.runLength || 4;
    if (!state!.hasLaidDown?.[pid]) return n === runLen; // contrato: escala exacta
    return n >= 4; // post-contrato: escalas extendidas
  }

  canLaydown(state: PublicState | null, pid: string | null): boolean {
    if (!this.canAct(state, pid) || state!.phase !== 'MELD' || !pid) return false;
    if (state!.hasLaidDown?.[pid]) return false;
    return this.isContractReady(state);
  }

  canExtraMeld(state: PublicState | null, pid: string | null): boolean {
    if (!this.canAct(state, pid) || state!.phase !== 'MELD' || !pid) return false;
    if (!state!.hasLaidDown?.[pid]) return false;
    if (!state!.canLayoff?.[pid]) return false;
    return this.pendingMelds.length > 0;
  }

  canLayoff(state: PublicState | null, pid: string | null): boolean {
    if (!this.canAct(state, pid) || state!.phase !== 'MELD' || !pid) return false;
    if (!state!.canLayoff?.[pid]) return false;
    return this.selected.size > 0;
  }

  canEndMeld(state: PublicState | null, pid: string | null): boolean {
    return this.canAct(state, pid) && state!.phase === 'MELD';
  }

  canDiscard(state: PublicState | null, pid: string | null): boolean {
    return this.canAct(state, pid) && state!.phase === 'DISCARD' && this.selected.size === 1;
  }

  canSelectCards(state: PublicState | null, pid: string | null): boolean {
    if (!state || !pid) return false;
    if (state.status !== 'PLAYING') return false;
    if (state.turnPlayerId !== pid) return false;
    return state.phase === 'MELD' || state.phase === 'DISCARD';
  }

  // --- Game actions ---
  drawDeck(): void {
    this.game.action({ type: 'DRAW_DECK' });
  }

  drawDiscard(): void {
    this.game.action({ type: 'DRAW_DISCARD' });
  }

  makeMeld(type: MeldType): void {
    const ids = Array.from(this.selected);
    if (type === 'SET') {
      if (ids.length < 3 || ids.length > 4) return;
    } else {
      if (ids.length < 4) return;
    }

    // prevent reusing the same card in multiple pending melds
    const used = new Set(this.pendingMelds.flatMap(m => m.cardIds));
    if (ids.some(id => used.has(id))) return;

    this.pendingMelds.push({ type, cardIds: ids });
    ids.forEach((id) => this.reserved.add(id));
    this.selected.clear();
  }

  removePending(i: number): void {
    this.pendingMelds.splice(i, 1);
    this.rebuildReserved();
  }

  clearBuilder(): void {
    this.pendingMelds = [];
    this.selected.clear();
    this.reserved.clear();
    this.lastBuilderActionId = null;
  }

  laydown(): void {
    if (this.pendingMelds.length === 0) return;
    const actionId = cryptoRandomId();
    this.lastBuilderActionId = actionId;
    this.game.action({ type: 'LAYDOWN', melds: this.pendingMelds }, actionId);
  }

  extraMeld(): void {
    if (this.pendingMelds.length === 0) return;
    const actionId = cryptoRandomId();
    this.lastBuilderActionId = actionId;
    this.game.action({ type: 'MELD_EXTRA', melds: this.pendingMelds }, actionId);
  }

  layoffTo(state: PublicState, pid: string, targetPlayerId: string, meldId: string): void {
    if (!this.canLayoff(state, pid)) return;
    if (!state.hasLaidDown?.[targetPlayerId]) return;
    const ids = Array.from(this.selected);
    if (ids.length === 0) return;
    this.game.action({ type: 'LAYOFF', targetPlayerId, meldId, cardIds: ids });
    this.selected.clear();
  }

  endMeld(): void {
    this.game.action({ type: 'END_MELD' });
  }

  discardSelected(): void {
    const ids = Array.from(this.selected);
    if (ids.length !== 1) return;
    this.game.action({ type: 'DISCARD', cardId: ids[0] });
    this.clearBuilder();
  }

  toggleSelect(state: PublicState | null, pid: string | null, card: Card): void {
    if (!this.canSelectCards(state, pid)) return;
    if (this.reserved.has(card.id)) return;
    if (this.selected.has(card.id)) this.selected.delete(card.id);
    else this.selected.add(card.id);
  }

  isSelected(cardId: string): boolean {
    return this.selected.has(cardId);
  }


  isReserved(cardId: string): boolean {
    return this.reserved.has(cardId);
  }

  /** Cards still available to select (cards already used in pending melds are hidden). */
  visibleHand(hand: Card[]): Card[] {
    const cards = (hand ?? []).filter((c) => !this.reserved.has(c.id));
    return this.sortCards(cards);
  }

  private sortCards(cards: Card[]): Card[] {
    const copy = [...(cards ?? [])];
    if (this.sortMode === 'SUIT') {
      return copy.sort((a, b) => {
        const sa = this.suitWeight(a);
        const sb = this.suitWeight(b);
        if (sa !== sb) return sa - sb;
        const ra = this.rankWeight(a);
        const rb = this.rankWeight(b);
        if (ra !== rb) return ra - rb;
        return a.id.localeCompare(b.id);
      });
    }

    // Default: sort by rank (A is highest)
    return copy.sort((a, b) => {
      const ra = this.rankWeight(a);
      const rb = this.rankWeight(b);
      if (ra !== rb) return ra - rb;
      const sa = this.suitWeight(a);
      const sb = this.suitWeight(b);
      if (sa !== sb) return sa - sb;
      return a.id.localeCompare(b.id);
    });
  }

  private rankWeight(c: Card): number {
    if (c.isJoker) return 99;
    const r = c.rank ?? 0;
    return r === 1 ? 14 : r; // As al final (más valor)
  }

  private suitWeight(c: Card): number {
    if (c.isJoker) return 9;
    switch (c.suit) {
      case 'S': return 0;
      case 'H': return 1;
      case 'D': return 2;
      case 'C': return 3;
      default: return 8;
    }
  }

  /** Resolve pending meld card ids into Card objects for rendering. */
  pendingCards(m: PendingMeld): Card[] {
    return (m.cardIds ?? []).map((id) => this.handIndex.get(id)).filter((c): c is Card => !!c);
  }

  private rebuildReserved(): void {
    this.reserved = new Set(this.pendingMelds.flatMap((m) => m.cardIds));
  }

  // --- Render helpers ---
  cardShort(c: Card): string {
    if (c.isJoker) return '🃏';
    return `${rankLabel(c.rank)}${suitLabel(c.suit)}`;
  }

  meldText(cards: Card[]): string {
    return (cards ?? []).map((c: Card) => this.cardShort(c)).join(' ');
  }

  // --- Contract readiness ---
  isContractReady(state: PublicState | null): boolean {
    if (!state) return false;
    const c = state.currentContract;
    const sets = this.pendingMelds.filter(m => m.type === 'SET');
    const runs = this.pendingMelds.filter(m => m.type === 'RUN');
    if (sets.length !== c.sets) return false;
    if (runs.length !== c.runs) return false;

    // Exact sizes for contract: trío=3, escala=4
    if (sets.some(m => m.cardIds.length !== 3)) return false;
    const runLen = c.runLength || 4;
    if (runs.some(m => m.cardIds.length !== runLen)) return false;
    return true;
  }
}

function suitLabel(s: any) {
  switch (s) {
    case 'S': return '♠';
    case 'H': return '♥';
    case 'D': return '♦';
    case 'C': return '♣';
    default: return '?';
  }
}

function rankLabel(r: any) {
  switch (r) {
    case 1: return 'A';
    case 11: return 'J';
    case 12: return 'Q';
    case 13: return 'K';
    default: return String(r);
  }
}

function cryptoRandomId() {
  const arr = new Uint8Array(8);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}