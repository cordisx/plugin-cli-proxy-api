# CLIProxy Providers

This public repository is the standalone owner of the CordisX CLIProxyAPI
provider sessions plugin.

## Delivery status

This version contains the standalone renderer, executable `platform-provider`
service, and package-v14 managed gateway runtime. The renderer uses only public
Host React, UI, and service contracts. The Node services use only public
Protocol and Host-managed service APIs; CLIProxy method declarations, response
projection, lifecycle, upstream composition, and account controls live here.

The Host owns endpoint and credential resolution, process startup, opaque
workspace handles, method/schema policy, configuration persistence, and the
single Provider Fleet. The plugin receives no endpoint, credential, process,
filesystem path, raw transport, or Fleet handle.

The plugin currently pins the experimental Protocol review head
`a1127780513b76f0c3b1acee70cd638b5348c6a5` and Host review head
`204d7a59e800c27258fb41435390a72cee1c5e9e`. These dependencies are public but
unmerged and unpublished. The package remains `private` to prevent npm
publication; its manifest declares explicit local source distribution, and no
packaged installer is available yet.

## Development

Requires Node.js 22 or newer.

```sh
npm ci
npm run check
npm run dev:dry-run
```

`npm run dev:dry-run` validates the local source graph without launching Codex
Desktop. The package remains `private`; use the explicit local source distribution described by the package manifest.

## Provenance and license

[HISTORY.md](HISTORY.md) records the filtered owner history from the original
Host-owned implementation. This repository is licensed under
[AGPL-3.0-or-later](LICENSE).

## Notification feedback

See [operation notifications and development dependencies](./.agents/docs/notifications.md).
