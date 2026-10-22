import { z } from 'zod'
import type { TokenAddress, UserSummary } from '@/auth/claims'
import { isValidPostalCode } from '@/utils/postal-code'

const required = (message: string) => z.string().trim().min(1, message)

const addressSchema = z.object({
  addressLineOne: required('Enter address line 1'),
  addressLineTwo: z.string().trim().optional(),
  locality: required('Enter a city'),
  region: required('Select a province'),
  postalCode: required('Enter a postal code').refine(isValidPostalCode, {
    message: 'Enter a valid postal code, like V8V 1A1',
  }),
  country: z.literal('Canada'),
})

export const addressChangeFormSchema = z
  .object({
    dateOfBirth: z.string().date('Enter a valid date of birth'),
    effectiveDate: z.string().date('Enter a valid effective date'),
    residentialAddress: addressSchema,
    mailingSameAsResidential: z.boolean(),
    mailingAddress: z.object({
      addressLineOne: z.string(),
      addressLineTwo: z.string().optional(),
      locality: z.string(),
      region: z.string(),
      postalCode: z.string(),
      country: z.string(),
    }),
    notifyIcbc: z.boolean(),
    notifyMsp: z.boolean(),
  })
  .superRefine((values, ctx) => {
    if (!values.notifyIcbc && !values.notifyMsp) {
      ctx.addIssue({
        code: 'custom',
        message: 'Select at least one service to notify',
        path: ['notifyIcbc'],
      })
    }
    if (values.mailingSameAsResidential) return
    const result = addressSchema.safeParse(values.mailingAddress)
    if (!result.success) {
      for (const issue of result.error.issues) {
        ctx.addIssue({ ...issue, path: ['mailingAddress', ...issue.path] })
      }
    }
  })

export type AddressChangeFormValues = z.infer<typeof addressChangeFormSchema>

export const emptyAddress = {
  addressLineOne: '',
  addressLineTwo: '',
  locality: '',
  region: 'BC',
  postalCode: '',
  country: 'Canada',
}

export const defaultFormValues = (): AddressChangeFormValues => ({
  dateOfBirth: '',
  effectiveDate: new Date().toISOString().slice(0, 10),
  residentialAddress: { ...emptyAddress },
  mailingSameAsResidential: true,
  mailingAddress: { ...emptyAddress },
  notifyIcbc: true,
  notifyMsp: true,
})

const toApiAddress = (address: Partial<TokenAddress>) => ({
  country: address.country ?? '',
  addressLineOne: address.addressLineOne ?? '',
  addressLineTwo: address.addressLineTwo || undefined,
  locality: address.locality ?? '',
  region: address.region ?? '',
  postalCode: address.postalCode ?? '',
})

/** Maps form state to the POST /api/v1/address-change body. */
export function toAddressChangeRequest(
  values: AddressChangeFormValues,
  user: UserSummary,
  idempotencyKey: string,
) {
  return {
    idempotencyKey,
    effectiveDate: values.effectiveDate,
    isBillingAddressSame: values.mailingSameAsResidential,
    person: {
      firstName: user.firstName,
      lastName: user.lastName,
      dateOfBirth: values.dateOfBirth,
      emailAddress: user.email || undefined,
    },
    oldAddress: toApiAddress(user.currentAddress ?? {}),
    newAddress: toApiAddress(values.residentialAddress),
    mailingAddress: values.mailingSameAsResidential
      ? undefined
      : toApiAddress(values.mailingAddress),
    notificationIntent: { notifyIcbc: values.notifyIcbc, notifyMsp: values.notifyMsp },
  }
}
