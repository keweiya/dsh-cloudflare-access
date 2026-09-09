# Capability: client-capability

远程 Web Client 通过可逆包装 `connection.isLoopback` 解锁 Host Settings persistence，让浏览器愿意发起配置面 RPC。Client 不是安全裁决者；`dsh.client.immediately` 必须为 true，否则 ui-settings 会在本模块加载前把 loopback=false 快照进 memory 模式。

## Requirements

### Requirement: Remote Web Client may attempt Host settings
The Client Module SHALL enable remote Web Client capability so Settings persistence is not stuck in memory-only mode solely because the page hostname is not loopback. After enablement, the client MAY issue `settings/describe` and related privileged RPCs.

#### Scenario: Settings become attemptable
- **GIVEN** the client plugin is loaded on `https://dsh.example.com`
- **WHEN** a settings-scoped feature binds persistence
- **THEN** the client uses Host persistence rather than marking the scope unavailable without issuing RPC

### Requirement: Client module is prefetched before settings snapshot
The package MUST declare `dsh.client.immediately` as `true` and `dsh.client.inject` MUST include `@deepseek-ai/dsh-client-connection`. The Web boot MUST prefetch this module before `ui-settings` snapshots `remote.$host.isLoopback`.

#### Scenario: Settings RPC is issued remotely
- **GIVEN** the plugin is installed on a remote trusted-host Web profile
- **WHEN** the browser loads Settings
- **THEN** the client module wraps `isLoopback` before ui-settings binds persistence
- **AND** the browser issues `settings/describe` instead of remaining in memory-only mode

### Requirement: Client is not the security authority
The Client Module MUST NOT verify Cloudflare JWTs in the browser, MUST NOT infer login from Cookies, and MUST NOT decide privileged authorization in JavaScript. The Server Plugin remains the only authorization decision maker.

#### Scenario: No browser JWT check
- **GIVEN** the client plugin is loaded
- **WHEN** it enables capability
- **THEN** enablement does not depend on reading `Cf-Access-Jwt-Assertion` or `CF_Authorization` in JavaScript

#### Scenario: Server still denies
- **GIVEN** capability is enabled
- **AND** the browser request has no valid Access JWT
- **WHEN** the client calls a privileged RPC
- **THEN** the Server denies the call

### Requirement: Reversible client wrap
Unloading the client plugin MUST restore DSH default remote capability behavior for `connection.isLoopback`.

#### Scenario: Unload restores official client gating
- **GIVEN** the client plugin wrapped `connection.isLoopback`
- **WHEN** the plugin fiber unloads
- **THEN** subsequent settings binds follow official loopback gating again
