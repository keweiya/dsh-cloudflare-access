import { type CordisConfig } from '../config.ts';
import { type PluginLogger } from './authorization.ts';
export type { CordisConfig, PluginConfig } from '../config.ts';
export { resolveConfig, isCloudflareConfigured, issuerOf, jwksUrlOf } from '../config.ts';
export { createJwtVerifier, CLOCK_TOLERANCE_SECONDS } from './cloudflare-jwt.ts';
export { decide, PRIVILEGED_METHODS, jwtParticipates } from './policy.ts';
export declare const name = "cloudflare-access";
export declare const inject: string[];
export interface ServerPluginContext {
    webServer: {
        register(route: unknown): () => void;
        registerUpgrade(route: unknown): () => void;
        registerFallback?(handler: unknown): () => void;
    };
    logger?: PluginLogger;
    effect(callback: () => (() => void) | Promise<void>, name?: string): void;
    get(name: string): unknown;
    inject?(deps: readonly string[], callback: (fiber: unknown) => void): void;
}
export declare function apply(ctx: ServerPluginContext, config?: CordisConfig): void;
//# sourceMappingURL=index.d.ts.map