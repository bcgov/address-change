import { z } from 'zod'
import type { TokenAddress, UserSummary } from '@/auth/claims'
import { isValidPostalCode } from '@/utils/postal-code'

const required = (message: string) => z.string().trim().min(1, message)

const addressSchema = z.object({
  addressLineOne: required('Enter address line 1'),
  addressLineTwo: z.string().trim().optional(),
  locality: required('Enter a city'),
  region: z.literal('BC', {
    errorMap: () => ({ message: 'Your new address must be in British Columbia' }),
  }),
  postalCode: required('Enter a postal code').refine(isValidPostalCode, {
    message: 'Enter a valid postal code, like V8V 1A1',
  }),
  country: z.literal('Canada'),
})

const inRange = (value: string, min: number, max: number) => {
  const number = Number(value)
  return /^\d+$/.test(value.trim()) && number >= min && number <= max
}

const conditionalIssues = (values: {
  mailingSameAsResidential: boolean
  mailingAddress: unknown
  notifyIcbc: boolean
  icbc: {
    driversLicenseNumber: string
    heightCm: string
    weightKg: string
    securityKeyword: string
  }
}): z.IssueData[] => {
  const issues: z.IssueData[] = []
  if (!values.mailingSameAsResidential) {
    const result = addressSchema.safeParse(values.mailingAddress)
    if (!result.success) {
      for (const issue of result.error.issues) {
        issues.push({ ...issue, path: ['mailingAddress', ...issue.path] })
      }
    }
  }
  if (!values.notifyIcbc) return issues
  const { driversLicenseNumber, heightCm, weightKg, securityKeyword } = values.icbc
  const fail = (field: string, message: string) =>
    issues.push({ code: 'custom', message, path: ['icbc', field] })
  if (!/^\d{7,8}$/.test(driversLicenseNumber.trim())) {
    fail('driversLicenseNumber', 'Enter your 7 or 8 digit driver’s licence number')
  }
  if (!inRange(heightCm, 50, 275)) {
    fail('heightCm', 'Enter your height in cm, as shown on your licence')
  }
  if (!inRange(weightKg, 20, 400)) {
    fail('weightKg', 'Enter your weight in kg, as shown on your licence')
  }
  if (!securityKeyword.trim()) fail('securityKeyword', 'Enter your security keyword')
  return issues
}

export const addressChangeFormSchema = z
  .object({
    collectionNoticeAcknowledged: z
      .boolean()
      .refine((value) => value, { message: 'Acknowledge the collection notice to continue' }),
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
    notifyBcsc: z.boolean(),
    notifyIcbc: z.boolean(),
    icbc: z.object({
      driversLicenseNumber: z.string(),
      heightCm: z.string(),
      weightKg: z.string(),
      securityKeyword: z.string(),
    }),
  })
  .superRefine((values, ctx) => {
    for (const issue of conditionalIssues(values)) ctx.addIssue(issue)
  })

export type AddressChangeFormValues = z.infer<typeof addressChangeFormSchema>

/** All schema issues; zod skips the conditional checks when a base field fails, so they run separately here. */
function allIssues(values: AddressChangeFormValues): z.ZodIssue[] {
  const result = addressChangeFormSchema.safeParse(values)
  if (result.success) return []
  const extra = conditionalIssues(values).map((issue) => ({
    ...issue,
    message: issue.message ?? '',
    path: issue.path ?? [],
  })) as z.ZodIssue[]
  return [...result.error.issues, ...extra]
}

export const emptyAddress = {
  addressLineOne: '',
  addressLineTwo: '',
  locality: '',
  region: 'BC',
  postalCode: '',
  country: 'Canada',
}

export const defaultFormValues = (): AddressChangeFormValues => ({
  collectionNoticeAcknowledged: false,
  dateOfBirth: '',
  effectiveDate: new Date().toISOString().slice(0, 10),
  residentialAddress: { ...emptyAddress },
  mailingSameAsResidential: true,
  mailingAddress: { ...emptyAddress },
  notifyBcsc: true,
  notifyIcbc: true,
  icbc: { driversLicenseNumber: '', heightCm: '', weightKg: '', securityKeyword: '' },
})

/** Overlays saved draft values on the defaults so older drafts still yield a complete form. */
export function mergeDraftValues(saved: Record<string, unknown>): AddressChangeFormValues {
  const defaults = defaultFormValues()
  const section = <K extends 'residentialAddress' | 'mailingAddress' | 'icbc'>(key: K) => ({
    ...defaults[key],
    ...((saved[key] as object | undefined) ?? {}),
  })
  return {
    ...defaults,
    ...(saved as Partial<AddressChangeFormValues>),
    residentialAddress: section('residentialAddress'),
    mailingAddress: section('mailingAddress'),
    icbc: section('icbc'),
    notifyBcsc: true,
  }
}

export type StepFields = readonly (keyof AddressChangeFormValues)[]

/** Form fields validated when leaving each step. */
export const stepFields = (hasBirthdate: boolean): readonly StepFields[] => [
  ['collectionNoticeAcknowledged'],
  hasBirthdate ? [] : ['dateOfBirth'],
  ['effectiveDate', 'residentialAddress', 'mailingSameAsResidential', 'mailingAddress'],
  ['notifyIcbc', 'icbc'],
  [],
]

/** True when no schema issue falls on the given fields, so the step can be left. */
export function areFieldsValid(values: AddressChangeFormValues, names: StepFields): boolean {
  if (names.length === 0) return true
  return !allIssues(values).some((issue) =>
    names.includes(issue.path[0] as keyof AddressChangeFormValues),
  )
}

/** Returns the values with each invalid leaf among `names` reset to its default, so only valid input is kept. */
export function withValidFieldsOnly(
  values: AddressChangeFormValues,
  names: StepFields,
): AddressChangeFormValues {
  const issues = allIssues(values)
  if (issues.length === 0) return values
  const defaults = defaultFormValues() as Record<string, unknown>
  const cleaned = structuredClone(values) as Record<string, unknown>
  for (const issue of issues) {
    const [root, ...rest] = issue.path as string[]
    if (!names.includes(root as keyof AddressChangeFormValues)) continue
    if (rest.length === 0) {
      cleaned[root] = defaults[root]
      continue
    }
    const target = cleaned[root] as Record<string, unknown>
    const fallback = defaults[root] as Record<string, unknown>
    target[rest[0]] = fallback[rest[0]]
  }
  return cleaned as AddressChangeFormValues
}

const toApiAddress = (address: Partial<TokenAddress>) => ({
  country: address.country ?? '',
  addressLineOne: address.addressLineOne ?? '',
  addressLineTwo: address.addressLineTwo || undefined,
  locality: address.locality ?? '',
  region: address.region ?? '',
  postalCode: address.postalCode ?? '',
})

/** Maps form state to the POST /api/v1/address-change body. MSP is not offered yet, so it is never notified. */
export function toAddressChangeRequest(
  values: AddressChangeFormValues,
  user: UserSummary,
  idempotencyKey: string,
) {
  const icbc = values.notifyIcbc
    ? {
        driversLicenseNumber: values.icbc.driversLicenseNumber.trim(),
        heightCm: Number(values.icbc.heightCm),
        weightKg: Number(values.icbc.weightKg),
        securityKeyword: values.icbc.securityKeyword.trim(),
      }
    : {}
  return {
    idempotencyKey,
    effectiveDate: values.effectiveDate,
    isBillingAddressSame: values.mailingSameAsResidential,
    person: {
      firstName: user.firstName,
      lastName: user.lastName,
      dateOfBirth: values.dateOfBirth,
      emailAddress: user.email || undefined,
      ...icbc,
    },
    oldAddress: toApiAddress(user.currentAddress ?? {}),
    newAddress: toApiAddress(values.residentialAddress),
    mailingAddress: values.mailingSameAsResidential
      ? undefined
      : toApiAddress(values.mailingAddress),
    notificationIntent: {
      notifyBcsc: values.notifyBcsc,
      notifyIcbc: values.notifyIcbc,
      notifyMsp: false,
    },
  }
}
