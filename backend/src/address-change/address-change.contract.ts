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

export const addressChangeAcknowledgementSchema = z
  .object({
    requestId: z.string().uuid(),
  })
  .strict()

export type AddressChangeRequest = z.infer<typeof addressChangeRequestSchema>
export type AddressChangeAcknowledgement = z.infer<typeof addressChangeAcknowledgementSchema>

const contract = initContract()

export const addressChangeContract = contract.router({
  submit: {
    method: 'POST',
    path: ADDRESS_CHANGE_ROUTE,
    body: addressChangeRequestSchema,
    responses: {
      202: addressChangeAcknowledgementSchema,
      400: z.object({
        statusCode: z.number(),
        message: z.string(),
        error: z.string(),
      }),
    },
    summary: 'Accept an address change request',
  },
})
