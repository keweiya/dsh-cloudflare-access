# Security Policy

## This plugin does not replace Cloudflare Access

`dsh-cloudflare-access` verifies Cloudflare Access JWTs at the DeepSeek Harness Origin and maps a successful verification onto DSH remote privileged authorization. It is an additional authentication / authorization layer.

Recommended deployment:

```text
Internet
   ↓
Cloudflare Access
   ↓
Cloudflare Proxy
   ↓
Origin Network Controls
   ↓
Reverse Proxy
   ↓
DeepSeek Harness
   ↓
dsh-cloudflare-access
```

- Keep Origin reachable only from Cloudflare (or an equivalent trusted ingress).
- Keep DSH `--trusted-host` and Host/Origin checks enabled.
- Do not expose the DSH Origin to the public internet merely because this plugin is installed.
- A valid Access JWT never authorizes an arbitrary Host or Origin.
- On a remote trusted host, a valid Access JWT replaces DSH's launch-token cookie. Loopback still requires the URL printed by `dsh web`.

## Token handling

- Only `Cf-Access-Jwt-Assertion` is trusted.
- Cookies are not used as Origin identity.
- Logs must never contain JWTs, assertion headers, cookies, credentials, or API keys.

## Reporting

If you believe you have found a vulnerability, open a private security advisory on [Luawig/dsh-cloudflare-access](https://github.com/Luawig/dsh-cloudflare-access/security/advisories/new). Do not file a public issue with a working exploit.
