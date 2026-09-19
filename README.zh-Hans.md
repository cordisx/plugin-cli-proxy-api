# CLIProxy Providers

CLIProxy Providers 将 CordisX 连接到 CLIProxyAPI runtime 提供的模型与会话。可以用它
浏览 Provider 模型、创建和继续会话、查看会话内容，并在 CordisX 中管理 runtime
上报的 upstream 账号。

## 安装

插件 ID：`cli-proxy-api`。当前版本：`0.1.1`。

CordisX Community Marketplace feed 必须先完成配置并启用，`--source` 才能选择它：

```sh
FEED_URL=https://raw.githubusercontent.com/cordisx/marketplace/main/marketplace.json
npx cordisx@beta source add "$FEED_URL" --yes
npx cordisx@beta plugin install cli-proxy-api --source "$FEED_URL" --version 0.1.1
```

若该 feed 已启用，可跳过 `source add`。使用其他 profile 时，两条命令都要添加
相同的 `--profile <profile>`。`--yes` 只确认来源变更，不会批准插件权限；发现来源
也不等同于 trust root。

Marketplace v3 条目列出已验证的 `0.1.1` artifact 后，安装命令才可用。在此之前，
可从
[GitHub Release](https://github.com/cordisx/plugin-cli-proxy-api/releases/tag/v0.1.1)
下载压缩包与 `SHA256SUMS`。

## 使用

在 CordisX 中打开 CLIProxy Providers，选择 Provider 和模型，然后创建会话或打开
runtime 已上报的会话。可用操作可能包括继续、分叉、归档、恢复、删除、发送、引导
和中断；插件只显示当前精确请求获准执行的操作。

Upstream Subscriptions 页面显示 CLIProxyAPI 账号、状态、模型和已配置的 CordisX
upstream。可在此启动或取消支持的 OAuth 操作。本版本可以管理 CLIProxyAPI 已上报的
账号，但不能在 CordisX 中新增或导入账号文件。

## 配置

通过 CordisX 插件配置中的 `providerIds` 限制可见 Provider；留空表示显示全部上报的
Provider。配置在插件重启后生效。托管 gateway 在 Host 控制下读取包内 YAML 和 JSON
schema。

CLIProxyAPI 账号与 endpoint 必须在外部 runtime 中配置。Host 负责解析凭据、启动托管
进程、持久化配置和维护唯一的 Provider Fleet。插件不会获得原始凭据、文件系统路径、
进程 handle 或 transport handle。

## 权限与限制

模型、task 和 turn 能力全部为可选权限。Task 内容、创建、控制、turn 提交与控制都
限定在精确请求范围内。启用前请检查插件请求的权限。

功能可用性取决于兼容的 Host managed-service runtime 和正常工作的 CLIProxyAPI
配置。精确 Provider 或模型不可用时，插件不会静默替换为其他对象。

## 排错

- **找不到 `0.1.1`：**确认 Marketplace v3 条目已列出验证后的 artifact；`--source`
  不会添加或修复 feed。
- **没有模型或会话：**确认 CLIProxyAPI 正在运行、账号已启用，并授予模型和 catalog
  读取权限。
- **账号控制不可用：**在 CordisX 外配置账号，或确认 Host managed service 已开放
  所需操作。
- **会话操作被禁用：**授予对应的精确请求权限，并确认所选 Provider 仍上报该会话。

## 许可证

CLIProxy Providers 使用 [AGPL-3.0-or-later](LICENSE)。来源记录见
[HISTORY.md](HISTORY.md)，第三方声明见
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。维护者环境、检查和发布步骤见
[AGENTS.md](AGENTS.md)。
