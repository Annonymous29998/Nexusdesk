# Environment Variables

See root `.env.example` for the full list. Critical variables:

| Variable                                   | Purpose                                          |
| ------------------------------------------ | ------------------------------------------------ |
| `DATABASE_URL`                             | PostgreSQL connection string                     |
| `REDIS_URL`                                | Redis connection                                 |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | JWT signing (>=32 chars)                         |
| `SESSION_SECRET`                           | Cookie signing                                   |
| `ENCRYPTION_KEY`                           | AES-256-GCM key (base64, 32 bytes)               |
| `AGENT_ENROLLMENT_SECRET`                  | Shared enrollment secret                         |
| `STUN_URLS` / `TURN_URLS`                  | WebRTC ICE (issued by the API to viewer + agent) |
| `TURN_SHARED_SECRET`                       | coturn `use-auth-secret` (never put in `VITE_*`) |
| `TURN_USERNAME` / `TURN_CREDENTIAL`        | Static TURN fallback if HMAC secret is unset     |
| `RATE_LIMIT_GUEST_MAX`                     | Public `/guest/:code` guess throttle             |
| `SMTP_*`                                   | Transactional email                              |
| `CORS_ORIGINS`                             | Allowed browser origins                          |

Generate secrets:

```bash
openssl rand -base64 64
openssl rand -base64 32
```
