# DSH 源码调研

## 状态
accepted

## 调研对象
- 仓库：DeepSeek Harness 上游源码与 npm 包
- 版本：`0.1.5-alpha.1`（tag `dsh-v0.1.5-alpha.1`，commit `5dda764ed3aa172535a7967b06ff95d9cbfe536a`）；另对照 `0.2.0-rc.2`，见第 8 节
- 对照包：`@deepseek-ai/dsh-client-connection`、`dsh-host-webserver`、`dsh-api-gateway`、`dsh-api-settings-controller`、`dsh-api-remotes`、`dsh-client-ui-settings`、`dsh-web-app`、`dsh-agent-preset-registry`、`dsh-llm`
- 结论：不修改 DSH dist/source。compat 包装 `webServer.register` 与 `connection.isLoopback`，JWT 通过后调用原 `/api` handler。

## 1. `/api` 处理链

`@deepseek-ai/dsh-client-connection` 在 `webServer` 存在时注册 `kind: prefix, path: /api`。handler 顺序：

1. `isTrustedApiRequest(request, trustedHosts)` → 失败则 403
2. `browserAuth.isAuthenticated(request)` → 失败则 401
3. `createSharedFetchHandler('/api')`：精确 Fetch 路由，否则 Typert interceptor

`connection.requestRejection` 同步返回 Host/Origin + cookie 的 401/403。jose JWKS 是异步的，不能放进 `requestRejection`。

关键事实：`requestRejection` / `authorizeIndex` 是 `connection` 服务上的公开方法，**每一个路由所有者**都可以调用，不是 `/api` 私有物。第三方插件据此保护自己的路由（dshmarket ≥ 1.66.13 把它的 48 条 `/dsh-market/*` exact 路由放在这道检查后面，见 dsh-market#603）。因此豁免标记必须覆盖所有注册路由，而 deny 策略仍只属于 DSH 自己的面，见 `docs/decisions/ADR-0006-route-coverage-for-cookie-substitution.md`。

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
| `agentPresets/read` `copy` `deletePreset` | `dsh-agent-preset-registry` |
| `llm/discoverModels` | `dsh-llm` |

普通 API 示例：`agentPresets/list`、`agentPresets/select`、`llm/listProviders`、`llm/listConfigurableProviders`。

`0.2.0-rc.2` 实测（第 8 节）：`settings/*` 与 `credentials/*` 仍来自 `dsh-api-settings-controller`，但 `settings/canOpenAgentPresetDirectory`、`settings/openAgentPresetDirectory` 已移除；`agentPresets/*` 在 `dsh-agent-preset-registry/lib/typert.host.js` 中只剩 `list` `read` `select`；`llm/*` 在 `dsh-llm/lib/typert.host.js` 中为 `discoverModels` `listConfigurableProviders` `listProviders`。

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

Cookie 名与载荷绑定请求的 `Host` authority，且签名密钥来自持久凭据（`/root/.dsh/.credentials.yaml`），因此重启不失效、跨 authority 不通用。豁免覆盖每一条注册路由与 upgrade：第三方插件路由（如 `/dsh-market/*`）的 handler 同样会调用 `requestRejection`，只标记 `/api` 会让它们在 Access 后面回 401。

## 7. 插件 unload

须自行恢复被替换的 `register` / `registerUpgrade` 与 `isLoopback`。不能依赖 DSH 撤销包装。

## 对实现方案的结论

```text
Hook A → Server JWT：compat 包装 webServer.register / registerUpgrade
Hook B → Client capability：compat 包装 connection.isLoopback
Bundle C → package.json dsh.bundle + dsh.client
成功路径 → 原 /api handler（Remote）；远程有效 JWT 跳过 DSH Cookie
覆盖范围 → 豁免标记覆盖所有注册路由与 upgrade；deny 只作用于 /api、/api/remote.mux、index fallback
```

## 8. `0.2.0-rc.2` 实测记录

对照安装的 `@deepseek-ai/dsh` `0.2.0-rc.2`（`/usr/lib/node_modules/@deepseek-ai/dsh`）：

| 项 | `0.1.5-alpha.1` | `0.2.0-rc.2` |
| --- | --- | --- |
| `@deepseek-ai/dsh-client-connection` | `0.1.5-alpha.1` | `0.2.0-rc.2` |
| `@deepseek-ai/dsh-host-webserver` | `0.1.5-alpha.1` | `0.2.0-rc.2` |
| `@deepseek-ai/cordis` | `4.0.2` | `4.0.4` |
| `webServer.register` / `registerUpgrade` / `registerFallback` | 存在 | 存在，签名与语义不变（`register` 仍对重复 `(kind, path)` 抛错） |
| `connection.requestRejection` / `authorizeIndex` / `trustedHosts` | 存在 | 存在 |
| `api-request-trust`（`isLoopbackHostname` / `canonicalAuthority` / `isTrustedAuthority` / `isTrustedApiRequest`） | — | 与 `src/compat/dsh-trust.ts` 的副本语义一致（rc.2 另有 `assertTrustedAuthority` 做配置校验，本插件不需要） |
| `dsh.webServer` 扩展点 | — | 不变；`webRuntime.trustedHosts` 仍可读 |

live 探针（对 Access 后的运行实例，伪造 header）：

| 请求 | 结果 |
| --- | --- |
| `Host: dsh.0rz.li` + `Cf-Access-Jwt-Assertion: not-a-real-jwt`，`/api/settings/describe` | 403 `forbidden` |
| `Host: localhost:3080`，同路径 | 401 `unauthorized` |
| `Host: 127.0.0.1:3080`，同路径 | 401 `unauthorized` |

结论：CF 插件在 `0.2.0-rc.2` 上仍被正确加载，`webRuntime.trustedHosts` 能解析，Host/Origin 栅栏与 `dsh-trust.ts` 副本一致；`/api` 面工作正常。peer 版本改为范围 `^0.1.5-alpha.1 || ^0.2.0-rc.2` 后，`dsh plugin add` 的 peer 校验不再拒绝安装。

### 8.1 激活顺序实测（2.1.1 的依据）

2.1.0（只包装注册方法）在这台实例上仍然 401。用**不依赖有效 JWT** 的时序探针定位：给一个 header 里带未知 `kid` 的 JWT，`jose` 的 `createRemoteJWKSet` 在冷却期外会重新抓一次 JWKS（本机实测 `https://keweiya.cloudflareaccess.com/cdn-cgi/access/certs` 约 0.53s 冷连接 / 0.036s 复用连接）。于是「这条路由有没有走验签」可以被观测：

| 探针（`Host: dsh.0rz.li`，冷却期外） | 耗时 | 含义 |
| --- | --- | --- |
| `/api/settings/describe` + 未知-kid JWT | 0.557s | 走了验签（重取 JWKS） |
| 紧接着同一请求（冷却期内） | 0.004s | — |
| `/dsh-market/api/v1/capabilities` + 同一 JWT | 0.001s | **没走验签** |
| `/dsh-market/api/v1/capabilities` 无 JWT | 0.001s | 基线 |

`remoteHostTrusted` 已由 `/api` 的 403 排除（403 需要 `hostOriginTrusted=true`，两者共用 `isTrustedAuthority`）。所以市场路由确实没被包装。

原因：`dshmarket@1.66.14` 在自己的 `apply` 里 `ctx.inject(['webServer','loader'], (hostCtx) => { … host.webServer.register(…) })`，服务可用即同步注册 48 条 `/dsh-market/*` 路由；本插件走 plugin 级 `inject = ['webServer']`，`apply` 由 Cordis 延后。用真实市场代码复现（`mountMarketRoutes` + `refuseUnadmitted`）：`compat-first` → 200，`compat-last` → 401（与线上一致）。2.1.1 的采纳（adopt）修好后两种顺序都是 200。

2.1.1 装回同一实例并重启（PID 25099，启动于 `01:02:58`）后，同一个探针的对照：

| 探针 | 2.1.0 | 2.1.1 |
| --- | --- | --- |
| `/dsh-market/api/v1/capabilities` + 未知-kid JWT | 0.001s | **0.582s**（重取 JWKS，说明走了验签） |
| 同请求无 JWT | 0.001s | 0.001s |
| 同请求紧接着再发一次（冷却期内） | — | 0.002s |

状态码不变：`/api/settings/describe` + 伪造 JWT → 403，`/dsh-market/api/v1/capabilities` + 伪造 JWT → 401（市场自己的准入裁决）。

路由表形状（`dsh-host-webserver` rc.2）：`this.exact` / `this.prefixes` / `this.upgrades` 是 `Map<path, route>`，`this.fallback` 是 handler；`match()` 与 upgrade 分支、fallback 分支都在请求时读 `route.handler`，所以在表里就地替换 handler 即可生效。
