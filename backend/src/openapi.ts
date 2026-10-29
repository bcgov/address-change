import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { OPENAPI_SERVER_URLS, buildOpenApiDocument } from './openapi.config'
import type { OpenApiEnvironment } from './openapi.config'

/**
 * Writes the OpenAPI document for an environment: `node dist/openapi <test|prod> <output>`.
 * Issuer and scope come from OIDC_ISSUER and OIDC_SUBMISSION_SCOPE; the server URL defaults per environment and can be overridden with OPENAPI_SERVER_URL.
 */
const [environment, output] = process.argv.slice(2)
if ((environment !== 'test' && environment !== 'prod') || !output) {
  console.error('Usage: node dist/openapi <test|prod> <output-file>')
  process.exit(1)
}

if (environment === 'prod' && !process.env.OPENAPI_VERSION) {
  console.error('OPENAPI_VERSION (the release version) is required for the prod spec')
  process.exit(1)
}

const document = buildOpenApiDocument({
  environment: environment as OpenApiEnvironment,
  version: process.env.OPENAPI_VERSION,
  issuer: process.env.OIDC_ISSUER,
  scope: process.env.OIDC_SUBMISSION_SCOPE,
  serverUrl:
    process.env.OPENAPI_SERVER_URL || OPENAPI_SERVER_URLS[environment as OpenApiEnvironment],
})
const path = resolve(output)
mkdirSync(dirname(path), { recursive: true })
writeFileSync(path, `${JSON.stringify(document, null, 2)}\n`)
console.log(`OpenAPI ${environment} spec written to ${path}`)
