# Guest support links (ScreenConnect-style)

## Flow

1. Technician opens **Support links** in the dashboard and clicks **Generate link**.
2. They copy the join URL (e.g. `https://your-app/join/AB12CD34`) and send it to the Windows user.
3. The user opens the link → **Download for Windows** → runs the PowerShell installer as Administrator.
4. The agent installs, enrolls with the guest code, and heartbeats to the API.
5. The technician sees the PC under **Devices** (Online) and clicks **Connect**.

## API

| Method | Path | Auth |
|--------|------|------|
| POST | `/organizations/:orgId/guest-links` | Technician |
| GET | `/organizations/:orgId/guest-links` | Technician |
| DELETE | `/organizations/:orgId/guest-links/:linkId` | Technician |
| GET | `/guest/:code` | Public |
| GET | `/guest/:code/windows.ps1` | Public |
| GET | `/guest/:code/agent-package.zip` | Public |

## Packaging the Windows agent

Before guests can install, build the zip once:

```bash
npm run pack:agent
```

This writes `apps/agent/release/agent-windows.zip`, which the API serves.

## Security notes

- Codes expire (default 7 days) and default to **one install**.
- Links can be revoked from the dashboard.
- Enrollment uses the guest code; the shared `AGENT_ENROLLMENT_SECRET` remains for internal/fleet enrollments.
- Put the API behind HTTPS in production so installers download over TLS.
