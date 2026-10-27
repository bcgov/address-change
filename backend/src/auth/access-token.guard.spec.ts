import { ConfigService } from '@nestjs/config'
import {
  ForbiddenException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common'
import { createLocalJWKSet, createRemoteJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose'
import type { JWTPayload } from 'jose'
import { AccessTokenVerifier } from './access-token.guard'

vi.mock('jose', async (importOriginal) => ({
  ...(await importOriginal<typeof import('jose')>()),
  createRemoteJWKSet: vi.fn(),
}))

describe('AccessTokenVerifier (real JWT signature verification)', () => {
  let keys: Awaited<ReturnType<typeof generateKeyPair>>
  let verifier: AccessTokenVerifier
  const config = {
    OIDC_ISSUER: 'https://sso.example.test/realm',
    OIDC_AUDIENCE: 'address-change-api',
    OIDC_JWKS_URI: 'https://sso.example.test/certs',
    OIDC_SUBMISSION_SCOPE: 'address-change:submit',
  }
  beforeAll(async () => {
    keys = await generateKeyPair('RS256')
  })
  beforeEach(async () => {
    vi.mocked(createRemoteJWKSet).mockReset()
    const local = createLocalJWKSet({
      keys: [{ ...(await exportJWK(keys.publicKey)), kid: 'test-key', alg: 'RS256', use: 'sig' }],
    })
    vi.mocked(createRemoteJWKSet).mockReturnValue(local as ReturnType<typeof createRemoteJWKSet>)
    verifier = new AccessTokenVerifier(new ConfigService(config))
  })
  const token = async (overrides: JWTPayload = {}, signingKey?: typeof keys.privateKey) => {
    const now = Math.floor(Date.now() / 1000)
    return new SignJWT({
      iss: config.OIDC_ISSUER,
      aud: config.OIDC_AUDIENCE,
      sub: 'synthetic-subject',
      typ: 'Bearer',
      scope: 'openid address-change:submit',
      iat: now,
      exp: now + 300,
      ...overrides,
    })
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key', typ: 'JWT' })
      .sign(signingKey ?? keys.privateKey)
  }
  it('verifies signatures and returns only the exact subject, reusing the JWKS resolver', async () => {
    const signed = await token()
    expect(await verifier.verify(signed)).toBe('synthetic-subject')
    expect(await verifier.verify(signed)).toBe('synthetic-subject')
    expect(createRemoteJWKSet).toHaveBeenCalledTimes(1)
  })
  it.each([
    { iss: 'https://untrusted.example.test' },
    { aud: 'another-api' },
    { exp: 1 },
    { exp: undefined },
    { iat: undefined },
    { sub: '' },
    { typ: 'ID' },
    { nbf: 9999999999 },
  ])('rejects invalid claims or an ID token', async (overrides) => {
    await expect(verifier.verify(await token(overrides))).rejects.toBeInstanceOf(
      UnauthorizedException,
    )
  })
  it('rejects another signing key and malformed tokens', async () => {
    const other = await generateKeyPair('RS256')
    await expect(verifier.verify(await token({}, other.privateKey))).rejects.toBeInstanceOf(
      UnauthorizedException,
    )
    await expect(verifier.verify('decoded-json-is-not-a-token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    )
  })
  it('rejects an unexpected subject type rather than treating it as an application error', async () => {
    await expect(
      verifier.verify(await token({ sub: 123 as unknown as string })),
    ).rejects.toBeInstanceOf(UnauthorizedException)
  })
  it('rejects missing permission independently of successful authentication', async () => {
    await expect(verifier.verify(await token({ scope: 'openid profile' }))).rejects.toBeInstanceOf(
      ForbiddenException,
    )
  })
  it('fails closed for missing or non-HTTPS configuration', async () => {
    for (const settings of [{}, { ...config, OIDC_JWKS_URI: 'http://sso.example.test/certs' }]) {
      await expect(
        new AccessTokenVerifier(new ConfigService(settings)).verify(await token()),
      ).rejects.toBeInstanceOf(ServiceUnavailableException)
    }
  })
  it('reports key-service unavailability without exposing internal errors', async () => {
    vi.mocked(createRemoteJWKSet).mockReturnValue((async () => {
      throw new Error('private network detail')
    }) as unknown as ReturnType<typeof createRemoteJWKSet>)
    await expect(verifier.verify(await token())).rejects.toThrow(
      'Token verification is temporarily unavailable',
    )
  })
})
