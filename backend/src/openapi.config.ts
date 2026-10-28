import { generateOpenApi } from '@ts-rest/open-api'
import type { OpenAPIObject } from 'openapi3-ts'
import {
  ADDRESS_CHANGE_ROUTE,
  OPENAPI_REQUEST_ID,
  addressChangeContract,
} from './address-change/address-change.contract'
import type { OpenApiRouteMetadata } from './address-change/address-change.contract'
import { DEFAULT_ISSUERS, DEFAULT_SCOPE, applyOAuth2 } from './openapi.oauth2'
import type { OpenApiEnvironment } from './openapi.oauth2'

const responseDescriptions: Record<string, string> = {
  200: 'The request completed successfully.',
  202: 'The request was accepted for processing.',
  400: 'The request is malformed or fails validation. The body is an RFC 9457 problem details object; errors lists the invalid fields without echoing their values.',
  401: 'A valid bearer access token is required.',
  403: 'The access token does not include the required scope.',
  404: 'The requested resource was not found for this resident.',
  409: 'The request conflicts with the current state of a resource.',
  503: 'The service or a downstream partner is temporarily unavailable.',
}

const errorExamples: Record<string, object> = {
  400: {
    type: 'about:blank',
    title: 'Bad Request',
    status: 400,
    detail: 'Invalid request body',
    errors: [
      {
        type: 'validation',
        code: 'invalid_string',
        message: 'Invalid value at /person/dateOfBirth',
        location: 'body',
      },
    ],
  },
  401: { statusCode: 401, message: 'A bearer access token is required', error: 'Unauthorized' },
  403: {
    statusCode: 403,
    message: 'Missing address-change submission permission',
    error: 'Forbidden',
  },
  404: { statusCode: 404, message: 'Draft not found', error: 'Not Found' },
  409: {
    statusCode: 409,
    message: 'An address-change request is already active',
    error: 'Conflict',
  },
  503: { statusCode: 503, message: 'Request could not be saved', error: 'Service Unavailable' },
}

export type { OpenApiEnvironment }

export interface OpenApiOptions {
  environment?: OpenApiEnvironment
  /** API version (the release tag for Prod); defaults to a fixed 0.0.0-<environment> placeholder. */
  version?: string
  /** SSO realm URL; defaults to the BC Gov SSO realm for the environment. */
  issuer?: string
  scope?: string
  serverUrl?: string
}

/** Public base URL of each deployed environment, listed as the spec's server. */
export const OPENAPI_SERVER_URLS: Record<OpenApiEnvironment, string> = {
  test: 'https://address-change-test.apps.gold.devops.gov.bc.ca',
  prod: 'https://address-change-prod.apps.gold.devops.gov.bc.ca',
}
const ENVIRONMENT_LABELS: Record<OpenApiEnvironment, string> = { test: 'Test', prod: 'Production' }

/**
 * Builds the OpenAPI document from the ts-rest contract, the same contract the controllers validate against.
 */
export function buildOpenApiDocument(options: OpenApiOptions = {}): OpenAPIObject {
  const environment = options.environment ?? 'test'
  const issuer = options.issuer || DEFAULT_ISSUERS[environment]
  const scope = options.scope || DEFAULT_SCOPE

  const document = generateOpenApi(
    addressChangeContract,
    {
      info: {
        title: 'Address Change API',
        version: options.version || `0.0.0-${environment}`,
        description: `Lets an authenticated BC resident draft and submit an address change, and track its delivery to partner services such as ICBC and MSP. Requests are validated, stored, and delivered asynchronously. This is the ${ENVIRONMENT_LABELS[environment]} environment contract.`,
        termsOfService: 'https://www2.gov.bc.ca/gov/content?id=D1EE0A405E584363B205CD4353E02C88',
        contact: {
          name: 'Contact the Location Services team',
          url: 'https://dpdd.atlassian.net/servicedesk/customer/portal/1/group/7/',
        },
        license: {
          name: 'Open Government License - British Columbia',
          url: 'https://www2.gov.bc.ca/gov/content?id=A519A56BC2BF44E4A008B33FCF527F61',
        },
      },
      tags: [{ name: 'Address Change', description: 'Draft, submit, and track address changes.' }],
    },
    {
      // Per-operation docs live on the contract routes; this applies them.
      operationMapper: (operation: any, appRoute) => {
        const meta = appRoute.metadata as OpenApiRouteMetadata
        operation.operationId = meta.operationId
        operation.tags = ['Address Change']

        if (operation.requestBody) operation.requestBody.required = true
        const body = operation.requestBody?.content?.['application/json']
        if (body && meta.requestExample) {
          body.schema.example = meta.requestExample
          operation.requestBody.description = 'The address-change payload.'
        }
        for (const [status, example] of Object.entries(meta.responseExamples ?? {})) {
          operation.responses[status].content['application/json'].schema.example = example
        }
        return operation
      },
    },
  )

  applyOAuth2(document, issuer, scope)

  for (const pathItem of Object.values(document.paths)) {
    for (const operation of Object.values(pathItem) as Array<Record<string, any>>) {
      if (typeof operation !== 'object' || !operation.operationId) continue

      for (const parameter of operation.parameters ?? []) {
        if (parameter.name === 'requestId') {
          parameter.description =
            'Identifier of the address-change request, as returned on creation.'
          parameter.schema.example = OPENAPI_REQUEST_ID
        }
      }

      for (const [status, response] of Object.entries<Record<string, any>>(operation.responses)) {
        response.description = responseDescriptions[status]
        const schema = response.content?.['application/json']?.schema
        if (schema && schema.example === undefined) schema.example = errorExamples[status]
      }
    }
  }

  // Path items carry a summary describing the resource.
  const pathSummaries: Record<string, string> = {
    [ADDRESS_CHANGE_ROUTE]: 'Address-change requests',
    [`${ADDRESS_CHANGE_ROUTE}/drafts`]: 'Address-change drafts',
    [`${ADDRESS_CHANGE_ROUTE}/drafts/{requestId}`]: 'A single address-change draft',
  }
  for (const [path, summary] of Object.entries(pathSummaries)) {
    ;(document.paths[path] as Record<string, unknown>).summary = summary
  }

  if (options.serverUrl) {
    document.servers = [
      {
        url: options.serverUrl,
        description: `Address Change API, ${ENVIRONMENT_LABELS[environment]} environment`,
      },
    ]
  }

  normalizeForOpenApi30(document)
  return document
}

// The schema generator emits some JSON Schema 2020-12 constructs that OpenAPI 3.0 rejects.
function normalizeForOpenApi30(node: unknown): void {
  if (Array.isArray(node)) {
    for (const item of node) normalizeForOpenApi30(item)
    return
  }
  if (!node || typeof node !== 'object') return
  const schema = node as Record<string, any>
  for (const [limit, flag] of [
    ['exclusiveMinimum', 'minimum'],
    ['exclusiveMaximum', 'maximum'],
  ] as const) {
    if (typeof schema[limit] === 'number') {
      schema[flag] = schema[limit]
      schema[limit] = true
    }
  }
  if (
    schema.additionalProperties &&
    Object.keys(schema.additionalProperties).join() === 'nullable'
  ) {
    schema.additionalProperties = true
  }
  for (const value of Object.values(schema)) normalizeForOpenApi30(value)
}
