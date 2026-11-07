# Changelog

## v0.1 — 2026-11-07

First public experimental release. Package and extension version: `0.1.0`.

- Publish the Chromium extension and lightweight Node.js/WebSocket coordinator.
- Use one host anchor; automatically map independent YouTube live media origins.
- Estimate clock offset from four timestamps. Account for observation and delivery age.
- Apply bounded tanh speed correction, 60/25ms hysteresis, and large-error seeks.
- Add room-scoped authorization, message validation/limits, revisions, and reconnect handling.
- Include tests, local measurement data, a reproducible figure, MIT licensing, and safe packaging.

The UI remains rough and uses Vietnamese labels. Internal YouTube timing APIs can change.
Local timeline measurements do not establish internet, hardware-audio, or long-duration accuracy.
