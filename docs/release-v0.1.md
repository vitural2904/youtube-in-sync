# v0.1 — first public experimental release

YouTube In Sync pairs a Chromium extension with a lightweight WebSocket coordinator.
One host anchors the room. Guests automatically map the YouTube timeline, catch up, and
continuously correct drift. Manual scene alignment is removed.

## Included

- Source for the extension, server, tests, packaging tools, and documentation.
- Unpacked extension ZIP with the manifest at its root and the MIT license included.
- SHA-256 checksum file. GitHub-generated source ZIP and tarball downloads.
- Architecture diagram, timing equations, recorded local observations, and a reproducible figure.
- Issue/branch/PR contribution guidelines and pinned-action CI.

## Validation and limits

28 JavaScript tests and one packaging test pass locally. A two-profile Thorium test exercised
automatic joining from a 60-second lag. Another local trace converged to six rounded samples
around 24ms of media timeline error after a deliberately induced small backward seek.

**The UI is still rough and uses Vietnamese labels.** Core behavior is promising and functional
in these initial trials, not validated for every browser, geography, or workload. Internal
YouTube live APIs may change. This is not a hardware-audio latency measurement. No public
coordinator is provided. Friends on different machines must use a shared WSS coordinator.

See README and `docs/validation.md` for details. This is the first public release even though
local development previously used internal version labels.
