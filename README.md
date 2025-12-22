# Fix de compilación API (Nest) para deploy en Render

Copia estos archivos encima de tu repo (misma ruta):
- apps/api/src/types.ts
- apps/api/src/rooms.service.ts

Esto corrige:
- Payloads: GameStartPayload y ActionPayload incluyen playerId
- ClientAction LAYDOWN/MELD_EXTRA usa melds como {type, cardIds[]} (como espera rules.ts)
- PublicState incluye currentContract
- RoomState requiere scores/turnCounter/laidDownTurn y createRoom los inicializa
- startGame usa 1 mazo si hay 2 jugadores (52 + 2 jokers)

Luego verifica:
```bash
npm run build -w @carioca/api
```
