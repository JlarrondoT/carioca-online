# Carioca Online

Aplicación multijugador en tiempo real para jugar Carioca (variante de rummy) en el navegador.

Este repositorio es un monorepo con dos aplicaciones:

- `apps/api`: Backend en NestJS que expone una API WebSocket (Socket.IO) para gestionar salas y la lógica del juego.
- `apps/web`: Cliente frontend en Angular que consume el backend vía Socket.IO y ofrece la interfaz de juego.

**Estado:** prototipo funcional — juego por salas, turnos, contratos y chat reactivo.

---

## Estructura principal

- `apps/api/` — NestJS (TypeScript). Entrada: `apps/api/src/main.ts`.
- `apps/web/` — Angular (TypeScript). Entrada: `apps/web/src/main.ts`.
- Root `package.json` usa workspaces para ejecutar ambos en desarrollo.

## Tecnologías

- Node.js (recomendado >= 20)
- NestJS (backend)
- Socket.IO (comunicación en tiempo real)
- Angular + Angular CDK (frontend)
- TypeScript

## Requisitos

- Node.js >= 20
- npm (o yarn/pnpm si prefieres, ajustar comandos)

## Instalación (local)

1. Desde la raíz del repositorio:

```bash
npm install
```

2. Ejecutar en modo desarrollo (ambas apps):

```bash
npm run dev
```

También puedes arrancar sólo una de las apps:

```bash
npm run dev:api   # inicia @carioca/api (NestJS)
npm run dev:web   # inicia @carioca/web (Angular)
```

## Build

```bash
npm run build    # compila api + web
```

## Variables de entorno importantes

- `PORT` — puerto en el que escucha la API (por defecto 3000 en desarrollo).
- `CORS_ORIGIN` — orígenes permitidos por CORS para Socket.IO. Puede ser una lista separada por comas o vacío para permitir todo en dev. Se lee en `apps/api/src/main.ts`.

Ejemplo export (Windows PowerShell):

```powershell
$env:PORT = '3000'
$env:CORS_ORIGIN = 'http://localhost:4200'
```

## Config del frontend

La URL del backend usada por el cliente está en `apps/web/src/app/config.ts` (valor por defecto apunta a un despliegue en Render). Para desarrollo local ajusta `apiUrl` a `http://localhost:3000`.

## API / Eventos WebSocket

El backend usa Socket.IO. Eventos principales (cliente -> servidor):

- `room:create` — crear sala
  - Payload: `{ name: string }`
- `room:join` — unirse a sala
  - Payload: `{ roomCode: string, name: string }`
- `game:start` — iniciar partida (sólo host)
  - Payload: `{ roomCode: string, playerId: string }`
- `game:action` — acciones de juego (robos, bajar, botar, etc.)
  - Payload: `{ roomCode, playerId, actionId, action }` donde `action` es uno de los `ClientAction` (p. ej. `{ type: 'DRAW_DECK' }`, `{ type: 'DISCARD', cardId }`, `{ type: 'LAYDOWN', melds: [...] }`).
- `chat:reaction` — mensaje rápido de reacción
  - Payload: `{ roomCode, playerId, text }` donde `text` es uno de los textos predefinidos en `apps/api/src/types.ts`.

Eventos servidor -> cliente (respuestas/actualizaciones):

- `room:joined` — confirma unión/creación y envía estado público y `playerId`.
- `room:error` — error relacionado con sala.
- `state:update` — estado público de la sala (turnos, fase, conteo de manos, mesa, etc.).
- `hand:update` — mano privada de un jugador (enviada sólo a su socketId).
- `action:accepted` / `action:rejected` — resultado de una acción.
- `chat:reaction` — nueva reacción publicada por un jugador.

Para detalles de tipos y reglas, revisa:

- `apps/api/src/types.ts`
- `apps/api/src/rules.ts`

## Lógica de juego (resumen)

- Implementa reglas de Carioca (contratos por ronda, bajar juegos, botar a juegos, conteo de puntajes).
- Se usan 1 o 2 mazos según número de jugadores (2 jugadores → 1 mazo + jokers; 3+ jugadores → 2 mazos).
- Flujo por turno: `DRAW` → `MELD` → `DISCARD`.

## Desarrollo y debugging

- Backend tiene logs simples por consola (útil para despliegues tipo Render).
- Cliente mantiene un keep-alive que consulta `GET /health` en el backend; la ruta está en `apps/api/src/health.controller.ts`.

## Despliegue

- El proyecto puede desplegarse en servicios como Render o Heroku. Asegúrate de configurar:

  - `PORT` (o usa el valor que provea la plataforma)
  - `CORS_ORIGIN` para permitir el dominio del frontend (p. ej. GitHub Pages o el dominio del hosting del frontend)

- `apps/api` ya incluye un `Dockerfile` en `apps/api/Dockerfile` (revisar y adaptar si usas contenedores).

## Tests

No hay pruebas unitarias incluidas en el prototipo. Para validar manualmente:

1. Levanta `api` y `web` en local.
2. Crea una sala y conecta al menos 2 navegadores/usuarios.
3. Inicia la partida y prueba flujos: robar, bajar, botar, finalizar ronda.

## Licencia

Revisa el fichero `LICENSE` en la raíz del repositorio.
