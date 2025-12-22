# Fix de build (Cloud Run): exports y tipos alineados con el código actual

Este zip contiene un reemplazo de:
- `apps/api/src/types.ts`

Corrige:
- exports faltantes: `ActionPayload`, `RoomCreatePayload`, `RoomJoinPayload`, `GameStartPayload`, `ClientAction`
- propiedades esperadas por el código: `hostPlayerId`, `discard`, `scores`, etc.
- `Card` como unión discriminada (evita `never` en Extract<...> con isJoker)

## Aplicar
1) Descomprime encima del repo (respeta rutas).
2) Reintenta:
```powershell
gcloud builds submit --config cloudbuild.yaml .
```
