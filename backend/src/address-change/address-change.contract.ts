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
      })
      .strict(),
  })
  .strict()
  .refine((value) => value.isBillingAddressSame || value.mailingAddress !== undefined, {
    path: ['mailingAddress'],
  })
  .refine((value) => value.notificationIntent.notifyIcbc || value.notificationIntent.notifyMsp, {
    path: ['notificationIntent'],
  })

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
    effectiveDate: z.string(),
    createdAt: z.string().datetime(),
    operations: z.array(addressChangeOperationStatusSchema),
  })
  .strict()

export type AddressChangeRequest = z.infer<typeof addressChangeRequestSchema>
export type AddressChangeAcknowledgement = z.infer<typeof addressChangeAcknowledgementSchema>
export type AddressChangeSummary = z.infer<typeof addressChangeSummarySchema>

const contract = initContract()
const errorSchema = z.object({
  statusCode: z.number(),
  message: z.string(),
  error: z.string(),
})

export const addressChangeContract = contract.router({
  list: {
    method: 'GET',
    path: ADDRESS_CHANGE_ROUTE,
    responses: {
      200: z.array(addressChangeSummarySchema),
      401: errorSchema,
      503: errorSchema,
    },
    summary: 'List address-change requests for the authenticated resident',
  },
  submit: {
    method: 'POST',
    path: ADDRESS_CHANGE_ROUTE,
    body: addressChangeRequestSchema,
    responses: {
      202: addressChangeAcknowledgementSchema,
      400: errorSchema,
      401: errorSchema,
      403: errorSchema,
      409: errorSchema,
      503: errorSchema,
    },
    summary: 'Accept an address change request',
  },
})
