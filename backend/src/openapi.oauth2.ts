// Kept free of @ts-rest/open-api so the running app can apply its own issuer and scope to a prebuilt spec.
export const OAUTH2_SCHEME = 'oauth2'
export const DEFAULT_SCOPE = 'address-change-bc-6667'

export type OpenApiEnvironment = 'test' | 'prod'

export const DEFAULT_ISSUERS: Record<OpenApiEnvironment, string> = {
  test: 'https://test.loginproxy.gov.bc.ca/auth/realms/standard',
  prod: 'https://loginproxy.gov.bc.ca/auth/realms/standard',
}

/** Sets the OAuth2 scheme and each operation's required scope on an OpenAPI document. */
export function applyOAuth2(
  document: { components?: any; paths: Record<string, any> },
  issuer: string,
  scope: string,
): void {
  document.components = {
    ...document.components,
    securitySchemes: {
      [OAUTH2_SCHEME]: {
        type: 'oauth2',
        description: 'OAuth 2.0 authorization code flow against the BC government SSO.',
        flows: {
          authorizationCode: {
            authorizationUrl: `${issuer}/protocol/openid-connect/auth`,
            tokenUrl: `${issuer}/protocol/openid-connect/token`,
            scopes: { [scope]: 'Submit and manage address change requests' },
          },
        },
      },
    },
  }

  for (const pathItem of Object.values(document.paths)) {
    for (const operation of Object.values(pathItem) as Array<Record<string, any>>) {
      if (typeof operation !== 'object' || !operation.operationId) continue
      operation.security = [{ [OAUTH2_SCHEME]: [scope] }]
    }
  }
}
