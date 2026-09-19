# CLIProxy Providers

CLIProxy Providers connects CordisX to models and sessions exposed by a
CLIProxyAPI runtime. Use it to browse provider models, create and continue
sessions, inspect session content, and manage reported upstream accounts from
the CordisX interface.

## Install

Plugin ID: `cli-proxy-api`. Current release: `0.1.1`.

The CordisX Community Marketplace feed must already be configured and enabled
before `--source` can select it:

```sh
FEED_URL=https://raw.githubusercontent.com/cordisx/marketplace/main/marketplace.json
npx cordisx@beta source add "$FEED_URL" --yes
npx cordisx@beta plugin install cli-proxy-api --source "$FEED_URL" --version 0.1.1
```

Skip `source add` when that exact feed is already enabled. For another profile,
add the same `--profile <profile>` argument to both commands. `--yes` confirms
the source change only; it does not approve plugin permissions. A discovery
source is not a trust root.

The install command becomes available after the Marketplace v3 entry lists the
verified `0.1.1` artifact. Until then, download the archive and `SHA256SUMS`
from the
[GitHub release](https://github.com/cordisx/plugin-cli-proxy-api/releases/tag/v0.1.1).

## Use

Open CLIProxy Providers in CordisX to select a provider and model, create a
session, or open a previously reported session. Available controls can include
continue, fork, archive, restore, delete, send, steer, and interrupt; the plugin
shows only operations permitted for the exact request.

The Upstream Subscriptions page lists CLIProxyAPI accounts, their status and
models, and configured CordisX upstreams. Supported OAuth actions can be
started or cancelled there. This release can manage accounts reported by
CLIProxyAPI but cannot add or import account files in CordisX.

## Configuration

Use the CordisX plugin configuration to limit visible providers with
`providerIds`; leave it empty to show all reported providers. Configuration
applies after a plugin restart. The managed gateway reads its packaged YAML and
JSON schemas under Host control.

CLIProxyAPI accounts and endpoints must be configured in the external runtime.
The Host resolves credentials, starts managed processes, persists configuration,
and owns the Provider Fleet. The plugin never receives raw credentials,
filesystem paths, process handles, or transport handles.

## Permissions and limits

All model, task, and turn capabilities are optional. Task content, creation,
control, turn submission, and turn control are scoped to the exact request.
Review requested permissions before enabling them.

Availability depends on a compatible Host managed-service runtime and a working
CLIProxyAPI configuration. The plugin does not silently substitute another
provider or model when an exact identity is unavailable.

## Troubleshooting

- **Install cannot find version `0.1.1`:** confirm the Marketplace v3 entry
  lists the verified artifact. `--source` does not add or repair a feed.
- **No models or sessions appear:** confirm CLIProxyAPI is running, its accounts
  are enabled, and model/catalog read permissions are granted.
- **Account controls are unavailable:** configure the account outside CordisX
  or verify that the Host managed service exposes the requested operation.
- **A session action is disabled:** grant the matching exact-request permission
  and confirm the selected provider still reports that session.

## License

CLIProxy Providers is licensed under
[AGPL-3.0-or-later](LICENSE). Provenance is recorded in
[HISTORY.md](HISTORY.md), and third-party notices are in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Maintainer setup, checks, and
release instructions are in [AGENTS.md](AGENTS.md).
