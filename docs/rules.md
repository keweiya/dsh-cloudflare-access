# 系统规则

## 状态
accepted

## 范围
定义全局约束、认证授权、配置、日志、生命周期与包装约束。规则必须可测试。

## 全局规则
RULE-GLOBAL-1: 本插件是 additional authentication / authorization，不是 replacement security layer。

RULE-GLOBAL-2: 有效 Cloudflare JWT 不得授权任意 Host 或 Origin。

RULE-GLOBAL-3: 禁止 fork DSH、修改 DSH 安装目录、patch 编译后的 JS、替换 Web 静态资源。

RULE-GLOBAL-4: DSH 版本适配代码只能放在 `src/compat/`。

## 认证授权规则

RULE-AUTH-LOOPBACK: Host 为 loopback 的请求不要求 Cloudflare JWT，privileged 与 ordinary 都按 DSH 原行为处理。

RULE-AUTH-HOST-ORIGIN: 任何远程放行之前必须通过 DSH 原有 Host/Origin/`sec-fetch-site` 检查。本插件不得跳过、伪造或放宽该检查。

RULE-AUTH-PRIVILEGED-METHODS: 远程 privileged 方法固定为：

- `settings/describe`
- `settings/openSettingsDocument`
- `settings/update`
- `settings/replace`
- `settings/mutate`
- `settings/canOpenAgentPresetDirectory`
- `settings/openAgentPresetDirectory`
- `credentials/describe`
- `credentials/set`
- `credentials/unset`
- `agentPresets/read`
- `agentPresets/copy`
- `agentPresets/deletePreset`
- `llm/discoverModels`

不得把 `host.pickDirectory`、`host.openPath`、`agentPresets/list`、`agentPresets/select` 放入该放行集合。

RULE-AUTH-PRIVILEGED-REMOTE: 远程 + privileged 必须提供有效 JWT。不得提供关闭该要求的配置项。

RULE-AUTH-FAIL-CLOSED: 远程 privileged 在以下情况必须拒绝：JWT 缺失、无效、过期、iss 不匹配、aud 不匹配、JWKS 不可用、`teamDomain` 或 `audiences` 未配置。禁止因 Cloudflare 网络异常而放行。

RULE-AUTH-TOKEN-SOURCE: 只从 HTTP Header `Cf-Access-Jwt-Assertion` 读取 token。Cookie `CF_Authorization` 不得作为 Origin 身份依据。

RULE-AUTH-ORDINARY-OFF: `auth.ordinary=off` 时，JWT 不参与普通 API 判断；继续使用 DSH 原 trusted-host / Origin 策略。这是默认值。

RULE-AUTH-ORDINARY-OPTIONAL: `auth.ordinary=optional` 时，无 JWT 则继续 DSH 原规则；有 JWT 则必须有效，无效拒绝。

RULE-AUTH-ORDINARY-REQUIRED: `auth.ordinary=required` 时，远程普通 API（含 `/api/remote.mux` upgrade）必须携带有效 JWT。

RULE-AUTH-UNCONFIGURED: `teamDomain` 或 `audiences` 为空时插件可以启动；loopback 不受影响；远程 privileged 拒绝；日志明确提示尚未配置。

## JWT 规则

RULE-JWT-LIBRARY: 必须使用成熟 JWT/JWKS 库（当前使用 `jose`）。禁止自实现 RSA、JWK 或 JWT parser。

RULE-JWT-CHECKS: 验证必须包括 signature、alg、iss、aud、exp；nbf 存在时必须验证。拒绝 unsigned JWT 与 algorithm downgrade。`exp` / `nbf` 允许 30 秒时钟偏差，超出仍拒绝。

RULE-JWT-ISS: `iss` 必须等于规范化后的 `teamDomain`。规范化结果是 http(s) origin：缺 scheme 时补 `https://`，去掉 path 与尾斜杠；已有 `http://` 或 `https://` 时保留该 scheme 与端口。

RULE-JWT-AUD: 配置的 `audiences` 命中 token aud 中任一值即通过；token 无 aud 或都不匹配则拒绝。

RULE-JWT-JWKS: 必须使用 Remote JWK Set。禁止每个请求都拉取 JWKS，也禁止进程启动下载一次后永不更新。

RULE-JWT-NO-RESULT-CACHE: 不得缓存单个 JWT 的验证结果。只缓存 JWKS。

## 配置规则

RULE-CONFIG-PRECEDENCE: 优先级固定为 Environment Variables > Cordis / Bundle Config > Default Values。

RULE-CONFIG-ENV-LOCK: 某个键对应的环境变量存在时，该键的运行时值不得被 Cordis 配置或 Web Settings 覆盖。

RULE-CONFIG-ENV-NAMES: 必须识别：

- `DSH_CF_ACCESS_TEAM_DOMAIN`
- `DSH_CF_ACCESS_AUDIENCES`（逗号分隔，去空白）
- `DSH_CF_ACCESS_ORDINARY_MODE`（`off` | `optional` | `required`）

RULE-CONFIG-DERIVE: 不要求用户配置 issuer 或 jwksUrl。`issuer` 等于规范化后的 `teamDomain` origin，`jwksUrl = <origin>/cdn-cgi/access/certs`。

## 日志规则

RULE-LOG-NO-SECRETS: 禁止记录完整 JWT、`Cf-Access-Jwt-Assertion` 值、Cookie、credential 内容、API key。

RULE-LOG-CATEGORIES: JWT 失败日志只能使用类别：`expired`、`invalid_signature`、`issuer_mismatch`、`audience_mismatch`、`missing_token`、`jwks_unavailable`、`unconfigured`、`malformed`。

RULE-LOG-BOOT: 启动时记录插件已初始化、issuer 是否配置、audience 数量、ordinary 模式。配置缺失时必须明确提示。

## 客户端规则

RULE-CLIENT-NO-SECURITY: Client Plugin 不得在浏览器验证 Cloudflare JWT，不得根据 Cookie 判断登录，不得根据浏览器 JS 决定 privileged 权限。

RULE-CLIENT-CAPABILITY: Client 只允许远程 Web 尝试 Host Settings / Credentials / Agent Preset / Model discovery。Server 始终是最终裁决者。

RULE-CLIENT-NO-NATIVE-HOST-AUTHZ: 即使 Client 为了解锁 Settings 而包装 `isLoopback`，Server 也不得因此放行 `host.pickDirectory` 或 `host.openPath`。

## 生命周期规则

RULE-LIFECYCLE-REVERSIBLE: unload 必须撤销所有扩展，DSH 恢复官方默认行为。

RULE-LIFECYCLE-NO-GLOBAL-PATCH: 允许在 `compat/` 内对服务方法进行可恢复包装；disposer 必须把原方法/属性写回。unload 后不得残留包装。

## 包装规则

RULE-PACKAGING-BUNDLE: `package.json` 必须声明 `dsh.bundle.patch` 指向 `cordis.patch.yml`，并 export `./cordis.patch.yml`。patch 行 `name` 必须等于 npm 包名。

RULE-PACKAGING-CLIENT: 必须提供构建完成的 `exports["./client"]` 与 `dsh.client.platform = web`。`dsh.client.immediately` 必须为 `true`，`inject` 必须包含 `@deepseek-ai/dsh-client-connection`。安装后无需用户编译 DSH Web。

RULE-PACKAGING-PEER: `peerDependencies` 只声明实际验证过的 DSH API 范围；当前对准 `0.1.5-alpha.1`，禁止提前写宽泛范围。

RULE-PACKAGING-ARTIFACTS: Git 树与 npm tarball 必须包含 `lib/index.js`、`lib/client.js`、`README.md`、`LICENSE`。`lib/client.js` 必须是 `window.__ModuleLoader__.load` factory。`keywords` 必须包含 `dsh-plugin`。作为依赖安装时，若 `lib/` 已存在，`prepare` 不得要求本机安装 TypeScript 或 esbuild。

## 无效模式
- Cloudflare 故障时 fail open。
- 用 Cookie 代替 assertion header。
- 把 Host 改成 `127.0.0.1` 以绕过 DSH 信任栅栏。
- 在 Client 里“验证通过才显示 Settings”。
- 替换整个 `connection` 插件行作为默认安装方式。
- 使用 `connection.rpc.intercept` 做认证。
- 把 DSH 内部 import 写进 `cloudflare-jwt.ts`。

## 示例

### 正确模式
远程 privileged：Host/Origin 通过 → JWT 有效 → 原 `/api` handler。

### 错误模式
远程 privileged：JWT 有效 → 跳过 Host 检查 → 放行。
