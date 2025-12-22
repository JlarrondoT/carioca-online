import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { RoomsService } from './rooms.service';
import { ActionPayload, RoomCreatePayload, RoomJoinPayload, GameStartPayload } from './types';

@WebSocketGateway({
  cors: { origin: true, credentials: true },
})
export class GameGateway {
  @WebSocketServer()
  server!: Server;

  constructor(private rooms: RoomsService) {}

  handleDisconnect(client: Socket) {
    this.rooms.disconnect(client.id);
  }

  @SubscribeMessage('room:create')
  onCreate(@ConnectedSocket() client: Socket, @MessageBody() body: RoomCreatePayload) {
    try {
      const { roomCode, playerId, room } = this.rooms.createRoom(body?.name ?? 'Host', client.id);
      client.join(roomCode);

      const state = this.rooms.getPublicState(room);
      client.emit('room:joined', { roomCode, playerId, state });
      return;
    } catch (e: any) {
      client.emit('room:error', { message: e?.message ?? 'Unknown error' });
    }
  }

  @SubscribeMessage('room:join')
  onJoin(@ConnectedSocket() client: Socket, @MessageBody() body: RoomJoinPayload) {
    try {
      const { roomCode, playerId, room } = this.rooms.joinRoom(body.roomCode, body?.name ?? 'Player', client.id);
      client.join(roomCode);

      // Notify everyone
      this.broadcastRoom(roomCode);
      // Send joined payload to the joining client
      client.emit('room:joined', { roomCode, playerId, state: this.rooms.getPublicState(room) });
      return;
    } catch (e: any) {
      client.emit('room:error', { message: e?.message ?? 'Unknown error' });
    }
  }

  @SubscribeMessage('game:start')
  onStart(@ConnectedSocket() client: Socket, @MessageBody() body: GameStartPayload) {
    try {
      const room = this.rooms.startGame(body.roomCode, body.playerId);
      this.broadcastRoom(room.roomCode);
      this.broadcastHands(room.roomCode);
    } catch (e: any) {
      client.emit('game:error', { message: e?.message ?? 'Unknown error' });
    }
  }

  


  @SubscribeMessage('chat:reaction')
  async onReaction(@ConnectedSocket() client: Socket, @MessageBody() body: ReactionPayload) {
    try {
      const { roomCode, playerId, text } = body ?? ({} as any);
      if (!roomCode || !playerId || !text) throw new Error('Invalid payload');

      if (!REACTION_TEXTS.includes(text)) throw new Error('Invalid reaction');

      const room = this.rooms.getRoom(roomCode);
      if (!room) throw new Error('Room not found');

      const player = room.players.find(p => p.id === playerId);
      if (!player) throw new Error('Player not found');

      if (player.socketId && player.socketId !== client.id) throw new Error('Invalid socket');

      const msg: ReactionMessage = {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        playerId,
        name: player.name,
        text,
        ts: Date.now(),
      };

      room.reactions = room.reactions ?? [];
      room.reactions.push(msg);
      if (room.reactions.length > 30) room.reactions.splice(0, room.reactions.length - 30);

      this.server.to(roomCode).emit('chat:reaction', msg);
      return { ok: true };
    } catch (e: any) {
      this.log(body?.roomCode ?? '-', 'reaction rejected', e?.message ?? e);
      return { ok: false, message: e?.message ?? 'error' };
    }
  }


@SubscribeMessage('game:action')
  onAction(@ConnectedSocket() client: Socket, @MessageBody() body: ActionPayload) {
    try {
      const room = this.rooms.applyAction(body.roomCode, body.playerId, body.action);
      this.broadcastRoom(room.roomCode);
      this.broadcastHands(room.roomCode);

      client.emit('action:accepted', { actionId: body.actionId });
    } catch (e: any) {
      client.emit('action:rejected', { actionId: body.actionId, message: e?.message ?? 'Invalid action' });
    }
  }

  private broadcastRoom(roomCode: string) {
    const room = this.rooms.getRoom(roomCode);
    const state = this.rooms.getPublicState(room);
    this.server.to(roomCode).emit('state:update', state);
  }

  private broadcastHands(roomCode: string) {
    const room = this.rooms.getRoom(roomCode);
    for (const p of room.players) {
      const hand = this.rooms.getPrivateHand(room, p.id);
      this.server.to(p.socketId).emit('hand:update', hand);
    }
  }
}
