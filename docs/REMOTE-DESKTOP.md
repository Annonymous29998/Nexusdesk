# Remote desktop path

There is **one** live signaling path: Fastify `GET /ws`.

```
React Viewer  --HTTPS-->  Fastify API
              --WSS /ws-->  sockets/index.ts  (auth, start_stream, SDP/ICE relay, JPEG fallback)
              --WebRTC---->  Guest Node agent (video + DataChannel)

JPEG over WebSocket is a bounded fallback only, started if WebRTC is not healthy
within ~4s, and stopped when WebRTC is connected and pushing frames.
```

Production URLs:

- Control panel: `https://www.nesuxdesk.xyz`
- API / installers / WS: `https://api.nesuxdesk.xyz` and `wss://api.nesuxdesk.xyz/ws`

A single API instance is required for JPEG fan-out and in-memory signaling rooms.
WebRTC media is not stored in Redis or the API process.

Minimum guest agent for this path: `0.1.25` (`MIN_REMOTE_CONTROL_AGENT_VERSION`).
