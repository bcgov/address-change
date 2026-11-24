import { BadRequestException } from '@nestjs/common'
import type { ZodIssue } from 'zod'

/**
 * RFC 9457 problem details for a 400 response. Only the field path and the issue code are
 * returned, never the submitted values, so private data is not reflected to the caller.
 */
export function badRequestProblem(
  detail: string,
  issues: Array<Pick<ZodIssue, 'path' | 'code'>>,
  location: 'body' | 'path' = 'body',
): BadRequestException {
  return new BadRequestException({
    type: 'about:blank',
    title: 'Bad Request',
    status: 400,
    detail,
    errors: issues.map((issue) => ({
      type: 'validation',
      code: issue.code,
      message: `Invalid value at /${issue.path.join('/')}`,
      location,
    })),
  })
}
