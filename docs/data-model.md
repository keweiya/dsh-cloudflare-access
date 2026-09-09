# 数据模型

## 状态
accepted

## 范围
本插件无数据库。模型覆盖运行时配置、JWT 验证结果、授权决策与错误类别。

## 实体

### PluginConfig
- teamDomain: `string | null`。非空时为规范化后的 http(s) origin。
- audiences: `string[]`
- ordinary: `off | optional | required`
- envLocked: `EnvLockedKeys`

约束：`ordinary` 只能是三枚举之一。`audiences` 在解析 env 时按逗号拆分并 trim，丢弃空段。

### EnvLockedKeys
- teamDomain: `boolean`
- audiences: `boolean`
- ordinary: `boolean`

某字段为 true 表示对应环境变量存在，运行时忽略 Cordis 对该字段的写入。

### JwtVerification
- outcome: `valid | missing | invalid`
- reason: `JwtFailureReason | null`
- audienceMatched: `string | null`

不持久化、不缓存该实体。每次请求现场验证。

### JwtFailureReason
状态值：

- `missing_token`
- `malformed`
- `expired`
- `invalid_signature`
- `issuer_mismatch`
- `audience_mismatch`
- `jwks_unavailable`
- `unconfigured`

### AuthDecision
- effect: `allow | deny`
- class: `loopback | privileged | ordinary`
- reason: `JwtFailureReason | host_origin_rejected | null`

## 状态迁移

JWT 验证：

```text
request
  → missing header → missing/missing_token
  → unconfigured teamDomain/audiences → invalid/unconfigured
  → compact JWS parse fail → invalid/malformed
  → JWKS unreachable and signature cannot be verified → invalid/jwks_unavailable
  → signature/alg fail → invalid/invalid_signature
  → iss fail → invalid/issuer_mismatch
  → aud fail → invalid/audience_mismatch
  → exp fail → invalid/expired
  → nbf fail → invalid/malformed
  → all pass → valid
```

授权：

```text
loopback → allow
remote + host/origin fail → deny(host_origin_rejected)
remote + privileged + jwt valid → allow
remote + privileged + jwt not valid → deny(reason)
remote + ordinary/off → allow (JWT ignored)
remote + ordinary/optional + no jwt → allow
remote + ordinary/optional + jwt valid → allow
remote + ordinary/optional + jwt invalid → deny(reason)
remote + ordinary/required + jwt valid → allow
remote + ordinary/required + otherwise → deny(reason)
```

不存在从 deny 到 allow 的重试状态机。每次请求独立决策。

## 约束
RULE-DATA-1: `PluginConfig.audiences` 为空或 `teamDomain` 为 null 时，远程 privileged 决策必须是 deny/`unconfigured`。

RULE-DATA-2: `JwtVerification` 不得写入日志全文；只允许 `reason`。

RULE-DATA-3: `ordinary` 非法字符串必须在配置解析阶段失败或回退拒绝启动该键的 env 覆盖，不得静默当成 `off`。环境变量非法值应 fail closed 到拒绝加载或拒绝远程 privileged，并打错误日志。选定：非法 `DSH_CF_ACCESS_ORDINARY_MODE` 使配置解析抛错，插件 fiber 失败，避免静默降级。

## 示例

```json
{
  "teamDomain": "https://example.cloudflareaccess.com",
  "audiences": ["aud_1", "aud_2"],
  "ordinary": "optional",
  "envLocked": {
    "teamDomain": true,
    "audiences": true,
    "ordinary": false
  }
}
```

```json
{
  "effect": "deny",
  "class": "privileged",
  "reason": "missing_token"
}
```
