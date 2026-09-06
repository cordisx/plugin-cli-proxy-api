# CLIProxy Providers

This public repository is the future standalone owner of the CordisX
CLIProxyAPI provider sessions plugin.

## Migration status

The repository currently contains an inert, private-package scaffold. It does
not yet provide the Provider sessions UI or provider configuration. The active
implementation remains in `cordisx/cordisx` until the migration is complete.

The renderer can move to the existing public `cordisx/contracts`,
`cordisx/react`, and `cordisx/ui` entries. Provider configuration requires a
new versioned Protocol service declaration and a matching Host-owned Provider
Fleet adapter. Until both are formally merged, this repository will not copy
Host launcher configuration, credentials, persistence, app-server transport,
or private service APIs.

The planned plugin will preserve composite provider identity and use only the
permission-brokered `ctx.platform` service. It will not create a second Provider
Fleet, replace the native Codex Desktop connection, or fall back to it.

## Development

Requires Node.js 22 or newer.

```sh
npm ci
npm run check
npm run dev:dry-run
```

`npm run dev:dry-run` validates the local source graph without launching Codex
Desktop. The package remains `private` while the migration is incomplete.

## Provenance and license

[HISTORY.md](HISTORY.md) records the filtered owner history from the original
Host-owned implementation. This repository is licensed under
[AGPL-3.0-or-later](LICENSE).
