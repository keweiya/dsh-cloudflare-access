# Capability: dsh-authorization

## MODIFIED Requirements

### Requirement: Remote Access JWT substitutes for the DSH launch-token cookie
On a remote trusted host, a cryptographically valid Access JWT MUST skip DSH `requestRejection` / `authorizeIndex` cookie failures for **every registered route and WebSocket upgrade** — the index, `/api`, `/api/remote.mux`, and routes registered by other plugins, whether they were registered before or after this plugin activated. Coverage MUST NOT depend on activation order. `connection.requestRejection` is the host's admission check for every route owner, so a third-party route that calls it (for example dshmarket's `/dsh-market/*`) MUST see the same Access identity. Loopback MUST keep the official launch-token cookie. A valid JWT MUST NOT skip Host/Origin rejection.

#### Scenario: Remote valid JWT without DSH cookie
- **GIVEN** a remote trusted-host request with a valid JWT
- **AND** no DSH `dsh-auth-*` cookie
- **WHEN** `settings/describe` or `GET /` is handled
- **THEN** the plugin MUST NOT fail closed on DSH browser-session 401

#### Scenario: Third-party exact route without DSH cookie
- **GIVEN** a remote trusted-host request with a valid JWT
- **AND** another plugin registered an exact route whose handler calls `connection.requestRejection`
- **WHEN** that route is handled
- **THEN** the gate returns no rejection and the plugin MUST NOT fail closed on DSH browser-session 401

#### Scenario: Third-party route registered before the plugin activated
- **GIVEN** another plugin registered its routes before this plugin's `apply` ran (dshmarket mounts inside `ctx.inject(['webServer','loader'], …)`, which can run first on `0.2.0-rc.2`)
- **AND** a remote trusted-host request with a valid JWT
- **WHEN** that already-registered route is handled
- **THEN** the plugin MUST have adopted it and MUST NOT fail closed on DSH browser-session 401
- **AND** without a valid JWT the route's own admission decision still applies unchanged
- **AND** unloading the plugin MUST restore the adopted route's original handler

#### Scenario: Third-party route without a valid JWT
- **GIVEN** a remote trusted-host request with no JWT, or with an invalid JWT
- **WHEN** another plugin's route is handled
- **THEN** the plugin MUST NOT mark the request
- **AND** the route's own admission decision applies unchanged

#### Scenario: Loopback keeps the DSH cookie
- **GIVEN** Host is loopback
- **AND** no DSH `dsh-auth-*` cookie
- **WHEN** a privileged RPC is requested
- **THEN** DSH original cookie authentication still applies
