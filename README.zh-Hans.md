# CLIProxy Providers

此公开仓是 CordisX CLIProxyAPI Provider 会话插件的独立 owner。

## 交付状态

本版本包含独立 renderer、可执行的 `platform-provider` 服务和 package-v14 托管网关
runtime。Renderer 只使用公开的 Host React、UI 和服务合同；Node 服务只使用公开
Protocol 与 Host 托管服务 API。CLIProxy 的方法声明、响应投影、生命周期、上游组合和
账号控制均由本仓库维护。

Host 负责 endpoint 与凭据解析、进程启动、不透明 workspace handle、方法/Schema
策略、配置持久化和唯一的 Provider Fleet。插件不会获得 endpoint、凭据、进程、
文件系统路径、原始 transport 或 Fleet handle。

插件当前固定实验性 Protocol review head
`a1127780513b76f0c3b1acee70cd638b5348c6a5` 和 Host review head
`41d62722bc84a5cbe9320ed116faf1a80b428e57`。这些公开依赖尚未合并或发布。包继续保持
`private` 以阻止 npm 发布；manifest 声明显式本地源码分发，目前仍未提供安装包。

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
