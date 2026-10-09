# 项目概览

## 状态
accepted

## 范围

`dsh-cloudflare-access` 是 DeepSeek Harness 的 out-of-tree Profile Bundle。它在 Origin 验证 Cloudflare Access JWT，并把验证结果叠加到 DSH 已有 Host/Origin 防护之上，用于远程开放配置面 privileged API。同时提供 Web Client Module，让远程浏览器愿意发起这些 RPC。

本仓库不包含 DSH 本体、Cloudflare 控制面或反向代理配置，只提供插件包及其文档、测试与发布元数据。

## 目标
- 把 Cloudflare Access 的认证结果映射为 DSH 授权。
- 保持 DSH 原安全边界，只增加一层 Origin 再验证。
- 用可卸载的 Cordis 插件实现，不修改 DSH dist/source。

## 非目标
- 替代 Cloudflare Access。
- 替代 DSH 的 trusted-host / Host / Origin / Sandbox / Agent / Tool 权限。
- 提供独立 IdP。

## 核心原则
PRINCIPLE-1: 最小职责。只做 JWT Authentication + DSH Remote Authorization + Remote Client Capability Enablement。

PRINCIPLE-2: 附加安全层，不是替换安全层。有效 JWT 永远不意味着允许任意 Host/Origin。

PRINCIPLE-3: Fail closed。远程 privileged 在缺配置、缺 token、验签失败、JWKS 不可用时一律拒绝。

PRINCIPLE-4: Loopback 行为保持官方默认，不要求 Cloudflare。

PRINCIPLE-5: Server 是唯一权限裁决者。Client 只负责 capability enablement，不在浏览器验证 JWT。

PRINCIPLE-6: DSH 版本相关接入集中在 `compat/`，不得与 JWT 核心耦合。

PRINCIPLE-7: 插件效果必须可逆。unload 后不得留下包装、路由替换或全局 patch。

## 关键概念
- **Privileged API**：本插件 JWT 放行的配置面 Remote，见 `docs/protocols.md`。
- **Ordinary API**：DSH 自己面上其余 `/api` 方法以及 `/api/remote.mux`；是否要求 JWT 由 `auth.ordinary` 决定。第三方插件注册的路由不属于该模式的范围。
- **Team Domain**：Cloudflare Access 团队域名，同时作为 JWT issuer 与 JWKS 基址。
- **Capability enablement**：Client 允许 UI 发起 Host settings RPC；成功与否由 Server 决定。
- **compat 适配**：针对 DSH 无公开 auth hook 的可逆包装；target 为 `0.1.5-alpha.1` 与 `0.2.0-rc.2`。

## 术语表
- **DSH**：DeepSeek Harness。
- **Access JWT**：Cloudflare 注入的 `Cf-Access-Jwt-Assertion`。
- **Loopback**：Host 为 localhost / 127.0.0.1 / ::1 等本机回环地址。
- **trusted-host**：DSH `--trusted-host` / `trustedHosts`，是 DNS-rebinding 栅栏，不是认证。
- **Profile Bundle**：带 `dsh.bundle` 的 npm 包，安装时自动进入 profile bundle stack。
- **Client Module**：带 `dsh.client` 与 `exports["./client"]` 的浏览器插件。

## Open Questions
- 见 `docs/intake.md`。
