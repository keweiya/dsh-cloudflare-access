/**
 * DSH（0.1.5-alpha.1 … 0.2.0-rc.2）没有公开 authorization hook。
 * `connection.requestRejection` 是同步的（Host/Origin + browser-session Cookie），
 * 装不下 jose JWKS 异步验签。因此 inject `webServer`，在 connection 注册路由
 * 之前包装 register / registerUpgrade / registerFallback，把 Cloudflare JWT
 * 叠在原 handler 前面。
 *
 * 远程 + 有效 Access JWT：跳过 DSH launch-token Cookie（Access 已证明身份）。
 * loopback 仍走官方 token/Cookie（Access 罩不到本机端口）。
 *
 * ## 覆盖范围：豁免打在所有路由，deny 只留给 DSH Remote
 *
 * `connection.requestRejection` 是宿主公开给**每一个**路由所有者的检查，不是
 * `/api` 私有物：第三方插件也用它（dshmarket 1.66.13 起把它的 48 条
 * `/dsh-market/*` exact 路由都放在这道检查后面，见 dsh-market#603）。
 *
 * 因此标记分两层：
 * - **豁免（mark）**：每一条注册路由与每一个 upgrade。远程 + 有效 JWT 时把
 *   `req` 记入 `skipped`，于是这些路由自己的 `requestRejection` 调用也会拿到
 *   `undefined`。只标记 `/api` 会让第三方路由在 Access 后面继续索要
 *   launch-token Cookie，从而对已由 Access 认证的浏览器返回 401。
 * - **裁决（deny）**：仍只作用于 `/api` 前缀、`/api/remote.mux` 与 index
 *   fallback。非 `/api` 路由的准入由它自己的所有者裁决，本插件不替它们拒绝
 *   ——否则 `ordinary=required` 会把第三方插件的静态资源、健康检查、webhook
 *   一并挡掉。未被标记时，第三方路由的行为与安装本插件之前完全一致。
 *
 * 豁免只对**远程**且 JWT 有效时生效，且只增加放行、从不放宽 Host/Origin；
 * loopback 不读 JWT，仍走官方 token/Cookie。
 *
 * ## 激活顺序：必须「采纳」先注册的路由
 *
 * 只包装 `register` 是不够的，因为**包装器装上的时机可能晚于第三方挂载**：
 * dshmarket 在自己的 `apply` 里用 `ctx.inject(['webServer','loader'], …)`，
 * 服务一可用就同步注册 48 条路由；而本插件走 plugin 级 `inject = ['webServer']`，
 * apply 由框架延后。实测（0.2.0-rc.2 + dshmarket 1.66.14）就是这样：市场路由
 * 先落表，包装器后装上，于是市场路由永远不被标记，Access 后面继续 401。
 *
 * 所以激活时除了换掉三个注册方法，还要扫一遍 webserver 已注册的路由表
 * （`exact` / `prefixes` / `upgrades` / `fallback`），把**已经注册**的路由就地
 * 换成包装后的 handler。这样无论谁先谁后，覆盖范围都完整。
 * 表结构缺失或形状不同时跳过，插件退回「只覆盖激活之后注册的路由」。
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Duplex } from 'node:stream'
import type { PluginConfig } from '../config.ts'
import { httpStatusFor, logDenied, type PluginLogger } from '../server/authorization.ts'
import type { JwtVerifier } from '../server/cloudflare-jwt.ts'
import { decide, jwtParticipates } from '../server/policy.ts'
import { readAccessJwt, type JwtVerification } from '../server/types.ts'
import { API_PATH, REMOTE_STREAM_MUX_PATH, rpcMethodFromUrl } from './api-path.ts'
import { isTrustedApiRequest, requestIsLoopback, requestRemoteHostTrusted } from './dsh-trust.ts'

export interface WebRoute {
  kind: 'exact' | 'prefix'
  path: string
  handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
}

export interface WebUpgradeRoute {
  path: string
  handler: (req: IncomingMessage, socket: Duplex, head: Buffer) => void | Promise<void>
}

export interface WebServerLike {
  register(route: WebRoute): () => void
  registerUpgrade(route: WebUpgradeRoute): () => void
  registerFallback?(handler: WebRoute['handler']): () => void
  /**
   * DSH 0.1.5-alpha.1 … 0.2.0-rc.2 的 webserver 把路由放在实例的这几张表里，
   * dispatch 时读 `route.handler`（`match()` / upgrade 分支 / `this.fallback`）。
   * 本插件激活可能晚于第三方挂载（见文件头「激活顺序」），因此激活时要就地
   * 采纳这些表里已经存在的路由。字段缺失或不是 Map/函数时跳过。
   */
  exact?: Map<string, WebRoute>
  prefixes?: Map<string, WebRoute>
  upgrades?: Map<string, WebUpgradeRoute>
  fallback?: WebRoute['handler']
}

export interface ConnectionAuthLike {
  requestRejection(request: IncomingMessage): 401 | 403 | undefined
  authorizeIndex(request: IncomingMessage, response: ServerResponse): boolean
}

export interface CompatFiber {
  connection?: ConnectionAuthLike
  get?(name: string): unknown
}

export interface CompatContext {
  webServer: WebServerLike
  logger?: PluginLogger
  effect(callback: () => (() => void) | Promise<void>, name?: string): void
  get(name: string): unknown
  inject?(deps: readonly string[], callback: (fiber: CompatFiber) => void): void
}

export interface ServerCompatDeps {
  config: PluginConfig
  verifier: JwtVerifier
  getTrustedHosts: () => readonly string[]
}

type Gate =
  | { action: 'forward'; skipBrowserSession: boolean }
  | {
      action: 'deny'
      status: 401 | 403
      body: string
      method: string | undefined
      privileged: boolean
      reason: ReturnType<typeof decide>['reason']
    }

const MISSING_JWT: JwtVerification = {
  outcome: 'missing',
  reason: 'missing_token',
  audienceMatched: null,
}

function nodeHeaders(req: IncomingMessage): Record<string, string | string[] | undefined> {
  return req.headers
}

function writeAuth(res: ServerResponse, status: 401 | 403, body: string): void {
  res.writeHead(status)
  res.end(body)
}

function rejectUpgrade(socket: Duplex, status: 401 | 403): void {
  const reason = status === 401 ? 'Unauthorized' : 'Forbidden'
  socket.write(`HTTP/1.1 ${status} ${reason}\r\nConnection: close\r\n\r\n`)
  socket.destroy()
}

function isApiPrefix(route: WebRoute): boolean {
  return route.kind === 'prefix' && route.path === API_PATH
}

function isRemoteMuxUpgrade(route: WebUpgradeRoute): boolean {
  return route.path === REMOTE_STREAM_MUX_PATH
}

/**
 * Whether this gate result admits the request on Access identity alone, so the
 * host's browser-session check should be skipped for it. A denied gate never
 * carries it: denial means the JWT was missing or unusable.
 */
function marksBrowserSession(gate: Gate): boolean {
  return gate.action === 'forward' && gate.skipBrowserSession
}

function connectionFrom(fiber: CompatFiber): ConnectionAuthLike | undefined {
  if (fiber.connection !== undefined) return fiber.connection
  const found = fiber.get?.('connection')
  if (found !== undefined && typeof found === 'object' && found !== null
    && 'requestRejection' in found && 'authorizeIndex' in found) {
    return found as ConnectionAuthLike
  }
  return undefined
}

function restoreMethod<K extends 'requestRejection' | 'authorizeIndex'>(
  connection: ConnectionAuthLike,
  key: K,
  original: ConnectionAuthLike[K],
  hadOwn: boolean,
): void {
  if (hadOwn) {
    connection[key] = original
    return
  }
  delete (connection as Partial<ConnectionAuthLike>)[key]
}

function wrapBrowserSession(
  connection: ConnectionAuthLike,
  skipped: WeakSet<IncomingMessage>,
  effect: CompatContext['effect'],
): void {
  const hadOwnRejection = Object.prototype.hasOwnProperty.call(connection, 'requestRejection')
  const hadOwnIndex = Object.prototype.hasOwnProperty.call(connection, 'authorizeIndex')
  const originalRejection = connection.requestRejection
  const originalIndex = connection.authorizeIndex

  connection.requestRejection = (request) => {
    const rejection = originalRejection.call(connection, request)
    if (rejection === 401 && skipped.has(request)) return undefined
    return rejection
  }
  connection.authorizeIndex = (request, response) => {
    if (skipped.has(request)) return true
    return originalIndex.call(connection, request, response)
  }

  effect(() => () => {
    restoreMethod(connection, 'requestRejection', originalRejection, hadOwnRejection)
    restoreMethod(connection, 'authorizeIndex', originalIndex, hadOwnIndex)
  }, 'dsh-cloudflare-access: restore connection browser-session')
}

/** 标记本插件生成的 handler，采纳（adopt）时据此避免二次包装。 */
const WRAPPED: unique symbol = Symbol('dsh-cloudflare-access:wrapped')

type AnyHandler = (...args: never[]) => unknown

function markWrapped<T extends AnyHandler>(handler: T): T {
  Object.defineProperty(handler, WRAPPED, { value: true, enumerable: false })
  return handler
}

function isWrapped(handler: unknown): boolean {
  return typeof handler === 'function'
    && (handler as { [WRAPPED]?: boolean })[WRAPPED] === true
}

/**
 * Wrap webServer.register / registerUpgrade / registerFallback, then adopt the
 * routes registered before this plugin activated. Restores originals on dispose.
 */
export function installServerCompat(ctx: CompatContext, deps: ServerCompatDeps): void {
  const originalRegister = ctx.webServer.register
  const originalRegisterUpgrade = ctx.webServer.registerUpgrade
  const originalRegisterFallback = ctx.webServer.registerFallback?.bind(ctx.webServer)
  const logger: PluginLogger = ctx.logger ?? { info() {}, warn() {} }
  const skipped = new WeakSet<IncomingMessage>()

  const markAndForward = (req: IncomingMessage, skip: boolean): void => {
    if (skip) skipped.add(req)
  }

  // Deny policy stays on the DSH Remote surface. Every other route is only
  // marked, so its own owner decides admission (see the header note).
  const wrapHttpHandler = (
    inner: WebRoute['handler'],
    policyRoute: boolean,
  ): WebRoute['handler'] => markWrapped(async (req: IncomingMessage, res: ServerResponse) => {
    const gate = await authorize(req, deps)
    if (policyRoute && gate.action === 'deny') {
      logDenied(logger, {
        method: gate.method,
        reason: gate.reason,
        privileged: gate.privileged,
      })
      writeAuth(res, gate.status, gate.body)
      return
    }
    markAndForward(req, marksBrowserSession(gate))
    await inner(req, res)
  })

  // Same split as register(): only the DSH Remote mux upgrade is denied here.
  const wrapUpgradeHandler = (
    inner: WebUpgradeRoute['handler'],
    policyRoute: boolean,
  ): WebUpgradeRoute['handler'] => markWrapped(
    async (req: IncomingMessage, socket: Duplex, head: Buffer) => {
      const gate = await authorize(req, deps)
      if (policyRoute && gate.action === 'deny') {
        logDenied(logger, {
          method: gate.method,
          reason: gate.reason,
          privileged: gate.privileged,
        })
        rejectUpgrade(socket, gate.status)
        return
      }
      markAndForward(req, marksBrowserSession(gate))
      await inner(req, socket, head)
    },
  )

  // The fallback serves DSH's own index and static assets, so it is a
  // first-party surface like `/api`: `ordinary=required` still denies a client
  // that cannot present an Access JWT. Third-party routes are deliberately
  // excluded from that denial (see the header note).
  const wrapFallbackHandler = (inner: WebRoute['handler']): WebRoute['handler'] =>
    markWrapped(async (req: IncomingMessage, res: ServerResponse) => {
      const gate = await authorize(req, deps)
      if (gate.action === 'deny') {
        logDenied(logger, {
          method: gate.method,
          reason: gate.reason,
          privileged: gate.privileged,
        })
        writeAuth(res, gate.status, gate.body)
        return
      }
      markAndForward(req, marksBrowserSession(gate))
      await inner(req, res)
    })

  ctx.webServer.register = (route: WebRoute): (() => void) => {
    return originalRegister.call(ctx.webServer, {
      ...route,
      handler: wrapHttpHandler(route.handler, isApiPrefix(route)),
    })
  }

  ctx.webServer.registerUpgrade = (route: WebUpgradeRoute): (() => void) => {
    return originalRegisterUpgrade.call(ctx.webServer, {
      ...route,
      handler: wrapUpgradeHandler(route.handler, isRemoteMuxUpgrade(route)),
    })
  }

  if (originalRegisterFallback !== undefined) {
    ctx.webServer.registerFallback = (handler: WebRoute['handler']): (() => void) => {
      return originalRegisterFallback(wrapFallbackHandler(handler))
    }
  }

  if (typeof ctx.inject === 'function') {
    ctx.inject(['connection'], (fiber) => {
      const connection = connectionFrom(fiber)
      if (connection === undefined) return
      wrapBrowserSession(connection, skipped, ctx.effect)
    })
  }

  // Routes registered before this plugin activated never saw the wrappers
  // above (see the header note on activation order). Adopt them in place:
  // dispatch reads `route.handler`, so replacing it is enough.
  const restorations: Array<() => void> = []
  let adopted = 0
  const webServer = ctx.webServer

  for (const table of [webServer.exact, webServer.prefixes]) {
    if (!(table instanceof Map)) continue
    for (const [path, route] of table) {
      if (typeof route?.handler !== 'function' || isWrapped(route.handler)) continue
      const wrapped: WebRoute = {
        ...route,
        handler: wrapHttpHandler(route.handler, isApiPrefix(route)),
      }
      table.set(path, wrapped)
      adopted += 1
      restorations.push(() => {
        if (table.get(path) === wrapped) table.set(path, route)
      })
    }
  }

  if (webServer.upgrades instanceof Map) {
    const upgrades = webServer.upgrades
    for (const [path, route] of upgrades) {
      if (typeof route?.handler !== 'function' || isWrapped(route.handler)) continue
      const wrapped: WebUpgradeRoute = {
        ...route,
        handler: wrapUpgradeHandler(route.handler, isRemoteMuxUpgrade(route)),
      }
      upgrades.set(path, wrapped)
      adopted += 1
      restorations.push(() => {
        if (upgrades.get(path) === wrapped) upgrades.set(path, route)
      })
    }
  }

  if (typeof webServer.fallback === 'function' && !isWrapped(webServer.fallback)) {
    const original = webServer.fallback
    const wrapped = wrapFallbackHandler(original)
    webServer.fallback = wrapped
    adopted += 1
    restorations.push(() => {
      if (webServer.fallback === wrapped) webServer.fallback = original
    })
  }

  if (adopted > 0) {
    logger.info(`adopted ${String(adopted)} route(s) registered before activation`)
  }

  ctx.effect(() => () => {
    for (const restore of restorations) restore()
    ctx.webServer.register = originalRegister
    ctx.webServer.registerUpgrade = originalRegisterUpgrade
    if (originalRegisterFallback !== undefined) {
      ctx.webServer.registerFallback = originalRegisterFallback
    }
  }, 'dsh-cloudflare-access: restore webServer.register')
}

/**
 * Loopback 交给原 handler（DSH 自己走 token/Cookie）。
 * Access 登录回调经常是 `sec-fetch-site: cross-site` 导航，跳过 Cookie 只要求 Host 在 `--trusted-host` 中且 JWT 有效，不套用完整 Origin 栅栏。policy deny 仍要求完整 Host/Origin。
 */
async function authorize(req: IncomingMessage, deps: ServerCompatDeps): Promise<Gate> {
  const headers = nodeHeaders(req)
  if (requestIsLoopback(headers)) return { action: 'forward', skipBrowserSession: false }

  const trustedHosts = deps.getTrustedHosts()
  const remoteHostTrusted = requestRemoteHostTrusted(headers, trustedHosts)
  const hostOriginTrusted = isTrustedApiRequest(headers, trustedHosts)

  const method = rpcMethodFromUrl(req.url)
  const token = readAccessJwt(headers)
  const tokenPresent = token !== undefined && token.trim() !== ''
  const needPolicyJwt = hostOriginTrusted && jwtParticipates({
    method,
    ordinary: deps.config.ordinary,
    tokenPresent,
  })
  let jwt = MISSING_JWT
  if (needPolicyJwt || (remoteHostTrusted && tokenPresent)) {
    jwt = await deps.verifier.verify(headers)
  }

  const skipBrowserSession = remoteHostTrusted && jwt.outcome === 'valid'
  if (!hostOriginTrusted || !needPolicyJwt) {
    return { action: 'forward', skipBrowserSession }
  }

  const decision = decide({
    isLoopback: false,
    hostOriginTrusted: true,
    method,
    ordinary: deps.config.ordinary,
    jwt,
  })
  if (decision.effect !== 'deny') return { action: 'forward', skipBrowserSession }

  const http = httpStatusFor(decision)
  return {
    action: 'deny',
    status: http?.status ?? 401,
    body: http?.body ?? 'unauthorized',
    method,
    privileged: decision.class === 'privileged',
    reason: decision.reason,
  }
}
