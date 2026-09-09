# Capability: cloudflare-jwt

Cloudflare Access 身份只从 HTTP 头 `Cf-Access-Jwt-Assertion` 进入 Origin。本能力用 `jose` Remote JWK Set 校验签名、issuer、audience 与时间声明，并在 JWKS 不可用时 fail closed。Cookie 不是 Origin 身份。

## Requirements

### Requirement: Token is read only from the Access assertion header
The plugin SHALL authenticate Cloudflare Access solely from the HTTP header `Cf-Access-Jwt-Assertion`. The plugin MUST NOT treat `CF_Authorization` or any other Cookie as Origin identity.

#### Scenario: Header present
- **GIVEN** a request includes `Cf-Access-Jwt-Assertion`
- **WHEN** JwtVerifier runs
- **THEN** that header value is the only token input

#### Scenario: Cookie is ignored
- **GIVEN** a request has Cookie `CF_Authorization` and no `Cf-Access-Jwt-Assertion`
- **WHEN** JwtVerifier runs
- **THEN** the result is `missing` / `missing_token`

### Requirement: JWT cryptographic verification
The plugin SHALL verify JWTs with the `jose` library and MUST NOT implement RSA, JWK, or JWT parsing itself. Verification MUST include signature, algorithm, `iss`, `aud`, `exp`, and `nbf` when present. Unsigned tokens and algorithm downgrade MUST be rejected.

#### Scenario: Valid JWT
- **GIVEN** a compact JWS signed by a JWKS key, with matching iss/aud and unexpired exp
- **WHEN** it is verified
- **THEN** the outcome is `valid`

#### Scenario: Expired JWT
- **GIVEN** a token whose `exp` is in the past
- **WHEN** it is verified
- **THEN** the outcome is `invalid` / `expired`

#### Scenario: Clock skew within 30 seconds
- **GIVEN** a token whose `exp` is fewer than 30 seconds in the past
- **WHEN** it is verified
- **THEN** the outcome is `valid`

#### Scenario: Invalid signature
- **GIVEN** a token signed with a key not in JWKS
- **WHEN** it is verified
- **THEN** the outcome is `invalid` / `invalid_signature`

#### Scenario: Wrong issuer
- **GIVEN** a token whose `iss` is not the configured teamDomain
- **WHEN** it is verified
- **THEN** the outcome is `invalid` / `issuer_mismatch`

### Requirement: Team domain is normalized to an http(s) origin
The plugin SHALL normalize `cloudflare.teamDomain` / `DSH_CF_ACCESS_TEAM_DOMAIN` to an http(s) origin before using it as `iss` or deriving the JWKS URL. A host without a scheme MUST be treated as `https://`. A non-http(s) scheme MUST fail configuration.

#### Scenario: Host without scheme
- **GIVEN** teamDomain `example.cloudflareaccess.com`
- **WHEN** config is resolved
- **THEN** issuer is `https://example.cloudflareaccess.com` and JWKS is `https://example.cloudflareaccess.com/cdn-cgi/access/certs`

#### Scenario: Trailing slash and path are dropped
- **GIVEN** teamDomain `https://example.cloudflareaccess.com/cdn-cgi/access/`
- **WHEN** config is resolved
- **THEN** issuer is `https://example.cloudflareaccess.com`

#### Scenario: Wrong audience
- **GIVEN** configured audiences `["a"]` and a token whose aud is `b`
- **WHEN** it is verified
- **THEN** the outcome is `invalid` / `audience_mismatch`

#### Scenario: Missing audience
- **GIVEN** a token with no aud claim
- **WHEN** it is verified
- **THEN** the outcome is `invalid` / `audience_mismatch`

#### Scenario: Multiple configured audiences
- **GIVEN** configured audiences `["a","b"]` and a token whose aud is `b`
- **WHEN** it is verified
- **THEN** the outcome is `valid`

#### Scenario: Unsigned JWT
- **GIVEN** a compact JWT with `alg` `none`
- **WHEN** it is verified
- **THEN** the outcome is `invalid`

#### Scenario: Future nbf
- **GIVEN** a signed token whose `nbf` is more than 30 seconds in the future
- **WHEN** it is verified
- **THEN** the outcome is `invalid` / `malformed`

### Requirement: Remote JWKS with rotation
The plugin SHALL use a Remote JWK Set at `<teamDomain>/cdn-cgi/access/certs`. It MUST NOT fetch JWKS on every request as a hard-coded per-request client, and MUST NOT pin a process-start snapshot forever. Unknown `kid` MUST trigger JWKS refresh. JWKS unavailability MUST fail closed.

#### Scenario: Unknown kid refresh
- **GIVEN** a valid token whose kid is absent from the cached JWKS but present after refresh
- **WHEN** it is verified
- **THEN** the verifier refreshes JWKS and the outcome is `valid`

#### Scenario: JWKS unavailable
- **GIVEN** the certs endpoint cannot be fetched and the signature cannot be verified
- **WHEN** verification runs
- **THEN** the outcome is `invalid` / `jwks_unavailable`

### Requirement: No JWT result cache
The plugin MUST NOT cache per-token verification results. Only JWKS MAY be cached.

#### Scenario: Two requests with the same token
- **GIVEN** the same valid JWT on two sequential requests
- **WHEN** both are verified
- **THEN** each request performs signature verification rather than returning a stored decision map keyed by the token
