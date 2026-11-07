# Security

This is an experimental first release. No external security audit has been performed.
The latest tagged release is the supported baseline; fixes may require updating both components.

## Report privately

Use **Security → Report a vulnerability** on GitHub when private reporting is available.
If it is unavailable, open a non-sensitive issue asking the maintainer for a private channel.
Do not publish exploit details, room codes, member tokens, cookies, credentials, or raw traces.
There is no promised response-time SLA.

## Trust boundaries

The web page and all client telemetry are untrusted. Internal YouTube timing methods can be
modified or can change upstream. The extension checks shape, content, bindings, and freshness;
it cannot attest that a client is genuine. The host is authorized to control its own room.

Room invitations and member tokens are separate random bearer secrets. Anyone with an invitation
can join until the room expires or fills. There is no approval lobby or account authentication.
Tokens remain in trusted `chrome.storage.session`; they are not sent to the page-world reader.
Do not share a profile containing an active session with someone you do not trust.

The coordinator authorizes every action against its own connection/session state. It rejects
guest timeline writes, invalid content/timeline identifiers, expired sessions, and stale revisions.
Payloads, room/member counts, socket buffers, connection attempts, and message rates are bounded.
Origin checks help against browser-origin abuse; non-browser clients can forge an Origin header.

## Deploy carefully

Local development binds `127.0.0.1`. Remote deployment requires an explicit extension-Origin
allowlist and WSS behind a TLS reverse proxy. Do not expose the backend HTTP port publicly.
Do not place bearer tokens in URLs or logs. Different unpacked installations can have different
extension IDs; maintain the actual allowlist rather than enabling a wildcard.

The server uses the direct socket address for connection limits. Behind a reverse proxy, clients
may share that address and its quota. v0.1 deliberately does not trust arbitrary forwarded headers.
This is not a complete DDoS defense or a multi-tenant public-service deployment.

The extension requests desktop YouTube access and local-coordinator access. Optional HTTPS host
access is granted separately for a remote coordinator. It has no microphone, tab-capture,
history, cookie, or all-sites mandatory permission.

See [deployment](docs/deployment.md) and [the MVP contract](docs/mvp.md).
