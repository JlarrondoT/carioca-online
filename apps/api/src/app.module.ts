import { Module } from "@nestjs/common";
import { GameGateway } from "./game.gateway";
import { HealthController } from "./health.controller";
import { RoomsService } from "./rooms.service";

@Module({
  providers: [RoomsService, GameGateway],
  controllers: [HealthController],
})
export class AppModule {}
