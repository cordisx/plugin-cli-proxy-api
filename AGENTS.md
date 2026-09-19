# CLIProxy Providers Repository Guide

- This repository exclusively owns the CLIProxy Providers product UI, plugin
  manifest, configuration declarations, documentation, styles, and tests.
- Use only documented, versioned CordisX and Protocol APIs. Never import Host
  source, provider internals, launcher configuration, secret storage, DOM
  adapters, or private bridges.
- The Host owns Provider Fleet execution, credentials, persistence, restart
  transactions, permissions, page chrome, shared React, and lifecycle cleanup.
- Read [.agents/rules/README.md](.agents/rules/README.md) before changing this
  repository.
- Read the organization
  [CSS ownership and maintenance rule](https://github.com/cordisx/cordisxmono/blob/main/.agents/rules/css.md)
  before changing CSS or a style-bearing DOM contract.

## Operation notifications

Use the public `ctx.notifications.show()` service for operation feedback and
require `notifications` in plugin injection. Do not create a custom Toast,
manually positioned alert, or page-wide success/error paragraph. Keep field
validation and durable business state beside the relevant object. Use stable
semantic `kind` values, localized safe text, and notification rules owned by Host;
never expose raw exceptions or notify on every polling attempt.
See the [Host notification guide](https://github.com/cordisx/cordisx/blob/3cfe370eb7abf33e16686fbd82659cd441247fbd/.agents/docs/notifications.md)
for the interaction contract and older-Host capability boundary.

Dependency setup: [notification migration](./.agents/docs/notifications.md).

## Development and release

- Requires Node.js 22 or newer. Install dependencies with `npm ci`.
- Run `npm run check`, `npm pack --dry-run`, and `git diff --check` before a
  release checkpoint.
- Keep public READMEs focused on installation and use. Architecture, migration
  history, source layout, local development, tests, and release operations
  belong here or in indexed maintainer documentation.
- Releases use a GitHub prerelease, not npm. Build the exact merged main commit,
  package with `npm pack`, attach the archive with `SHA256SUMS`, then download
  and verify both assets. The archive must contain `cordisx-package.json`, the
  browser entry, both service entries, and every declared runtime resource.
- Marketplace artifact URLs and digests are updated separately by the catalog
  owner after verification. Do not copy older trust records.
