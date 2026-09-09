# Capability: plugin-packaging

本包必须是可独立安装的 DSH Profile Bundle：`dsh.bundle` 插入 Web profile 行，`dsh.client` 提供浏览器 factory，Env 锁定信任根。Git 与 npm 发行都携带预构建 `lib/`，unload 后恢复官方远程限制。

## Requirements

### Requirement: Formal DSH bundle install
The package MUST declare `dsh.bundle` with `patch` pointing at `./cordis.patch.yml` so `dsh plugin --profile web add dsh-cloudflare-access` adds the bundle to the Web profile stack without requiring the user to edit `$DSH_HOME/profiles/web/cordis.patch.yml`. The package MUST NOT require modifying DSH itself. The patch row `name` MUST equal the installed npm package name.

#### Scenario: Plugin add
- **GIVEN** a Web profile
- **WHEN** the operator runs the standard DSH plugin add for this package
- **THEN** the profile bundle list includes `dsh-cloudflare-access`
- **AND** no manual profile patch edit is required

### Requirement: Formal client module
The package MUST ship a built `exports["./client"]` and declare `dsh.client` with `platform` `web`, `immediately` `true`, and `inject` including `@deepseek-ai/dsh-client-connection`. Installing the plugin MUST NOT require the user to rebuild DSH Web. `immediately` is required so the Web boot prefetches this module before `ui-settings` snapshots loopback state. `lib/client.js` MUST be a Harness `window.__ModuleLoader__.load` factory whose id is the package name.

#### Scenario: Client export present
- **GIVEN** the published npm package
- **WHEN** DSH scans `dsh.client` packages
- **THEN** `./client` resolves to a prebuilt browser module
- **AND** the declaration has `immediately: true`

### Requirement: Community package identity
The package MUST export `./cordis.patch.yml`, include `dsh-plugin` in `keywords`, and ship `lib/index.js`, `lib/client.js`, `cordis.patch.yml`, `README.md`, and `LICENSE` in the npm tarball and in the Git tree used for `github:` installs. A Git dependency install MUST use the committed `lib/` artifacts and MUST NOT require TypeScript or esbuild when those artifacts are present.

#### Scenario: Pack contains runtime artifacts
- **GIVEN** `pnpm pack`
- **WHEN** the tarball is listed
- **THEN** it contains `package/lib/index.js`, `package/lib/client.js`, and `package/cordis.patch.yml`

#### Scenario: Git install skips prepare build
- **GIVEN** a Git checkout that already contains `lib/index.js` and `lib/client.js`
- **AND** the package is installed as a dependency of another project
- **WHEN** `prepare` runs
- **THEN** it does not require TypeScript or esbuild

### Requirement: Committed runtime artifacts match source
CI MUST rebuild `lib/` from `src/` and fail if the committed artifacts differ.

#### Scenario: lib drift
- **GIVEN** `src/` was changed without rebuilding `lib/`
- **WHEN** CI runs `pnpm build`
- **THEN** `git diff -- lib` is non-empty and the job fails

### Requirement: Configuration precedence and env lock
Runtime configuration MUST resolve Environment Variables over Cordis/Bundle config over defaults. If `DSH_CF_ACCESS_TEAM_DOMAIN`, `DSH_CF_ACCESS_AUDIENCES`, or `DSH_CF_ACCESS_ORDINARY_MODE` exists, that field MUST NOT be overridden by Web Settings or Cordis config at runtime. Audiences env MUST accept comma-separated values. Users MUST NOT be required to configure issuer or jwksUrl separately.

#### Scenario: Env wins
- **GIVEN** `DSH_CF_ACCESS_TEAM_DOMAIN` is set to team A
- **AND** Cordis config names team B
- **WHEN** the plugin resolves config
- **THEN** issuer is team A

#### Scenario: Derived JWKS
- **GIVEN** teamDomain `https://example.cloudflareaccess.com`
- **WHEN** config is resolved
- **THEN** JWKS URL is `https://example.cloudflareaccess.com/cdn-cgi/access/certs`

### Requirement: Reversible server effects
Unloading the server plugin MUST restore official DSH remote privileged restrictions. The plugin MUST NOT leave a global monkey patch after unload.

#### Scenario: Unload restores official remote restrictions
- **GIVEN** the server plugin was authorizing remote `settings.*` with a valid JWT
- **WHEN** the plugin unloads
- **THEN** the same remote `settings.*` request is rejected by official DSH behavior
