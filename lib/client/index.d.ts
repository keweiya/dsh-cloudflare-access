/**
 * Browser capability enablement.
 * Wraps connection.isLoopback so remote Settings try Host persistence.
 * Does not verify JWT or cookies. Server remains the authority.
 *
 * `dsh.client.immediately` must be true: the Web boot prefetches those
 * bundles before `loader.create`. Without it this module arrives after
 * ui-settings has already snapshotted remote.$host.isLoopback=false
 * (copied from connection.isLoopback) into memory mode and never issues
 * settings/describe. inject connection so apply() runs after the handle
 * exists and before ui-settings (which also waits for remote).
 */
export interface ConnectionHandleLike {
    isLoopback: boolean;
}
export interface ClientContextLike {
    connection: ConnectionHandleLike;
    effect(callback: () => (() => void) | Promise<void>, name?: string): void;
    get(name: string): unknown;
}
export declare const inject: string[];
export declare function apply(ctx: ClientContextLike): void;
//# sourceMappingURL=index.d.ts.map