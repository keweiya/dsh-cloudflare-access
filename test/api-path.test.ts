import { rpcMethodFromUrl } from '../src/compat/api-path.ts'

describe('rpc method from URL', () => {
  it('maps Typert Remote paths and the stream mux', () => {
    expect(rpcMethodFromUrl('/api/settings/describe')).toBe('settings/describe')
    expect(rpcMethodFromUrl('/api/agentPresets/deletePreset')).toBe('agentPresets/deletePreset')
    expect(rpcMethodFromUrl('/api/remote.mux')).toBe('remote.mux')
    expect(rpcMethodFromUrl('/health')).toBeUndefined()
  })
})
