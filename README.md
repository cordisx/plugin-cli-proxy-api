# CLIProxy Providers

This public repository is the standalone owner of the CordisX CLIProxyAPI
provider sessions plugin.

## Delivery status

The standalone renderer and executable package-v9 `platform-provider` service
are merged on `main`. The renderer uses only public Host React, UI, and
`ctx.platform` contracts. The Node service uses only the public Protocol broker
and `ctx.platformProviders.register`; CLIProxy method declarations, response
projection, lifecycle, and approval adaptation live here.

The Host owns endpoint and credential resolution, process startup, opaque
workspace handles, method/schema policy, configuration persistence, and the
single Provider Fleet. The plugin receives no endpoint, credential, process,
filesystem path, raw transport, or Fleet handle.

The plugin pins Protocol `06277f9d117893a9215c991db8c0881df0f0b0f3` and
the formal Host v2 and Codex app-server broker implementation
`cb4d35d8e5a3632c18358ab9d9d04c4dec63e090`. The package remains `private`
to prevent npm publication; its manifest declares explicit local source
distribution, and no packaged installer is available yet.

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
