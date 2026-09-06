# CLIProxy Providers

此公开仓将成为 CordisX CLIProxyAPI Provider 会话插件的独立 owner。

## 迁移状态

当前分支已经包含拆出的 renderer，以及可执行的 package-v9
`platform-provider` 服务候选。Renderer 只使用公开的 Host React、UI 和
`ctx.platform` 合同；Node 服务只使用公开 Protocol broker 与
`ctx.platformProviders.register`。CLIProxy 的方法声明、响应投影、生命周期和审批适配均由本仓库维护。

Host 继续负责 endpoint 与凭据解析、进程启动、不透明 workspace handle、方法/Schema
策略、配置持久化和唯一的 Provider Fleet。插件不会获得 endpoint、凭据、进程、文件系统路径、原始 transport 或 Fleet handle。

候选精确固定 Protocol `f9b57a6dc665ff471c9bda06d4923be6e2e03b6a`。
在匹配的 Host 服务装载器和 broker authority 正式合入前，包保持 private 且 PR 不合入。
当前分支消费正式的 Protocol v2 安全 factory projection，让 Host 校验后的模型映射进入插件，同时不暴露原始服务配置。Protocol v2 已精确固定为 `cbfd15ef4d2f51bcffa659f393cd65730bbe5f0d`；匹配的 Host v2 实现正式合入后，本插件才可合入。

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
