# Proposal

## Why

`connection.requestRejection` / `authorizeIndex` 是 `connection` 服务上公开给**每一个路由所有者**的准入检查，不是 `/api` 私有物。2.0.0 的 Hook A 只包装了 `/api` 前缀、`/api/remote.mux` upgrade 与 index fallback，于是第三方插件注册的路由拿不到 Access JWT 的 Cookie 豁免。

现场表现：`dshmarket` 1.66.13 起把它的 48 条 `/dsh-market/*` exact 路由都放在这道检查后面（dsh-market#603，修复未授权读写与安装的 RCE）。在 Cloudflare Access 后面，这些路由继续索要 DSH launch-token Cookie，对已由 Access 认证的浏览器回 401 —— 即使 `Cf-Access-Jwt-Assertion` 有效，`/api` 也一切正常。

同时 DSH 已发布 `0.2.0-rc.2`，`peerDependencies` 里的精确版本使 `dsh plugin add` 直接拒绝安装（`Exact-version exemption: not active`）。

来源：Access 后的 Web profile 现场故障（`/dsh-market/*` 全 401）、DSH `0.2.0-rc.2` 安装包核对与 live 探针。

## What Changes

- 豁免标记（跳过 DSH launch-token Cookie）覆盖每一条注册路由与每一个 upgrade。
- `policy` 的 deny 仍只作用于 `/api` 前缀、`/api/remote.mux` 与 index fallback；不属于本插件的路由在无 JWT / 无效 JWT 时不标记也不拒绝，行为与未安装本插件时一致。
- peer 范围改为 `^0.1.5-alpha.1 || ^0.2.0-rc.2`（`dsh-client-connection` / `dsh-host-webserver`）与 `^4.0.2`（`cordis`）。
- privileged 方法名单对照 `0.2.0-rc.2` 安装包重新核对，写明来源包与「取并集」的理由。
- 新增集成测试、验收标准与 ADR-0006；更新 README / CHANGELOG / docs / openspec 基线。

## Capabilities

### New Capabilities
- 无。

### Modified Capabilities
- `dsh-authorization`：豁免覆盖范围从「index、`/api`、`/api/remote.mux`」扩展到「每一条注册路由与 upgrade」；新增「不得拒绝不属于本插件的路由」；privileged 名单补上实测与并集要求。

## Impact

- 远程每次非 `/api` 请求多一次 JWT 验签（`jose` 的 Remote JWK Set 已缓存 JWKS，成本为一次本地验签）。
- `ordinary=required` 不再影响第三方插件路由，其准入由各自所有者裁决。
- peer 范围放宽到两条支持线；`0.1.5-alpha.1` 上的行为不变。
- 未标记时第三方路由与安装前完全一致：本插件既不放松也不收紧它们。

## Affected Docs

- `README.md` / `README.zh-CN.md`
- `CHANGELOG.md`
- `AGENTS.md`
- `docs/rules.md`
- `docs/architecture.md`
- `docs/protocols.md`
- `docs/overview.md`
- `docs/intake.md`
- `docs/services/dsh-compat-server.md`
- `docs/references/dsh-source-research.md`
- `docs/decisions/ADR-0006-route-coverage-for-cookie-substitution.md`
