# 验收标准

## 状态
accepted

## 全局验收标准
- AC-INSTALL-1: `dsh plugin --profile web add dsh-cloudflare-access` 后，profile 自动加入 bundle，无需手工修改 `$DSH_HOME/profiles/web/cordis.patch.yml`。
- AC-INSTALL-2: 不修改 DSH 安装目录、不替换 Web 静态资源、不 patch 编译后的 DSH JS。
- AC-INSTALL-3: 重启 DSH 后 Server Plugin 与 Client Module 自动加载。
- AC-INSTALL-4: 远程打开 Settings 时浏览器发起 `settings/describe`，而不是因 `isLoopback=false` 快照停留在 memory persistence。`dsh.client.immediately` 必须为 `true`。
- AC-LOCAL-1: 访问 localhost 时 Settings / Credentials / Preset / Model discovery 保持可用，且不要求 Cloudflare JWT。
- AC-REMOTE-OK-1: `dsh.example.com` + 有效 JWT + 正确 aud + 正确 issuer + 合法 Host/Origin 时，Settings 可打开、Models 可加载、Credentials 可写入、Agent Preset 管理可用、Model discovery 可用，且不要求 DSH `?token=` / `dsh-auth-*` Cookie。
- AC-REMOTE-DENY-1: 无 JWT、错误 JWT、错误 AUD、错误 issuer、过期 JWT、错误 Host、错误 Origin 时，远程 privileged API 均不可使用。
- AC-REMOTE-DENY-2: 有效 JWT + 非法 Host/Origin 仍然拒绝。
- AC-ORDINARY-1: `off` / `optional` / `required` 三种普通 API 模式符合 `docs/rules.md` 中 RULE-AUTH-ORDINARY-*。
- AC-ROTATE-1: Cloudflare 更换签名 key 后，无需改插件配置、重启 DSH 或重新发布插件；JWKS 刷新后验证恢复。
- AC-UNLOAD-1: 删除或禁用插件后，本插件的 JWT 包装与 Cookie 跳过消失，无残留 `register` / `registerFallback` / `isLoopback` / `requestRejection` 包装。

## 场景验收标准

### 场景 A：远程合法管理
- GIVEN 远程浏览器已通过 Cloudflare Access，Origin 收到有效 `Cf-Access-Jwt-Assertion`
- AND Host 为 trusted-host
- WHEN 用户打开 Settings 并调用 `settings/describe` / `settings/mutate`
- THEN Server 放行，Client 能完成 Host persistence
- AND 不要求 DSH launch-token Cookie（Access 登录回调即使是 `sec-fetch-site: cross-site` 也如此）

### 场景 B：远程非法请求
- GIVEN 远程 privileged 请求缺少 header、签名失败、iss/aud 不匹配、过期，或配置缺失
- WHEN 调用 `settings/*` / `credentials/*` / 特权 `agentPresets/*` / `llm/discoverModels`
- THEN 请求被拒绝
- AND 缺 token 归类为未认证，token 存在但无效归类为禁止

### 场景 C：本地 loopback
- GIVEN Host 为 loopback
- WHEN 不携带 JWT 调用 privileged API
- THEN 按 DSH 原行为允许

### 场景 D：普通 API
- GIVEN 远程请求已通过 DSH Host/Origin
- WHEN `ordinary=off` 且无 JWT
- THEN 允许
- WHEN `ordinary=optional` 且 JWT 无效
- THEN 拒绝
- WHEN `ordinary=required` 且无 JWT
- THEN 拒绝

### 场景 E：安装卸载
- GIVEN 插件已安装并放行过远程 privileged
- WHEN unload
- THEN 同样的远程 privileged 请求回到官方 403/forbidden 行为

## 非功能验收标准
- 性能：不在每个请求上拉取 Cloudflare JWKS；不缓存单个 JWT 结果。Host/Origin 失败、loopback、以及 `ordinary=off` 且无 Access JWT 的普通 API 不进行 JWT 验签。远程若带了 Access JWT 则验签，用于跳过 DSH Cookie。
- 安全：fail closed；JWT 不能替代 Host/Origin；日志不记录 token / Cookie / credential / API key。
- 可观测性：启动时记录 issuer 是否配置、audience 数量、ordinary 模式；失败记录原因类别。
- 兼容性：README 兼容性矩阵只写 `2.0.x` / `0.1.5-alpha.1`。peerDependencies 不声明未测范围。

## 不验收事项
- 远程 `host.pickDirectory` / `host.openPath` 可用。
- 因 Client `isLoopback` capability wrap 而出现的 native host UI 入口被隐藏。
- Cloudflare Access Application 自动创建。
- 插件市场安装。
- 按 Cloudflare 用户或 group 的细粒度 ACL。
