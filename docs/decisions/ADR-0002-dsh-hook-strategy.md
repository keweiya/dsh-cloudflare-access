# ADR-0002 DSH 0.1.0-rc.5 可逆 Hook 策略

## 状态
superseded by ADR-0005

当前 live target 是 DSH `0.1.5-alpha.1`，见 `docs/decisions/ADR-0005-dsh-015-hook-strategy.md`。下文保留对 `0.1.0-rc.5` / `0.1.1-rc.2` 扩展点的记录。

## 背景
规格要求不修改 DSH 本体，并在编码前确认扩展点。对 DeepSeek Harness `0.1.0-rc.5` 源码的调研结论：

- 无正式 authorization hook。
- `PRIVILEGED_METHODS` 硬编码在 `@deepseek-ai/dsh-client-connection` 的 Fetch fallback 内，且用空 trustedHosts 调用 `isTrustedApiRequest`。
- `connection.rpc.intercept` 单槽已被 Typert Gateway 占用。
- Client 通过 `connection.isLoopback` 把 Settings 设为 `memory`，无公开 persistence override。
- Cordis `ctx.effect` / 服务方法包装可以在 unload 时恢复。

完整证据见 `docs/references/dsh-source-research.md`。

## 决策

采用三件套，不 fork DSH：

```text
Hook A → 包装 webServer.register / registerUpgrade（Server authorization）
Hook B → 包装 connection.isLoopback（Client capability）
Bundle C → dsh.bundle + dsh.client 自动安装
```

实现约束：

1. Hook A/B 的 DSH 符号只出现在 `src/compat/`。
2. Server 插件 `inject = ['webServer']`，确保在 connection 注册 `/api` 前包装 `register`。
3. 远程 privileged + 有效 JWT：Host/Origin 通过后直连 `apiProxy`，不伪造 loopback Host。
4. `host.pickDirectory` / `host.openPath` 不走放行路径。
5. Client 不验证 JWT。
6. unload 恢复原函数与属性。

## 备选方案
- 方案 A：等待 DSH 上游提供正式 auth hook。不适合 v0.1 交付。
- 方案 B：cordis.patch.yml 整行替换 `id: connection`。维护一份 connection fork，拒绝作为默认。
- 方案 C：只包装 `/api` 外层 handler 而不直连 apiProxy。无法放行 privileged，因为内部 pin 仍会 403。
- 方案 D：只包装 `settingsScope.bind`。无法覆盖 `WelcomeNoticeStore` 与 `SettingsDocumentStore` 对 `isLoopback` 的直接读取。

## 影响
- 正向影响：无需改 DSH dist；符合 Bundle 安装；可逆。
- 负向影响：compat 与 DSH 内部行为绑定，升级 DSH 必须跑集成测试。Client 包装 `isLoopback` 可能让 native host UI 出现，但 Server 仍拒绝这两类 RPC。这是 v0.1 已知限制。

## 相关文档
- `docs/architecture.md`
- `docs/references/dsh-source-research.md`
- `docs/services/dsh-compat-server.md`
- `docs/services/dsh-compat-client.md`
