# 服务规格

## 状态
accepted

## 服务名称
DshCompatClient

## 职责
- 在浏览器 Cordis 上下文中可逆包装 `connection.isLoopback`，使远程页使用 Host settings persistence，并让 Settings / Models / Credentials / Preset UI 发起 RPC。
- unload 时恢复原属性。

## 非职责
- 验证 JWT 或 Cookie。
- 根据 JS 决定用户是否有 privileged 权限。
- 隐藏 native host UI。

## 服务规则
RULE-SERVICE-CLIENT-1: 包装是 capability enablement，不是授权。

RULE-SERVICE-CLIENT-2: 必须 `inject` `connection`，在 `apply` 时包装，用 `ctx.effect` 恢复。

RULE-SERVICE-CLIENT-4: `dsh.client.immediately` 必须为 `true`，且 `dsh.client.inject` 必须包含 `@deepseek-ai/dsh-client-connection`。Web boot 先 prefetch immediately 包再 `loader.create`；否则本模块在 ui-settings 把 `remote.$host.isLoopback=false` 快照进 memory persistence 之后才到达，远程 Settings 不会发起 `settings/describe`。

RULE-SERVICE-CLIENT-3: 不得把 Cloudflare header 或 Cookie 传到业务逻辑。

## 接口
- `apply(ctx): void` — Client plugin 入口

## 依赖
- 上游：`ctx.connection`
- 下游：DSH `ui-settings*`、`ui-agent-preset`、`ui-settings-models`

## 故障处理
- `connection` 不存在则 fiber 等待（inject），不得自己 provide 一个假 connection。

## 示例
远程 `location.hostname = dsh.example.com` 时，包装后 `connection.isLoopback === true`，`remote.$host.isLoopback` 与 `settingsScope.bind` 使用 `host` persistence；Server 若拒绝 JWT，RPC 仍失败，UI 保持错误态而不是静默 memory 模式。
