import { OPENAPI_SERVER_URLS, buildOpenApiDocument } from './openapi.config'

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
})
