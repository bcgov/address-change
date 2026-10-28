import { Injectable } from '@nestjs/common'
import type { PipeTransform } from '@nestjs/common'
import { z } from 'zod'
import { badRequestProblem } from './problem-details'

@Injectable()
export class ZodValidationPipe<TSchema extends z.ZodTypeAny>
  implements PipeTransform<unknown, z.infer<TSchema>>
{
  constructor(private readonly schema: TSchema) {}

  transform(value: unknown): z.infer<TSchema> {
    const result = this.schema.safeParse(value)
    if (!result.success) {
      throw badRequestProblem('Invalid request body', result.error.issues)
    }
    return result.data
  }
}
