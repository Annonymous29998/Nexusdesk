# Remote desktop performance checks

Do not claim zero latency. Measure before/after on a real guest PC.

## What to record

| Metric              | How                                                                                    |
| ------------------- | -------------------------------------------------------------------------------------- |
| WebRTC connect time | Viewer status `connecting` → `connected`                                               |
| Screen latency      | Flash a clock or stopwatch on the guest; photograph both screens                       |
| Input latency       | Click a visible button; time until the guest UI reacts _and_ until the viewer shows it |
| CPU / memory        | Task Manager on guest (`nexusdesk-agent` / node) and Chrome task manager on the viewer |
| Dropped frames      | If the picture stutters, note whether the teal cursor still moves (input vs video)     |
| Reconnect           | Kill guest Wi-Fi for 10s; time until `Connected` returns                               |
| Bandwidth           | Router/OS stats during a busy desktop (video playing on guest)                         |

## Scenarios

A. Same LAN  
B. Two normal internet connections (home + LTE)  
C. Higher latency (optional: Network Link Conditioner / `tc`)  
D. Symmetric NAT / guest behind CGNAT — TURN must be configured or ICE will fail

## Pass bar (engineering, not marketing)

- No multi-second growing backlog of old frames
- Viewer chrome stays clickable (header, End session) while the session is live
- Clicks and keys are not stuck behind mouse-move
- After WebRTC is healthy, JPEG is not the live encoder
- Guest reinstall required after agent 0.1.25 packaging
