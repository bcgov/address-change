import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common'
import { ADDRESS_CHANGE_PATH, API_VERSION, addressChangeContract } from './address-change.contract'
import type {
  AddressChangeAcknowledgement,
  AddressChangeDraft,
  AddressChangeDraftResponse,
  AddressChangeRequest,
  AddressChangeSummary,
} from './address-change.contract'
import { badRequestProblem } from '../common/problem-details'
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

  @Put('drafts')
  @UseGuards(AccessTokenGuard)
  @HttpCode(HttpStatus.OK)
  saveDraft(
    @Body(new ZodValidationPipe(addressChangeContract.saveDraft.body))
    body: AddressChangeDraft,
    @Req() request: AuthenticatedRequest,
  ): Promise<AddressChangeAcknowledgement> {
    return this.service.saveDraft(body, request.ownerSub)
  }

  @Get('drafts/:requestId')
  @UseGuards(AccessTokenGuard)
  @Header('Cache-Control', 'no-store, max-age=0')
  @Header('Pragma', 'no-cache')
  @Header('Vary', 'Authorization')
  @HttpCode(HttpStatus.OK)
  getDraft(
    @Param(
      'requestId',
      new ParseUUIDPipe({
        exceptionFactory: () =>
          badRequestProblem('Invalid request identifier', [
            { path: ['requestId'], code: 'invalid_string' },
          ]),
      }),
    )
    requestId: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<AddressChangeDraftResponse> {
    return this.service.getDraft(requestId, request.ownerSub)
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
