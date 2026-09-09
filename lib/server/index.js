import { isCloudflareConfigured, issuerOf, resolveConfig } from "../config.js";
import { installServerCompat } from "../compat/dsh.js";
import { logBoot } from "./authorization.js";
import { createJwtVerifier } from "./cloudflare-jwt.js";
export { resolveConfig, isCloudflareConfigured, issuerOf, jwksUrlOf } from "../config.js";
export { createJwtVerifier, CLOCK_TOLERANCE_SECONDS } from "./cloudflare-jwt.js";
export { decide, PRIVILEGED_METHODS, jwtParticipates } from "./policy.js";
export const name = 'cloudflare-access';
export const inject = ['webServer'];
function trustedHostsFrom(ctx) {
    const runtime = ctx.get('webRuntime');
    return runtime?.trustedHosts ?? [];
}
export function apply(ctx, config) {
    const resolved = resolveConfig(config, process.env);
    const logger = ctx.logger ?? { info() { }, warn() { } };
    logBoot(logger, {
        configured: isCloudflareConfigured(resolved),
        audienceCount: resolved.audiences.length,
        ordinary: resolved.ordinary,
        issuer: issuerOf(resolved),
    });
    const verifier = createJwtVerifier(resolved);
    installServerCompat(ctx, {
        config: resolved,
        verifier,
        getTrustedHosts: () => trustedHostsFrom(ctx),
    });
}
//# sourceMappingURL=index.js.map