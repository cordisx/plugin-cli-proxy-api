# CLIProxy Providers

此公开仓将成为 CordisX CLIProxyAPI Provider 会话插件的独立 owner。

## 迁移状态

仓库目前只有惰性的私有 package scaffold，尚未提供 Provider 会话界面或
Provider 配置。迁移完成前，正在生效的实现仍位于 `cordisx/cordisx`。

renderer 可迁移到现有公开入口 `cordisx/contracts`、`cordisx/react` 和
`cordisx/ui`。Provider 配置还需要新的 versioned Protocol service declaration
以及对应的 Host-owned Provider Fleet adapter。在二者正式合并前，本仓不会复制
Host launcher 配置、凭据、持久化、app-server transport 或 private service API。

计划中的插件会保留复合 Provider 身份，并且只使用经过权限 broker 的
`ctx.platform` 服务。它不会创建第二个 Provider Fleet、替换 Codex Desktop
原生连接，或在失败时回退到原生连接。

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
