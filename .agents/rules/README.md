# Repository Rules

## Ownership

- Keep renderer product code and styles in this repository. Keep Host provider,
  launcher, credential, persistence, restart, and adapter code in
  `cordisx/cordisx`.
- Consume Provider sessions only through the public `ctx.platform` service.
  Never add a raw transport, second Provider Fleet, direct app-server client,
  native DOM access, or fallback to the current native connection.
- Treat `(providerId, modelId)` and `(providerId, remoteSessionId)` as composite
  identities. Never silently substitute another provider.
- Register every contribution under the plugin lifecycle and dispose it during
  deactivation or generation replacement.

## Styles and quality

- Follow the organization
  [CSS rule](https://github.com/cordisx/cordisxmono/blob/main/.agents/rules/css.md).
  Plugin CSS may style only this plugin's body DOM and must not target Host
  internal class names.
- dprint owns formatting, ESLint owns JavaScript and TypeScript source policy,
  and Stylelint owns stylesheet syntax, selector complexity, and the 1000-line
  maintained stylesheet limit.
- The exact shared quality provider is pinned in `package.json` and
  `dprint.json`. Run `npm run check` before a checkpoint commit.

## Delivery

- Keep `main` releasable and use `codex/` branches for feature work.
- Do not publish or claim a working provider configuration path until the
  versioned Protocol service declaration and Host provider adapter are formally
  merged and pinned.
- Playground or dry-run evidence does not prove native App integration or user
  acceptance.
