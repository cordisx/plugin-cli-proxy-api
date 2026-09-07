# CLIProxy Providers

此公开仓是 CordisX CLIProxyAPI Provider 会话插件的独立 owner。

## 交付状态

独立 renderer 与可执行的 package-v9 `platform-provider` 服务已经合入 `main`。
Renderer 只使用公开的 Host React、UI 和 `ctx.platform` 合同；Node 服务只使用
公开 Protocol broker 与 `ctx.platformProviders.register`。CLIProxy 的方法声明、
响应投影、生命周期和审批适配均由本仓库维护。

Host 负责 endpoint 与凭据解析、进程启动、不透明 workspace handle、方法/Schema
策略、配置持久化和唯一的 Provider Fleet。插件不会获得 endpoint、凭据、进程、
文件系统路径、原始 transport 或 Fleet handle。

插件精确固定 Protocol `06277f9d117893a9215c991db8c0881df0f0b0f3`，并依赖
已正式合入的 Host v2 与 Codex app-server broker
`cb4d35d8e5a3632c18358ab9d9d04c4dec63e090`。包继续保持 `private` 以阻止 npm
发布；manifest 声明显式本地源码分发，目前仍未提供安装包。

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
