# DSH 源码调研

## 状态
accepted

## 调研对象
- 仓库：DeepSeek Harness 上游源码与 npm 包
- 版本：`0.1.5-alpha.1`（tag `dsh-v0.1.5-alpha.1`，commit `5dda764ed3aa172535a7967b06ff95d9cbfe536a`）
- 对照包：`@deepseek-ai/dsh-client-connection`、`dsh-host-webserver`、`dsh-api-gateway`、`dsh-api-settings-controller`、`dsh-api-remotes`、`dsh-client-ui-settings`、`dsh-web-app`
- 结论：不修改 DSH dist/source。compat 包装 `webServer.register` 与 `connection.isLoopback`，JWT 通过后调用原 `/api` handler。

## 1. `/api` 处理链

`@deepseek-ai/dsh-client-connection` 在 `webServer` 存在时注册 `kind: prefix, path: /api`。handler 顺序：

1. `isTrustedApiRequest(request, trustedHosts)` → 失败则 403
2. `browserAuth.isAuthenticated(request)` → 失败则 401
3. `createSharedFetchHandler('/api')`：精确 Fetch 路由，否则 Typert interceptor

`connection.requestRejection` 同步返回 Host/Origin + cookie 的 401/403。jose JWKS 是异步的，不能放进 `requestRejection`。

## 2. 是否存在正式 authorization hook

不存在可替换的 Origin JWT / Access 中间件。相关但不可占用的机制：

| 机制 | 原因 |
| --- | --- |
| `isTrustedApiRequest` | 模块函数，不读 CF header |
| `connection.rpc.intercept` | 单槽，已被 `@deepseek-ai/dsh-api-gateway` 占用 |
| `BrowserAuth` | DSH 进程令牌 + 签名 Cookie，不是 Cloudflare Access |
| `connection.requestRejection` | 同步，装不下 JWKS 验签 |

选定：包装 `webServer.register` / `registerUpgrade` / `registerFallback`（`inject = ['webServer']`，早于 connection 注册 `/api`）。JWT 通过后调用原 handler。远程有效 JWT 跳过 `requestRejection` / `authorizeIndex` 的 Cookie 401；loopback 不跳过。

## 3. RPC 路径

Gateway `claimsEndpoint` 识别两段 `namespace/method`。HTTP 路径为 `/api/<namespace>/<method>`。

配置面（本插件 privileged 放行集合的权威来源）：

| endpoint | 来源包 |
| --- | --- |
| `settings/describe` `update` `replace` `mutate` | `dsh-api-settings-controller` |
| `settings/openSettingsDocument` | 同上 |
| `settings/canOpenAgentPresetDirectory` `openAgentPresetDirectory` | 同上 |
| `credentials/describe` `set` `unset` | 同上 |
| `agentPresets/read` `copy` `deletePreset` | `dsh-agent-presets` |
| `llm/discoverModels` | `dsh-llm` |

普通 API 示例：`agentPresets/list`、`agentPresets/select`、`llm/listProviders`、`llm/listConfigurableProviders`。

不列入本插件放行集合：`host.pickDirectory` / `host.openPath` 式 native 入口。目录选择走 host directory-picker 能力与对应 Remote，本插件不为其绕过任何 DSH 栅栏。

## 4. WebSocket

`@deepseek-ai/dsh-api-gateway` 用 `webServer.registerUpgrade` 挂载 `/api/remote.mux`。升级前调用 `connection.requestRejection`（Host/Origin + browser-session）。

普通 API 的 `auth.ordinary=required` 作用于该 mux。

## 5. Web Client 何处决定 Settings unavailable

`ui-settings` 在 apply 时：

```text
persistence = ctx.remote.$host.isLoopback ? 'host' : 'memory'
```

`$host.isLoopback` 由 API Gateway 从 `connection.isLoopback` 复制，页面生命周期内视为固定。`connection.isLoopback` 在浏览器中是 `isLoopbackHostname(location.hostname)`，除非 transport 声明 `ownsHost`。

`dsh.client.immediately` 必须为 `true`，且 inject `@deepseek-ai/dsh-client-connection`，以便在 ui-settings 快照前包装 getter。

## 6. Browser-session

Connection 用 process launch token 换 `dsh-auth-*` HttpOnly Cookie。未带有效 Cookie 的 index 与 `/api` 官方返回 401。本插件在远程 + 有效 Access JWT 时跳过该 Cookie；loopback 仍要求打开 `dsh web` 打印的 `?token=` URL。

## 7. 插件 unload

须自行恢复被替换的 `register` / `registerUpgrade` 与 `isLoopback`。不能依赖 DSH 撤销包装。

## 对实现方案的结论

```text
Hook A → Server JWT：compat 包装 webServer.register / registerUpgrade
Hook B → Client capability：compat 包装 connection.isLoopback
Bundle C → package.json dsh.bundle + dsh.client
成功路径 → 原 /api handler（Remote）；远程有效 JWT 跳过 DSH Cookie
```
