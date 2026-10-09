# dsh-cloudflare-access

[English](./README.md)

面向 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的 Cloudflare Access JWT 再验证与远程 privileged 授权。

这是双面 **Profile Bundle + Web Client** 插件。它**不**替代 Cloudflare Access。身份仍在 Access。插件在 DSH Origin 再验证 `Cf-Access-Jwt-Assertion`，使 Settings、Credentials、Agent Preset 管理和模型发现可以在 `https://dsh.example.com` 这类远程主机名上工作。

不提供登录页、密码库、MFA、会话表或 Cloudflare API 客户端。

插件 **`2.1.x`** 支持 DeepSeek Harness **`0.1.5-alpha.1`** 与 **`0.2.0-rc.2`**。插件 **`2.0.x`** 是只支持 `0.1.5-alpha.1` 的那条线，**`1.0.x`** 是 DSH `0.1.2` 之前那条线（live 验证于 `0.1.1-rc.2`）。在[兼容性矩阵](#兼容性)更新之前，不要默认其他 DSH 版本可用。

## 架构

插件运行在 DSH 进程内。它不替代 Cloudflare Access，也不替代 Origin 允许名单。

![Deployment model](./docs/assets/archify/deployment.svg)

```text
Internet → Cloudflare Access → Cloudflare Proxy
       → Origin allowlist → reverse proxy → DSH → this plugin
```

Web Client 只做 capability enablement（`connection.isLoopback`）。授权裁决留在 Origin 上的 Server。

![Client vs Server](./docs/assets/archify/client-server.svg)

交互图（切换主题、Guided Views、导出 SVG/PNG）：[deployment](./docs/assets/archify/deployment.html)、[request path](./docs/assets/archify/privileged-request.html)、[client vs server](./docs/assets/archify/client-server.html)、[config](./docs/assets/archify/config-precedence.html)。说明见 [`docs/diagrams.md`](./docs/diagrams.md)。

## 快速开始

1. 使用 DeepSeek Harness **Web** profile。用 `--trusted-host` 钉住公网主机名。
2. 把该 Origin 放到 Cloudflare Access 应用后面。
3. 安装并重启：

```sh
dsh plugin --profile web add dsh-cloudflare-access
```

如果要在第三方路由修复（Access 后面的 `/dsh-market/*`）进入 npm 之前就用上，改装本 fork——本地 tarball 与 `github:` 的命令见[安装](#安装)。

4. 锁定信任根（生产环境建议如此）：

```sh
export DSH_CF_ACCESS_TEAM_DOMAIN=https://example.cloudflareaccess.com
export DSH_CF_ACCESS_AUDIENCES=your-access-application-aud
```

5. 经 Access 打开站点并硬刷新一次，再打开 Settings。Origin 上有效的 `Cf-Access-Jwt-Assertion` 会代替远程 Host 上的 DSH launch-token Cookie——对 DSH 自己的 `/api` 与其他插件注册的路由都成立。loopback 仍须使用 `dsh web` 打印的 `?token=` URL。

用 `dsh --profile web --dump-config` 确认 bundle：应有一层名为 `dsh-cloudflare-access`，以及插件行 `id: cloudflare-access`。

## 安全模型

远程 privileged 请求必须**同时**通过：

1. DSH 的 Host / Origin / `sec-fetch-site` 检查（`--trusted-host` 仍是必须的）。
2. 有效的 Cloudflare Access JWT（签名、`iss`、`aud`、过期时间；允许约 30 秒时钟偏差）。

有效 JWT 永远不能授权任意 Host 或 Origin。Loopback（`localhost` / `127.0.0.1` / `::1`）不要求 JWT，因此 `SSH Tunnel → localhost → DSH` 仍然可用。v2.0 中远程 privileged API 始终要求 JWT。

Origin 应只对 Cloudflare（或等价入口）可达。安装本插件不是把 DSH 挂到公网的理由。详见 [SECURITY.md](./SECURITY.md)。

![Remote privileged request path](./docs/assets/archify/privileged-request.svg)

先做 Host/Origin。有效 JWT 不得把 Host 改写为 loopback。privileged 成功交给原 `/api` handler（DSH Remote）；远程信任主机上有效 Access JWT 同时跳过 DSH launch-token Cookie。缺失或无效 JWT 返回 401/403，且不进入 privileged 业务实现。Loopback 不读 JWT，仍走官方 token/Cookie。

转发 `Host`、`Origin` 和 `Cf-Access-Jwt-Assertion`。不要剥掉 assertion 头。不要信任 `CF_Authorization` Cookie。

### Access JWT 覆盖哪些路由

`connection.requestRejection` 是 DSH 开放给**每一个**路由所有者的准入检查，不是 `/api` 私有物：第三方插件也用它（dshmarket ≥ 1.66.13 把它的 48 条 `/dsh-market/*` 路由都放在这道检查后面）。因此本插件按路由把两件事分开：

- **Cookie 替代——所有路由。** 每一条注册路由与每一个 WebSocket upgrade 都会拿到 Access JWT 豁免，于是那些自己调用宿主准入检查的路由，也会放行已由 Access 认证过的浏览器。没有这一步，它们会继续索要 launch-token Cookie，即使 JWT 有效也在 Access 后面回 401。
- **拒绝策略——仅 DSH 自己的面。** 只有 `/api`、`/api/remote.mux` 与 index fallback 会被 `auth.ordinary` 拒绝。不属于本插件的路由绝不在这里被拒：由它自己的 handler 裁决，所以 `ordinary=required` 不会把共装的 UI 挡在它自己的静态资源之外。没有有效 JWT 时，第三方路由的行为与安装本插件之前完全一致。

豁免是纯增量的，只跳过 DSH 的 browser-session Cookie。它要求远程可信 `Host` **且** JWT 通过签名、`iss`、`aud`、过期检查；从不放宽 Host/Origin 栅栏，也从不作用于 loopback。

## 安装

需要 **Web** profile，DSH 版本为 `0.1.5-alpha.1` 或 `0.2.0-rc.2`（见[兼容性](#兼容性)）。安装**不需要**手工编辑 `$DSH_HOME/profiles/web/cordis.patch.yml`，也不需要改 DSH 本体：`dsh plugin add` 写 profile 的 `package.json` / lockfile，插件行由本包的 `dsh.bundle.patch`（`cordis.patch.yml`）插入。

### 从 npm 安装

```sh
dsh plugin --profile web add dsh-cloudflare-access
```

registry 上目前是 `2.0.0`，两次路由覆盖修复都不包含：在 Access 后面，第三方插件的路由（例如 `/dsh-market/*`）即使带有效 JWT 仍会返回 401。先 `npm view dsh-cloudflare-access version` 确认裸装会解析到哪个版本；在新版本发布之前，请用下面的 fork 安装方式。

### 从本 fork 安装

第三方路由（Access 后面 `/dsh-market/*` 返回 401）的修复在这个 fork 的分支上。**本地 tarball 是不需要构建审批的那条路**：

```sh
git clone https://github.com/keweiya/dsh-cloudflare-access
cd dsh-cloudflare-access
git checkout fix/cover-third-party-routes
npm pack --ignore-scripts --pack-destination /tmp   # 打包已提交的 lib/
dsh plugin --profile web add /tmp/dsh-cloudflare-access-2.1.1.tgz
```

`--ignore-scripts` 打包已提交的 `lib/` 并跳过 `prepare` 构建。想自己从源码构建：先 `npm install --include=dev && npm run build`，再不带该参数执行 `npm pack`。

直接从 Git 装也可以，但 pnpm 会拦住 git 包的 `prepare` 脚本，直到你显式放行：

```sh
dsh plugin --profile web add github:keweiya/dsh-cloudflare-access#fix/cover-third-party-routes
```

第一次会以 `ERR_PNPM_GIT_DEP_PREPARE_NOT_ALLOWED` 失败，并把需要放行的**精确键**打印出来——键里含解析到的 commit：

```yaml
# $DSH_HOME/profiles/web/pnpm-workspace.yaml
allowBuilds:
  "dsh-cloudflare-access@https://codeload.github.com/keweiya/dsh-cloudflare-access/tar.gz/<commit>": true
```

把该键加进去，重跑同一条命令即可装完（依赖安装时 `prepare` 脚本会跳过自己的构建，直接用已提交的 `lib/`）。因为键锁定了 commit，分支一旦移动就要重新加键——经常这么装的话，建议用 tarball 或固定 tag。

### 重启并确认

`dsh plugin add` 只改磁盘上的 profile；运行中的 `dsh web` 仍在用启动时加载的 fiber，所以**不重启就不会生效**。

```sh
systemctl restart dsh                                   # 或者你启动 dsh web 的方式
journalctl -u dsh -n 30 --no-pager | grep 'dsh web:'    # 新的 loopback ?token= 网址
dsh --profile web --dump-config | grep -A1 cloudflare-access
```

输出里应有一层 `dsh-cloudflare-access` 和一行插件 `id: cloudflare-access`。想确认**实际加载**的版本，把进程启动时间和安装时间对一下：`systemctl show -p MainPID,ActiveEnterTimestamp dsh`。

### 卸载 / 回滚

```sh
dsh plugin --profile web remove dsh-cloudflare-access
systemctl restart dsh
```

卸载后本插件的 JWT 包装消失：远程访问退回 DSH 自己的 `?token=` Cookie，每条路由的行为与安装本插件之前一致。

## 配置

1. 把 DSH Web origin 放到 Cloudflare Access 应用后面。
2. 复制应用的 **Audience**（`aud`）和 team domain，例如 `https://example.cloudflareaccess.com`（省略 `https://` 的主机名也可以）。
3. Cloudflare 会在已认证请求上注入 `Cf-Access-Jwt-Assertion`。该头是本插件读取的唯一身份。

team domain 规范化为 http(s) origin（路径丢弃）后，推导 issuer 与 JWKS URL：

```text
issuer  = <origin>
JWKS    = <origin>/cdn-cgi/access/certs
```

不要配置 `issuer` 或 `jwksUrl`。支持多个 audience。

![Configuration precedence](./docs/assets/archify/config-precedence.svg)

生产环境用环境变量钉住 team domain 和 audience。变量一旦存在（即使是空字符串），该字段即锁定，无法从远程 Settings 会话改指向。

| 变量 | 含义 |
| --- | --- |
| `DSH_CF_ACCESS_TEAM_DOMAIN` | Team domain / issuer |
| `DSH_CF_ACCESS_AUDIENCES` | 逗号分隔的 audience |
| `DSH_CF_ACCESS_ORDINARY_MODE` | `off` \| `optional` \| `required` |

```sh
dsh --profile web --trusted-host dsh.example.com
```

systemd：

```ini
[Service]
Environment=DSH_CF_ACCESS_TEAM_DOMAIN=https://example.cloudflareaccess.com
Environment=DSH_CF_ACCESS_AUDIENCES=your-access-application-aud
Environment=DSH_CF_ACCESS_ORDINARY_MODE=off
ExecStart=/usr/bin/dsh --profile web --trusted-host dsh.example.com
```

Cordis overlay（仅当对应 env 未设置时使用）：

```yaml
cloudflare:
  teamDomain: https://example.cloudflareaccess.com
  audiences:
    - your-access-application-aud
auth:
  ordinary: off
```

缺少 `teamDomain` 或 `audiences`：插件仍会启动，loopback 不变，远程 privileged API 被拒绝。

## 普通 API 模式

`auth.ordinary` 只作用于 DSH 自己面上的**远程非特权** API——`/api` 前缀、`/api/remote.mux` 与 index fallback。其他插件注册的路由不在其范围内，由它们自己的 handler 裁决。Loopback 忽略它。Host/Origin 始终先执行。

| 模式 | 无 JWT | 有效 JWT | 无效 JWT |
| --- | --- | --- | --- |
| `off`（默认） | DSH 原策略 | 忽略 | 忽略 |
| `optional` | DSH 原策略 | 放行 | 拒绝 |
| `required` | 拒绝 | 放行 | 拒绝 |

无论该设置如何，远程 privileged API 始终要求有效 JWT。

## 排障

| 现象 | 检查 |
| --- | --- |
| 远程 Settings 仍不可用 | Access 必须在站点前面；硬刷新，使 Client 模块在 Settings 之前加载；确认 `Cf-Access-Jwt-Assertion` 到达 Origin。 |
| Settings UI 从不调用 `settings/describe` | 本包设置了 `dsh.client.immediately: true`。若旧 tarball 漏了该项，重新安装。 |
| `settings/*` 返回 401 | Access header 缺失或未被转发。查反向代理是否转发 `Cf-Access-Jwt-Assertion`。loopback 仍须打开 `dsh web` 打印的 `?token=` URL。 |
| `settings/*` 返回 403 | `iss`/`aud`/签名/过期无效、插件未配置、Host/Origin 不匹配，或 Origin 时钟偏差超过约 30 秒。 |
| `ordinary=required` 时事件 WebSocket 失败 | `/api/remote.mux` 走普通 API 策略。缺 JWT → 401；无效 JWT → 403。 |
| Access 后面其他插件的路由返回 401（例如 `/dsh-market/*`） | 2.1.1 已修复：Access JWT 的 Cookie 替代以前只覆盖 `/api`（2.1.0），随后又只覆盖**本插件激活之后**注册的路由（2.1.1 会采纳已经注册的路由）。升级本包即可，无需改配置。 |
| Loopback Settings 坏了 | 卸载插件；loopback 不得要求 JWT。若仍要求，请报 bug。 |
| JWKS / 密钥轮换失败 | Origin 必须能访问 `https://<team>/cdn-cgi/access/certs`。Cloudflare 轮换密钥后无需改配置。 |
| 日志 | 只记录类别（`expired`、`invalid_signature`、`issuer_mismatch`、`audience_mismatch`、`missing_token`、`jwks_unavailable`、`unconfigured`）。从不记录 token。 |

本插件不授权 `host.pickDirectory` 或 `host.openPath`。部分 native-host UI 仍可能出现。

## 兼容性

| 插件 | DSH | 状态 |
| --- | --- | --- |
| 1.0.x | 0.1.1-rc.2（0.1.2 之前） | Live 验证（Web profile，远程 Settings / Credentials）。走 `apiProxy` + privileged pin。与 DSH 0.1.2+ 不兼容。 |
| 2.0.x | 0.1.5-alpha.1 | 已在 Cloudflare Access 后的 Web profile 上 live 验证（远程 Settings 不需要 DSH `?token=`）。单元/集成测试。CI 不启动 DSH 进程。 |
| 2.1.x | 0.1.5-alpha.1、0.2.0-rc.2 | `0.2.0-rc.2` 已对照安装的 DSH 包核对，并在 Access 后的 Web profile 上 live 验证（有效 JWT、伪造 JWT → 403、loopback → 401、`/api` 拒绝范围不变；激活顺序探针见 `docs/references/dsh-source-research.md` §8.1，并用真实 `dshmarket@1.66.14` 在两种挂载顺序下复现）；privileged 端点名已对照 `dsh-api-settings-controller`、`dsh-agent-preset-registry`、`dsh-llm` 重新核对。单元/集成测试。CI 不启动 DSH 进程。 |

在本矩阵更新之前，不要默认更新的 DSH 版本可用。

## 开发

```sh
pnpm install
pnpm test
pnpm typecheck
pnpm pack:check
```

改源码后执行 `pnpm build`，使提交的 `lib/` 与 `src/` 一致。CI 会重建 `lib/`，树不一致则失败。

```sh
dsh plugin --profile web add ./
```

插件打包遵循 [dsh.pub/develop-plugin.md](https://dsh.pub/develop-plugin.md)。本仓库不声称已有 dsh.pub listing 或安全审计。

### 维护者

Dependabot 每周更新 npm 和 GitHub Actions。从 GitHub Actions 发布时，使用 `npm publish --access public --provenance`，并授予 `id-token: write`。v0.1.0 和 v1.0.0 发布时没有 provenance。

## License

MIT
