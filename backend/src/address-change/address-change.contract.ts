import { initContract } from '@ts-rest/core'
import { z } from 'zod'

export const API_VERSION = '1'
export const ADDRESS_CHANGE_PATH = 'address-change'
export const ADDRESS_CHANGE_ROUTE = `/api/v${API_VERSION}/${ADDRESS_CHANGE_PATH}`

const nonBlankString = z.string().refine((value) => value.trim().length > 0)
const optionalString = z.string().nullable().optional()

const addressSchema = z
  .object({
    country: nonBlankString,
    addressLineOne: nonBlankString,
    addressLineTwo: optionalString,
    locality: nonBlankString,
    region: nonBlankString,
    postalCode: nonBlankString,
  })
  .strict()

const personSchema = z
  .object({
    firstName: nonBlankString,
    firstMiddleInitial: optionalString,
    secondMiddleInitial: optionalString,
    lastName: nonBlankString,
    dateOfBirth: z.string().date(),
    emailAddress: optionalString,
    daytimePhone: optionalString,
    driversLicenseNumber: optionalString,
    heightCm: z.number().int().positive().nullable().optional(),
    weightKg: z.number().int().positive().nullable().optional(),
    securityKeyword: optionalString,
    phn: optionalString,
  })
  .strict()

export const addressChangeRequestSchema = z
  .object({
    idempotencyKey: z
      .string()
      .min(1)
      .max(255)
      .refine((value) => value.trim().length > 0),
    effectiveDate: z.string().date(),
    isBillingAddressSame: z.boolean(),
    person: personSchema,
    oldAddress: addressSchema,
    newAddress: addressSchema,
    mailingAddress: addressSchema.optional(),
    notificationIntent: z
      .object({
        notifyIcbc: z.boolean(),
        notifyMsp: z.boolean(),
        notifyBcsc: z.boolean().optional(),
      })
      .strict(),
  })
  .strict()
  .refine((value) => value.isBillingAddressSame || value.mailingAddress !== undefined, {
    path: ['mailingAddress'],
  })
  .refine(
    (value) =>
      value.notificationIntent.notifyIcbc ||
      value.notificationIntent.notifyMsp ||
      value.notificationIntent.notifyBcsc === true,
    {
      path: ['notificationIntent'],
    },
  )

export const draftDataSchema = z
  .object({
    step: z.number().int().min(0).max(10),
    // Opaque form state owned by the frontend; stored encrypted and returned only to its owner.
    values: z.record(z.string(), z.unknown()),
  })
  .strict()
  .refine((value) => JSON.stringify(value).length <= 20_000)

export const addressChangeDraftSchema = z
  .object({
    idempotencyKey: z
      .string()
      .min(1)
      .max(255)
      .refine((value) => value.trim().length > 0),
    draft: draftDataSchema,
  })
  .strict()

export const addressChangeDraftResponseSchema = z
  .object({
    requestId: z.string().uuid(),
    idempotencyKey: z.string(),
    status: z.literal('DRAFT'),
    draft: draftDataSchema,
  })
  .strict()

export const addressChangeAcknowledgementSchema = z
  .object({
    requestId: z.string().uuid(),
  })
  .strict()

const addressChangeOperationStatusSchema = z
  .object({
    partnerCode: nonBlankString,
    deliveryMode: nonBlankString,
    status: nonBlankString,
  })
  .strict()

export const addressChangeSummarySchema = z
  .object({
    requestId: z.string().uuid(),
    status: nonBlankString,
    effectiveDate: z.string().nullable(),
    createdAt: z.string().datetime(),
    submittedAt: z.string().datetime().nullable(),
    updatedAt: z.string().datetime(),
    operations: z.array(addressChangeOperationStatusSchema),
  })
  .strict()

export type AddressChangeRequest = z.infer<typeof addressChangeRequestSchema>
export type AddressChangeAcknowledgement = z.infer<typeof addressChangeAcknowledgementSchema>
export type AddressChangeDraft = z.infer<typeof addressChangeDraftSchema>
export type AddressChangeDraftResponse = z.infer<typeof addressChangeDraftResponseSchema>
export type AddressChangeSummary = z.infer<typeof addressChangeSummarySchema>

/** Sample values shared by the OpenAPI examples. */
export const OPENAPI_REQUEST_ID = '7c825573-3df5-4e63-b376-ef7a4057369d'
const EXAMPLE_TIMESTAMP = '2026-01-15T17:30:00.000Z'
const exampleAddress = {
  country: 'Canada',
  addressLineOne: '1234 Example Street',
  locality: 'Victoria',
  region: 'BC',
  postalCode: 'V8W 1A1',
}
const exampleAck = { requestId: OPENAPI_REQUEST_ID }
const exampleDraft = { step: 2, values: { firstName: 'Alex' } }

/** Per-operation OpenAPI documentation, read by openapi.config.ts via the route metadata. */
export interface OpenApiRouteMetadata {
  operationId: string
  requestExample?: unknown
  responseExamples?: Record<number, unknown>
}

const contract = initContract()
const errorSchema = z.object({
  statusCode: z.number(),
  message: z.string(),
  error: z.string(),
})

const problemDetailsSchema = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number().int(),
  detail: z.string(),
  errors: z
    .array(
      z.object({
        type: z.string(),
        code: z.string(),
        message: z.string(),
        location: z.enum(['body', 'query', 'header', 'path', 'cookie']),
      }),
    )
    .min(1),
})

export const addressChangeContract = contract.router({
  list: {
    method: 'GET',
    path: ADDRESS_CHANGE_ROUTE,
    responses: {
      200: z.array(addressChangeSummarySchema),
      401: errorSchema,
      403: errorSchema,
      503: errorSchema,
    },
    summary: 'List address-change requests',
    description:
      'Returns the address-change requests owned by the authenticated resident, including the delivery status of each partner operation.',
    metadata: {
      operationId: 'listAddressChangeRequests',
      responseExamples: {
        200: [
          {
            requestId: OPENAPI_REQUEST_ID,
            status: 'SUBMITTED',
            effectiveDate: '2026-02-01',
            createdAt: EXAMPLE_TIMESTAMP,
            submittedAt: EXAMPLE_TIMESTAMP,
            updatedAt: EXAMPLE_TIMESTAMP,
            operations: [{ partnerCode: 'ICBC', deliveryMode: 'API', status: 'DELIVERED' }],
          },
        ],
      },
    } satisfies OpenApiRouteMetadata,
  },
  getDraft: {
    method: 'GET',
    path: `${ADDRESS_CHANGE_ROUTE}/drafts/:requestId`,
    pathParams: z.object({ requestId: z.string().uuid() }),
    responses: {
      200: addressChangeDraftResponseSchema,
      400: problemDetailsSchema,
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
      503: errorSchema,
    },
    summary: 'Get an address-change draft',
    description:
      'Returns a draft address-change request owned by the authenticated resident. Drafts owned by other residents are reported as not found.',
    metadata: {
      operationId: 'getAddressChangeDraft',
      responseExamples: {
        200: {
          requestId: OPENAPI_REQUEST_ID,
          idempotencyKey: 'draft-7f3a',
          status: 'DRAFT',
          draft: exampleDraft,
        },
      },
    } satisfies OpenApiRouteMetadata,
  },
  saveDraft: {
    method: 'PUT',
    path: `${ADDRESS_CHANGE_ROUTE}/drafts`,
    body: addressChangeDraftSchema,
    responses: {
      200: addressChangeAcknowledgementSchema,
      400: problemDetailsSchema,
      401: errorSchema,
      403: errorSchema,
      409: errorSchema,
      503: errorSchema,
    },
    summary: 'Save an address-change draft',
    description:
      'Creates or updates the resident draft identified by the idempotency key. The draft content is opaque form state and is stored encrypted.',
    metadata: {
      operationId: 'saveAddressChangeDraft',
      requestExample: { idempotencyKey: 'draft-7f3a', draft: exampleDraft },
      responseExamples: { 200: exampleAck },
    } satisfies OpenApiRouteMetadata,
  },
  submit: {
    method: 'POST',
    path: ADDRESS_CHANGE_ROUTE,
    body: addressChangeRequestSchema,
    responses: {
      202: addressChangeAcknowledgementSchema,
      400: problemDetailsSchema,
      401: errorSchema,
      403: errorSchema,
      409: errorSchema,
      503: errorSchema,
    },
    summary: 'Submit an address-change request',
    description:
      'Accepts an address-change request for asynchronous delivery to the selected partners and returns a request identifier. Repeating a submission with the same idempotency key returns the original result.',
    metadata: {
      operationId: 'submitAddressChangeRequest',
      requestExample: {
        idempotencyKey: 'submit-7f3a',
        effectiveDate: '2026-02-01',
        isBillingAddressSame: true,
        person: { firstName: 'Alex', lastName: 'Example', dateOfBirth: '1990-04-12' },
        oldAddress: exampleAddress,
        newAddress: { ...exampleAddress, addressLineOne: '5678 Sample Avenue' },
        notificationIntent: { notifyIcbc: true, notifyMsp: true },
      },
      responseExamples: { 202: exampleAck },
    } satisfies OpenApiRouteMetadata,
  },
})
