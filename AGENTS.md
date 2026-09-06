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
