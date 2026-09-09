# 需求摄取记录

## 状态
accepted

## 来源
- 来源 1：本仓库产品文档与 OpenSpec（`docs/product/`、`openspec/specs/`）。
- 来源 2：DeepSeek Harness 源码与 npm 包调研，当前版本 `0.1.5-alpha.1`。结论见 `docs/references/dsh-source-research.md`。
- 来源 3：CI 对照 DSH `0.1.5-alpha.1` npm 包跑本仓库单元/集成测试，不启动真实 DSH 进程。

## Facts
- FACT-1: 项目定位是 DSH Profile Bundle + Client Plugin，为 Cloudflare Access 后方的 DeepSeek Harness Origin 提供 JWT 再验证，并把认证结果映射为远程 privileged API 授权。
- FACT-2: 插件不提供账号、密码、MFA、登录页、Session、用户数据库、Cloudflare API 管理、nginx 管理或 DSH Agent/Sandbox 权限管理。
- FACT-3: 禁止 fork / 修改 DSH 安装目录 / patch 编译后的 DSH JS / 替换 Web 静态资源 / 修改 DSH 上游源码。
- FACT-4: 远程 privileged 请求必须同时通过 DSH 原有 Host/Origin 检查和有效 Cloudflare Access JWT；有效 JWT 不得绕过 Host/Origin。
- FACT-5: Loopback 访问不要求 Cloudflare JWT，privileged API 保持 DSH 原行为，以支持 `SSH Tunnel → localhost → DSH`。
- FACT-6: 远程 privileged API 固定要求有效 JWT，不提供关闭开关。覆盖 `settings/*`、`credentials/*`、特权子集 `agentPresets/*`、`llm/discoverModels`。
- FACT-7: 普通 API 的 JWT 策略可配置为 `off | optional | required`，默认 `off`。Loopback 不受该配置影响。
- FACT-8: Origin 只信任 HTTP Header `Cf-Access-Jwt-Assertion`，不以 `CF_Authorization` Cookie 作为身份依据。
- FACT-9: 用户只配置 `cloudflare.teamDomain` 与 `cloudflare.audiences`（多值）。`teamDomain` 规范化为 http(s) origin；`issuer` 等于该 origin，`jwksUrl = <origin>/cdn-cgi/access/certs`。
- FACT-10: 必须支持环境变量 `DSH_CF_ACCESS_TEAM_DOMAIN`、`DSH_CF_ACCESS_AUDIENCES`（逗号分隔）、`DSH_CF_ACCESS_ORDINARY_MODE`。优先级为 Environment > Cordis/Bundle Config > Default。环境变量一旦存在，运行时不得被 Web Settings 覆盖。
- FACT-11: JWT 验证必须使用成熟库（推荐 `jose`），覆盖 signature、alg、iss、aud、exp、nbf（存在时）。拒绝 unsigned、algorithm downgrade、错误 iss/aud、过期 token。
- FACT-12: 使用 Remote JWK Set 缓存与 key rotation；不缓存单个 JWT 验证结果。JWKS 不可用时 fail closed，禁止因 Cloudflare 网络异常而放行。
- FACT-13: 缺少 `teamDomain` 或 `audiences` 时插件可以启动，loopback 保持，远程 privileged API 必须 fail closed，并打明确日志。
- FACT-14: 安装形态必须是正式 `dsh.bundle`（`cordis.patch.yml`）+ `dsh.client`（`exports["./client"]`），使用 `dsh plugin --profile web add ...` 后无需手工改 Profile patch。
- FACT-15: 插件 unload 必须可逆，不得留下全局 monkey patch。
- FACT-16: 不实现 `host.pickDirectory`、`host.openPath`、用户名密码、MFA、用户数据库、RBAC、Cloudflare API、自动创建 Access Application、nginx 管理。远程页上因此出现的 native host UI 入口可以存在，对应 RPC 保持 403。
- FACT-17: License MIT；TypeScript；ESM；GitHub 开源；npm 公共包 `dsh-cloudflare-access`（https://www.npmjs.com/package/dsh-cloudflare-access）。
- FACT-18: DSH `0.1.5-alpha.1` 无公开 authorization hook。`connection.requestRejection` 同步，不能承载 jose JWKS。配置面走 Typert Remote。Client 通过 `connection.isLoopback` → `remote.$host.isLoopback` 决定 Settings persistence。完整调用链见 `docs/references/dsh-source-research.md`。
- FACT-19: `settings/*` 配置面方法、`credentials/*`、`agentPresets/read|copy|deletePreset`、`llm/discoverModels` 由本插件按 privileged 要求 JWT。`agentPresets/list|select`、`llm/listProviders|listConfigurableProviders` 按 ordinary。
- FACT-20: `dsh.client.immediately` 必须为 `true`，且 inject `@deepseek-ai/dsh-client-connection`。否则 Web boot 在 ui-settings 把 `isLoopback=false` 快照进 memory persistence 之后才加载本模块，远程 Settings 不会调用 `settings/describe`。
- FACT-21: 当前 target 是 DSH `0.1.5-alpha.1`。已在 Access 后的 Web profile 上 live 验证远程 Settings。CI 仍只跑本仓库单元/集成测试与 `pnpm pack:check`，不启动 DSH 进程。
- FACT-22: 生产配置应使用环境变量锁定 Team Domain / Audience。本插件不提供独立 Web Settings 表单来编辑这些信任根。
- FACT-23: 远程 + 有效 Access JWT 代替 DSH process launch token / `dsh-auth-*` Cookie（首页、`/api`、`/api/remote.mux`）。loopback 仍要求官方 token/Cookie。反向代理必须把 `Cf-Access-Jwt-Assertion` 转到 Origin。

## Assumptions
- ASSUMPTION-1: 兼容性矩阵与 peerDependencies 只声明已对照过的 DSH `0.1.5-alpha.1`，不提前写更宽范围。
- ASSUMPTION-2: npm 包名使用未加 scope 的 `dsh-cloudflare-access`。GitHub 仓库为 `Luawig/dsh-cloudflare-access`。
- ASSUMPTION-3: Cordis 配置面是可被后续 overlay 编辑的配置来源；环境变量覆盖该面。
- ASSUMPTION-4: 远程 WebSocket 事件通道 `/api/remote.mux` 按普通 API 策略处理，不属于 privileged 集合。
- ASSUMPTION-5: 在 DSH 无公开授权钩子的前提下，将 Host 路由包装与 Client `isLoopback` 包装隔离在 `compat/`，JWT/policy 核心不依赖 DSH 内部符号。
- ASSUMPTION-6: Client 把远程页的 `connection.isLoopback` 视为 capability enablement（仅 UI），安全裁决仍在 Server。

## Open Questions
- 无。

## Pending Decisions
- DECISION-3: 何时提交 dsh.pub / 插件市场 listing。当前安装路径是 `dsh plugin --profile web add dsh-cloudflare-access`。

## Resolved Decisions
- DECISION-1: 后续版本从 GitHub Actions 使用 `npm publish --provenance`；v0.1.0 未带 provenance。
- DECISION-2: 使用 Dependabot（npm 与 GitHub Actions，weekly）。

## Reference Signals

### 可借鉴模式
- REF-1: Cloudflare Access Origin 验证 `Cf-Access-Jwt-Assertion`，JWKS 来自 Team Domain `/cdn-cgi/access/certs`。
- REF-2: DSH 正式 out-of-tree bundle：`package.json` 的 `dsh.bundle.patch` + `dsh.client` + `exports["./client"]`。社区发行约定见 https://dsh.pub/develop-plugin.md。
- REF-3: `jose.createRemoteJWKSet()` 负责 JWKS cache、cooldown、kid miss refresh、key rotation。

### 不适用模式
- REF-4: 不要把 Cloudflare Access Application 创建、Zero Trust Dashboard 自动化或 Cloudflare API token 管理做进插件。
- REF-5: 不要用 Cookie `CF_Authorization` 做 Origin 身份。
- REF-6: 不要 fork DSH 或替换 connection 整包作为正常安装方式。

### 需要适配后采用
- REF-7: DSH `webServer.register` 包装作为 Server 授权插入点。适配条件：包装必须发生在 `connection` 注册 `/api` 之前；unload 时恢复原方法；JWT 不能跳过 Host/Origin。
- REF-8: DSH Client `connection.isLoopback` 包装作为 capability enablement。适配条件：Client 不做 JWT 判断；`immediately: true`；本插件不把 native directory-picker / `host.openPath` 列入 privileged 放行集合；unload 时恢复原值。
