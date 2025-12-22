import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { CdkDragDrop, DragDropModule } from '@angular/cdk/drag-drop';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { GameService } from '../game.service';
import { Card, Meld, MeldType, PublicState, ReactionText, REACTION_TEXTS } from '../types';

type PendingMeld = { id: string; type: MeldType; cardIds: string[] };

const HAND_DROP_ID = 'hand';
const DISCARD_DROP_ID = 'discard';

@Component({
  selector: 'app-game',
  standalone: true,
  imports: [CommonModule, DragDropModule],
  templateUrl: './game.component.html',
})
export class GameComponent implements OnInit, OnDestroy {
  private sub = new Subscription();

  // Sorting + visual helpers
  sortMode: 'RANK' | 'SUIT' = 'RANK';
  recentlyDrawnId: string | null = null;
  private flashTimer: any = null;
  private prevHandIds = new Set<string>();
  private isDragging = false;

  // Builder state
  pendingMelds: PendingMeld[] = [];
  /** Card ids already assigned to pending melds (hidden from hand). */
  reserved = new Set<string>();
  /** Map cardId -> pendingMeldId (so we can move cards between melds). */
  private cardToPending = new Map<string, string>();
  /** Latest hand snapshot, used to render card chips for pending melds. */
  private handIndex = new Map<string, Card>();

  // Discard selection fallback (optional, in addition to drag-to-discard)
  discardSelectedId: string | null = null;

  // Drop list ids
  readonly handDropId = HAND_DROP_ID;
  readonly discardDropId = DISCARD_DROP_ID;
  pendingDropIds: string[] = [];
  tableDropIds: string[] = [];

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
    this.sub.add(
      this.game.state$.subscribe((s) => {
        if (!s?.roomCode) {
          this.router.navigateByUrl('/');
          return;
        }

        // Keep drop targets in sync with current table state
        this.tableDropIds = this.computeTableDropIds(s);

        // When phase returns to DRAW (next player's turn), clear local builder state
        if (s.phase === 'DRAW') {
          this.clearBuilder();
          this.discardSelectedId = null;
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

  // --- Navigation ---
  backToLobby(): void {
    this.clearBuilder();
    this.recentlyDrawnId = null;
    this.prevHandIds.clear();
    this.discardSelectedId = null;
    this.game.resetLocal();
    this.router.navigateByUrl('/');
  }

  startGame(): void {
    this.game.startGame();
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

  playerName(state: PublicState | null, id: string | null): string {
    if (!state || !id) return '—';
    return state.players.find((p) => p.id === id)?.name ?? id;
  }

  phaseLabel(p: any): string {
    switch (p) {
      case 'DRAW':
        return 'Robar';
      case 'MELD':
        return 'Armar';
      case 'DISCARD':
        return 'Botar';
      default:
        return String(p ?? '—');
    }
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
    const runLen = c.runLength || 4;

    // Count only *complete* melds toward the contract
    const completeSets = this.pendingMelds.filter((m) => m.type === 'SET' && m.cardIds.length === 3);
    const completeRuns = this.pendingMelds.filter((m) => m.type === 'RUN' && m.cardIds.length === runLen);

    if (!state.hasLaidDown?.[pid]) {
      const missing: string[] = [];
      if (c.sets - completeSets.length > 0) missing.push(`${c.sets - completeSets.length} trío(s)`);
      if (c.runs - completeRuns.length > 0) missing.push(`${c.runs - completeRuns.length} escala(s) (${runLen})`);
      return missing.length
        ? `Te falta agregar: ${missing.join(' y ')}.`
        : 'Listo para bajar el contrato.';
    }

    if (state.canLayoff?.[pid]) return 'Puedes botar cartas a juegos en la mesa (arrastrar carta a un juego).';
    return 'Ya bajaste. Podrás botar cartas a juegos desde tu próximo turno.';
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

  canBuild(state: PublicState | null, pid: string | null): boolean {
    return this.canAct(state, pid) && state!.phase === 'MELD';
  }

  canLaydown(state: PublicState | null, pid: string | null): boolean {
    if (!this.canBuild(state, pid) || !pid) return false;
    if (state!.hasLaidDown?.[pid]) return false;
    return this.isContractReady(state);
  }

  canExtraMeld(state: PublicState | null, pid: string | null): boolean {
    if (!this.canBuild(state, pid) || !pid) return false;
    if (!state!.hasLaidDown?.[pid]) return false;
    if (!state!.canLayoff?.[pid]) return false;
    return this.pendingMelds.some((m) => m.cardIds.length > 0);
  }

  canEndMeld(state: PublicState | null, pid: string | null): boolean {
    return this.canAct(state, pid) && state!.phase === 'MELD';
  }

  canDiscardPhase(state: PublicState | null, pid: string | null): boolean {
    return this.canAct(state, pid) && state!.phase === 'DISCARD';
  }

  // --- Game actions ---
  drawDeck(): void {
    this.game.action({ type: 'DRAW_DECK' });
  }

  drawDiscard(): void {
    this.game.action({ type: 'DRAW_DISCARD' });
  }

  addPending(type: MeldType): void {
    const id = cryptoRandomId();
    this.pendingMelds.push({ id, type, cardIds: [] });
    this.rebuildPendingDropIds();
  }

  removePending(i: number): void {
    const m = this.pendingMelds[i];
    if (m) {
      for (const cid of m.cardIds) {
        this.cardToPending.delete(cid);
        this.reserved.delete(cid);
      }
    }
    this.pendingMelds.splice(i, 1);
    this.rebuildReservedFromMap();
    this.rebuildPendingDropIds();
  }

  clearBuilder(): void {
    this.pendingMelds = [];
    this.reserved.clear();
    this.cardToPending.clear();
    this.lastBuilderActionId = null;
    this.rebuildPendingDropIds();
  }

  laydown(): void {
    const melds = this.pendingMelds.filter((m) => m.cardIds.length > 0);
    if (melds.length === 0) return;
    const actionId = cryptoRandomId();
    this.lastBuilderActionId = actionId;
    this.game.action(
      {
        type: 'LAYDOWN',
        melds: melds.map((m) => ({ type: m.type, cardIds: m.cardIds })),
      },
      actionId
    );
  }

  extraMeld(): void {
    const melds = this.pendingMelds.filter((m) => m.cardIds.length > 0);
    if (melds.length === 0) return;
    const actionId = cryptoRandomId();
    this.lastBuilderActionId = actionId;
    this.game.action(
      {
        type: 'MELD_EXTRA',
        melds: melds.map((m) => ({ type: m.type, cardIds: m.cardIds })),
      },
      actionId
    );
  }

  endMeld(): void {
    this.game.action({ type: 'END_MELD' });
  }

  discard(cardId: string): void {
    if (!cardId) return;
    this.game.action({ type: 'DISCARD', cardId });
    this.discardSelectedId = null;
    this.clearBuilder();
  }

  discardSelected(): void {
    if (!this.discardSelectedId) return;
    this.discard(this.discardSelectedId);
  }

  // --- Drag & Drop ---
  allDropIds(): string[] {
    // The hand list must be connected to pending, discard, and table.
    return [HAND_DROP_ID, DISCARD_DROP_ID, ...this.pendingDropIds, ...this.tableDropIds];
  }

  pendingDropId(m: PendingMeld): string {
    return `pending-${m.id}`;
  }

  tableDropId(playerId: string, meldId: string): string {
    return `table-${playerId}-${meldId}`;
  }

  canDropToPending(state: PublicState | null, pid: string | null): boolean {
    return this.canBuild(state, pid);
  }

  canDropToHand(state: PublicState | null, pid: string | null): boolean {
    // Allow returning a card from pending melds back to hand while it's your turn.
    return this.canAct(state, pid) && (state!.phase === 'MELD' || state!.phase === 'DISCARD');
  }

  canDropToDiscard(state: PublicState | null, pid: string | null): boolean {
    return this.canDiscardPhase(state, pid);
  }

  canDropToTableMeld(state: PublicState | null, pid: string | null, targetPlayerId: string): boolean {
    if (!this.canBuild(state, pid) || !pid) return false;
    if (!state!.canLayoff?.[pid]) return false;
    if (!state!.hasLaidDown?.[targetPlayerId]) return false;
    return true;
  }

  onDropToPending(ev: CdkDragDrop<any>, state: PublicState, pid: string, target: PendingMeld): void {
    if (!this.canDropToPending(state, pid)) return;
    const card = ev.item.data as Card | undefined;
    if (!card?.id) return;

    // Move within builder: from hand or from another pending meld.
    const fromPendingId = this.cardToPending.get(card.id);
    if (fromPendingId) {
      if (fromPendingId === target.id) return;
      this.detachFromPending(card.id, fromPendingId);
    }

    // Add to target
    if (!target.cardIds.includes(card.id)) target.cardIds.push(card.id);
    this.cardToPending.set(card.id, target.id);
    this.reserved.add(card.id);
  }

  onDropToHand(ev: CdkDragDrop<any>, state: PublicState, pid: string): void {
    if (!this.canDropToHand(state, pid)) return;
    const card = ev.item.data as Card | undefined;
    if (!card?.id) return;
    const fromPendingId = this.cardToPending.get(card.id);
    if (!fromPendingId) return;
    this.detachFromPending(card.id, fromPendingId);
    this.reserved.delete(card.id);
    this.cardToPending.delete(card.id);
  }

  onDropToDiscard(ev: CdkDragDrop<any>, state: PublicState, pid: string): void {
    if (!this.canDropToDiscard(state, pid)) return;
    const card = ev.item.data as Card | undefined;
    if (!card?.id) return;

    // If it was in the builder, return it to hand first (so UI stays consistent)
    const fromPendingId = this.cardToPending.get(card.id);
    if (fromPendingId) {
      this.detachFromPending(card.id, fromPendingId);
      this.reserved.delete(card.id);
      this.cardToPending.delete(card.id);
    }
    this.discard(card.id);
  }

  onDropToTableMeld(ev: CdkDragDrop<any>, state: PublicState, pid: string, targetPlayerId: string, meldId: string): void {
    if (!this.canDropToTableMeld(state, pid, targetPlayerId)) return;
    const card = ev.item.data as Card | undefined;
    if (!card?.id) return;

    // If it was in the builder, detach so it becomes available again if server rejects.
    const fromPendingId = this.cardToPending.get(card.id);
    if (fromPendingId) {
      this.detachFromPending(card.id, fromPendingId);
      this.reserved.delete(card.id);
      this.cardToPending.delete(card.id);
    }

    // Send layoff as a single-card action.
    this.game.action({ type: 'LAYOFF', targetPlayerId, meldId, cardIds: [card.id] });
  }

  onCardClick(ev: MouseEvent, state: PublicState, pid: string, card: Card): void {
    // Avoid click side-effects after a drag.
    if (this.isDragging) return;
    if (!this.canDiscardPhase(state, pid)) return;
    this.discardSelectedId = this.discardSelectedId === card.id ? null : card.id;
    ev.preventDefault();
    ev.stopPropagation();
  }

  dragStarted(): void {
    this.isDragging = true;
  }

  dragEnded(): void {
    // allow a click shortly after drag end without toggling
    setTimeout(() => (this.isDragging = false), 0);
  }

  // --- Rendering / data helpers ---
  visibleHand(hand: Card[]): Card[] {
    const cards = (hand ?? []).filter((c) => !this.reserved.has(c.id));
    return this.sortCards(cards);
  }

  pendingCards(m: PendingMeld): Card[] {
    return (m.cardIds ?? []).map((id) => this.handIndex.get(id)).filter((c): c is Card => !!c);
  }

  cardShort(c: Card): string {
    if (c.isJoker) return '🃏';
    return `${rankLabel(c.rank)}${suitLabel(c.suit)}`;
  }

  meldText(cards: Card[]): string {
    return (cards ?? []).map((c: Card) => this.cardShort(c)).join(' ');
  }

  meldLabel(m: PendingMeld | Meld): string {
    return m.type === 'SET' ? 'TRÍO' : 'ESCALA';
  }

  // --- Contract readiness ---
  isContractReady(state: PublicState | null): boolean {
    if (!state) return false;
    const c = state.currentContract;
    const runLen = c.runLength || 4;

    const active = this.pendingMelds.filter((m) => m.cardIds.length > 0);
    const sets = active.filter((m) => m.type === 'SET');
    const runs = active.filter((m) => m.type === 'RUN');
    if (sets.length !== c.sets) return false;
    if (runs.length !== c.runs) return false;
    if (sets.some((m) => m.cardIds.length !== 3)) return false;
    if (runs.some((m) => m.cardIds.length !== runLen)) return false;
    return true;
  }

  // --- Internal helpers ---
  private detachFromPending(cardId: string, pendingId: string): void {
    const m = this.pendingMelds.find((x) => x.id === pendingId);
    if (!m) return;
    m.cardIds = m.cardIds.filter((id) => id !== cardId);
  }

  private rebuildReservedFromMap(): void {
    this.reserved = new Set(this.cardToPending.keys());
  }

  private rebuildPendingDropIds(): void {
    this.pendingDropIds = this.pendingMelds.map((m) => this.pendingDropId(m));
  }

  private computeTableDropIds(state: PublicState): string[] {
    const ids: string[] = [];
    for (const pid of state.players.map((p) => p.id)) {
      const melds = state.table?.[pid] ?? [];
      for (const m of melds) ids.push(this.tableDropId(pid, m.id));
    }
    return ids;
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
      case 'S':
        return 0;
      case 'H':
        return 1;
      case 'D':
        return 2;
      case 'C':
        return 3;
      default:
        return 8;
    }
  }
}

function suitLabel(s: any) {
  switch (s) {
    case 'S':
      return '♠';
    case 'H':
      return '♥';
    case 'D':
      return '♦';
    case 'C':
      return '♣';
    default:
      return '?';
  }
}

function rankLabel(r: any) {
  switch (r) {
    case 1:
      return 'A';
    case 11:
      return 'J';
    case 12:
      return 'Q';
    case 13:
      return 'K';
    default:
      return String(r);
  }
}

function cryptoRandomId() {
  const arr = new Uint8Array(8);
  crypto.getRandomValues(arr);
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}