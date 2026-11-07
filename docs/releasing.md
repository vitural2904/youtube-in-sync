# Release procedure

The first public release is tag `v0.1`, with package/extension version `0.1.0`.
Earlier local development labels were not public releases.

1. Open a release issue. Work on `release/<version>`, not `main`.
2. Align `package.json`, lockfile, extension manifest, and `/health` version.
3. Update documentation and benchmark evidence. Keep limitations visible.
4. Run tests, syntax/manifest checks, package tests, and dependency audit.
5. Build `python scripts/package-extension.py`. Inspect ZIP entries and `dist/SHA256SUMS.txt`.
6. Review staged files for credentials, profiles, traces, private paths, and unwanted archives.
7. Push the branch. Open a linked pull request. Wait for CI and resolve findings.
8. Merge the reviewed release. Tag the exact merged commit. Do not move a published tag.
9. Create a GitHub prerelease with the extension ZIP and SHA-256 file. GitHub supplies source
   ZIP/tarball downloads automatically. Mark the UI and validation limits in the notes.
10. Verify the tag, commit, release links, uploaded bytes, and clean working tree.

The ZIP is unpacked; it includes `manifest.json` at its root and a copy of the MIT license.
It excludes development tools, the server, local profiles, and test output. The source archive
contains both application components and the tests/build documentation.
