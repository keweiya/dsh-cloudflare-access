# 范围说明

## 状态
accepted

## 当前版本范围

当前交付 Cloudflare Access JWT 在 DSH Origin 的再验证，以及远程配置面授权：

- JWT 验证：`Cf-Access-Jwt-Assertion`、iss、多 aud、exp/nbf、Remote JWKS。
- 授权：loopback bypass；远程 privileged 固定要求 JWT；普通 API 三种模式。
- Client：远程 Web 解锁 Settings / Credentials / Agent Preset 管理 / Model discovery 的尝试路径；`dsh.client.immediately: true`，在 ui-settings 快照 loopback 之前 prefetch。
- 包装：正式 `dsh.bundle` + `dsh.client`，Env/Cordis 配置。
- 质量：单元测试、集成测试、README、SECURITY.md、CHANGELOG.md、MIT npm 包。

目标 DSH 版本：`0.1.5-alpha.1`（已对照官方 npm 包扩展点）。兼容性矩阵只写该版本。

## 明确不做

- `host.pickDirectory`、`host.openPath` 的远程授权。
- 用户名密码、MFA、用户数据库、RBAC、Session。
- Cloudflare API、自动创建 Access Application。
- nginx / 反向代理管理。
- Fork 或 patch DSH dist/source。
- 单个 JWT 结果缓存。
- DSH 插件市场安装（后续候选）。

## 后续版本候选

- 兼容 DSH 插件市场安装。
- 随 DSH 新版本扩展 `compat/`，而不是放宽未测 peer range。
- 可选：按 Cloudflare identity group 做只读/读写分离（当前无需求）。
- 可选：隐藏远程页上因 capability wrap 出现但 Server 仍拒绝的 native host UI。

## 范围变更规则
RULE-SCOPE-1: 任何新增核心用户场景必须同步更新 `prd.md` 和 `acceptance-criteria.md`。

RULE-SCOPE-2: 任何影响架构、协议或数据模型的范围变更必须创建或更新 ADR。

RULE-SCOPE-3: 新增远程开放的 RPC 方法必须同时更新 privileged 方法清单、测试和 SECURITY.md；不得以“看起来像配置面”为理由隐式放行。
