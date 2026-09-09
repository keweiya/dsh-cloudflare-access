# 架构图

## 状态
delivered

## 范围
给 README 与 `architecture.md` 配图。图内文案为英文，与根目录 README 一致。交互图由 Archify 绘制，源 JSON、HTML 和导出的 SVG 在 `docs/assets/archify/`。根目录 README 按章节内嵌四张 SVG。

普通 API 的 `off | optional | required` 不单独配图，见 README 表格。

打开 HTML 可切换主题、走 Guided Views、导出 SVG/PNG。GitHub 不能内嵌这些 HTML，clone 后用浏览器打开即可。

---

## 图 1 部署模型

**结论：** 插件在 DSH 进程内，不替代 Access，也不替代 Origin 网络控制。

**交互图：** [deployment.html](./assets/archify/deployment.html)  
**源：** [deployment.architecture.json](./assets/archify/deployment.architecture.json)

![部署模型](./assets/archify/deployment.svg)

Internet → Cloudflare Access → Cloudflare Proxy → Origin 允许名单 → 反向代理（本仓库不管理）→ DeepSeek Harness（`--trusted-host`）→ Server（JWT + policy）与 Client（仅 capability）。

---

## 图 2 远程 privileged 请求路径

**结论：** Host/Origin 先于 JWT；JWT 有效也不得改写 Host。成功则交给原 `/api` handler。

**交互图：** [privileged-request.html](./assets/archify/privileged-request.html)  
**源：** [privileged-request.workflow.json](./assets/archify/privileged-request.workflow.json)

![远程 privileged 请求路径](./assets/archify/privileged-request.svg)

Loopback 或 Host/Origin 失败交给 DSH 原 handler（不读 JWT）。privileged 且 JWT 有效：原 `/api` handler。缺失或无效：401 / 403，不进入业务实现。

---

## 图 3 Client 与 Server 职责

**结论：** 浏览器只做 capability enablement；能不能改 Settings 由 Origin 上的 Server 决定。

**交互图：** [client-server.html](./assets/archify/client-server.html)  
**源：** [client-server.architecture.json](./assets/archify/client-server.architecture.json)

![Client 与 Server 职责](./assets/archify/client-server.svg)

Client 包装 `connection.isLoopback`，`immediately: true`。不读 Cookie、不验 JWT。Server 校验 `Cf-Access-Jwt-Assertion`，并拒绝 `host.pickDirectory` / `host.openPath`。

---

## 图 4 配置优先级

**结论：** 环境变量存在即锁定；远程 Settings 改不了 Team Domain。

**交互图：** [config-precedence.html](./assets/archify/config-precedence.html)  
**源：** [config-precedence.architecture.json](./assets/archify/config-precedence.architecture.json)

![配置优先级](./assets/archify/config-precedence.svg)

Env > Cordis/Bundle > Default。空字符串也锁定。`issuer` 与 JWKS 由规范化后的 `teamDomain` origin 推导，用户不单独配置。
