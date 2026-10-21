import { randomUUID } from 'node:crypto'
import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common'
import { ADDRESS_CHANGE_PATH, API_VERSION, addressChangeContract } from './address-change.contract'
import type { AddressChangeAcknowledgement, AddressChangeRequest } from './address-change.contract'
import { ZodValidationPipe } from '../common/zod-validation.pipe'

@Controller({ path: ADDRESS_CHANGE_PATH, version: API_VERSION })
export class AddressChangeController {
  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  submit(
    @Body(new ZodValidationPipe(addressChangeContract.submit.body))
    _body: AddressChangeRequest,
  ): AddressChangeAcknowledgement {
    return { requestId: randomUUID() }
  }
}
