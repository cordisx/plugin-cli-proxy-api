# CLIProxy Providers

This public repository is the standalone owner of the CordisX CLIProxyAPI
provider sessions plugin.

## Migration status

This branch contains the extracted renderer and an executable package-v9
`platform-provider` service candidate. The renderer uses only public Host React,
UI, and `ctx.platform` contracts. The Node service uses only the public Protocol
broker and `ctx.platformProviders.register`; CLIProxy method declarations,
response projection, lifecycle, and approval adaptation live here.

The Host still owns endpoint and credential resolution, process startup, opaque
workspace handles, method/schema policy, configuration persistence, and the
single Provider Fleet. The plugin receives no endpoint, credential, process,
filesystem path, raw transport, or Fleet handle.

The candidate pins Protocol `f9b57a6dc665ff471c9bda06d4923be6e2e03b6a`.
It remains private and unmerged until the matching Host service loader and
broker authority are formally merged. One contract gap is still open: the v1
factory projection omits the safe per-provider model mapping stored in the
CLIProxy runtime configuration. The migration must resolve that public
projection before claiming feature parity or deleting the Host-built consumer.

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
