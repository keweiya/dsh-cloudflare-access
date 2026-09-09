# 产品需求文档

## 状态
accepted

## 背景

DeepSeek Harness（DSH）允许通过 `--trusted-host` 从远程域名访问 Web。配置面走 Typert Remote。Settings UI 把非 loopback 页当作 memory-only，因此远程页仍须由本插件开启 capability。典型远程部署是：

```text
Browser → Cloudflare Access → Cloudflare Proxy → Origin Reverse Proxy → DeepSeek Harness
```

Cloudflare Access 已经完成身份认证，DSH 却无法识别该认证关系，仍把远程浏览器当作未认证客户端。结果是远程 Web UI 中 Settings、Credentials、Agent Preset 管理、Model discovery 不可用。

本项目补齐 Cloudflare Identity 到 DSH Authorization 的映射，且不引入第二套登录系统。

## 目标
- GOAL-1: 在 DSH Origin 验证 Cloudflare Access JWT（`Cf-Access-Jwt-Assertion`）。
- GOAL-2: 远程浏览器在 JWT 有效且 Host/Origin 合法时，可以使用 DSH 配置面 privileged API。
- GOAL-3: 远程 Web Client 能够尝试使用 Settings / Credentials / Agent Preset / Model discovery，由 Server 做最终裁决。
- GOAL-4: 普通 API 可按 `off | optional | required` 叠加 JWT 要求，默认不改变 DSH 原 trusted-host 行为。
- GOAL-5: 以标准 DSH Profile Bundle + Client Plugin 安装，无需修改 DSH 本体或手工编辑 Profile patch。
- GOAL-6: 插件卸载后 JWT 包装可逆，DSH 恢复未安装本插件时的行为。

## 非目标
- NON-GOAL-1: 提供账号、密码、MFA、登录页、Session 或用户数据库。
- NON-GOAL-2: 创建或管理 Cloudflare Access Application / Cloudflare API。
- NON-GOAL-3: 管理 nginx、自定义反向代理或 Origin 防火墙。
- NON-GOAL-4: 管理 DSH Agent 权限、Sandbox 权限或 Tool permissions。
- NON-GOAL-5: 远程开放 `host.pickDirectory` 或 `host.openPath`。
- NON-GOAL-6: 实现 RBAC 或按 Cloudflare 用户/组做细粒度授权。
- NON-GOAL-7: Fork DSH、patch 其 dist，或替换 Web 静态资源。
- NON-GOAL-8: 接入 DSH 插件市场（仅预留兼容方向）。

## 用户角色

### Origin 管理员
- 目标：把已有 Cloudflare Access 保护的 DSH 远程 Web 变成可管理的 Origin。
- 痛点：Access 已认证，但 DSH Settings 仍不可用；不想再做一套密码系统。
- 成功标准：用环境变量或 Cordis 配置指定 Team Domain 与 Audience 后，合法远程用户能管理 Settings，非法请求被拒绝。

### 远程操作者
- 目标：在 `https://dsh.example.com` 使用与本地 loopback 相同的配置面能力。
- 痛点：远程打开 Web 后 Settings 不可用，无法写凭据、管理 Preset 或发现模型。
- 成功标准：通过 Cloudflare Access 登录后，Settings / Models / Credentials / Agent Preset / Model discovery 可用。

### 本地开发者
- 目标：继续用 localhost 或 SSH tunnel 管理 DSH，不被 Cloudflare 配置打断。
- 痛点：插件可能误伤 loopback。
- 成功标准：loopback 不要求 JWT，privileged API 与官方 DSH 行为一致。

## 核心场景

### 场景 A：远程合法管理
- 触发条件：用户经 Cloudflare Access 打开 `https://dsh.example.com`。
- 用户操作：打开 Settings，修改模型/凭据，管理 Agent Preset，执行 model discovery。
- 系统响应：Client 允许发起 privileged RPC；Server 验证 Host/Origin 与 JWT 后放行。
- 成功结果：配置写入 Host，UI 可读写。

### 场景 B：远程非法或绕过 Access
- 触发条件：请求缺少 JWT、JWT 无效、错误 AUD/issuer、过期，或错误 Host/Origin。
- 用户操作：直接访问 Origin 或伪造 token，调用 privileged API。
- 系统响应：拒绝。配置缺失时同样拒绝远程 privileged。
- 成功结果：远程 privileged API 不可使用。

### 场景 C：本地 loopback 管理
- 触发条件：用户访问 `localhost` 或经 SSH tunnel 访问 loopback。
- 用户操作：使用 Settings 等官方功能。
- 系统响应：不检查 Cloudflare JWT，保持 DSH 原行为。
- 成功结果：本地管理不受插件影响。

### 场景 D：普通 API 策略切换
- 触发条件：管理员设置 `auth.ordinary` 为 `off` / `optional` / `required`。
- 用户操作：远程调用非特权 API。
- 系统响应：按 `docs/rules.md` 中 RULE-AUTH-ORDINARY-* 允许或拒绝；loopback 始终不受影响。
- 成功结果：三种模式行为可预测，且不削弱 Host/Origin 防护。

### 场景 E：安装与卸载
- 触发条件：管理员执行 `dsh plugin --profile web add dsh-cloudflare-access`，或移除该插件。
- 用户操作：安装后重启 DSH；卸载后再重启或热卸载。
- 系统响应：自动加入 Web Profile bundle stack；卸载后扩展全部撤销。
- 成功结果：无需改 DSH 本体，也无需手工改 Profile patch。

## 功能范围

### In Scope
- Cloudflare Access JWT 源站验证。
- 远程 privileged API 授权（settings / credentials / 特权 agentPreset / llm.discoverModels）。
- Web Client capability enablement。
- 普通 API 三种 JWT 模式。
- Env 与 Cordis 配置及 Env 锁定。
- 正式 DSH Bundle 与 Client Module。
- 单元测试、集成测试、README、SECURITY.md、CHANGELOG.md。

### Out of Scope
- 见非目标。
- 单个 JWT 验证结果缓存。
- 按 Cloudflare identity 做用户级 ACL。

## 验收标准摘要
- AC-1: 标准插件安装后自动加载，无需手工改 Profile patch，无需改 DSH 本体。
- AC-2: localhost privileged 功能保持可用且不要求 JWT。
- AC-3: 合法远程 JWT 请求可以使用 Settings / Credentials / Preset 管理 / Model discovery。
- AC-4: 非法远程请求不能使用 privileged API，包括错误 Host/Origin 即使 JWT 有效。
- AC-5: 普通 API 三种模式符合策略定义。
- AC-6: Cloudflare 轮换签名 key 后无需改配置、重启或重新发布插件。
- AC-7: 删除或禁用插件后 DSH 恢复官方远程 privileged 限制。

## Open Questions
- 见 `docs/intake.md`。
