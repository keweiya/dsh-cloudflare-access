# Design

## 问题结构

一个包装层要同时做两件范围不同的事：

| 职责 | 正确的范围 | 错误的范围会怎样 |
| --- | --- | --- |
| 豁免：让 `requestRejection` 对已由 Access 认证的请求返回 `undefined` | 每一条注册路由与 upgrade | 第三方路由（`/dsh-market/*`）在 Access 后回 401 |
| 拒绝：返回 401/403 拦住请求 | 仅 DSH 自己的面 | `ordinary=required` 把第三方静态资源、健康检查、webhook 一起挡掉 |

2.0.0 把两者都绑在 `isApiPrefix(route)` 上，于是两件事同时做错了一个方向。

## 选定方案

在 `installServerCompat` 的包装层里拆开：

```ts
const policyRoute = isApiPrefix(route)            // 或 isRemoteMuxUpgrade(route)
handler: async (req, res) => {
  const gate = await authorize(req, deps)
  if (policyRoute && gate.action === 'deny') { /* 401/403 */ return }
  markAndForward(req, marksBrowserSession(gate))
  await inner(req, res)
}
```

`register` / `registerUpgrade` 用同一形状；`registerFallback` 保持原有的「deny + mark」，因为 fallback 服务的是 DSH 自己的 index 与静态资源，属于第一方面。

`marksBrowserSession(gate)` 收窄类型：`deny` 分支不携带 `skipBrowserSession`，而 `policyRoute` 条件让 TypeScript 无法自行收窄。

## 为什么不在 `requestRejection` 里验签

该回调同步，装不下 jose JWKS 的异步解析（ADR-0005 已记录）。因此必须在异步包装层验签，并把结果作为「请求已由 Access 认证」的标记留在请求对象上，供后续同步的 `requestRejection` 读取。

## 安全性论证

豁免是纯增量的：

- 只在 `remoteHostTrusted && jwt.outcome === 'valid'` 时标记；从不放宽 Host/Origin 栅栏。
- 需要同时满足 `Host` ∈ 声明过的 `trustedHosts`（非 loopback）**且** JWT 通过签名 / `iss` / `aud` / 过期校验。攻击者既不能伪造 Host，也不能伪造 JWT。
- loopback 不读 JWT、不标记。
- 未标记时第三方路由与安装前完全一致 —— 本插件不会让任何第三方路由比原来更宽松，也不会更严格。

## 跨站请求

`skipBrowserSession` 使用 `remoteHostTrusted`（故意忽略 `sec-fetch-site`，以兼容 Access 登录回调）。这一取舍在 2.0.0 就存在于 `/api` 上，本次改动不引入新的类别：第三方路由自身仍可用 `Origin` 做同源检查（dshmarket 即如此），而 DSH 的 `/api` 是 JSON-RPC，跨站预检会先被拦下。

## DSH 0.2.0-rc.2 适配

| 项 | 结论 |
| --- | --- |
| `webServer.register` / `registerUpgrade` / `registerFallback` | 签名与语义不变 |
| `connection.requestRejection` / `authorizeIndex` / `trustedHosts` | 存在且语义不变 |
| `api-request-trust` | 与 `src/compat/dsh-trust.ts` 副本一致（rc.2 多一个 `assertTrustedAuthority`，本插件不需要） |
| peer 版本 | connection / webserver `0.2.0-rc.2`，cordis `4.0.4` → 范围 `^0.1.5-alpha.1 \|\| ^0.2.0-rc.2`、`^4.0.2` |
| privileged 端点 | `settings/*` / `credentials/*` 仍来自 `dsh-api-settings-controller`；`agentPresets/*` 在 `dsh-agent-preset-registry/lib/typert.host.js` 中为 `list` `read` `select`；`llm/discoverModels` 仍在 `dsh-llm/lib/typert.host.js` |

## 备选方案

- 只标记 `/api`，让第三方插件各自验 CF JWT：会把身份逻辑复制到多个插件里，违背「身份仍在 Cloudflare Access，本插件只在 Origin 再验证一次」的边界。否决。
- 豁免与拒绝都铺到所有路由：会让 `ordinary=required` 越权拒绝不属于本插件的路由。否决。
