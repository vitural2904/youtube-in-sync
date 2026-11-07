# A coordinator for friends on different computers

The release includes software, not a hosted service. All participants need the same coordinator.
`127.0.0.1` always refers to the current computer, so it cannot connect friends over the internet.

## Local development

```sh
npm ci --omit=dev
npm start
```

This listens on `127.0.0.1:8787`. The extension default is `ws://127.0.0.1:8787/ws`.
Two independent profiles on this computer can test together.

## Remote server with TLS

Use a server you administer, a domain pointing to it, and a TLS reverse proxy supporting
WebSocket upgrades. The following is an example topology, not a deployed endpoint.

```text
extensions -- WSS/443 --> TLS reverse proxy -- loopback/8787 --> coordinator
```

Find each installed extension's ID on its extensions page. Unpacked IDs may differ across
computers. Use the exact `chrome-extension://<id>` values, separated by commas.

On a Linux host with Docker:

```sh
docker build -t youtube-in-sync:v0.1 .
docker run --rm --name youtube-in-sync \
  -p 127.0.0.1:8787:8787 \
  -e ALLOWED_ORIGINS='chrome-extension://YOUR_ACTUAL_EXTENSION_ID' \
  youtube-in-sync:v0.1
```

The container binds internally to `0.0.0.0`, but Docker publishes only the host's loopback port.
Without Docker, set `ALLOWED_ORIGINS` and run the process bound to loopback. `HOST` and `PORT`
override the listen address and port. Non-loopback mode refuses to start without an allowlist.

For a host-installed Caddy proxy, an illustrative Caddyfile is:

```caddyfile
sync.example.com {
    reverse_proxy 127.0.0.1:8787
}
```

Replace the example hostname. Configure real DNS and certificate issuance for your server.
Verify `/health` through HTTPS and a WSS room connection. Keep backend port 8787 off the public
network. This recipe has not been exercised as a public deployment in the initial smoke test.

## Point participants at the server

In the extension popup, enter `wss://sync.example.com/ws` using your actual hostname.
Click **Cho phép máy chủ HTTPS** to grant that specific host permission. Every participant uses
the same endpoint, video, and private room code. No YouTube API key is needed.

## Operational limits

- Rooms live in RAM and expire after two hours. Restarting the server destroys them.
- Up to eight members per room, 100 rooms, and 200 concurrent sockets are the current bounds.
- Disconnected guests are retained for roughly 60–75 seconds. A missing host closes the room
  after a similar window. There is no host migration.
- Connection attempts are limited per direct socket address. Proxy deployments may share a quota.
- The coordinator does not implement account identity, a join-approval lobby, durable storage,
  cross-process room routing, or automatic TLS provisioning.

See [SECURITY.md](../SECURITY.md) before making an instance reachable by others.
