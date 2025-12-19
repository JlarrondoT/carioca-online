# Deploy plan: Front + Backend separate (Cloud Run + Firestore)

## Backend (NestJS + Socket.IO) on Cloud Run
Start cheap:
- min instances: 0 (scale to zero)
- max instances: 1 (keeps in-memory rooms safe)
- memory: 512MiB, cpu: 1
- request timeout: 3600s (websockets)

Suggested deploy:
```bash
gcloud run deploy carioca-api \
  --source apps/api \
  --region <REGION> \
  --allow-unauthenticated \
  --min-instances 0 \
  --max-instances 1 \
  --memory 512Mi \
  --cpu 1 \
  --timeout 3600
```

## Firestore (persistence + TTL)
Collection: rooms
DocId: roomCode
Fields:
- state (json)
- updatedAt
- expiresAt  (now + 6h)

Enable Firestore TTL on `expiresAt` so inactive rooms auto-delete.

Write strategy:
- On every accepted action: update room doc and bump expiresAt.
- Optional debounce: 1 write/sec/room.

## Frontend (Angular) static hosting
Cheapest/easiest:
- Firebase Hosting (HTTPS + CDN)
Alternative:
- Cloud Storage static website + Cloud CDN

Build:
```bash
cd apps/web
npm ci
npm run build
```

Then deploy the `dist/...` folder.

## When you need >1 Cloud Run instance
- Move authoritative state out of memory (Firestore/Redis)
- For Socket.IO rooms across instances: Redis adapter.