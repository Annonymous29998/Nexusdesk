# Architecture

NexusDesk follows clean architecture boundaries inside the API and keeps operator surfaces (dashboard/desktop) thin.

## Control plane

- **API** authenticates users/agents (JWT + refresh rotation), manages orgs/devices/sessions, and fans out WebRTC signaling over `/ws`.
- **Prisma/PostgreSQL** is the system of record.
- **Redis** backs rate limits, presence, and multi-instance pub/sub (with memory fallback).
- **RemoteSessionManager** tracks concurrent remote sessions and connection limits.

## Media plane

1. Operator creates a remote session via REST.
2. Viewer and agent authenticate on WebSocket.
3. SDP/ICE are relayed (`signal:offer|answer|ice_candidate`).
4. Media flows peer-to-peer via WebRTC; TURN (`services/relay`) provides relay fallback.

## Agent

Background service that:

1. Enrolls with a one-time secret + device public key
2. Stores encrypted device tokens at rest
3. Maintains reconnecting WebSocket + heartbeat
4. Executes commands (screenshot, input lock, WoL, terminal, update check)
5. Captures frames with optional native deps and compresses before transmission

## Packages

Shared contracts live in `@nexusdesk/types` / `@nexusdesk/shared` so API, agent, dashboard, and signaling stay aligned.
