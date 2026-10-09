# Capability: dsh-authorization

## MODIFIED Requirements

### Requirement: Remote Access JWT substitutes for the DSH launch-token cookie
On a remote trusted host, a cryptographically valid Access JWT MUST skip DSH `requestRejection` / `authorizeIndex` cookie failures for **every registered route and WebSocket upgrade** — the index, `/api`, `/api/remote.mux`, and routes registered by other plugins. `connection.requestRejection` is the host's admission check for every route owner, so a third-party route that calls it (for example dshmarket's `/dsh-market/*`) MUST see the same Access identity. Loopback MUST keep the official launch-token cookie. A valid JWT MUST NOT skip Host/Origin rejection.

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

### Requirement: Ordinary API modes
Ordinary (non-privileged) remote APIs on DSH's own surfaces — the `/api` prefix, `/api/remote.mux`, and the index fallback — SHALL follow `auth.ordinary` after Host/Origin succeeds. Routes registered by other plugins are outside this setting's scope. Loopback MUST ignore this setting.

- `off` (default): JWT does not affect allow/deny. A present remote JWT is verified so a valid token can skip the DSH launch-token cookie.
- `optional`: no JWT continues; a present JWT MUST be valid.
- `required`: a valid JWT is mandatory, including `/api/remote.mux` upgrades.

#### Scenario: Ordinary off without JWT
- **GIVEN** `ordinary=off` and a remote trusted-host request with no JWT
- **WHEN** a non-privileged RPC is called
- **THEN** the decision is allow according to DSH original policy

#### Scenario: Ordinary off with a present JWT
- **GIVEN** `ordinary=off` and a remote trusted-host request with a JWT
- **WHEN** a non-privileged RPC is called
- **THEN** the decision is allow according to DSH original policy
- **AND** a valid JWT skips the DSH launch-token cookie
- **AND** an invalid JWT MUST NOT deny the ordinary API

#### Scenario: Ordinary optional with invalid JWT
- **GIVEN** `ordinary=optional` and a remote request with an invalid JWT
- **WHEN** a non-privileged RPC is called
- **THEN** the decision is deny

#### Scenario: Ordinary optional without JWT
- **GIVEN** `ordinary=optional` and no JWT
- **WHEN** a non-privileged RPC is called
- **THEN** the decision is allow

#### Scenario: Ordinary required without JWT
- **GIVEN** `ordinary=required` and no JWT
- **WHEN** a non-privileged RPC is called
- **THEN** the decision is deny / `missing_token`

#### Scenario: Ordinary required with valid JWT
- **GIVEN** `ordinary=required` and a valid JWT
- **WHEN** a non-privileged RPC is called
- **THEN** the decision is allow

### Requirement: Remote privileged APIs require JWT
Remote calls to the privileged method set MUST require a valid Cloudflare Access JWT. The plugin MUST NOT provide a configuration switch that disables this requirement. Missing configuration MUST fail closed for remote privileged APIs while still allowing the plugin to start.

Privileged methods that MAY be authorized remotely with a valid JWT are exactly: `settings/describe`, `settings/openSettingsDocument`, `settings/update`, `settings/replace`, `settings/mutate`, `settings/canOpenAgentPresetDirectory`, `settings/openAgentPresetDirectory`, `credentials/describe`, `credentials/set`, `credentials/unset`, `agentPresets/read`, `agentPresets/copy`, `agentPresets/deletePreset`, `llm/discoverModels`.

The list MUST be the union of the supported DSH lines and MUST be verified against the installed DSH packages, not inferred from memory: an entry that names no method on the running version is inert, while a missing entry is fail-open under `ordinary=off`. `settings/canOpenAgentPresetDirectory`, `settings/openAgentPresetDirectory`, `agentPresets/copy`, and `agentPresets/deletePreset` exist only on `0.1.5-alpha.1`. `agentPresets/list` and `agentPresets/select` MUST stay ordinary: they read preset metadata and choose the active preset, which is a preference rather than the configuration / credential / preset-file plane this list guards.

The plugin MUST NOT treat `host.pickDirectory` or `host.openPath` as plugin-authorized privileged methods even when the JWT is valid.

#### Scenario: Remote valid JWT
- **GIVEN** a remote trusted-host request with a valid JWT
- **WHEN** `settings/mutate` is called
- **THEN** the decision is allow

#### Scenario: Remote missing JWT
- **GIVEN** a remote trusted-host request with no JWT
- **WHEN** `credentials/set` is called
- **THEN** the decision is deny / `missing_token`

#### Scenario: Remote invalid JWT
- **GIVEN** a remote trusted-host request with an invalid JWT
- **WHEN** `llm/discoverModels` is called
- **THEN** the decision is deny with a non-missing failure reason

#### Scenario: Unconfigured team
- **GIVEN** `teamDomain` or `audiences` is missing
- **WHEN** a remote privileged RPC arrives
- **THEN** the decision is deny / `unconfigured`
- **AND** the plugin process remains started

#### Scenario: Native host methods stay off the allow list
- **GIVEN** a remote trusted-host request with a valid JWT
- **WHEN** `host.openPath` or `host.pickDirectory` is called
- **THEN** the plugin MUST NOT classify that method as privileged-allow

## ADDED Requirements

### Requirement: The plugin never denies a route it does not own
The plugin's deny policy MUST be limited to DSH's own surfaces: the `/api` prefix, the `/api/remote.mux` upgrade, and the index fallback. A route registered by another plugin MUST NOT be denied by this plugin, even when `auth.ordinary` would deny a DSH surface; its own handler decides admission. Without a valid JWT such a route MUST behave exactly as it did before the plugin was installed.

#### Scenario: ordinary required does not deny a third-party asset
- **GIVEN** `ordinary=required`
- **AND** a remote trusted-host request with no JWT
- **WHEN** another plugin's static asset route is handled
- **THEN** the plugin MUST NOT deny it
- **AND** the original handler runs

#### Scenario: ordinary required still denies DSH ordinary APIs
- **GIVEN** `ordinary=required`
- **AND** a remote trusted-host request with no JWT
- **WHEN** an ordinary `/api` RPC is handled
- **THEN** the decision is deny / `missing_token`
- **AND** the original `/api` handler MUST NOT run
