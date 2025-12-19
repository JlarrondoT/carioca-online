import { Injectable } from '@nestjs/common';
import { nanoid } from 'nanoid';
import {
  Card,
  Contract,
  Meld,
  Player,
  PublicState,
  RoomState,
  Suit,
  Rank,
} from './types';
import { applyAction, createDeck, defaultContracts, dealHands, publicStateForRoom } from './rules';

@Injectable()
export class RoomsService {
  private rooms = new Map<string, RoomState>();

  createRoom(playerName: string, socketId: string) {
    const roomCode = this.generateRoomCode();
    const playerId = nanoid(10);

    const contracts = defaultContracts();
    const room: RoomState = {
      roomCode,
      status: 'LOBBY',
      hostPlayerId: playerId,
      players: [
        {
          id: playerId,
          name: playerName.trim() || 'Player 1',
          socketId,
          connected: true,
        },
      ],

      contracts,
      contractIndex: 0,

      turnPlayerId: null,
      phase: 'DRAW',

      deck: [],
      discard: [],

      hands: {},
      table: {},
      hasLaidDown: {},

      scores: { [playerId]: 0 },
      roundWinnerId: null,
      turnCounter: 0,
      laidDownTurn: {},
    };

    this.rooms.set(roomCode, room);
    return { roomCode, playerId, room };
  }

  joinRoom(roomCodeRaw: string, playerName: string, socketId: string) {
    const roomCode = roomCodeRaw.trim().toUpperCase();
    const room = this.rooms.get(roomCode);
    if (!room) throw new Error('Room not found');

    if (room.status !== 'LOBBY') {
      throw new Error('Room already started');
    }

    const playerId = nanoid(10);
    room.players.push({
      id: playerId,
      name: playerName.trim() || `Player ${room.players.length + 1}`,
      socketId,
      connected: true,
    });

    // Initialize score for new player (in case of late join while in lobby)
    room.scores[playerId] = 0;
    room.hasLaidDown[playerId] = false;
    room.laidDownTurn[playerId] = null;

    return { roomCode, playerId, room };
  }

  getRoom(roomCodeRaw: string) {
    const roomCode = roomCodeRaw.trim().toUpperCase();
    const room = this.rooms.get(roomCode);
    if (!room) throw new Error('Room not found');
    return room;
  }

  updateSocket(roomCodeRaw: string, playerId: string, socketId: string) {
    const room = this.getRoom(roomCodeRaw);
    const p = room.players.find(x => x.id === playerId);
    if (!p) throw new Error('Player not found');
    p.socketId = socketId;
    p.connected = true;
  }

  disconnect(socketId: string) {
    for (const room of this.rooms.values()) {
      const p = room.players.find(x => x.socketId === socketId);
      if (p) {
        p.connected = false;
        // If everyone disconnected, we keep the room (simple prototype).
      }
    }
  }

  startGame(roomCodeRaw: string, playerId: string) {
    const room = this.getRoom(roomCodeRaw);

    if (room.status !== 'LOBBY') throw new Error('Game already started');
    if (room.hostPlayerId !== playerId) throw new Error('Only host can start');

    if (room.players.length < 2) throw new Error('Need at least 2 players');

    room.status = 'PLAYING';
    room.contractIndex = 0;

    room.deck = createDeck({ decks: 2, jokersPerDeck: 2 });
    room.discard = [];
    room.table = {};
    room.hands = {};
    room.hasLaidDown = {};
    for (const p of room.players) {
      room.table[p.id] = [];
      room.hands[p.id] = [];
      room.hasLaidDown[p.id] = false;
      room.laidDownTurn[p.id] = null;
      if (room.scores[p.id] == null) room.scores[p.id] = 0;
    }

    room.roundWinnerId = null;
    room.turnCounter = 0;

    // Según reglas clásicas: 12 cartas por jugador.
    dealHands(room, 12);

    // Start discard pile with 1 card (must not be joker ideally; we accept it for simplicity)
    // Start discard pile with 1 card (avoid joker as first discard when possible)
    let firstDiscard = room.deck.pop();
    if (firstDiscard?.isJoker) {
      // Put it back and try a few times
      room.deck.unshift(firstDiscard);
      for (let i = 0; i < 10; i++) {
        const c = room.deck.pop();
        if (!c) break;
        if (!c.isJoker) { firstDiscard = c; break; }
        room.deck.unshift(c);
      }
      // If still joker, just take top
      if (firstDiscard?.isJoker) firstDiscard = room.deck.pop();
    }
    if (firstDiscard) room.discard.push(firstDiscard);

    // First player starts
    room.turnPlayerId = room.players[0].id;
    room.phase = 'DRAW';

    return room;
  }

  applyAction(roomCodeRaw: string, playerId: string, action: any) {
    const room = this.getRoom(roomCodeRaw);
    applyAction(room, playerId, action);
    return room;
  }

  getPublicState(room: RoomState): PublicState {
    return publicStateForRoom(room);
  }

  getPrivateHand(room: RoomState, playerId: string) {
    return room.hands[playerId] ?? [];
  }

  private generateRoomCode(): string {
    // 5-char readable code
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    for (let i = 0; i < 50; i++) {
      const code = Array.from({ length: 5 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
      if (!this.rooms.has(code)) return code;
    }
    // Fallback
    return nanoid(6).toUpperCase();
  }
}
