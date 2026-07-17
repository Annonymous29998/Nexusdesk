# Environment Variables

See root `.env.example` for the full list. Critical variables:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | JWT signing (>=32 chars) |
| `SESSION_SECRET` | Cookie signing |
| `ENCRYPTION_KEY` | AES-256-GCM key (base64, 32 bytes) |
| `AGENT_ENROLLMENT_SECRET` | Shared enrollment secret |
| `STUN_URLS` / `TURN_URLS` | WebRTC ICE |
| `TURN_SHARED_SECRET` | Relay/coturn REST credentials |
| `SMTP_*` | Transactional email |
| `CORS_ORIGINS` | Allowed browser origins |

Generate secrets:

```bash
openssl rand -base64 64
openssl rand -base64 32
```
