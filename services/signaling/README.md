# Signaling microservice (unused by the live Viewer)

The production remote-desktop path does **not** use this process.

Live signaling is the Fastify API WebSocket:

- `GET wss://api.nesuxdesk.xyz/ws` (production)
- `apps/api/src/sockets/index.ts`

The dashboard Viewer uses `RemoteStreamClient` → `ScreenStreamClient` against that gateway.

This `services/signaling` package is leftover room-based signaling. Do not start it in production unless you are explicitly experimenting. Starting it alongside the API creates a second, unused architecture.

Docker image `Dockerfile.signaling` and `pm2 start services/signaling` in older docs are obsolete for remote control.
