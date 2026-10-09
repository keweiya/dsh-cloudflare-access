# ADR-0006 豁免覆盖全部路由，拒绝仍只留给 DSH 自己的面

## 状态
accepted

## 背景
DSH 把准入检查 `connection.requestRejection` 放在 `connection` 服务上，供**每一个**路由所有者调用，不是 `/api` 私有物。

2.0.0 的 Hook A 只包装 `kind === 'prefix' && path === '/api'` 的路由，以及 `/api/remote.mux` upgrade 与 index fallback。于是：

- 第三方插件注册的路由（`dshmarket` ≥ 1.66.13 的 48 条 `/dsh-market/*` exact 路由，见 dsh-market#603）虽然自己也调用 `connection.requestRejection`，却拿不到 Access JWT 的豁免，在 Access 后面继续索要 DSH launch-token Cookie，对已由 Access 认证的浏览器回 401。
- 反过来，如果把 policy 的 deny 也一并铺到所有路由，`ordinary=required` 会把第三方插件的静态资源、健康检查、webhook 一起挡掉——本插件没有资格替别人的路由做准入裁决。

## 决策
把「豁免」与「拒绝」拆成两个不同范围的职责：

| 职责 | 范围 | 依据 |
| --- | --- | --- |
| 豁免（把 `req` 记入 `skipped`，使 `requestRejection` 返回 `undefined`） | 每一条 `register` 路由、每一个 `registerUpgrade` upgrade、index fallback | `requestRejection` 是宿主对所有路由所有者开放的检查；第三方路由需要同一份 Access 身份 |
| 拒绝（返回 401/403） | 仅 `/api` 前缀、`/api/remote.mux`、index fallback | 这些是 DSH 自己的面，`auth.ordinary` 的语义边界在此 |

实现：在包装层先 `await authorize(req, deps)`，再判断 `policyRoute`（`isApiPrefix` / `isRemoteMuxUpgrade` / fallback）。非 policy 路由即使得到 `deny` 也不拒绝，只按 `marksBrowserSession(gate)` 决定是否标记，然后交给原 handler。

### 补记（2.1.1）：覆盖范围不得依赖激活顺序

2.1.0 上线后实测发现上面这套实现**不够**：它只覆盖「本插件激活之后」注册的路由。

线上证据（`0.2.0-rc.2` + `dshmarket@1.66.14`，Access 后面）：

- `/api/settings/describe` 带伪造 JWT → 403（说明包装器已装在 `/api` 上）。
- 用一个「未知 kid」的 JWT 触发 jose 重取 JWKS 的时序探针：`/api` 在冷却期外耗时 0.53s，而 `/dsh-market/api/v1/capabilities` 与无 JWT 的基线一样是 0.001s——**市场路由根本没有走验签**，即没被包装。

原因在激活顺序：本插件走 plugin 级 `inject = ['webServer']`，apply 由框架延后；而 dshmarket 在自己的 `apply` 里用 `ctx.inject(['webServer','loader'], …)`，服务一可用就同步注册那 48 条路由。市场先落表，包装器后装上。

因此 2.1.1 在激活时增加一步**采纳（adopt）**：扫 `webServer.exact` / `prefixes` / `upgrades` 三张表与 `fallback` 座位，就地替换 `route.handler`（dispatch 读的就是这个属性），把先注册的路由一并纳入。表结构缺失或形状不同时跳过，退回「只覆盖激活之后注册的路由」。采纳的条目在 unload 时还原，且用 `Symbol` 标记避免二次包装。

## 安全性
- 豁免是**纯增量**：只有 `remoteHostTrusted && jwt.outcome === 'valid'` 时才标记，且从不放宽 Host/Origin 栅栏。
- 需要同时满足：`Host` 属于声明过的 `trustedHosts`（非 loopback），且 JWT 通过签名 / `iss` / `aud` / 过期校验。攻击者既不能伪造 Host，也不能伪造 JWT。
- loopback 不读 JWT、不标记，仍走官方 token/Cookie。
- 未被标记时，第三方路由的行为与安装本插件之前完全一致；本插件不会让任何第三方路由比原来更宽松，也不会更严格。

## 备选方案
- 方案 A：只标记 `/api`，把第三方路由留给它们自己解决。等于要求每个插件都自己验一遍 CF Access JWT，身份逻辑会被复制到多个插件里，违背「身份仍在 Cloudflare Access，本插件只在 Origin 再验证一次」的边界。否决。
- 方案 B：豁免与拒绝都铺到所有路由。会让 `ordinary=required` 越权拒绝不属于本插件的路由。否决。
- 方案 C：在 `connection.requestRejection` 里做验签。该回调同步，装不下 jose JWKS 的异步解析。否决（同 ADR-0005）。
- 方案 D（2.1.1 采纳）：只包装注册方法，靠「本插件必须比别人先激活」的假设。实测该假设在 `0.2.0-rc.2` 上不成立（见上），且它把正确性押在 bundle 顺序这种隐式属性上。否决，改为激活时采纳已注册路由。
- 方案 E（2.1.1 备选）：让本插件抢先注册一个 catch-all 前缀路由。DSH 的 exact 表优先于前缀表，第三方 exact 路由仍会命中自己的 handler，覆盖不到。否决。

## 影响
- 正向影响：Access 后面的第三方插件路由（dshmarket 市场、其 API 与静态资源）不再需要手工打开 `?token=` URL；插件生态不必各自实现 JWT 验签。
- 正向影响：`ordinary=required` 的语义边界更清晰——只管 DSH 自己的面。
- 负向影响：每条非 `/api` 路由在远程请求上多一次 JWT 验签（`jose` 的 `createRemoteJWKSet` 会缓存 JWKS，成本为一次本地验签）。静态资源请求同样计费，这是为正确性付出的代价。
- 负向影响：本插件对「第三方路由的准入」不再有任何发言权；一个不调用 `requestRejection` 的插件路由在远程就是无鉴权的，与本插件无关。
- 负向影响（2.1.1）：采纳依赖 webserver 的内部表名（`exact` / `prefixes` / `upgrades` / `fallback`）。这是版本相关的内部结构，所以只放在 `src/compat/` 并做形状检测；DSH 若改名，插件会静默退回「只覆盖激活之后注册的路由」，而不是崩溃。

## 相关文档
- `docs/services/dsh-compat-server.md`
- `docs/decisions/ADR-0005-dsh-015-hook-strategy.md`
- `docs/references/dsh-source-research.md`
