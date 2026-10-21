import { BadRequestException, Injectable } from '@nestjs/common'
import type { PipeTransform } from '@nestjs/common'
import { z } from 'zod'

@Injectable()
export class ZodValidationPipe<TSchema extends z.ZodTypeAny> implements PipeTransform<
  unknown,
  z.infer<TSchema>
> {
  constructor(private readonly schema: TSchema) {}

  transform(value: unknown): z.infer<TSchema> {
    const result = this.schema.safeParse(value)
    if (!result.success) {
      throw new BadRequestException('Invalid request body')
    }
    return result.data
  }
}
