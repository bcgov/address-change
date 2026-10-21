import { afterEach, vi } from 'vitest'
import { searchAddresses, toSuggestion } from '../geocoder'

describe('toSuggestion', () => {
  test('maps a geocoder feature to address fields', () => {
    expect(
      toSuggestion({
        properties: {
          fullAddress: '1234 Douglas Terr, Port Coquitlam, BC',
          streetAddress: '1234 Douglas Terr',
          localityName: 'Port Coquitlam',
          provinceCode: 'BC',
        },
      }),
    ).toEqual({
      label: '1234 Douglas Terr, Port Coquitlam, BC',
      addressLineOne: '1234 Douglas Terr',
      locality: 'Port Coquitlam',
      region: 'BC',
      country: 'Canada',
    })
  })

  test('skips features without a street address', () => {
    expect(toSuggestion({ properties: { fullAddress: 'Victoria, BC' } })).toBeNull()
  })
})

describe('searchAddresses', () => {
  afterEach(() => vi.unstubAllGlobals())

  test('queries the geocoder with autocomplete and returns mapped results', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        features: [{ properties: { streetAddress: '1 Main St', localityName: 'Victoria' } }, {}],
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const results = await searchAddresses('1 Main')

    expect(String(fetchMock.mock.calls[0][0])).toContain('autoComplete=true')
    expect(String(fetchMock.mock.calls[0][0])).toContain('addressString=1+Main')
    expect(results).toHaveLength(1)
    expect(results[0]).toMatchObject({ addressLineOne: '1 Main St', region: 'BC' })
  })

  test('throws when the geocoder responds with an error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }))
    await expect(searchAddresses('abc')).rejects.toThrow('500')
  })
})
