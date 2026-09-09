# 产品路线图

## 状态
accepted

## 当前 — Origin JWT 映射（插件 2.0.x / DSH 0.1.5-alpha.1）
- 状态：已实现；对照官方 npm 包扩展点，并在 Access 后的 Web profile 上 live 验证远程 Settings。
- 目标：在不修改 DSH 本体的前提下，把 Cloudflare Access 身份映射为 DSH 远程配置面授权。
- 交付能力：JWT 验证、privileged 授权、普通 API 三模式、Client capability（含 immediately prefetch）、Bundle/Client 包装、测试与安全文档。JWT 叠在原 `/api` / `/api/remote.mux` / index 之前；远程有效 Access JWT 跳过 DSH launch-token Cookie。
- 不包含：RBAC、Cloudflare API、`host.pickDirectory` / `host.openPath`、插件市场 listing。
- 验收方式：`docs/product/acceptance-criteria.md`；单元/集成测试；Access 后的 Web profile live 验证。

## 下一步 — 分发与 DSH 版本跟随
- 目标：安装命令落到真实分发渠道，并在 DSH 升级后保持可逆扩展点。
- 交付能力：npm 公共包、可选 dsh.pub listing、针对已测 DSH 的兼容性矩阵；必要时只改 `compat/`。
- 不包含：把 DSH 符号扩散进 JWT 核心；未测版本的宽 peer range。
- 验收方式：文档中的安装命令与实际分发渠道一致；对新 DSH 版本跑通 privileged / ordinary / Host-Origin / unload 用例。

## 候选 — 插件市场
- 目标：降低安装摩擦。
- 交付能力：DSH 插件市场 / 目录安装路径。
- 不包含：改变安全模型。
- 验收方式：市场安装与 `dsh plugin --profile web add` 行为一致。
