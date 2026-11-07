# MVP contract

Two components: a Chromium MV3 extension and a Node WebSocket coordinator.
Minimum Chromium 116. YouTube desktop watch pages only. One bound tab per browser profile.
Each participant explicitly binds their own tab from the extension popup.
Host access is limited to desktop YouTube and the loopback coordinator. Remote HTTPS
coordinators require a separate optional origin grant. No automatic content injection.
Rooms support eight participants. Host snapshots define the canonical timeline.
Followers cannot change the room timeline. Pause/play/seek on the host's player drives the room.
Host buffering freezes the anchor; host disconnect suspends following. A slow guest only
adjusts its own player. Host departure closes the room. Host transfer is deferred.
No relay of video, cookies, titles, browsing history or YouTube credentials.

Client: sample player, estimate clock offset with bounded low-RTT samples, predict target,
apply deadband/P-control/seek cooldown, detect ads and navigation, stop locally on leave.
Server: authenticate room-scoped sessions, authorize host, validate messages, expire sessions,
bound connections/rooms/payloads/rates, reject stale revisions, distribute canonical state.

No manual alignment. Each client reads YouTube canonical current time and verifies the
player-to-media offset. Live origin timestamps must agree within two seconds. Page-context
telemetry is read via a fixed MAIN-world function, with only a public video ID as input.
No privileged extension API or token is exposed in MAIN. Content control stays isolated.
Mappings expire and are reacquired automatically after ads, source replacement or reconnect.
Unknown/mismatched timelines must never display synchronized. No cross-source sync.
This adapter depends on internal YouTube APIs, which can change. Unsupported data fails closed.

Security boundaries: web page and client telemetry are untrusted. Browser-provided sender
tab/frame/document identity gates local bindings. Only popup may create/join/leave.
Room bearer tokens stay in service worker/session storage; never enter page/content context.
Messages delivered to a player contain no credentials. No page-to-extension window bridge.
Origin checks are defense in depth, not client attestation. Modified clients may lie about
their own state. Host is trusted only to control its own room within bounded command rates.

Initial acceptance: room create/join/resume; unauthorized timeline denied; cross-room denied;
replay denied; malformed/oversized/flooded messages bounded; follower corrects induced drift;
navigation/ads/offline/leave do not keep applying stale targets; reconnect resumes same session.
Local development binds loopback. Remote deployment requires TLS and explicit extension IDs.
In-memory rooms disappear on server restart. No public deployment is implied.

Timing precision: client observations carry performance.timeOrigin + performance.now().
Worker translates observation age onto the estimated server clock. Guest target carries its
original browser timestamp; control extrapolates from it, including message and timer delay.
Continuous tanh correction is bounded at ±3%, with 60/25ms hysteresis. Control interval 100ms.
No claim of directly measuring speaker/Bluetooth output latency.
