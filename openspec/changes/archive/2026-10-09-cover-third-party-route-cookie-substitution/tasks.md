# Tasks

## 1. 路由覆盖

- [x] 1.1 `src/compat/dsh.ts`：`register` 包装每一条路由；仅当 `isApiPrefix(route)` 时才应用 deny（`specs/dsh-authorization`）。
- [x] 1.2 `src/compat/dsh.ts`：`registerUpgrade` 包装每一个 upgrade；仅当 `isRemoteMuxUpgrade(route)` 时才应用 deny。
- [x] 1.3 `src/compat/dsh.ts`：`registerFallback` 保持 deny + mark，并注释说明它属于 DSH 自己的面。
- [x] 1.4 抽出 `marksBrowserSession(gate)`，让 `deny` 分支的类型收窄成立。
- [x] 1.5 文件头注释写明「豁免覆盖所有路由 / deny 只留给 DSH 自己的面」及其理由。

## 2. DSH 0.2.0-rc.2 适配

- [x] 2.1 `package.json`：peer 范围改为 `^0.1.5-alpha.1 || ^0.2.0-rc.2`（connection / webserver）与 `^4.0.2`（cordis）；版本升到 `2.1.0`。
- [x] 2.2 对照 `0.2.0-rc.2` 安装包核对 `webServer` / `connection` / `api-request-trust` 扩展点，记录在 `docs/references/dsh-source-research.md` 第 8 节。
- [x] 2.3 对照 `dsh-api-settings-controller` / `dsh-agent-preset-registry` / `dsh-llm` 核对 privileged 名单，写明来源与并集理由（`src/server/policy.ts`）。
- [x] 2.4 `src/compat/api-path.ts` / `src/compat/dsh-trust.ts` 注释标明实测版本范围。

## 3. 测试

- [x] 3.1 集成测试：第三方 exact 路由 + 有效 JWT → 标记，`requestRejection` 返回 `undefined`。
- [x] 3.2 集成测试：无 JWT / 无效 JWT → 不标记，路由自己的 401 生效。
- [x] 3.3 集成测试：loopback 第三方路由仍走官方 token/Cookie。
- [x] 3.4 集成测试：`ordinary=required` 不拒绝第三方路由，但仍拒绝 DSH 自己的普通 `/api`。
- [x] 3.5 集成测试：第三方 upgrade 在有效 JWT 后被标记。
- [x] 3.6 policy 测试：`0.2.0-rc.2` 实测的 privileged 端点全部命中。
- [x] 3.7 packaging 测试：peer 范围断言更新。

## 4. 文档与规范

- [x] 4.1 `CHANGELOG.md` 新增 2.1.0。
- [x] 4.2 `README.md` / `README.zh-CN.md`：新增「Access JWT 覆盖哪些路由」小节、ordinary 范围、排障行、兼容性矩阵。
- [x] 4.3 `AGENTS.md` / `docs/rules.md`：新增覆盖范围约束与 RULE-COMPAT-ROUTE-SCOPE；RULE-PACKAGING-PEER 更新。
- [x] 4.4 `docs/services/dsh-compat-server.md`：RULE-SERVICE-COMPAT-2 改写，新增 RULE-SERVICE-COMPAT-6。
- [x] 4.5 `docs/architecture.md` / `docs/protocols.md` / `docs/overview.md` / `docs/intake.md` / `docs/README.md` / `docs/product/*` 同步。
- [x] 4.6 `docs/decisions/ADR-0006-route-coverage-for-cookie-substitution.md`。
- [x] 4.7 `openspec/specs/dsh-authorization/spec.md` 基线更新 + 本 change 归档。

## 5. 验证

- [x] 5.1 `npm run build` 后提交的 `lib/` 与 `src/` 一致（本仓库 CI 用 `pnpm build` 复核）。
- [x] 5.2 `vitest run` 全绿（68 个用例）。
- [x] 5.3 `tsc --noEmit` 通过。
- [x] 5.4 打包内容包含 `lib/index.js`、`lib/client.js`、`cordis.patch.yml`、`README.md`、`LICENSE`。
- [x] 5.5 live 探针：Access 后实例上伪造 JWT → 403、loopback → 401、`/api` 行为不变。
