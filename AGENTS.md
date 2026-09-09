# AGENTS.md

本仓库是 DeepSeek Harness 的 out-of-tree **Profile Bundle + Web Client** 插件，不是 DSH 本体，也不是独立 IdP。

## DeepSeek Harness plugin development

Before changing plugin code, read https://dsh.pub/develop-plugin.md completely. Follow the pinned
runtime contract and verification boundaries there; this repository's own security, testing, and
release rules remain authoritative.

## 必须保持的约束

- 身份仍在 Cloudflare Access。本插件只在 Origin 再验证 `Cf-Access-Jwt-Assertion`。
- Server 是唯一授权裁决者。Client 只做 `connection.isLoopback` 的 capability enablement，不读 Cookie、不验 JWT。
- `dsh.client.immediately` 必须为 `true`，`dsh.client.inject` 必须包含 `@deepseek-ai/dsh-client-connection`。关闭 immediately 会导致远程 Settings 卡在 memory persistence，浏览器不会发 `settings/describe`。
- DSH 版本相关包装只放在 `src/compat/`。JWT / policy / config 不得 import DSH 内部模块。
- 不要伪造 loopback Host。
- 不要开放 `host.pickDirectory` / `host.openPath`。
- unload 必须可逆：恢复 `webServer.register` / `registerUpgrade` / `registerFallback`、`connection.requestRejection` / `authorizeIndex` 与 `connection.isLoopback`。
- 远程 + 有效 Access JWT 可代替 DSH launch-token Cookie。loopback 仍走官方 token/Cookie。
- 日志只记录原因类别，不得记录 token、Cookie、凭据。

## 交付形态

- Host：`exports["."]` → `lib/index.js`，`inject = ['webServer']`。
- Client：`exports["./client"]` → 预构建的 `lib/client.js`（`window.__ModuleLoader__.load` factory）。
- Bundle：`dsh.bundle.patch` → `cordis.patch.yml`，行 `name` 必须等于 npm 包名 `dsh-cloudflare-access`。
- Git / 社区安装依赖已提交的 `lib/`，不要把运行时产物重新 gitignore 掉。

## 验证

```sh
pnpm test
pnpm typecheck
pnpm pack:check
```

兼容性矩阵只写实测过的 DSH 版本。当前 target 是 `0.1.5-alpha.1`（已对照官方 npm 包扩展点，并在 Access 后的 Web profile 上 live 验证远程访问；本仓库 CI 不启动 DSH 进程）。
