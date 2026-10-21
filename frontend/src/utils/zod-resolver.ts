import type { FieldErrors, FieldValues, Resolver } from 'react-hook-form'
import type { ZodType } from 'zod'

/** Minimal zod resolver for react-hook-form (avoids the heavy @hookform/resolvers peer tree). */
export function zodResolver<T extends FieldValues>(schema: ZodType<T, any, any>): Resolver<T> {
  return async (values) => {
    const result = await schema.safeParseAsync(values)
    if (result.success) {
      return { values: result.data, errors: {} }
    }
    const errors: Record<string, any> = {}
    for (const issue of result.error.issues) {
      let cursor = errors
      issue.path.forEach((segment, index) => {
        const key = String(segment)
        if (index === issue.path.length - 1) {
          cursor[key] ??= { type: issue.code, message: issue.message }
        } else {
          cursor = cursor[key] ??= {}
        }
      })
    }
    return { values: {}, errors: errors as FieldErrors<T> }
  }
}
