# Changelog

## Unreleased

## 2.1.1

- Adopt the routes that were already registered when the plugin activates. Wrapping `webServer.register` alone only covers routes registered **after** it, and on `0.2.0-rc.2` a third-party plugin can mount first: dshmarket registers its 48 `/dsh-market/*` routes inside `ctx.inject(['webServer','loader'], …)`, which runs before this plugin's `apply` (deferred by `inject = ['webServer']`). 2.1.0 therefore left exactly the routes it meant to cover unmarked, and the market still answered 401 behind Access. Activation now also sweeps the webserver's `exact` / `prefixes` / `upgrades` tables and the fallback seat, replacing `route.handler` in place — dispatch reads that property, so ordering no longer matters. Adopted entries are restored on unload, and re-activation never stacks a second wrapper.
- Verified against the real `dshmarket@1.66.14` code on `0.2.0-rc.2`: `mountMarketRoutes` + `refuseUnadmitted` answer 200 for a valid Access JWT and 401 without one in both mount orders (plugin first, plugin last). 2.1.0 failed the second order.

## 2.1.0

- Cover **every** registered route and WebSocket upgrade with the Access-JWT cookie substitution, not just `/api`. `connection.requestRejection` is DSH's admission check for every route owner, so a third-party route that asks it (dshmarket ≥ 1.66.13 puts its 48 `/dsh-market/*` routes behind it, dsh-market#603) kept demanding DSH's launch-token cookie and answered 401 behind Access even with a valid JWT.
- Keep the deny policy on DSH's own surfaces only: the `/api` prefix, `/api/remote.mux`, and the index fallback. A route this plugin does not own is never denied by `auth.ordinary`, so `ordinary=required` cannot lock a co-installed UI out of its own assets; without a valid JWT such a route behaves exactly as it did before the plugin was installed.
- Support DSH `0.2.0-rc.2`: peer ranges are now `^0.1.5-alpha.1 || ^0.2.0-rc.2` for `@deepseek-ai/dsh-client-connection` and `@deepseek-ai/dsh-host-webserver`, and `^4.0.2` for `@deepseek-ai/cordis` (the pinned exact versions made `dsh plugin add` reject the install on 0.2.0-rc.2).
- Re-verify the privileged endpoint set against the installed 0.2.0-rc.2 packages and document each name's source (`dsh-api-settings-controller`, `dsh-agent-preset-registry/typert.host.js`, `dsh-llm/typert.host.js`). The set stays the union of both supported lines: an entry naming no method on the running version is inert, while a missing entry is fail-open under `ordinary=off`. `settings/canOpenAgentPresetDirectory`, `settings/openAgentPresetDirectory`, `agentPresets/copy`, and `agentPresets/deletePreset` are 0.1.5-alpha.1-only; `agentPresets/list` and `agentPresets/select` stay ordinary on purpose.
- Add integration tests for third-party exact routes and upgrades: valid JWT marks, missing/invalid JWT does not, loopback stays on the official token/cookie, `ordinary=required` never denies a route the plugin does not own, and `/api` denial is unchanged.

## 2.0.0

- Overlay Cloudflare JWT on the original `/api`, `/api/remote.mux`, and index fallback. A valid Access JWT on a remote trusted host skips DSH's launch-token cookie, including Access login callbacks with `sec-fetch-site: cross-site`. Loopback still requires the official token.
- Map privileged RPCs to Typert Remote endpoints (`settings/describe`, `agentPresets/deletePreset`, and the rest of the 0.1.5 configuration surface).
- Treat `/api/remote.mux` as the ordinary events WebSocket.
- Peer `@deepseek-ai/dsh-client-connection` and `@deepseek-ai/dsh-host-webserver` `0.1.5-alpha.1`, plus `@deepseek-ai/cordis` `4.0.2`.

## 1.0.0

- Normalize `teamDomain` to an http(s) origin so a host without `https://` still produces a valid issuer and JWKS URL.
- Skip JWT signature verification when it cannot change the allow/deny decision (`ordinary=off` APIs and failed Host/Origin).
- Skip the `prepare` build during dependency installs so `github:` installs use committed `lib/` without TypeScript or esbuild.
- Fail CI when committed `lib/` does not match a fresh `pnpm build`.
- Allow 30 seconds of clock skew on JWT `exp` / `nbf` so Origin time drift does not reject live Access tokens.
- Return 502 from the privileged HTTP bridge when `apiProxy.fetch` throws, instead of leaving the client hanging.
- Cover loopback wrap, missing `apiProxy`, events upgrade denial, unsigned JWT, and future `nbf` in tests.
- Enable weekly Dependabot for npm and GitHub Actions. Document npm provenance for the next publish (v0.1.0 did not include it).
- Use the same 401/403 split on `/api/events.*` upgrades as on HTTP APIs. Handshake still fails; only the status line changes for invalid tokens.
- Stop committing unused `lib/client/index.js`; the browser runtime is `lib/client.js`.
- Tighten the README (quick start, placeholder audience values, user vs maintainer sections) and add a Chinese README aligned with the English README. Architecture figures are English Archify HTML and SVG in `docs/assets/archify/`.

## 0.1.0

- Initial release: Cloudflare Access JWT verification at the DSH Origin.
- Remote privileged authorization for the settings / credentials / agentPreset management / `llm.discoverModels` plane.
- Ordinary API modes `off | optional | required`.
- Web Client capability enablement for remote Settings, with `dsh.client.immediately: true` so the module is prefetched before `ui-settings` snapshots loopback state.
- Official `dsh.bundle` and `dsh.client` packaging for `dsh plugin --profile web add`.
