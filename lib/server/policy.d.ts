import type { OrdinaryMode } from '../config.ts';
import type { JwtFailureReason, JwtVerification } from './types.ts';
/**
 * Remote methods this plugin may authorize with a valid JWT.
 * Names are Typert Remote endpoints (`namespace/method`).
 *
 * The set is the union of the lines this plugin supports, and every entry is
 * inert on a version that has no such method — while a *missing* entry is
 * fail-open, because with `ordinary=off` (the default) an unlisted method is
 * admitted on a trusted host without a JWT. So entries are only removed when
 * their namespace leaves the privileged plane, never merely because one DSH
 * release renamed them.
 *
 * Measured on 0.2.0-rc.2 against the installed packages:
 * - `settings/*` and `credentials/*` come from
 *   `@deepseek-ai/dsh-api-settings-controller` (its `credentialsController`
 *   and `settingsController` namespace declarations): describe, update,
 *   replace, mutate, openSettingsDocument, set, unset.
 *   `settings/canOpenAgentPresetDirectory` and
 *   `settings/openAgentPresetDirectory` are 0.1.5-alpha.1-only.
 * - `agentPresets/*` comes from
 *   `@deepseek-ai/dsh-agent-preset-registry/typert.host.js`: list, read,
 *   select. `copy` and `deletePreset` are 0.1.5-alpha.1-only.
 * - `llm/discoverModels` comes from `@deepseek-ai/dsh-llm/typert.host.js`.
 *
 * `agentPresets/list` and `agentPresets/select` stay OUT of this set on
 * purpose: they read preset metadata and choose the active preset, which is a
 * preference rather than the configuration / credential / preset-file plane
 * this list guards (see test/policy.test.ts). Native directory-picker /
 * host.openPath stay off the list too, as does every namespace outside that
 * plane.
 */
export declare const PRIVILEGED_METHODS: Set<string>;
export type AuthClass = 'loopback' | 'privileged' | 'ordinary';
export interface AuthDecision {
    effect: 'allow' | 'deny';
    class: AuthClass;
    reason: JwtFailureReason | 'host_origin_rejected' | null;
}
export interface PolicyInput {
    isLoopback: boolean;
    hostOriginTrusted: boolean;
    method: string | undefined;
    ordinary: OrdinaryMode;
    jwt: JwtVerification;
}
export declare function isPrivilegedMethod(method: string | undefined): boolean;
/**
 * Whether cryptographic JWT verification can change the decision.
 * Host/Origin failure and loopback are handled before this is consulted.
 */
export declare function jwtParticipates(input: {
    method: string | undefined;
    ordinary: OrdinaryMode;
    tokenPresent: boolean;
}): boolean;
/**
 * Pure authorization decision. Host/Origin is consumed as a boolean; this
 * function never inspects headers and never treats JWT as a Host substitute.
 */
export declare function decide(input: PolicyInput): AuthDecision;
//# sourceMappingURL=policy.d.ts.map