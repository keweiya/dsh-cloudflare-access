# 服务规格

## 状态
accepted

## 服务名称
DshCompatServer

## 职责
- 可逆包装 `webServer.register` / `registerUpgrade` / `registerFallback`。
- 对 `/api` 前缀与 `/api/remote.mux` upgrade 应用 policy。
- 在远程 + 有效 JWT 且 Host/Origin 已通过时，把请求交给原 handler，并跳过 DSH launch-token Cookie。
- 在 unload 时恢复原 register 方法与 connection 的 browser-session 检查。

## 非职责
- 实现 JWT 解析。
- 替换 `connection` 插件行。
- 占用 `connection.rpc.intercept`。
- 在 loopback 上取消 DSH launch-token Cookie。

## 服务规则
RULE-SERVICE-COMPAT-1: 包装必须通过 `ctx.effect` 注册 disposer。

RULE-SERVICE-COMPAT-2: 非 `/api` 路由原样交给 `originalRegister`。

RULE-SERVICE-COMPAT-3: 远程 privileged 成功路径禁止修改 Host/Origin 头。

RULE-SERVICE-COMPAT-4: native directory-picker / `host.openPath` 式方法即使 JWT 有效也不列入本插件 privileged 放行集合。

RULE-SERVICE-COMPAT-5: Host/Origin 失败、loopback、以及 `ordinary=off` 且无 Access JWT 的普通 API 不得验签。远程若带了 Access JWT，必须验签以决定能否跳过 DSH Cookie。不得因此把 policy 的 allow/deny 放宽到 Host/Origin 失败。

## 接口
- `install(ctx, policy, verifier, config): Disposable`

## 依赖
- 上游：`webServer`、AuthorizationPolicy、JwtVerifier
- 下游：原 `/api` handler、`/api/remote.mux` upgrade、index fallback

## 故障处理
- 包装期间抛错记入 DSH/Cordis logger。

## 示例
见 `docs/architecture.md` 运行时流程。
