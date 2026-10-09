/**
 * DSH web HTTP paths used by the JWT overlay.
 * Verified against @deepseek-ai/dsh-api-gateway 0.1.5-alpha.1 … 0.2.0-rc.2.
 * Hardcoded so JWT / policy never import DSH packages.
 */
export declare const API_PATH = "/api";
/** Gateway multiplexed Remote stream WebSocket. */
export declare const REMOTE_STREAM_MUX_PATH = "/api/remote.mux";
export declare function rpcMethodFromUrl(url: string | undefined): string | undefined;
//# sourceMappingURL=api-path.d.ts.map