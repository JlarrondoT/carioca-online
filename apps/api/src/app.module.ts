import { Module } from '@nestjs/common';
import { GameGateway } from './game.gateway';
import { RoomsService } from './rooms.service';

@Module({
  providers: [RoomsService, GameGateway],
})
export class AppModule {}
