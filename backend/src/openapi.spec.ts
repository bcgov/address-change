import { OPENAPI_SERVER_URLS, buildOpenApiDocument } from './openapi.config'
import { applyOAuth2 } from './openapi.oauth2'

describe('OpenAPI spec', () => {
  // Regenerate the committed spec with `npm run openapi` (vitest -u).
  it('matches the committed docs/public/openapi/test.json', async () => {
    await expect(
      `${JSON.stringify(buildOpenApiDocument({ environment: 'test', serverUrl: OPENAPI_SERVER_URLS.test }), null, 2)}\n`,
    ).toMatchFileSnapshot('../../docs/public/openapi/test.json')
  })

  it('points the prod spec at the production SSO realm', () => {
    const flow = buildOpenApiDocument({ environment: 'prod' }).components?.securitySchemes?.oauth2
    expect(JSON.stringify(flow)).toContain('https://loginproxy.gov.bc.ca/auth/realms/standard')
  })

  it('applies a runtime issuer and scope to a prebuilt spec', () => {
    const document = JSON.parse(JSON.stringify(buildOpenApiDocument()))
    applyOAuth2(document, 'https://sso.example/realm', 'custom-scope')
    expect(JSON.stringify(document.components.securitySchemes.oauth2)).toContain(
      'https://sso.example/realm/protocol/openid-connect/auth',
    )
    expect(document.paths['/api/v1/address-change'].post.security).toEqual([
      { oauth2: ['custom-scope'] },
    ])
  })
})
