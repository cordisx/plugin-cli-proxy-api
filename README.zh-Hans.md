# CLIProxy Providers

此公开仓将成为 CordisX CLIProxyAPI Provider 会话插件的独立 owner。

## 迁移状态

此功能分支已经抽出 Provider 会话 renderer。它只使用 `cordisx/contracts`、
`cordisx/react`、`cordisx/ui` 和经过权限 broker 的公开 `ctx.platform` 服务。
package 继续保持 private；backend 迁移完成前，此分支不得合并。

Provider 配置还需要新的 versioned Protocol service declaration
以及对应的 Host-owned Provider Fleet adapter。在二者正式合并前，本仓不会复制
Host launcher 配置、凭据、持久化、app-server transport 或 private service API。

renderer 保留 `(providerId, modelId)` 和 `(providerId, remoteSessionId)`
复合身份。它不会创建第二个 Provider Fleet、替换 Codex Desktop 原生连接，或在
失败时回退到原生连接。

## 开发

需要 Node.js 22 或更新版本。

```sh
npm ci
npm run check
npm run dev:dry-run
```

`npm run dev:dry-run` 只验证本地 source graph，不会启动 Codex Desktop。迁移未完成
期间 package 保持 `private`。

## 来源与许可证

[HISTORY.md](HISTORY.md) 记录原 Host-owned 实现筛选后的 owner 历史。本仓采用
[AGPL-3.0-or-later](LICENSE) 许可证。
