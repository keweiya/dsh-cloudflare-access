import { decide, isPrivilegedMethod, jwtParticipates } from '../src/server/policy.ts'
import type { JwtVerification } from '../src/server/types.ts'

const valid: JwtVerification = { outcome: 'valid', reason: null, audienceMatched: 'aud' }
const missing: JwtVerification = { outcome: 'missing', reason: 'missing_token', audienceMatched: null }
const invalid: JwtVerification = { outcome: 'invalid', reason: 'expired', audienceMatched: null }

describe('authorization policy', () => {
  it('allows loopback privileged without JWT', () => {
    expect(decide({
      isLoopback: true,
      hostOriginTrusted: true,
      method: 'settings/describe',
      ordinary: 'required',
      jwt: missing,
    })).toEqual({ effect: 'allow', class: 'loopback', reason: null })
  })

  it('allows remote privileged with a valid JWT', () => {
    expect(decide({
      isLoopback: false,
      hostOriginTrusted: true,
      method: 'settings/mutate',
      ordinary: 'off',
      jwt: valid,
    }).effect).toBe('allow')
  })

  it('denies remote privileged without JWT', () => {
    const decision = decide({
      isLoopback: false,
      hostOriginTrusted: true,
      method: 'credentials/set',
      ordinary: 'off',
      jwt: missing,
    })
    expect(decision.effect).toBe('deny')
    expect(decision.reason).toBe('missing_token')
  })

  it('denies remote privileged with an invalid JWT', () => {
    const decision = decide({
      isLoopback: false,
      hostOriginTrusted: true,
      method: 'llm/discoverModels',
      ordinary: 'off',
      jwt: invalid,
    })
    expect(decision.effect).toBe('deny')
    expect(decision.reason).toBe('expired')
  })

  it('ordinary off allows remote without JWT', () => {
    expect(decide({
      isLoopback: false,
      hostOriginTrusted: true,
      method: 'llm/listProviders',
      ordinary: 'off',
      jwt: missing,
    }).effect).toBe('allow')
  })

  it('ordinary optional allows missing JWT and valid JWT, denies invalid', () => {
    const base = {
      isLoopback: false,
      hostOriginTrusted: true,
      method: 'agentPresets/list',
      ordinary: 'optional' as const,
    }
    expect(decide({ ...base, jwt: missing }).effect).toBe('allow')
    expect(decide({ ...base, jwt: valid }).effect).toBe('allow')
    expect(decide({ ...base, jwt: invalid }).effect).toBe('deny')
  })

  it('ordinary required denies missing and invalid JWT', () => {
    const base = {
      isLoopback: false,
      hostOriginTrusted: true,
      method: 'remote.mux',
      ordinary: 'required' as const,
    }
    expect(decide({ ...base, jwt: missing }).reason).toBe('missing_token')
    expect(decide({ ...base, jwt: valid }).effect).toBe('allow')
    expect(decide({ ...base, jwt: invalid }).effect).toBe('deny')
  })

  it('rejects a valid JWT when Host/Origin failed', () => {
    const decision = decide({
      isLoopback: false,
      hostOriginTrusted: false,
      method: 'settings/describe',
      ordinary: 'off',
      jwt: valid,
    })
    expect(decision.effect).toBe('deny')
    expect(decision.reason).toBe('host_origin_rejected')
  })

  it('does not treat native host methods as plugin-authorized privileged', () => {
    expect(isPrivilegedMethod('host.openPath')).toBe(false)
    expect(isPrivilegedMethod('host.pickDirectory')).toBe(false)
    expect(isPrivilegedMethod('agentPresets/list')).toBe(false)
    expect(isPrivilegedMethod('agentPresets/select')).toBe(false)
    expect(isPrivilegedMethod('settings.describe')).toBe(false)
  })

  it('skips JWT verification unless the decision can change', () => {
    expect(jwtParticipates({ method: 'llm/listProviders', ordinary: 'off', tokenPresent: true })).toBe(false)
    expect(jwtParticipates({ method: 'remote.mux', ordinary: 'optional', tokenPresent: false })).toBe(false)
    expect(jwtParticipates({ method: 'remote.mux', ordinary: 'optional', tokenPresent: true })).toBe(true)
    expect(jwtParticipates({ method: 'remote.mux', ordinary: 'required', tokenPresent: false })).toBe(true)
    expect(jwtParticipates({ method: 'settings/describe', ordinary: 'off', tokenPresent: false })).toBe(true)
  })
})
