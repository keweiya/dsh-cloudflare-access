# Proposal

## Why

2.1.0 把豁免标记铺到了「每一条注册路由」，但实现只包装 `webServer.register` / `registerUpgrade` / `registerFallback`——**只能覆盖本插件激活之后注册的路由**。

现场证据（`0.2.0-rc.2` + `dshmarket@1.66.14`，Cloudflare Access 后的 Web profile）：

- `/api/settings/describe` 带伪造 JWT → 403，说明包装器确实装上了。
- 用一个 header 里带未知 `kid` 的 JWT 做时序探针（`jose` 的 `createRemoteJWKSet` 在冷却期外会重取 JWKS，本机实测冷连接约 0.53s）：`/api` 冷却期外 0.557s，而 `/dsh-market/api/v1/capabilities` 与无 JWT 基线一样是 0.001s —— 市场路由**根本没走验签**，即没被包装。
- `remoteHostTrusted` 由 `/api` 的 403 排除（403 需要 `hostOriginTrusted=true`，两者共用 `isTrustedAuthority`）。

原因：`dshmarket` 在自己的 `apply` 里 `ctx.inject(['webServer','loader'], (hostCtx) => { … host.webServer.register(…) })`，服务可用即同步注册 48 条 `/dsh-market/*` 路由；本插件走 plugin 级 `inject = ['webServer']`，`apply` 由 Cordis 延后。**市场先落表，包装器后装上。**

用真实市场代码（`mountMarketRoutes` + `refuseUnadmitted`）复现：`compat-first` → 有效 JWT 200；`compat-last` → 有效 JWT 401 + 登录错误（与线上一致）。

## What Changes

- 激活时增加一步**采纳（adopt）**：扫 `webServer.exact` / `prefixes` / `upgrades` 三张表与 `fallback` 座位，就地替换 `route.handler`（dispatch 读的就是这个属性），把本插件激活前已注册的路由一并纳入豁免。
- 采纳的条目在 unload 时还原（仅当该 path 仍指向本插件包装的对象），并用 `Symbol` 标记避免二次包装。
- 表结构缺失或形状不同（未来 DSH 改名）时跳过，退回「只覆盖激活之后注册的路由」，不抛错。
- 补 4 个集成测试：先注册的 exact / prefix 路由、先注册的 upgrade、先注册的 fallback、二次激活不叠加包装、unload 还原。
- 文档：ADR-0006 补记、`docs/services/dsh-compat-server.md` 新增 RULE-SERVICE-COMPAT-7、`docs/references/dsh-source-research.md` §8.1 记录探针与复现、README ×2、CHANGELOG、openspec 基线。

## Capabilities

### New Capabilities
- 无。

### Modified Capabilities
- `dsh-authorization`：豁免覆盖不再依赖激活顺序（`Remote Access JWT substitutes for the DSH launch-token cookie` 增加「先注册的路由也必须被采纳」的场景）。

## Impact

- 正向：第三方插件（dshmarket 市场、其 API 与静态资源）在 Access 后面不再需要手工 `?token=` URL，且与插件加载顺序无关。
- 负向：采纳依赖 webserver 的内部表名，属版本相关结构，因此只放在 `src/compat/` 并做形状检测。
- 安全：与 2.1.0 相同，采纳只影响「是否标记豁免」，标记条件仍是 `remoteHostTrusted && jwt.outcome === 'valid'`；deny 范围不变。
