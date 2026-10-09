# 系统架构

## 状态
accepted

## 范围
定义插件在 DSH 进程内的模块边界、运行时请求路径、Client 注入方式，以及推荐部署模型。

## 选定架构

插件作为 DSH 进程内的 Cordis 组合层，而不是独立反向代理。部署与请求路径图见 `docs/diagrams.md`。

```text
Internet
   ↓
Cloudflare Access
   ↓
Cloudflare Proxy
   ↓
Origin Network Controls
   ↓
Reverse Proxy (nginx 等，本仓库不管理)
   ↓
DeepSeek Harness
   ↓
dsh-cloudflare-access
   ├─ Server: JWT verify + policy
   └─ Client: capability enablement
```

DSH `0.1.5-alpha.1` 与 `0.2.0-rc.2` 都没有公开 authorization hook。架构选择是：

```text
Hook A → Server authorization
Hook B → Client capability
Bundle C → 自动安装
```

不修改 DSH dist/source。版本相关包装只存在于 `compat/`。决策见 `docs/decisions/ADR-0005-dsh-015-hook-strategy.md`（hook 选择）与 `docs/decisions/ADR-0006-route-coverage-for-cookie-substitution.md`（豁免与拒绝各自的范围）。

## 系统组件

### ConfigResolver
- 职责：合并 Env、Cordis config 与默认值；标记哪些键被环境变量锁定。
- 非职责：校验 JWT、读写 DSH settings 文档。
- 上游：`process.env`、插件 `Config`。
- 下游：JwtVerifier、AuthorizationPolicy、日志。

### JwtVerifier
- 职责：从 `Cf-Access-Jwt-Assertion` 取值，用 `jose` + Remote JWK Set 验证 signature/alg/iss/aud/exp/nbf。
- 非职责：Host/Origin 判断、RPC 方法分类、Client UI。
- 上游：HTTP 请求头、ConfigResolver。
- 下游：AuthorizationPolicy。

### AuthorizationPolicy
- 职责：按 loopback / privileged / ordinary 模式给出 allow/deny 与错误类别。
- 非职责：实现 JWKS、修改 DSH 路由表。
- 上游：请求元数据、JwtVerifier 结果。
- 下游：compat 层的路由包装。

### DshCompatServer
- 职责：在 `webServer.register` / `registerUpgrade` / `registerFallback` 上做可逆包装。豁免标记覆盖每一条注册路由与每一个 upgrade（`connection.requestRejection` 是宿主开放给所有路由所有者的检查，第三方插件也用它）；JWT policy 的 deny 只作用于 `/api`、`/api/remote.mux` 与 index fallback。远程 + 有效 JWT 在 Host/Origin 通过后交给原 handler，并跳过 DSH launch-token Cookie。不伪造 loopback Host。
- 非职责：JWT 解析、普通业务 RPC、替第三方路由裁决准入。
- 上游：`webServer`、AuthorizationPolicy。
- 下游：DSH 原 `/api` handler、第三方插件注册的路由与 upgrade。

### DshCompatClient
- 职责：可逆包装 `connection.isLoopback`，让远程 Web 使用 Host settings persistence 并尝试 privileged RPC。
- 非职责：在浏览器验证 JWT、根据 Cookie 判断登录。
- 上游：`connection` 服务。
- 下游：DSH UI plugins（ui-settings 等）。

### BundleManifest
- 职责：通过 `dsh.bundle` 插入 Server 插件行，通过 `dsh.client` 注册浏览器模块。
- 非职责：用户手工维护 profile patch。

## 架构规则
RULE-ARCH-1: JWT 核心（config / jwt / policy）不得 import DSH 内部未公开模块；所有 DSH 符号依赖必须位于 `src/compat/`。

RULE-ARCH-2: Server 包装必须发生在 `client-connection` 注册 `/api` 之前。实现方式是插件 `inject = ['webServer']`，不注入 `webRuntime`，从而早于 connection 行激活。

RULE-ARCH-3: 远程 privileged 放行路径必须先复用或等价执行 DSH Host/Origin 检查，再验证 JWT，最后交给原 `/api` handler。禁止把 Host 改写成 loopback。

RULE-ARCH-4: 插件 unload 必须恢复 `webServer.register` / `registerUpgrade` / `registerFallback`、`connection.requestRejection` / `authorizeIndex` 与 `connection.isLoopback` 的原行为。

RULE-ARCH-5: 不得占用 `connection.rpc.intercept`。该槽位已被 Typert Gateway 使用。

RULE-ARCH-6: Client 模块必须 `dsh.client.immediately: true` 且 inject `@deepseek-ai/dsh-client-connection`，否则 Web boot 会在 ui-settings 把 `remote.$host.isLoopback=false` 快照进 memory persistence 之后才加载本模块。

## 运行时流程

### 远程 privileged HTTP
1. Cloudflare Access 认证浏览器并注入 `Cf-Access-Jwt-Assertion`。
2. 请求到达 DSH `webServer` 的 `/api` 前缀。
3. 本插件包装 handler 先做 Host/Origin（不得跳过）。
4. 识别 RPC 方法；若属于 privileged 且非 loopback，则验证 JWT。
5. JWT 有效则交给原 `/api` handler（Typert Remote），并跳过 DSH launch-token Cookie。
6. JWT 缺失或无效则拒绝，不调用 privileged 业务实现。

### 远程 ordinary HTTP
1. Host/Origin 仍由 DSH 原 handler 执行（包装层先按 ordinary 策略处理 JWT）。
2. `off`：无 JWT 不验签，交给原 handler。有 JWT 则验签：有效则跳过 DSH Cookie；无效不拒绝普通 API。
3. `optional`：无 JWT 不验签，交给原 handler；有 JWT 则必须有效。
4. `required`：必须有效 JWT，再交给原 handler。

### Loopback
1. 包装层识别 loopback 后直接交给 DSH 原 handler。
2. 不读取、不要求 JWT，也不跳过 DSH launch-token Cookie。

### 第三方插件路由（exact / upgrade）
1. 第三方插件（例如 dshmarket 的 `/dsh-market/*`）注册自己的路由，handler 内调用 `connection.requestRejection`。
2. 包装层先做 Host/Origin，再决定是否验签；远程 + 有效 JWT 时把该请求标记为已由 Access 认证。
3. handler 的 `requestRejection` 因此返回 `undefined`，不再索要 DSH launch-token Cookie。
4. 无 JWT / 无效 JWT 时不标记，也不拒绝：路由按自己的裁决返回，行为与未安装本插件时一致。
5. `ordinary` 模式不作用于这些路由——它们不属于 DSH 自己的面。
6. 插件激活时还会**采纳**已经注册在 webserver 表里的路由（`exact` / `prefixes` / `upgrades` / `fallback`）：第三方插件可以在本插件的 `apply` 之前就挂载（dshmarket 用 `ctx.inject(['webServer','loader'], …)` 实测如此），只包装注册方法会漏掉它们。

### Client
1. Client Module 在 `connection` 可用后把 `isLoopback` 包装为 capability 开启。
2. UI 发起 `settings/describe` 等 Remote。
3. Server 按上述流程裁决。
4. unload 时恢复 `isLoopback`。

## 部署模型

推荐：

```text
Internet
   ↓
Cloudflare Access
   ↓
Cloudflare Proxy
   ↓
Origin 仅允许 Cloudflare 网络
   ↓
Reverse Proxy
   ↓
DSH（--trusted-host dsh.example.com）
   ↓
dsh-cloudflare-access
```

插件不替代 Origin 网络控制。安装插件后仍不应把 DSH Origin 直接暴露到公网。

## 非目标
- 独立认证服务或 sidecar。
- 替换 `@deepseek-ai/dsh-client-connection` 整行。
- 在浏览器做 JWT 校验。
