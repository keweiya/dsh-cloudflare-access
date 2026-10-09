/**
 * Host/Origin fence copy, equivalent to DSH's own `api-request-trust` as
 * measured on 0.1.5-alpha.1 and 0.2.0-rc.2 (`@deepseek-ai/dsh-client-connection`:
 * `isLoopbackHostname`, `canonicalAuthority`, `isTrustedAuthority`,
 * `isTrustedApiRequest`).
 * Kept in compat so JWT core does not import DSH internals.
 */
export function isLoopbackHostname(hostname: string): boolean {
  if (hostname === 'localhost' || hostname === '[::1]') return true
  const parts = hostname.split('.')
  return parts.length === 4
    && parts[0] === '127'
    && parts.every(part => /^\d{1,3}$/.test(part) && Number(part) <= 255)
}

function header(
  headers: { get(name: string): string | null } | Record<string, string | string[] | undefined>,
  name: string,
): string | undefined {
  if (typeof (headers as { get?: unknown }).get === 'function') {
    return (headers as { get(name: string): string | null }).get(name) ?? undefined
  }
  const value = (headers as Record<string, string | string[] | undefined>)[name]
    ?? (headers as Record<string, string | string[] | undefined>)[name.toLowerCase()]
  return typeof value === 'string' ? value : undefined
}

function parseAuthority(authority: string): URL | undefined {
  try {
    return new URL(`http://${authority}`)
  } catch {
    return undefined
  }
}

function canonicalAuthority(entry: string, entryUrl: URL): string {
  const port = entryUrl.port !== '' ? entryUrl.port : new URL(`https://${entry}`).port
  return port === '' ? entryUrl.hostname : `${entryUrl.hostname}:${port}`
}

function isTrustedAuthority(hostUrl: URL, trustedHosts: readonly string[]): boolean {
  return trustedHosts.some((entry) => {
    const entryUrl = parseAuthority(entry)
    if (entryUrl === undefined) return false
    return canonicalAuthority(entry, entryUrl) === entryUrl.hostname
      ? entryUrl.hostname === hostUrl.hostname
      : entryUrl.host === hostUrl.host
  })
}

export function isTrustedApiRequest(
  headers: { get(name: string): string | null } | Record<string, string | string[] | undefined>,
  trustedHosts: readonly string[],
): boolean {
  const hostUrl = requestHostUrl(headers)
  if (hostUrl === undefined) return false
  if (!isLoopbackHostname(hostUrl.hostname) && !isTrustedAuthority(hostUrl, trustedHosts)) return false
  if (header(headers, 'sec-fetch-site') === 'cross-site') return false
  const origin = header(headers, 'origin')
  if (origin === undefined) return true
  try {
    return new URL(origin).host === hostUrl.host
  } catch {
    return false
  }
}

/**
 * Host 是否为已声明的远程 trusted-host。
 * 不看 Origin / sec-fetch-site：Access 登录回调经常是 cross-site 导航。
 */
export function requestRemoteHostTrusted(
  headers: { get(name: string): string | null } | Record<string, string | string[] | undefined>,
  trustedHosts: readonly string[],
): boolean {
  const hostUrl = requestHostUrl(headers)
  if (hostUrl === undefined || isLoopbackHostname(hostUrl.hostname)) return false
  return isTrustedAuthority(hostUrl, trustedHosts)
}

function requestHostUrl(
  headers: { get(name: string): string | null } | Record<string, string | string[] | undefined>,
): URL | undefined {
  const host = header(headers, 'host')
  if (host === undefined) return undefined
  return parseAuthority(host)
}

export function requestIsLoopback(
  headers: { get(name: string): string | null } | Record<string, string | string[] | undefined>,
): boolean {
  const host = header(headers, 'host')
  if (host === undefined) return false
  const hostUrl = parseAuthority(host)
  return hostUrl !== undefined && isLoopbackHostname(hostUrl.hostname)
}
