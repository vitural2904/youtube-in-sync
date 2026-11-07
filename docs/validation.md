# Initial validation and measurement method

These observations were captured on 2026-11-07 during local development. They are not an
independent benchmark, a controlled A/B experiment, or a guarantee of WAN performance.
The public release is v0.1; earlier local version labels did not denote public releases.

## Environment

| Item | Recorded value |
|---|---|
| OS | Windows |
| Browser | Thorium 138 |
| Node.js | 22.19.0 |
| WebSocket library | ws 8.22.1 |
| Participants | One host and one guest |
| Isolation | Two fresh browser profiles on one physical machine |
| Network | Loopback coordinator |
| Media | YouTube live video `4t4AQ15yj1M` at the time of testing |
| Automation | Playwright CLI; packaged popup opened as an extension page |

The automation selected the YouTube tab before invoking the popup actions. It exercised the
packaged UI message route, not a native toolbar click. No YouTube sign-in was used. The live
video may change or stop later; reproducing the scenario requires an available seekable stream.

## Metric

At each guest observation, record canonical position `p`, epoch-relative observation timestamp
`u`, service worker time origin `w`, and estimated worker-to-server clock offset `theta`.

```text
serverObservationTime = u - w + theta
errorMs = 1000 * (targetAt(roomAnchor, serverObservationTime) - p)
```

Evaluate the anchor at observation time, not after the measurement reply returns. Otherwise
measurement transport time contaminates the reported error. Both media positions are seconds;
clock timestamps are milliseconds. This metric measures media timeline alignment. It does
not independently measure frame identity, acoustic output, speaker latency, or OS mixing.

## Recorded trials

1. **Automatic acquisition:** guest was deliberately placed 60 seconds behind, then joined.
   It automatically sought to the host and displayed synchronized. No shared pause, common
   manual seek, or scene matching occurred. The observed guest media/player offset was 291630s.
2. **Small-error recovery:** after automatic synchronization, guest media was moved 250ms
   backward. Seek buffering briefly increased error. Twelve roughly one-second-spaced samples
   were `292, 367, 336, 306, 276, 245, 215, 184, 155, 127, 100, 76` milliseconds.
3. **Later settled window:** six approximately half-second-spaced samples rounded to `24ms`.
   The interval between the recovery and settled windows was not recorded. Do not connect
   their x-axes or infer exact settling time. Rounded values do not imply zero variance.

Raw numerical observations: [initial-local.json](benchmarks/initial-local.json).
Figure: [initial-benchmark.svg](assets/initial-benchmark.svg).
Regenerate with `python scripts/plot-benchmark.py` after optionally installing matplotlib 3.10.3.

Earlier development also observed a 145–150ms residual inside the former 200ms deadband.
That motivated 60/25ms hysteresis and smooth bounded correction. It was a separate run;
no comparative percentage improvement or statistical significance is claimed.

## Reproduce the scenario

1. Start a local coordinator. Load the source extension in two clean profiles.
2. Open the same seekable livestream. Create and join a room through the popup.
3. To test acquisition, move the guest behind before joining. Do not pre-align it with the host.
4. To test recovery, first reach synchronization, then induce a small guest backward seek.
5. Sample the canonical player position and observation timestamp. Compute error as above.
6. Record all timestamps, samples, network/browser conditions, and failed trials. Evaluate
   separate output-audio latency if that is the measurement question.

The existing `scripts/open-thorium.ps1` opens independent temporary test profiles. A developer
can drive them with Playwright CLI. There is not yet a fully automated real-YouTube benchmark
harness with independent acoustic/frame matching. Controlled-player tests are not a substitute.

## Automated release checks

```sh
npm ci
npm run check
npm test
python -m unittest discover -s test -p '*_test.py'
python scripts/package-extension.py
npm audit --omit=dev
```

26 JavaScript tests cover clock math, prediction, hysteresis/tanh limits, target delivery age,
automatic live mapping, invalid/missing origins, stale mappings, ad recovery, navigation,
bindings, disconnect/leave, room authorization, replay, invalid payloads, flooding, and expiry.
One Python packaging test checks repeatability, an explicit ZIP allowlist, archive integrity,
and exclusion of an intentionally added local-secret fixture. No personal data is used.

Ads have controlled tests, not a completed real-ad recovery trial. There is no multi-machine
internet test, large-room load test, universal Chromium validation, or long-duration claim.
Internal YouTube APIs are an acknowledged compatibility risk. Benchmark samples were captured
before public-release renaming; packaging/metadata changes are not a new performance trial.
