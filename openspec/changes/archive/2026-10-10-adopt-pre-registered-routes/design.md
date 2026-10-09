# Design

## 问题结构

包装 `webServer.register` 是**时间点**上的钩子：它只能影响钩子装上之后的调用。而 DSH 的路由表（`exact` / `prefixes` / `upgrades` / `fallback`）是**状态**。要覆盖「已经注册」的路由，必须动状态，不能只挂钩子。

激活顺序不可控：

| 插件 | 依赖声明 | apply 时机 |
| --- | --- | --- |
| 本插件 | plugin 级 `inject = ['webServer']` | 框架在服务就绪后延后调用 |
| dshmarket | 无 plugin 级 inject；在 `apply` 内 `ctx.inject(['webServer','loader'], cb)` | 服务就绪即同步执行 `cb`，当场注册 48 条路由 |

结果：dshmarket 先注册，本插件后包装。

## 选定方案

激活时在包装三个注册方法之后，立即扫一遍已注册状态：

1. `webServer.exact` / `webServer.prefixes`（`Map<path, route>`）→ 对每个条目用 `wrapHttpHandler(route.handler, isApiPrefix(route))` 生成新条目，`table.set(path, wrapped)`。
2. `webServer.upgrades`（`Map<path, route>`）→ 同上，policy 为 `isRemoteMuxUpgrade(route)`。
3. `webServer.fallback`（handler）→ `wrapFallbackHandler`。

之所以就地替换 `route.handler` 就够：`dsh-host-webserver` 的 `match()`、upgrade 分支与 fallback 分支都在**请求时**读 `route.handler`（rc.2 源码 `lib/index.js` 第 178/274/286/324-331 行附近）。

## 可逆与幂等

- 每个被采纳的条目记录还原闭包：仅当 `table.get(path) === wrapped` 时才写回原条目，避免还原已被别人替换/删除的路由。
- 用 `Symbol('dsh-cloudflare-access:wrapped')` 非枚举标记本插件生成的 handler；采纳时跳过已标记的 handler，重复激活不会叠加包装。
- 还原与三个注册方法的还原一起放进同一个 `ctx.effect` disposer。

## 形状检测与降级

- `exact` / `prefixes` / `upgrades` 必须是 `Map`，`fallback` 必须是函数，否则跳过。
- `route.handler` 必须是函数才包装。
- 任何一项不满足都只跳过，不抛错：插件退回「只覆盖激活之后注册的路由」，而不是让 DSH 起不来。

## 被否决的方案

- **只依赖 bundle 顺序**：把正确性押在隐式属性上，实测在 `0.2.0-rc.2` 上不成立。否决。
- **抢先注册 catch-all 前缀路由**：DSH 的 exact 表优先于前缀表，第三方 exact 路由仍命中自己的 handler。否决。
- **在 `connection.requestRejection` 里验签**：该回调同步，装不下 jose 的异步 JWKS 解析（同 ADR-0005）。否决。
- **包装 `webServer` 的 dispatch（`match` / 请求入口）**：比读路由表更贴内部实现，且 `match()` 只返回路由对象、请求入口在 `listen()` 里一次性闭包，改动面更大。采纳现有方案后无必要。

## 验证

- 单测：`test/integration.test.ts` 新增 4 例（先注册的 exact/prefix/upgrade/fallback、二次激活不叠加、unload 还原）。
- 真实代码：把 `dshmarket@1.66.14` 的 `lib/` 放到临时目录补齐依赖解析，用真实 `mountMarketRoutes` + `refuseUnadmitted` + 真实 `jose` 验签，跑 `compat-first` 与 `compat-last` 两种顺序，均要求「有效 JWT → 200，无 JWT → 401」。
- 线上：重装后复用 §8.1 的未知-kid 时序探针，市场路由应从 0.001s 变为走验签的耗时。
