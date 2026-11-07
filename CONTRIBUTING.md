# Contributing

Contributions and independent forks are welcome under the MIT license. You can improve the UI,
extend compatibility, test new environments, or change the synchronization design.

## Open an issue first

Describe the problem or proposal. Include expected behavior, actual behavior, browser/version,
stream type, and reproduction steps when relevant. Agree on the scope before a large change.
Use private reporting for vulnerabilities; never publish tokens or private room invitations.

## Work outside main

1. Fork this repository if you do not have write access.
2. Create a branch such as `fix/123-clock-drift` or `feat/123-popup-layout` from current `main`.
3. Keep related changes together. Use descriptive commits: what changed and why.
4. Run `npm ci`, `npm test`, and `npm run check`.
5. For packaging changes, run `python -m unittest discover -s test -p '*_test.py'`.
6. Open a pull request into `main`. Link the issue, for example `Closes #123`.

Do not push development commits directly to `main`. Maintainers merge reviewed pull requests.

## Explain your changes

Every pull request should state:

- The issue and the concrete behavior being improved.
- What changed. Identify intentional behavior or protocol changes.
- Why the approach fits the problem. Note tradeoffs and unsupported cases.
- Checks actually run, with results. Include before/after evidence where useful.
- Screenshots for UI changes; measured traces and measurement definitions for timing changes.

Keep claims proportional to the evidence. A unit test is not a real-player test. A local
two-profile measurement is not a WAN or acoustic-latency benchmark. Record failed trials too.
Retest ads, navigation, seek-range limits, reconnect, and host pause/seek when you affect control.

## Protect local data

Never commit browser profiles, cookies, bearer tokens, `.env` files, HARs, raw traces, or personal
paths. Review `git diff --cached` and `git status --ignored` before pushing. Generated packages
belong in release assets, not in source commits. The packaging script has an explicit allowlist.

The release process is documented in [docs/releasing.md](docs/releasing.md).
