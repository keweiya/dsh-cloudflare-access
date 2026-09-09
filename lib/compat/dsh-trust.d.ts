/**
 * DSH 0.1.5-alpha.1 compatible Host/Origin fence copy.
 * Kept in compat so JWT core does not import DSH internals.
 * Source of truth in DSH: @deepseek-ai/dsh-client-connection api-request-trust.
 */
export declare function isLoopbackHostname(hostname: string): boolean;
export declare function isTrustedApiRequest(headers: {
    get(name: string): string | null;
} | Record<string, string | string[] | undefined>, trustedHosts: readonly string[]): boolean;
/**
 * Host 是否为已声明的远程 trusted-host。
 * 不看 Origin / sec-fetch-site：Access 登录回调经常是 cross-site 导航。
 */
export declare function requestRemoteHostTrusted(headers: {
    get(name: string): string | null;
} | Record<string, string | string[] | undefined>, trustedHosts: readonly string[]): boolean;
export declare function requestIsLoopback(headers: {
    get(name: string): string | null;
} | Record<string, string | string[] | undefined>): boolean;
//# sourceMappingURL=dsh-trust.d.ts.map