import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common'
import { ADDRESS_CHANGE_PATH, API_VERSION, addressChangeContract } from './address-change.contract'
import type {
  AddressChangeAcknowledgement,
  AddressChangeRequest,
  AddressChangeSummary,
} from './address-change.contract'
import { ZodValidationPipe } from '../common/zod-validation.pipe'
import { AddressChangeService } from './address-change.service'
import { AccessTokenGuard } from '../auth/access-token.guard'
import type { AuthenticatedRequest } from '../auth/access-token.guard'

@Controller({ path: ADDRESS_CHANGE_PATH, version: API_VERSION })
export class AddressChangeController {
  constructor(private readonly service: AddressChangeService) {}

  @Get()
  @UseGuards(AccessTokenGuard)
  @Header('Cache-Control', 'no-store, max-age=0')
  @Header('Pragma', 'no-cache')
  @Header('Vary', 'Authorization')
  @HttpCode(HttpStatus.OK)
  list(@Req() request: AuthenticatedRequest): Promise<AddressChangeSummary[]> {
    return this.service.list(request.ownerSub)
  }

  @Post()
  @UseGuards(AccessTokenGuard)
  @HttpCode(HttpStatus.ACCEPTED)
  submit(
    @Body(new ZodValidationPipe(addressChangeContract.submit.body))
    body: AddressChangeRequest,
    @Req() request: AuthenticatedRequest,
  ): Promise<AddressChangeAcknowledgement> {
    return this.service.submit(body, request.ownerSub)
  }
}
