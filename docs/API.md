# API Documentation

Base URL: `http://localhost:4000`

Route constants are defined in `@nexusdesk/shared` (`API_ROUTES`).

## Auth

| Method | Path | Description |
|---|---|---|
| POST | `/auth/register` | Create owner + organization |
| POST | `/auth/login` | Email/password (+ optional MFA) |
| POST | `/auth/refresh` | Rotate refresh token |
| POST | `/auth/logout` | Revoke session |
| GET | `/auth/me` | Current user + org |
| POST | `/auth/forgot-password` | Send reset email |
| POST | `/auth/reset-password` | Reset with token |
| POST | `/auth/verify-email` | Verify email token |
| POST | `/auth/mfa/setup` | Begin TOTP enrollment |
| POST | `/auth/mfa/verify` | Confirm TOTP |

## Devices / sessions

| Method | Path | Description |
|---|---|---|
| GET | `/organizations/:orgId/devices` | List devices |
| POST | `/devices/enroll` | Agent enrollment |
| POST | `/devices/:deviceId/heartbeat` | Agent heartbeat |
| POST | `/organizations/:orgId/sessions` | Start remote session |
| POST | `/organizations/:orgId/sessions/:sessionId/end` | End session |
| GET | `/organizations/:orgId/sessions/:sessionId/turn-credentials` | ICE servers |

## WebSocket

Connect to `/ws` and send:

```json
{ "event": "auth:authenticate", "data": { "kind": "user|agent", "token": "<jwt>" } }
```

Signaling events: `signal:offer`, `signal:answer`, `signal:ice_candidate`, `signal:hangup`.
