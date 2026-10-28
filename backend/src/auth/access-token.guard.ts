import {
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common'
import type { CanActivate, ExecutionContext } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { Request } from 'express'
import type { JWTVerifyGetKey } from 'jose'
import { loggedFetch } from '../logging/logged-fetch'

export interface AuthenticatedRequest extends Request {
  ownerSub: string
}

@Injectable()
export class AccessTokenVerifier {
  private keys?: JWTVerifyGetKey
  private jwksUri?: string

  constructor(private readonly config: ConfigService) {}

  async verify(token: string): Promise<string> {
    const issuer = this.config.get<string>('OIDC_ISSUER')
    const audience = this.config.get<string>('OIDC_AUDIENCE')
    const jwksUri = this.config.get<string>('OIDC_JWKS_URI')
    const scope = this.config.get<string>('OIDC_SUBMISSION_SCOPE')
    if (!issuer || !audience?.trim() || !jwksUri || !scope?.trim() || /\s/.test(scope)) {
      throw new ServiceUnavailableException('Submission authentication is not configured')
    }
    try {
      if (new URL(issuer).protocol !== 'https:' || new URL(jwksUri).protocol !== 'https:') {
        throw new Error('HTTPS required')
      }
    } catch {
      throw new ServiceUnavailableException('Submission authentication is not configured')
    }

    // Dynamic import also supports Node versions that cannot require an ESM-only library.
    const { createRemoteJWKSet, jwtVerify, customFetch } = await import('jose')
    if (!this.keys || this.jwksUri !== jwksUri) {
      this.keys = createRemoteJWKSet(new URL(jwksUri), {
        timeoutDuration: 5000,
        [customFetch]: loggedFetch,
      })
      this.jwksUri = jwksUri
    }
    let verified: Awaited<ReturnType<typeof jwtVerify>>
    try {
      verified = await jwtVerify(token, this.keys, {
        issuer,
        audience,
        algorithms: ['RS256'],
        requiredClaims: ['sub', 'exp', 'iat'],
        clockTolerance: 5,
      })
    } catch (error) {
      const code = (error as { code?: string }).code
      const invalidTokenCodes = [
        'ERR_JWT_EXPIRED',
        'ERR_JWT_CLAIM_VALIDATION_FAILED',
        'ERR_JWS_SIGNATURE_VERIFICATION_FAILED',
        'ERR_JWS_INVALID',
        'ERR_JWT_INVALID',
        'ERR_JOSE_ALG_NOT_ALLOWED',
        'ERR_JOSE_NOT_SUPPORTED',
        'ERR_JWKS_NO_MATCHING_KEY',
      ]
      if (code && invalidTokenCodes.includes(code)) {
        throw new UnauthorizedException('Invalid or expired access token')
      }
      // Never return or log the JWT, claims, or raw library errors.
      throw new ServiceUnavailableException('Token verification is temporarily unavailable')
    }
    const { payload, protectedHeader } = verified
    if (
      typeof payload.sub !== 'string' ||
      !payload.sub.trim() ||
      (payload.typ !== 'Bearer' && protectedHeader.typ !== 'at+jwt')
    ) {
      throw new UnauthorizedException('An access token is required')
    }
    if (typeof payload.scope !== 'string' || !payload.scope.split(/\s+/).includes(scope)) {
      throw new ForbiddenException('Missing address-change submission permission')
    }
    return payload.sub
  }
}

@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(private readonly verifier: AccessTokenVerifier) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>()
    const match = /^Bearer ([^\s]+)$/i.exec(request.headers.authorization ?? '')
    if (!match?.[1]) throw new UnauthorizedException('A bearer access token is required')
    request.ownerSub = await this.verifier.verify(match[1])
    return true
  }
}
