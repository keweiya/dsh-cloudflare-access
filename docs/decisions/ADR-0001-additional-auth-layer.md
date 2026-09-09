# ADR-0001 附加认证层而不是替换 DSH 安全边界

## 状态
accepted

## 背景
DSH 的 `/api` 已有 Host/Origin/`sec-fetch-site` 栅栏。本插件要把 Cloudflare Access 身份接进 DSH，同时规格要求有效 JWT 不得绕过原防护。

## 决策
把插件定义为 additional authentication / authorization：

1. 先保留 DSH Host/Origin 检查。
2. 再叠加 JWT。
3. Loopback 完全不参与 JWT。
4. 不把 JWT 当作 trusted-host 的替代。

## 备选方案
- 方案 A：有 JWT 即视为可信，跳过 Host 检查。拒绝。这会破坏 DNS-rebinding 防护。
- 方案 B：替换 DSH connection 插件，重写全部信任逻辑。拒绝作为默认路径。分叉成本高，且违反不修改 DSH 本体。

## 影响
- 正向影响：与 Cloudflare 官方 Origin 再验证模型一致；SSH tunnel / localhost 不受影响。
- 负向影响：远程合法用户必须同时满足 Access 与 DSH trusted-host 配置，部署文档需要同时说明两层。

## 相关文档
- `docs/architecture.md`
- `docs/rules.md`
- `docs/product/prd.md`
