# 服务规格

## 状态
accepted

## 服务名称
ConfigResolver

## 职责
- 读取 Cordis 插件配置。
- 读取并解析环境变量。
- 按 Env > Cordis > Default 合并。
- 标记 env-locked 字段。
- 规范化 `teamDomain` 为 http(s) origin（用于 iss 与 JWKS URL 推导）。

## 非职责
- 验证 JWT。
- 决定某个 RPC 是否 privileged。
- 向 Web Settings 注册独立 UI（当前不要求）。

## 服务规则
RULE-SERVICE-CONFIG-1: 环境变量键存在（即使值为空字符串）即视为锁定该字段；空字符串按未配置处理，并保持锁定，防止 Web Settings 填入另一个 team。

RULE-SERVICE-CONFIG-2: `DSH_CF_ACCESS_AUDIENCES` 按逗号拆分、trim、丢弃空段。

RULE-SERVICE-CONFIG-3: `issuer` 与 `jwksUrl` 不得作为用户可配字段暴露。

## 接口
- `load(cordisConfig): PluginConfig`
- `jwksUrl(config): string | null` — `teamDomain` 存在时返回 `<origin>/cdn-cgi/access/certs`

## 依赖
- 上游：`process.env`、Cordis `Config`
- 下游：JwtVerifier、AuthorizationPolicy、启动日志

## 故障处理
- 非法 `ordinary` 枚举：插件加载失败。
- `teamDomain` 无法解析为 http(s) URL：插件加载失败。
- 缺 scheme 的主机名按 `https://<host>` 解析；结果只保留 origin（scheme + host + 端口），丢弃 path。

## 示例
Env `DSH_CF_ACCESS_TEAM_DOMAIN=https://example.cloudflareaccess.com` 且 Cordis `teamDomain: https://other.cloudflareaccess.com` → 运行时 issuer 为 `example`。
