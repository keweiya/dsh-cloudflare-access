# 服务规格

## 状态
accepted

## 服务名称
AuthorizationPolicy

## 职责
- 根据 loopback、RPC 方法、ordinary 模式和 JWT 结果输出 `AuthDecision`。
- 提供 privileged 方法集合（配置面子 集）。

## 非职责
- 执行 HTTP 响应写入。
- 调用 DSH 原 `/api` handler。
- 判断 Host/Origin（由 DSH 原函数或 compat 等价调用完成，policy 只消费其布尔结果）。

## 服务规则
RULE-SERVICE-POLICY-1: 输入 `hostOriginTrusted=false` 时一律 deny，忽略 JWT。

RULE-SERVICE-POLICY-2: `isLoopback=true` 时一律 allow，忽略 JWT 与 ordinary。

RULE-SERVICE-POLICY-3: privileged 判定只使用 `docs/protocols.md` 的放行清单，不得动态从请求 path 猜测。

## 接口
- `decide(input): AuthDecision`

输入：

```ts
{
  isLoopback: boolean
  hostOriginTrusted: boolean
  method: string | undefined  // /api 之后的 Remote 名；upgrade 为 remote.mux
  ordinary: 'off' | 'optional' | 'required'
  jwt: JwtVerification
}
```

## 依赖
- 上游：JwtVerifier、请求分类
- 下游：DshCompatServer

## 故障处理
Policy 本身无 I/O。错误由 JwtVerifier 以 `jwt.reason` 传入。

## 示例
远程 `settings/mutate` + missing JWT → `{ effect: 'deny', class: 'privileged', reason: 'missing_token' }`。
