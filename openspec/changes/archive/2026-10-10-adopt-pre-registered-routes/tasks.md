# Tasks

## 1. 采纳已注册路由

- [x] 1.1 `src/compat/dsh.ts`：抽出 `wrapHttpHandler` / `wrapUpgradeHandler` / `wrapFallbackHandler` 三个工厂，注册方法与采纳共用。
- [x] 1.2 `src/compat/dsh.ts`：激活时扫 `exact` / `prefixes` / `upgrades` 表与 `fallback`，就地替换 handler。
- [x] 1.3 `src/compat/dsh.ts`：`Symbol` 标记避免二次包装；还原闭包只在条目仍指向本插件包装时写回。
- [x] 1.4 `src/compat/dsh.ts`：形状检测 + 跳过式降级；文件头注释写明「覆盖范围不得依赖激活顺序」。
- [x] 1.5 `WebServerLike` 增加 `exact` / `prefixes` / `upgrades` / `fallback` 的可选视图。

## 2. 测试

- [x] 2.1 `test/integration.test.ts`：`createFakeWebServer` 改成 DSH 真实形状（按 path 存表 + `routes` 读取视图）。
- [x] 2.2 新增 `routes registered before the plugin activated`：先注册的 exact 路由被采纳（有效 JWT 200 / 无 JWT 401）且 unload 还原。
- [x] 2.3 同上：先注册的 prefix 路由与 upgrade 被采纳。
- [x] 2.4 同上：先注册的 index fallback 被采纳。
- [x] 2.5 同上：二次激活不叠加包装（每次请求只验签一次）。

## 3. 版本与文档

- [x] 3.1 `package.json`：版本升到 `2.1.1`。
- [x] 3.2 `CHANGELOG.md`：新增 2.1.1 段落。
- [x] 3.3 `AGENTS.md`：新增「覆盖范围不得依赖激活顺序」约束。
- [x] 3.4 `docs/decisions/ADR-0006-…md`：补记 2.1.1 的实测证据与采纳决策，新增备选方案 D / E。
- [x] 3.5 `docs/services/dsh-compat-server.md`：职责补采纳，新增 RULE-SERVICE-COMPAT-7。
- [x] 3.6 `docs/architecture.md`：第三方插件路由流程补第 6 步。
- [x] 3.7 `docs/references/dsh-source-research.md`：新增 §8.1 激活顺序实测与路由表形状。
- [x] 3.8 `README.md` / `README.zh-CN.md`：故障排查行与兼容性矩阵 2.1.x 行。
- [x] 3.9 `docs/README.md`：版本号。
- [x] 3.10 `openspec/specs/dsh-authorization/spec.md`：基线增加「先注册的路由也必须被采纳」场景。

## 4. 验证

- [x] 4.1 `npm test`（72 例）。
- [x] 4.2 `npm run typecheck`。
- [x] 4.3 `npm run build` 两次产物一致（零漂移）。
- [x] 4.4 真实 `dshmarket@1.66.14` 代码 + 真实 `jose` 验签，两种挂载顺序均通过。
- [x] 4.5 `npm pack` 产物内容与已提交 `lib/` 一致。
- [ ] 4.6 线上：重装 2.1.1 后用未知-kid 时序探针确认市场路由走验签。
