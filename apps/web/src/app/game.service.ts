import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { io, Socket } from 'socket.io-client';
import { config } from './config';
import { Card, ClientAction, PublicState } from './types';

type JoinedPayload = { roomCode: string; playerId: string; state: PublicState };

@Injectable({ providedIn: 'root' })
export class GameService {
  private socket: Socket | null = null;

  readonly connected$ = new BehaviorSubject<boolean>(false);
  readonly state$ = new BehaviorSubject<PublicState | null>(null);
  readonly hand$ = new BehaviorSubject<Card[]>([]);
  readonly playerId$ = new BehaviorSubject<string | null>(null);
  readonly roomCode$ = new BehaviorSubject<string | null>(null);
  readonly log$ = new BehaviorSubject<string[]>([]);
  readonly actionAccepted$ = new BehaviorSubject<{ actionId: string } | null>(null);
  readonly actionRejected$ = new BehaviorSubject<{ actionId: string; message: string } | null>(null);

  connect() {
    if (this.socket) return;

    const socket = io(config.apiUrl, {
      transports: ['websocket'],
      autoConnect: true,
    });

    this.socket = socket;

    socket.on('connect', () => {
      this.connected$.next(true);
      this.pushLog(`connected (${socket.id})`);
    });

    socket.on('disconnect', () => {
      this.connected$.next(false);
      this.pushLog('disconnected');
    });

    socket.on('room:joined', (payload: JoinedPayload) => {
      this.roomCode$.next(payload.roomCode);
      this.playerId$.next(payload.playerId);
      this.state$.next(payload.state);
      this.pushLog(`joined room ${payload.roomCode}`);
    });

    socket.on('room:error', (e: any) => this.pushLog(`room:error ${e?.message ?? e}`));
    socket.on('game:error', (e: any) => this.pushLog(`game:error ${e?.message ?? e}`));

    socket.on('state:update', (state: PublicState) => {
      this.state$.next(state);
    });

    socket.on('hand:update', (hand: Card[]) => {
      this.hand$.next(hand ?? []);
    });

    socket.on('action:rejected', (p: any) => {
      this.actionRejected$.next({ actionId: p?.actionId ?? '-', message: p?.message ?? 'invalid' });
      this.pushLog(`❌ action rejected (${p?.actionId ?? '-'}) — ${p?.message ?? 'invalid'}`);
    });

    socket.on('action:accepted', (p: any) => {
      this.actionAccepted$.next({ actionId: p?.actionId ?? '-' });
      this.pushLog(`✅ action accepted (${p?.actionId ?? '-'})`);
    });
  }

  createRoom(name: string) {
    this.ensureSocket();
    this.socket!.emit('room:create', { name });
  }

  joinRoom(roomCode: string, name: string) {
    this.ensureSocket();
    this.socket!.emit('room:join', { roomCode, name });
  }

  startGame() {
    const roomCode = this.roomCode$.value;
    const playerId = this.playerId$.value;
    if (!roomCode || !playerId) return;
    this.ensureSocket();
    this.socket!.emit('game:start', { roomCode, playerId });
  }

  action(action: ClientAction, actionId: string = cryptoRandomId()): string | null {
    const roomCode = this.roomCode$.value;
    const playerId = this.playerId$.value;
    if (!roomCode || !playerId) return null;

    this.ensureSocket();
    this.socket!.emit('game:action', { roomCode, playerId, actionId, action });
    return actionId;
  }

  resetLocal() {
    this.state$.next(null);
    this.hand$.next([]);
    this.playerId$.next(null);
    this.roomCode$.next(null);
    this.pushLog('local state reset (socket remains connected)');
  }

  private ensureSocket() {
    if (!this.socket) throw new Error('Socket not connected. Call connect() first.');
  }

  private pushLog(msg: string) {
    const ts = new Date().toLocaleTimeString();
    const next = [`[${ts}] ${msg}`, ...this.log$.value].slice(0, 120);
    this.log$.next(next);
  }
}

function cryptoRandomId() {
  // Browser-safe action id
  const arr = new Uint8Array(8);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}
