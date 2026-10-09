# 系统协议

## 状态
accepted

## 范围
定义本插件关心的 HTTP 入口、JWT 声明、配置协议、错误分类与 RPC 方法清单。本插件不引入新的对外 REST API。

## 接口

### API-JWT-HEADER
- 方法：任意到达 DSH Origin 的 HTTP/WebSocket 升级请求
- 路径或事件名：DSH `/api` 前缀，包括 `/api/<namespace>/<method>`、`/api/remote.mux`
- 输入：Header `Cf-Access-Jwt-Assertion`
- 输出：无新响应体协议；沿用 DSH HTTP 或 RPC 错误

### API-PRIVILEGED-RPC
- 方法：DSH unary HTTP RPC
- 路径：`/api/<namespace>/<method>`
- 输入：DSH 原 payload
- 输出：DSH 原结果；本插件只在授权失败时拦截

## 请求结构

### Cloudflare Access JWT Header
- `Cf-Access-Jwt-Assertion`: 紧凑 JWS。缺省表示未认证。

### 插件配置（Cordis）

```yaml
cloudflare:
  teamDomain: null
  audiences: []
auth:
  ordinary: off
```

字段：

- `cloudflare.teamDomain`: `string | null`。Cloudflare Access team domain。可写 `https://example.cloudflareaccess.com` 或 `example.cloudflareaccess.com`；运行时规范化为 http(s) origin。
- `cloudflare.audiences`: `string[]`。Access Application AUD，至少一个非空值才算已配置。
- `auth.ordinary`: `off | optional | required`。默认 `off`。

### 环境变量
- `DSH_CF_ACCESS_TEAM_DOMAIN`: 覆盖 `cloudflare.teamDomain`
- `DSH_CF_ACCESS_AUDIENCES`: 逗号分隔，覆盖 `cloudflare.audiences`
- `DSH_CF_ACCESS_ORDINARY_MODE`: 覆盖 `auth.ordinary`

## JWT 声明约束
- `alg`: 由 JWKS 与 `jose` 允许的算法决定，拒绝 `none` 与降级。
- `iss`: 必须等于规范化后的 `teamDomain` origin。
- `aud`: string 或 string[]；必须与配置 audiences 有交集。
- `exp`: 必须未过期，允许 30 秒时钟偏差。
- `nbf`: 若存在则必须已生效，同样允许 30 秒时钟偏差。

不把 `email` / `identity_nonce` 映射为 DSH 用户。本插件无用户模型。

## 特权方法清单

权威来源：DSH Typert Remote map，已对照 `0.1.5-alpha.1` 与 `0.2.0-rc.2` 的安装包核对（`dsh-api-settings-controller`、`dsh-agent-preset-registry`、`dsh-llm`）。本插件 **放行**配置面子集，**不把** native directory-picker / `host.openPath` 列入放行集合。

名单是两条支持线的并集：某个方法在当前版本不存在时该条目无害，而缺失条目在 `ordinary=off` 下是 fail open。`settings/canOpenAgentPresetDirectory`、`settings/openAgentPresetDirectory`、`agentPresets/copy`、`agentPresets/deletePreset` 是 `0.1.5-alpha.1` 专有（`0.2.0-rc.2` 已移除）。

| method | 本插件远程 + JWT |
| --- | --- |
| `settings/describe` | 放行 |
| `settings/openSettingsDocument` | 放行 |
| `settings/update` | 放行 |
| `settings/replace` | 放行 |
| `settings/mutate` | 放行 |
| `settings/canOpenAgentPresetDirectory` | 放行 |
| `settings/openAgentPresetDirectory` | 放行 |
| `credentials/describe` | 放行 |
| `credentials/set` | 放行 |
| `credentials/unset` | 放行 |
| `agentPresets/read` | 放行 |
| `agentPresets/copy` | 放行 |
| `agentPresets/deletePreset` | 放行 |
| `llm/discoverModels` | 放行 |
| `host.pickDirectory` / `host.openPath` | 不放行 |
| `agentPresets/list` | 按 ordinary |
| `agentPresets/select` | 按 ordinary |
| `llm/listProviders` | 按 ordinary |
| `llm/listConfigurableProviders` | 按 ordinary |
| `remote.mux` | 按 ordinary |

## 错误处理

若包装层能写 HTTP status（含 `/api/remote.mux` WebSocket 握手），则：

- `missing_token` → `401 Unauthorized`
- `unconfigured` → `403 Forbidden`
- `invalid_signature` / `issuer_mismatch` / `audience_mismatch` / `expired` / `malformed` / `jwks_unavailable` → `403 Forbidden`

响应体保持简单文本或 DSH 现有协议，不返回 token。若未来 DSH RPC error model 不允许改 HTTP status，则保持 DSH 协议形式，但错误分类字段必须可区分上述类别。

DSH 在 Host/Origin 失败时仍可能返回 `403`。loopback 或缺有效 Access JWT 的远程请求仍可能因缺 DSH Cookie 返回 `401`。unload 后 JWT 包装消失，官方行为恢复。

## 示例

有效配置：

```json
{
  "cloudflare": {
    "teamDomain": "https://example.cloudflareaccess.com",
    "audiences": ["11111111111111111111111111111111111"]
  },
  "auth": {
    "ordinary": "off"
  }
}
```

拒绝响应（HTTP 层）：

```http
HTTP/1.1 401 Unauthorized
Content-Type: text/plain

unauthorized
```

```http
HTTP/1.1 403 Forbidden
Content-Type: text/plain

forbidden
```
