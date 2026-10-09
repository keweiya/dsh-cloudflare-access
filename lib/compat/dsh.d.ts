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
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Duplex } from 'node:stream';
import type { PluginConfig } from '../config.ts';
import { type PluginLogger } from '../server/authorization.ts';
import type { JwtVerifier } from '../server/cloudflare-jwt.ts';
export interface WebRoute {
    kind: 'exact' | 'prefix';
    path: string;
    handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>;
}
export interface WebUpgradeRoute {
    path: string;
    handler: (req: IncomingMessage, socket: Duplex, head: Buffer) => void | Promise<void>;
}
export interface WebServerLike {
    register(route: WebRoute): () => void;
    registerUpgrade(route: WebUpgradeRoute): () => void;
    registerFallback?(handler: WebRoute['handler']): () => void;
    /**
     * DSH 0.1.5-alpha.1 … 0.2.0-rc.2 的 webserver 把路由放在实例的这几张表里，
     * dispatch 时读 `route.handler`（`match()` / upgrade 分支 / `this.fallback`）。
     * 本插件激活可能晚于第三方挂载（见文件头「激活顺序」），因此激活时要就地
     * 采纳这些表里已经存在的路由。字段缺失或不是 Map/函数时跳过。
     */
    exact?: Map<string, WebRoute>;
    prefixes?: Map<string, WebRoute>;
    upgrades?: Map<string, WebUpgradeRoute>;
    fallback?: WebRoute['handler'];
}
export interface ConnectionAuthLike {
    requestRejection(request: IncomingMessage): 401 | 403 | undefined;
    authorizeIndex(request: IncomingMessage, response: ServerResponse): boolean;
}
export interface CompatFiber {
    connection?: ConnectionAuthLike;
    get?(name: string): unknown;
}
export interface CompatContext {
    webServer: WebServerLike;
    logger?: PluginLogger;
    effect(callback: () => (() => void) | Promise<void>, name?: string): void;
    get(name: string): unknown;
    inject?(deps: readonly string[], callback: (fiber: CompatFiber) => void): void;
}
export interface ServerCompatDeps {
    config: PluginConfig;
    verifier: JwtVerifier;
    getTrustedHosts: () => readonly string[];
}
/**
 * Wrap webServer.register / registerUpgrade / registerFallback, then adopt the
 * routes registered before this plugin activated. Restores originals on dispose.
 */
export declare function installServerCompat(ctx: CompatContext, deps: ServerCompatDeps): void;
//# sourceMappingURL=dsh.d.ts.map