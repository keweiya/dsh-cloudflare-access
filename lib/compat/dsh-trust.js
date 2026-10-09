/**
 * Host/Origin fence copy, equivalent to DSH's own `api-request-trust` as
 * measured on 0.1.5-alpha.1 and 0.2.0-rc.2 (`@deepseek-ai/dsh-client-connection`:
 * `isLoopbackHostname`, `canonicalAuthority`, `isTrustedAuthority`,
 * `isTrustedApiRequest`).
 * Kept in compat so JWT core does not import DSH internals.
 */
export function isLoopbackHostname(hostname) {
    if (hostname === 'localhost' || hostname === '[::1]')
        return true;
    const parts = hostname.split('.');
    return parts.length === 4
        && parts[0] === '127'
        && parts.every(part => /^\d{1,3}$/.test(part) && Number(part) <= 255);
}
function header(headers, name) {
    if (typeof headers.get === 'function') {
        return headers.get(name) ?? undefined;
    }
    const value = headers[name]
        ?? headers[name.toLowerCase()];
    return typeof value === 'string' ? value : undefined;
}
function parseAuthority(authority) {
    try {
        return new URL(`http://${authority}`);
    }
    catch {
        return undefined;
    }
}
function canonicalAuthority(entry, entryUrl) {
    const port = entryUrl.port !== '' ? entryUrl.port : new URL(`https://${entry}`).port;
    return port === '' ? entryUrl.hostname : `${entryUrl.hostname}:${port}`;
}
function isTrustedAuthority(hostUrl, trustedHosts) {
    return trustedHosts.some((entry) => {
        const entryUrl = parseAuthority(entry);
        if (entryUrl === undefined)
            return false;
        return canonicalAuthority(entry, entryUrl) === entryUrl.hostname
            ? entryUrl.hostname === hostUrl.hostname
            : entryUrl.host === hostUrl.host;
    });
}
export function isTrustedApiRequest(headers, trustedHosts) {
    const hostUrl = requestHostUrl(headers);
    if (hostUrl === undefined)
        return false;
    if (!isLoopbackHostname(hostUrl.hostname) && !isTrustedAuthority(hostUrl, trustedHosts))
        return false;
    if (header(headers, 'sec-fetch-site') === 'cross-site')
        return false;
    const origin = header(headers, 'origin');
    if (origin === undefined)
        return true;
    try {
        return new URL(origin).host === hostUrl.host;
    }
    catch {
        return false;
    }
}
/**
 * Host 是否为已声明的远程 trusted-host。
 * 不看 Origin / sec-fetch-site：Access 登录回调经常是 cross-site 导航。
 */
export function requestRemoteHostTrusted(headers, trustedHosts) {
    const hostUrl = requestHostUrl(headers);
    if (hostUrl === undefined || isLoopbackHostname(hostUrl.hostname))
        return false;
    return isTrustedAuthority(hostUrl, trustedHosts);
}
function requestHostUrl(headers) {
    const host = header(headers, 'host');
    if (host === undefined)
        return undefined;
    return parseAuthority(host);
}
export function requestIsLoopback(headers) {
    const host = header(headers, 'host');
    if (host === undefined)
        return false;
    const hostUrl = parseAuthority(host);
    return hostUrl !== undefined && isLoopbackHostname(hostUrl.hostname);
}
//# sourceMappingURL=dsh-trust.js.map