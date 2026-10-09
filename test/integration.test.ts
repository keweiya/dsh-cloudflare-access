import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { Duplex } from 'node:stream'
import { generateKeyPair, SignJWT, exportJWK } from 'jose'
import { apply as applyServer } from '../src/server/index.ts'
import { httpStatusFor } from '../src/server/authorization.ts'
import { decide } from '../src/server/policy.ts'
import { installServerCompat, type WebRoute, type WebUpgradeRoute } from '../src/compat/dsh.ts'
import type { JwtVerification } from '../src/server/types.ts'

interface FakeWebServer {
  register(route: WebRoute): () => void
  registerUpgrade(route: WebUpgradeRoute): () => void
  registerFallback(handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>): () => void
  /** DSH 的真实形状：按 path 存的路由表（本插件就地采纳时会替换条目）。 */
  exact: Map<string, WebRoute>
  prefixes: Map<string, WebRoute>
  upgrades: Map<string, WebUpgradeRoute>
  fallback?: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
  /** 测试读取视图：`kind:path` → 当前表里的路由。 */
  routes: { get(key: string): WebRoute | undefined }
}

function collectEffects(disposers: Array<() => void>) {
  return (cb: () => (() => void) | Promise<void>): void => {
    const dispose = cb()
    if (typeof dispose === 'function') disposers.push(dispose)
  }
}

/**
 * Mirrors the shipped webserver: routes live in per-kind Maps keyed by path and
 * dispatch reads `route.handler`, so adopting a pre-registered route in place is
 * observable through this fake.
 */
function createFakeWebServer(): FakeWebServer {
  const exact = new Map<string, WebRoute>()
  const prefixes = new Map<string, WebRoute>()
  const upgrades = new Map<string, WebUpgradeRoute>()
  const tableFor = (kind: string) => (kind === 'exact' ? exact : prefixes)
  const webServer: FakeWebServer = {
    exact,
    prefixes,
    upgrades,
    routes: {
      get(key) {
        const separator = key.indexOf(':')
        return tableFor(key.slice(0, separator)).get(key.slice(separator + 1))
      },
    },
    register(route) {
      const table = tableFor(route.kind)
      table.set(route.path, route)
      return () => { table.delete(route.path) }
    },
    registerUpgrade(route) {
      upgrades.set(route.path, route)
      return () => { upgrades.delete(route.path) }
    },
    registerFallback(handler) {
      if (webServer.fallback !== undefined) {
        throw new Error('webserver: fallback already registered')
      }
      webServer.fallback = handler
      return () => { webServer.fallback = undefined }
    },
  }
  return webServer
}

describe('server compat integration', () => {
  it('restores register after unload', () => {
    const webServer = createFakeWebServer()
    const original = webServer.register
    const disposers: Array<() => void> = []
    const ctx = {
      webServer,
      logger: { info() {}, warn() {} },
      effect: collectEffects(disposers),
      get(name: string) {
        if (name === 'webRuntime') return { trustedHosts: ['dsh.example.com'] }
        return undefined
      },
    }
    applyServer(ctx, {
      cloudflare: { teamDomain: 'https://example.cloudflareaccess.com', audiences: ['aud'] },
    })
    expect(webServer.register).not.toBe(original)
    for (const dispose of disposers) dispose()
    expect(webServer.register).toBe(original)
  })

  it('restores registerUpgrade after unload', () => {
    const webServer = createFakeWebServer()
    const original = webServer.registerUpgrade
    const disposers: Array<() => void> = []
    applyServer({
      webServer,
      logger: { info() {}, warn() {} },
      effect: collectEffects(disposers),
      get() { return undefined },
    }, {
      cloudflare: { teamDomain: 'https://example.cloudflareaccess.com', audiences: ['aud'] },
    })
    expect(webServer.registerUpgrade).not.toBe(original)
    for (const dispose of disposers) dispose()
    expect(webServer.registerUpgrade).toBe(original)
  })

  it('maps missing privileged JWT to 401', () => {
    const http = httpStatusFor(decide({
      isLoopback: false,
      hostOriginTrusted: true,
      method: 'settings/describe',
      ordinary: 'off',
      jwt: { outcome: 'missing', reason: 'missing_token', audienceMatched: null },
    }))
    expect(http).toEqual({ status: 401, body: 'unauthorized' })
  })

  it('does not log token material in deny messages', () => {
    const lines: string[] = []
    const webServer = createFakeWebServer()
    const disposers: Array<() => void> = []
    applyServer({
      webServer,
      logger: {
        info(message) { lines.push(message) },
        warn(message) { lines.push(message) },
      },
      effect: collectEffects(disposers),
      get() { return undefined },
    }, {
      cloudflare: { teamDomain: 'https://example.cloudflareaccess.com', audiences: ['aud'] },
    })
    const joined = lines.join('\n')
    expect(joined).not.toMatch(/eyJ/)
    expect(joined).toContain('plugin initialized')
    for (const dispose of disposers) dispose()
  })
})

describe('end-to-end privileged wrap', () => {
  it('allows remote privileged after Host/Origin and a valid JWT, and 401 without a token', async () => {
    const pair = await generateKeyPair('RS256', { extractable: true })
    const publicJwk = await exportJWK(pair.publicKey)
    publicJwk.kid = 'k1'
    publicJwk.alg = 'RS256'
    publicJwk.use = 'sig'
    const jwks = createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ keys: [publicJwk] }))
    })
    await new Promise<void>((resolve) => { jwks.listen(0, '127.0.0.1', () => { resolve() }) })
    const addr = jwks.address()
    if (addr === null || typeof addr === 'string') throw new Error('port')
    const origin = `http://127.0.0.1:${String(addr.port)}`

    const webServer = createFakeWebServer()
    const disposers: Array<() => void> = []
    applyServer({
      webServer,
      logger: { info() {}, warn() {} },
      effect: collectEffects(disposers),
      get(name: string) {
        if (name === 'webRuntime') return { trustedHosts: ['dsh.example.com'] }
        return undefined
      },
    }, {
      cloudflare: { teamDomain: origin, audiences: ['aud'] },
    })

    const innerCalls: string[] = []
    webServer.register({
      kind: 'prefix',
      path: '/api',
      handler: async (_req, res) => {
        innerCalls.push('inner')
        res.writeHead(200)
        res.end('inner')
      },
    })

    const token = await new SignJWT({})
      .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
      .setIssuedAt()
      .setIssuer(origin)
      .setAudience('aud')
      .setExpirationTime('5m')
      .sign(pair.privateKey)

    const route = webServer.routes.get('prefix:/api')
    if (route === undefined) throw new Error('route missing')

    const missing = await invoke(route.handler, {
      url: '/api/settings/describe',
      headers: { host: 'dsh.example.com', origin: 'https://dsh.example.com' },
    })
    expect(missing.status).toBe(401)
    expect(innerCalls).toEqual([])

    const allowed = await invoke(route.handler, {
      url: '/api/settings/describe',
      headers: {
        host: 'dsh.example.com',
        origin: 'https://dsh.example.com',
        'cf-access-jwt-assertion': token,
      },
    })
    expect(allowed.status).toBe(200)
    expect(allowed.body).toBe('inner')
    expect(innerCalls).toEqual(['inner'])

    const badHost = await invoke(route.handler, {
      url: '/api/settings/describe',
      headers: {
        host: 'evil.example',
        origin: 'https://evil.example',
        'cf-access-jwt-assertion': token,
      },
    })
    expect(badHost.status).toBe(200)
    expect(badHost.body).toBe('inner')
    expect(innerCalls).toEqual(['inner', 'inner'])

    for (const dispose of disposers) dispose()
    jwks.close()
  })
})

describe('JWT verification is skipped when it cannot change the decision', () => {
  function pluginConfig(ordinary: 'off' | 'optional' | 'required' = 'off') {
    return {
      teamDomain: 'https://example.cloudflareaccess.com',
      audiences: ['aud'],
      ordinary,
      envLocked: { teamDomain: false, audiences: false, ordinary: false },
    }
  }

  function countingVerifier(verify: () => Promise<JwtVerification>) {
    let calls = 0
    return {
      calls: () => calls,
      verifier: {
        async verify() {
          calls += 1
          return verify()
        },
      },
    }
  }

  async function mountApi(input: {
    ordinary?: 'off' | 'optional' | 'required'
    verify?: () => Promise<JwtVerification>
  }) {
    const webServer = createFakeWebServer()
    const disposers: Array<() => void> = []
    const counted = countingVerifier(input.verify ?? (async () => ({
      outcome: 'invalid',
      reason: 'invalid_signature',
      audienceMatched: null,
    })))
    installServerCompat({
      webServer,
      logger: { info() {}, warn() {} },
      effect: collectEffects(disposers),
      get() { return undefined },
    }, {
      config: pluginConfig(input.ordinary),
      verifier: counted.verifier,
      getTrustedHosts: () => ['dsh.example.com'],
    })
    const innerCalls: string[] = []
    webServer.register({
      kind: 'prefix',
      path: '/api',
      handler: async (_req, res) => {
        innerCalls.push('inner')
        res.writeHead(200)
        res.end('inner')
      },
    })
    const route = webServer.routes.get('prefix:/api')
    if (route === undefined) throw new Error('route missing')
    return { route, innerCalls, calls: counted.calls, disposers }
  }

  it('does not verify ordinary APIs when ordinary=off and no JWT is present', async () => {
    const { route, innerCalls, calls, disposers } = await mountApi({ ordinary: 'off' })
    const result = await invoke(route.handler, {
      url: '/api/llm/listProviders',
      headers: {
        host: 'dsh.example.com',
        origin: 'https://dsh.example.com',
      },
    })
    expect(result.status).toBe(200)
    expect(result.body).toBe('inner')
    expect(innerCalls).toEqual(['inner'])
    expect(calls()).toBe(0)
    for (const dispose of disposers) dispose()
  })

  it('verifies a present JWT on ordinary=off so it can replace the DSH session cookie', async () => {
    const { route, innerCalls, calls, disposers } = await mountApi({ ordinary: 'off' })
    const result = await invoke(route.handler, {
      url: '/api/llm/listProviders',
      headers: {
        host: 'dsh.example.com',
        origin: 'https://dsh.example.com',
        'cf-access-jwt-assertion': 'not-a-jwt',
      },
    })
    expect(result.status).toBe(200)
    expect(result.body).toBe('inner')
    expect(innerCalls).toEqual(['inner'])
    expect(calls()).toBe(1)
    for (const dispose of disposers) dispose()
  })

  it('does not verify when Host/Origin already failed', async () => {
    const { route, innerCalls, calls, disposers } = await mountApi({ ordinary: 'required' })
    const result = await invoke(route.handler, {
      url: '/api/settings/describe',
      headers: {
        host: 'evil.example',
        origin: 'https://evil.example',
        'cf-access-jwt-assertion': 'not-a-jwt',
      },
    })
    expect(result.status).toBe(200)
    expect(innerCalls).toEqual(['inner'])
    expect(calls()).toBe(0)
    for (const dispose of disposers) dispose()
  })

  it('still verifies remote privileged APIs when ordinary=off', async () => {
    const { route, innerCalls, calls, disposers } = await mountApi({ ordinary: 'off' })
    const result = await invoke(route.handler, {
      url: '/api/settings/describe',
      headers: {
        host: 'dsh.example.com',
        origin: 'https://dsh.example.com',
        'cf-access-jwt-assertion': 'not-a-jwt',
      },
    })
    expect(result.status).toBe(403)
    expect(innerCalls).toEqual([])
    expect(calls()).toBe(1)
    for (const dispose of disposers) dispose()
  })
})

describe('wrap-layer authorization paths', () => {
  const config = {
    teamDomain: 'https://example.cloudflareaccess.com',
    audiences: ['aud'],
    ordinary: 'off' as const,
    envLocked: { teamDomain: false, audiences: false, ordinary: false },
  }

  it('lets loopback privileged through without a JWT', async () => {
    const webServer = createFakeWebServer()
    const disposers: Array<() => void> = []
    let verifies = 0
    installServerCompat({
      webServer,
      logger: { info() {}, warn() {} },
      effect: collectEffects(disposers),
      get() { return undefined },
    }, {
      config,
      verifier: {
        async verify() {
          verifies += 1
          return { outcome: 'missing', reason: 'missing_token', audienceMatched: null }
        },
      },
      getTrustedHosts: () => ['dsh.example.com'],
    })
    webServer.register({
      kind: 'prefix',
      path: '/api',
      handler: async (_req, res) => {
        res.writeHead(200)
        res.end('loopback')
      },
    })
    const route = webServer.routes.get('prefix:/api')
    if (route === undefined) throw new Error('route missing')
    const result = await invoke(route.handler, {
      url: '/api/settings/describe',
      headers: { host: 'localhost' },
    })
    expect(result.status).toBe(200)
    expect(result.body).toBe('loopback')
    expect(verifies).toBe(0)
    for (const dispose of disposers) dispose()
  })

  it('hands remote privileged to the original handler after a valid JWT', async () => {
    const webServer = createFakeWebServer()
    const disposers: Array<() => void> = []
    installServerCompat({
      webServer,
      logger: { info() {}, warn() {} },
      effect: collectEffects(disposers),
      get() { return undefined },
    }, {
      config,
      verifier: {
        async verify() {
          return { outcome: 'valid', reason: null, audienceMatched: 'aud' }
        },
      },
      getTrustedHosts: () => ['dsh.example.com'],
    })
    webServer.register({
      kind: 'prefix',
      path: '/api',
      handler: async (_req, res) => {
        res.writeHead(200)
        res.end('inner')
      },
    })
    const route = webServer.routes.get('prefix:/api')
    if (route === undefined) throw new Error('route missing')
    const result = await invoke(route.handler, {
      url: '/api/settings/describe',
      headers: {
        host: 'dsh.example.com',
        origin: 'https://dsh.example.com',
        'cf-access-jwt-assertion': 'valid-looking',
      },
    })
    expect(result.status).toBe(200)
    expect(result.body).toBe('inner')
    for (const dispose of disposers) dispose()
  })

  it('rejects an events upgrade when ordinary=required and the JWT is missing', async () => {
    const webServer = createFakeWebServer()
    const disposers: Array<() => void> = []
    installServerCompat({
      webServer,
      logger: { info() {}, warn() {} },
      effect: collectEffects(disposers),
      get() { return undefined },
    }, {
      config: { ...config, ordinary: 'required' },
      verifier: {
        async verify() {
          return { outcome: 'missing', reason: 'missing_token', audienceMatched: null }
        },
      },
      getTrustedHosts: () => ['dsh.example.com'],
    })
    let inner = 0
    webServer.registerUpgrade({
      path: '/api/remote.mux',
      handler: async () => { inner += 1 },
    })
    const route = webServer.upgrades.get('/api/remote.mux')
    if (route === undefined) throw new Error('upgrade missing')
    const result = await invokeUpgrade(route.handler, {
      url: '/api/remote.mux',
      headers: {
        host: 'dsh.example.com',
        origin: 'https://dsh.example.com',
      },
    })
    expect(result.status).toBe(401)
    expect(inner).toBe(0)
    for (const dispose of disposers) dispose()
  })

  it('rejects an events upgrade with 403 when the JWT is present but invalid', async () => {
    const webServer = createFakeWebServer()
    const disposers: Array<() => void> = []
    installServerCompat({
      webServer,
      logger: { info() {}, warn() {} },
      effect: collectEffects(disposers),
      get() { return undefined },
    }, {
      config: { ...config, ordinary: 'required' },
      verifier: {
        async verify() {
          return { outcome: 'invalid', reason: 'expired', audienceMatched: null }
        },
      },
      getTrustedHosts: () => ['dsh.example.com'],
    })
    let inner = 0
    webServer.registerUpgrade({
      path: '/api/remote.mux',
      handler: async () => { inner += 1 },
    })
    const route = webServer.upgrades.get('/api/remote.mux')
    if (route === undefined) throw new Error('upgrade missing')
    const result = await invokeUpgrade(route.handler, {
      url: '/api/remote.mux',
      headers: {
        host: 'dsh.example.com',
        origin: 'https://dsh.example.com',
        'cf-access-jwt-assertion': 'expired-token',
      },
    })
    expect(result.status).toBe(403)
    expect(inner).toBe(0)
    for (const dispose of disposers) dispose()
  })
})

describe('Access JWT substitutes for the DSH launch-token cookie', () => {
  const config = {
    teamDomain: 'https://example.cloudflareaccess.com',
    audiences: ['aud'],
    ordinary: 'off' as const,
    envLocked: { teamDomain: false, audiences: false, ordinary: false },
  }

  function createConnection() {
    return {
      requestRejection(_req: IncomingMessage): 401 | 403 | undefined {
        return 401
      },
      authorizeIndex(_req: IncomingMessage, res: ServerResponse): boolean {
        res.writeHead(401)
        res.end('dsh web authentication required')
        return false
      },
    }
  }

  it('skips requestRejection 401 on remote after a valid JWT', async () => {
    const webServer = createFakeWebServer()
    const disposers: Array<() => void> = []
    const connection = createConnection()
    const originalRejection = connection.requestRejection
    installServerCompat({
      webServer,
      logger: { info() {}, warn() {} },
      effect: collectEffects(disposers),
      get() { return undefined },
      inject(_deps, callback) {
        callback({ connection })
      },
    }, {
      config,
      verifier: {
        async verify() {
          return { outcome: 'valid', reason: null, audienceMatched: 'aud' }
        },
      },
      getTrustedHosts: () => ['dsh.example.com'],
    })
    webServer.register({
      kind: 'prefix',
      path: '/api',
      handler: async (req, res) => {
        const rejection = connection.requestRejection(req)
        if (rejection !== undefined) {
          res.writeHead(rejection)
          res.end('blocked')
          return
        }
        res.writeHead(200)
        res.end('inner')
      },
    })
    const route = webServer.routes.get('prefix:/api')
    if (route === undefined) throw new Error('route missing')
    const result = await invoke(route.handler, {
      url: '/api/settings/describe',
      headers: {
        host: 'dsh.example.com',
        origin: 'https://dsh.example.com',
        'cf-access-jwt-assertion': 'valid',
      },
    })
    expect(result.status).toBe(200)
    expect(result.body).toBe('inner')
    for (const dispose of disposers) dispose()
    expect(connection.requestRejection).toBe(originalRejection)
  })

  it('keeps the DSH cookie requirement on loopback', async () => {
    const webServer = createFakeWebServer()
    const disposers: Array<() => void> = []
    const connection = createConnection()
    installServerCompat({
      webServer,
      logger: { info() {}, warn() {} },
      effect: collectEffects(disposers),
      get() { return undefined },
      inject(_deps, callback) {
        callback({ connection })
      },
    }, {
      config,
      verifier: {
        async verify() {
          return { outcome: 'valid', reason: null, audienceMatched: 'aud' }
        },
      },
      getTrustedHosts: () => ['dsh.example.com'],
    })
    webServer.register({
      kind: 'prefix',
      path: '/api',
      handler: async (req, res) => {
        const rejection = connection.requestRejection(req)
        if (rejection !== undefined) {
          res.writeHead(rejection)
          res.end('blocked')
          return
        }
        res.writeHead(200)
        res.end('inner')
      },
    })
    const route = webServer.routes.get('prefix:/api')
    if (route === undefined) throw new Error('route missing')
    const result = await invoke(route.handler, {
      url: '/api/settings/describe',
      headers: { host: 'localhost' },
    })
    expect(result.status).toBe(401)
    expect(result.body).toBe('blocked')
    for (const dispose of disposers) dispose()
  })

  it('lets remote index through authorizeIndex after a valid JWT', async () => {
    const fallbacks: Array<(req: IncomingMessage, res: ServerResponse) => void | Promise<void>> = []
    const webServer = createFakeWebServer()
    webServer.registerFallback = (handler) => {
      fallbacks.push(handler)
      return () => { fallbacks.pop() }
    }
    const disposers: Array<() => void> = []
    const connection = createConnection()
    installServerCompat({
      webServer,
      logger: { info() {}, warn() {} },
      effect: collectEffects(disposers),
      get() { return undefined },
      inject(_deps, callback) {
        callback({ connection })
      },
    }, {
      config,
      verifier: {
        async verify() {
          return { outcome: 'valid', reason: null, audienceMatched: 'aud' }
        },
      },
      getTrustedHosts: () => ['dsh.example.com'],
    })
    webServer.registerFallback((req, res) => {
      if (!connection.authorizeIndex(req, res)) return
      res.writeHead(200)
      res.end('index')
    })
    const handler = fallbacks.at(-1)
    if (handler === undefined) throw new Error('fallback missing')
    const result = await invoke(handler, {
      url: '/',
      headers: {
        host: 'dsh.example.com',
        origin: 'https://dsh.example.com',
        'cf-access-jwt-assertion': 'valid',
      },
    })
    expect(result.status).toBe(200)
    expect(result.body).toBe('index')
    for (const dispose of disposers) dispose()
  })

  it('skips the DSH cookie on Access login callbacks marked cross-site', async () => {
    const fallbacks: Array<(req: IncomingMessage, res: ServerResponse) => void | Promise<void>> = []
    const webServer = createFakeWebServer()
    webServer.registerFallback = (handler) => {
      fallbacks.push(handler)
      return () => { fallbacks.pop() }
    }
    const disposers: Array<() => void> = []
    const connection = createConnection()
    installServerCompat({
      webServer,
      logger: { info() {}, warn() {} },
      effect: collectEffects(disposers),
      get() { return undefined },
      inject(_deps, callback) {
        callback({ connection })
      },
    }, {
      config,
      verifier: {
        async verify() {
          return { outcome: 'valid', reason: null, audienceMatched: 'aud' }
        },
      },
      getTrustedHosts: () => ['dsh.luawig.top'],
    })
    webServer.registerFallback((req, res) => {
      if (!connection.authorizeIndex(req, res)) return
      res.writeHead(200)
      res.end('index')
    })
    const handler = fallbacks.at(-1)
    if (handler === undefined) throw new Error('fallback missing')
    const result = await invoke(handler, {
      url: '/',
      headers: {
        host: 'dsh.luawig.top',
        'sec-fetch-site': 'cross-site',
        origin: 'https://example.cloudflareaccess.com',
        'cf-access-jwt-assertion': 'valid',
      },
    })
    expect(result.status).toBe(200)
    expect(result.body).toBe('index')
    for (const dispose of disposers) dispose()
  })
})

describe('third-party routes reuse the Access JWT cookie substitution', () => {
  const config = {
    teamDomain: 'https://example.cloudflareaccess.com',
    audiences: ['aud'],
    ordinary: 'off' as const,
    envLocked: { teamDomain: false, audiences: false, ordinary: false },
  }

  function createConnection() {
    return {
      requestRejection(_req: IncomingMessage): 401 | 403 | undefined {
        return 401
      },
      authorizeIndex(_req: IncomingMessage, res: ServerResponse): boolean {
        res.writeHead(401)
        res.end('dsh web authentication required')
        return false
      },
    }
  }

  /**
   * Mount the plugin over a fake host, then register a dshmarket-shaped exact
   * route whose handler asks the host gate itself — exactly what dshmarket's
   * `refuseUnadmitted` does since 1.66.13 (dsh-market#603).
   */
  function mount(input: {
    ordinary?: 'off' | 'optional' | 'required'
    verify?: () => Promise<JwtVerification>
  } = {}) {
    const webServer = createFakeWebServer()
    const disposers: Array<() => void> = []
    const connection = createConnection()
    installServerCompat({
      webServer,
      logger: { info() {}, warn() {} },
      effect: collectEffects(disposers),
      get() { return undefined },
      inject(_deps, callback) {
        callback({ connection })
      },
    }, {
      config: { ...config, ordinary: input.ordinary ?? 'off' },
      verifier: {
        async verify() {
          return input.verify === undefined
            ? { outcome: 'valid', reason: null, audienceMatched: 'aud' }
            : await input.verify()
        },
      },
      getTrustedHosts: () => ['dsh.example.com'],
    })
    webServer.register({
      kind: 'exact',
      path: '/dsh-market/status',
      handler: async (req, res) => {
        const rejection = connection.requestRejection(req)
        if (rejection !== undefined) {
          res.writeHead(rejection)
          res.end('blocked')
          return
        }
        res.writeHead(200)
        res.end('market')
      },
    })
    const route = webServer.routes.get('exact:/dsh-market/status')
    if (route === undefined) throw new Error('route missing')
    return { route, webServer, disposers, connection }
  }

  it('skips the launch-token cookie on a third-party exact route after a valid JWT', async () => {
    const { route, disposers } = mount()
    const result = await invoke(route.handler, {
      url: '/dsh-market/status',
      headers: {
        host: 'dsh.example.com',
        origin: 'https://dsh.example.com',
        'cf-access-jwt-assertion': 'valid',
      },
    })
    expect(result.status).toBe(200)
    expect(result.body).toBe('market')
    for (const dispose of disposers) dispose()
  })

  it('keeps the launch-token cookie requirement without a JWT', async () => {
    const { route, disposers } = mount()
    const result = await invoke(route.handler, {
      url: '/dsh-market/status',
      headers: { host: 'dsh.example.com', origin: 'https://dsh.example.com' },
    })
    expect(result.status).toBe(401)
    expect(result.body).toBe('blocked')
    for (const dispose of disposers) dispose()
  })

  it('keeps the launch-token cookie requirement when the JWT is invalid', async () => {
    const { route, disposers } = mount({
      verify: async () => ({ outcome: 'invalid', reason: 'expired', audienceMatched: null }),
    })
    const result = await invoke(route.handler, {
      url: '/dsh-market/status',
      headers: {
        host: 'dsh.example.com',
        origin: 'https://dsh.example.com',
        'cf-access-jwt-assertion': 'expired',
      },
    })
    expect(result.status).toBe(401)
    expect(result.body).toBe('blocked')
    for (const dispose of disposers) dispose()
  })

  it('keeps loopback third-party routes on the official token/cookie', async () => {
    const { route, disposers } = mount()
    const result = await invoke(route.handler, {
      url: '/dsh-market/status',
      headers: { host: '127.0.0.1:3080', 'cf-access-jwt-assertion': 'valid' },
    })
    expect(result.status).toBe(401)
    expect(result.body).toBe('blocked')
    for (const dispose of disposers) dispose()
  })

  it('never applies the ordinary deny policy to a route the plugin does not own', async () => {
    // ordinary=required still denies DSH's own /api and index fallback, but a
    // third-party route must not be denied here: that would lock a co-installed
    // UI (assets, health checks, webhooks) out of its own surface.
    const webServer = createFakeWebServer()
    const disposers: Array<() => void> = []
    installServerCompat({
      webServer,
      logger: { info() {}, warn() {} },
      effect: collectEffects(disposers),
      get() { return undefined },
    }, {
      config: { ...config, ordinary: 'required' },
      verifier: {
        async verify() {
          return { outcome: 'missing', reason: 'missing_token', audienceMatched: null }
        },
      },
      getTrustedHosts: () => ['dsh.example.com'],
    })
    webServer.register({
      kind: 'exact',
      path: '/dsh-market/plugin/client.js',
      handler: async (_req, res) => {
        res.writeHead(200)
        res.end('asset')
      },
    })
    const route = webServer.routes.get('exact:/dsh-market/plugin/client.js')
    if (route === undefined) throw new Error('route missing')
    const result = await invoke(route.handler, {
      url: '/dsh-market/plugin/client.js',
      headers: { host: 'dsh.example.com', origin: 'https://dsh.example.com' },
    })
    expect(result.status).toBe(200)
    expect(result.body).toBe('asset')
    for (const dispose of disposers) dispose()
  })

  it("still denies DSH's own ordinary /api under ordinary=required", async () => {
    const webServer = createFakeWebServer()
    const disposers: Array<() => void> = []
    installServerCompat({
      webServer,
      logger: { info() {}, warn() {} },
      effect: collectEffects(disposers),
      get() { return undefined },
    }, {
      config: { ...config, ordinary: 'required' },
      verifier: {
        async verify() {
          return { outcome: 'missing', reason: 'missing_token', audienceMatched: null }
        },
      },
      getTrustedHosts: () => ['dsh.example.com'],
    })
    let inner = 0
    webServer.register({
      kind: 'prefix',
      path: '/api',
      handler: async (_req, res) => {
        inner += 1
        res.writeHead(200)
        res.end('inner')
      },
    })
    const route = webServer.routes.get('prefix:/api')
    if (route === undefined) throw new Error('route missing')
    const result = await invoke(route.handler, {
      url: '/api/llm/listProviders',
      headers: { host: 'dsh.example.com', origin: 'https://dsh.example.com' },
    })
    expect(result.status).toBe(401)
    expect(inner).toBe(0)
    for (const dispose of disposers) dispose()
  })

  it('marks a third-party websocket upgrade after a valid JWT', async () => {
    const webServer = createFakeWebServer()
    const disposers: Array<() => void> = []
    const connection = createConnection()
    installServerCompat({
      webServer,
      logger: { info() {}, warn() {} },
      effect: collectEffects(disposers),
      get() { return undefined },
      inject(_deps, callback) {
        callback({ connection })
      },
    }, {
      config,
      verifier: {
        async verify() {
          return { outcome: 'valid', reason: null, audienceMatched: 'aud' }
        },
      },
      getTrustedHosts: () => ['dsh.example.com'],
    })
    const seen: Array<401 | 403 | undefined> = []
    webServer.registerUpgrade({
      path: '/dsh-market/events',
      handler: async (req) => { seen.push(connection.requestRejection(req)) },
    })
    const route = webServer.upgrades.get('/dsh-market/events')
    if (route === undefined) throw new Error('upgrade missing')
    await invokeUpgrade(route.handler, {
      url: '/dsh-market/events',
      headers: {
        host: 'dsh.example.com',
        origin: 'https://dsh.example.com',
        'cf-access-jwt-assertion': 'valid',
      },
    })
    expect(seen).toEqual([undefined])
    for (const dispose of disposers) dispose()
  })
})

describe('routes registered before the plugin activated', () => {
  const config = {
    teamDomain: 'https://example.cloudflareaccess.com',
    audiences: ['aud'],
    ordinary: 'off' as const,
    envLocked: { teamDomain: false, audiences: false, ordinary: false },
  }

  const withJwt = {
    host: 'dsh.example.com',
    origin: 'https://dsh.example.com',
    'cf-access-jwt-assertion': 'valid',
  }
  const withoutJwt = { host: 'dsh.example.com', origin: 'https://dsh.example.com' }

  function createConnection() {
    return {
      requestRejection(_req: IncomingMessage): 401 | 403 | undefined {
        return 401
      },
      authorizeIndex(_req: IncomingMessage, res: ServerResponse): boolean {
        res.writeHead(401)
        res.end('dsh web authentication required')
        return false
      },
    }
  }

  function marketHandler(connection: ReturnType<typeof createConnection>) {
    return async (req: IncomingMessage, res: ServerResponse) => {
      const rejection = connection.requestRejection(req)
      if (rejection !== undefined) {
        res.writeHead(rejection)
        res.end('blocked')
        return
      }
      res.writeHead(200)
      res.end('market')
    }
  }

  /**
   * dshmarket mounts inside `ctx.inject(['webServer','loader'], …)`, which on
   * 0.2.0-rc.2 runs before this plugin's own `apply`. The plugin must therefore
   * adopt whatever is already in the webserver's route tables.
   */
  function activate(
    webServer: FakeWebServer,
    connection: ReturnType<typeof createConnection>,
    input: { verify?: () => Promise<JwtVerification>, onVerify?: () => void } = {},
  ) {
    const disposers: Array<() => void> = []
    installServerCompat({
      webServer,
      logger: { info() {}, warn() {} },
      effect: collectEffects(disposers),
      get() { return undefined },
      inject(_deps, callback) {
        callback({ connection })
      },
    }, {
      config,
      verifier: {
        async verify() {
          input.onVerify?.()
          return input.verify === undefined
            ? { outcome: 'valid', reason: null, audienceMatched: 'aud' }
            : await input.verify()
        },
      },
      getTrustedHosts: () => ['dsh.example.com'],
    })
    return { disposers }
  }

  it('adopts a third-party exact route that was registered first', async () => {
    const webServer = createFakeWebServer()
    const connection = createConnection()
    const original = marketHandler(connection)
    webServer.register({ kind: 'exact', path: '/dsh-market/status', handler: original })
    const { disposers } = activate(webServer, connection)

    const adopted = webServer.exact.get('/dsh-market/status')
    expect(adopted?.handler).not.toBe(original)

    const admitted = await invoke(adopted!.handler, { url: '/dsh-market/status', headers: withJwt })
    expect(admitted.status).toBe(200)
    expect(admitted.body).toBe('market')

    const anonymous = await invoke(adopted!.handler, { url: '/dsh-market/status', headers: withoutJwt })
    expect(anonymous.status).toBe(401)
    expect(anonymous.body).toBe('blocked')

    for (const dispose of disposers) dispose()
    expect(webServer.exact.get('/dsh-market/status')?.handler).toBe(original)
  })

  it('adopts a third-party prefix route and an upgrade registered first', async () => {
    const webServer = createFakeWebServer()
    const connection = createConnection()
    webServer.register({ kind: 'prefix', path: '/dsh-market', handler: marketHandler(connection) })
    const seen: Array<401 | 403 | undefined> = []
    webServer.registerUpgrade({
      path: '/dsh-market/events',
      handler: async (req) => { seen.push(connection.requestRejection(req)) },
    })
    const { disposers } = activate(webServer, connection)

    const admitted = await invoke(webServer.prefixes.get('/dsh-market')!.handler, {
      url: '/dsh-market/status',
      headers: withJwt,
    })
    expect(admitted.status).toBe(200)

    await invokeUpgrade(webServer.upgrades.get('/dsh-market/events')!.handler, {
      url: '/dsh-market/events',
      headers: withJwt,
    })
    expect(seen).toEqual([undefined])

    for (const dispose of disposers) dispose()
  })

  it('adopts an index fallback registered first', async () => {
    const webServer = createFakeWebServer()
    const connection = createConnection()
    webServer.registerFallback(async (req, res) => {
      if (!connection.authorizeIndex(req, res)) return
      res.writeHead(200)
      res.end('index')
    })
    const { disposers } = activate(webServer, connection)

    const admitted = await invoke(webServer.fallback!, { url: '/', headers: withJwt })
    expect(admitted.status).toBe(200)
    expect(admitted.body).toBe('index')

    const anonymous = await invoke(webServer.fallback!, { url: '/', headers: withoutJwt })
    expect(anonymous.status).toBe(401)

    for (const dispose of disposers) dispose()
  })

  it('wraps an adopted route exactly once', async () => {
    const webServer = createFakeWebServer()
    const connection = createConnection()
    webServer.register({ kind: 'exact', path: '/dsh-market/status', handler: marketHandler(connection) })
    let verifications = 0
    const { disposers } = activate(webServer, connection, { onVerify: () => { verifications += 1 } })

    const route = webServer.exact.get('/dsh-market/status')
    await invoke(route!.handler, { url: '/dsh-market/status', headers: withJwt })
    expect(verifications).toBe(1)

    // Activating a second time must not stack another wrapper on the same route.
    const second = activate(webServer, connection, { onVerify: () => { verifications += 1 } })
    const readopted = webServer.exact.get('/dsh-market/status')
    await invoke(readopted!.handler, { url: '/dsh-market/status', headers: withJwt })
    expect(verifications).toBe(2)

    for (const dispose of second.disposers) dispose()
    for (const dispose of disposers) dispose()
  })
})

async function invoke(
  handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>,
  input: { url: string, headers: Record<string, string> },
): Promise<{ status: number, body: string }> {
  const chunks: Buffer[] = []
  let status = 200
  let ended = false
  const req = {
    url: input.url,
    method: 'GET',
    headers: input.headers,
    async *[Symbol.asyncIterator]() {},
    destroy() {},
  } as unknown as IncomingMessage
  return await new Promise((resolve, reject) => {
    const res = {
      headersSent: false,
      writableEnded: false,
      writeHead(code: number) {
        status = code
      },
      write(chunk: unknown) {
        if (Buffer.isBuffer(chunk)) chunks.push(chunk)
        else if (chunk instanceof Uint8Array) chunks.push(Buffer.from(chunk))
        else if (chunk !== undefined) chunks.push(Buffer.from(String(chunk)))
      },
      end(body?: unknown) {
        if (ended) return
        ended = true
        if (body !== undefined) {
          if (Buffer.isBuffer(body)) chunks.push(body)
          else if (body instanceof Uint8Array) chunks.push(Buffer.from(body))
          else chunks.push(Buffer.from(String(body)))
        }
        resolve({ status, body: Buffer.concat(chunks).toString() })
      },
      on() { return undefined },
      destroy() {
        if (!ended) {
          ended = true
          resolve({ status, body: Buffer.concat(chunks).toString() })
        }
      },
    } as unknown as ServerResponse
    Promise.resolve(handler(req, res)).catch(reject)
  })
}

async function invokeUpgrade(
  handler: (req: IncomingMessage, socket: Duplex, head: Buffer) => void | Promise<void>,
  input: { url: string, headers: Record<string, string> },
): Promise<{ status: number }> {
  let status = 101
  const req = {
    url: input.url,
    method: 'GET',
    headers: input.headers,
  } as unknown as IncomingMessage
  const socket = {
    write(chunk: unknown) {
      const text = Buffer.isBuffer(chunk) ? chunk.toString() : String(chunk)
      const match = /^HTTP\/1\.\d\s+(\d+)/.exec(text)
      if (match?.[1] !== undefined) status = Number(match[1])
    },
    destroy() {},
  } as unknown as Duplex
  await handler(req, socket, Buffer.alloc(0))
  return { status }
}
