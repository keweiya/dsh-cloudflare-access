# ADR-0005 DSH 0.1.5-alpha.1 可逆 Hook 策略

## 状态
accepted

## 背景
DSH `0.1.5-alpha.1` 上：

- 配置面是 Typert Remote controllers，unary RPC 路径 `/api/<namespace>/<method>`。
- 事件通道是 `/api/remote.mux` WebSocket。
- `/api` 在 Host/Origin 之后还要求 DSH 自己的 browser-session Cookie。
- Settings persistence 从 `connection.isLoopback` 复制到 `remote.$host.isLoopback`。
- 没有公开 authorization hook。`connection.requestRejection` 同步，不能承载 jose JWKS。

## 决策

三件套，不 fork DSH：

```text
Hook A → 包装 webServer.register / registerUpgrade（Server JWT 叠加）
Hook B → 包装 connection.isLoopback（Client capability）
Bundle C → dsh.bundle + dsh.client 自动安装
```

实现约束：

1. Hook A/B 的 DSH 符号只出现在 `src/compat/`。
2. Server 插件 `inject = ['webServer']`，确保在 connection 注册 `/api` 前包装 `register`。
3. 远程 + 有效 JWT：Host/Origin 通过后调用原 handler，并跳过 DSH launch-token Cookie。禁止伪造 loopback Host。
4. 不把 native directory-picker / `host.openPath` 式方法列入本插件 privileged 放行集合。
5. Client 不验证 JWT。
6. unload 恢复原函数与属性。
7. loopback 仍要求 DSH process launch token / `dsh-auth-*` Cookie。远程在 Access JWT 有效时不再要求该 Cookie。

## 备选方案
- 方案 A：等待 DSH 上游提供正式 auth hook。仍无公开 authorization service。
- 方案 B：远程用 Cloudflare JWT 代替 DSH browser-session。Access 已证明远程身份；loopback 仍保留进程令牌。采用。
- 方案 C：把 JWT 验签放进 `connection.requestRejection`。该回调同步，装不下 JWKS。改为在异步包装层验签后，对通过的请求跳过 Cookie 的 401。

## 影响
- 正向影响：JWT 叠加层可逆；远程 Access 用户不必再打开 `?token=` URL；配置面 RPC 能到达 Remote controllers。
- 负向影响：compat 与 DSH 内部路由/endpoint 名称绑定；升级 DSH 必须对照 Remote map。Client 包装 `isLoopback` 仍可能让 native host UI 出现。Origin 必须收到 `Cf-Access-Jwt-Assertion`。loopback 与直连 Origin（无 JWT）仍受 DSH Cookie 约束。

## 相关文档
- `docs/architecture.md`
- `docs/references/dsh-source-research.md`
- `docs/services/dsh-compat-server.md`
