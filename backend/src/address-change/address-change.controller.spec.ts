import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { randomBytes } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'
import { Test } from '@nestjs/testing'
import { VersioningType, UnauthorizedException } from '@nestjs/common'
import type { INestApplication } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import request from 'supertest'
import { Prisma } from '../../generated/prisma/client.js'
import { PrismaService } from '../prisma.service'
import { AccessTokenGuard, AccessTokenVerifier } from '../auth/access-token.guard'
import { AddressChangeController } from './address-change.controller'
import { AddressChangeService } from './address-change.service'
import { RequestEncryptionService } from './request-encryption.service'
import type { AddressChangeRequest } from './address-change.contract'

// Synthetic fixtures only: never copy resident claims or real access tokens here.
const validRequest: AddressChangeRequest = {
  idempotencyKey: 'request-key-123',
  effectiveDate: '2027-01-01',
  isBillingAddressSame: true,
  person: {
    firstName: 'Test',
    lastName: 'Resident',
    dateOfBirth: '1990-02-03',
    emailAddress: 'test@example.test',
    driversLicenseNumber: '00123456',
    heightCm: 170,
    weightKg: 65,
    securityKeyword: 'synthetic keyword',
    phn: '0012345678',
  },
  oldAddress: {
    country: 'CA',
    addressLineOne: '1 Test Street',
    locality: 'Victoria',
    region: 'BC',
    postalCode: 'V8V 1X4',
  },
  newAddress: {
    country: 'CA',
    addressLineOne: '2 Test Street',
    addressLineTwo: 'Unit 5',
    locality: 'Vancouver',
    region: 'BC',
    postalCode: 'V5K 0A1',
  },
  notificationIntent: { notifyIcbc: true, notifyMsp: true },
}

describe('AddressChange intake HTTP + SQL integration', () => {
  let app: INestApplication
  let pg: PGlite
  let encryption: RequestEncryptionService
  let failOperationNumber: number | undefined
  let transientFailures = 0
  const verifier = {
    verify: vi.fn(async (token: string) => {
      if (!['synthetic-A', 'synthetic-B'].includes(token)) throw new UnauthorizedException()
      return token === 'synthetic-A' ? 'resident-A' : 'resident-B'
    }),
  }

  beforeAll(async () => {
    pg = new PGlite()
    // Execute the real migrations unchanged ONLY inside this isolated test database.
    const migrations = resolve('..', 'migrations/sql')
    for (const file of readdirSync(migrations)
      .filter((name) => name.endsWith('.sql'))
      .sort()) {
      await pg.exec(readFileSync(resolve(migrations, file), 'utf8'))
    }
    const database = {
      $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
        const sql = Prisma.sql(strings, ...values)
        return (await pg.query(sql.text, sql.values)).rows
      },
      $transaction: async (callback: (tx: unknown) => Promise<unknown>) => {
        if (transientFailures > 0) {
          transientFailures--
          throw { code: 'P2034' }
        }
        return pg.transaction(async (transaction) => {
          let operationInserts = 0
          return callback({
            $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
              const sql = Prisma.sql(strings, ...values)
              return (await transaction.query(sql.text, sql.values)).rows
            },
            $executeRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
              const sql = Prisma.sql(strings, ...values)
              if (sql.text.includes('INSERT INTO address_change.processing_operation')) {
                operationInserts++
                if (operationInserts === failOperationNumber)
                  throw new Error('synthetic DB failure with private data')
              }
              return (await transaction.query(sql.text, sql.values)).affectedRows
            },
          })
        })
      },
    }
    const config = new ConfigService({
      ADDRESS_CHANGE_ENCRYPTION_KEY_ID: 'test-only',
      ADDRESS_CHANGE_ENCRYPTION_KEYS: JSON.stringify({
        'test-only': randomBytes(32).toString('base64'),
      }),
    })
    const module = await Test.createTestingModule({
      controllers: [AddressChangeController],
      providers: [
        AddressChangeService,
        RequestEncryptionService,
        AccessTokenGuard,
        { provide: AccessTokenVerifier, useValue: verifier },
        { provide: PrismaService, useValue: database },
        { provide: ConfigService, useValue: config },
      ],
    }).compile()
    encryption = module.get(RequestEncryptionService)
    app = module.createNestApplication()
    app.setGlobalPrefix('api')
    app.enableVersioning({ type: VersioningType.URI, prefix: 'v' })
    await app.init()
  }, 30000)

  beforeEach(async () => {
    await pg.exec(`TRUNCATE address_change.address_change_request CASCADE;
      UPDATE address_change.partner_system SET active = true, delivery_mode = 'FLAT_FILE';
      UPDATE address_change.status_type SET active = true;`)
    failOperationNumber = undefined
    transientFailures = 0
  })
  afterAll(async () => {
    await app?.close()
    await pg?.close()
  })

  const submit = (body: object = validRequest, token = 'synthetic-A') =>
    request(app.getHttpServer())
      .post('/api/v1/address-change')
      .set('Authorization', `Bearer ${token}`)
      .send(body)
  const rows = async (table: string) =>
    (await pg.query<Record<string, any>>(`SELECT * FROM address_change.${table}`)).rows

  it('commits request, person, addresses and selected operations, not delivery records', async () => {
    const response = await submit().expect(202)
    expect(response.body).toEqual({ requestId: expect.any(String) })
    const [saved] = await rows('address_change_request')
    expect(saved).toMatchObject({
      request_id: response.body.requestId,
      owner_sub: 'resident-A',
      status: 'SUBMITTED',
      status_category: 'REQUEST',
      created_by: 'resident-A',
    })
    expect(await rows('request_person')).toHaveLength(1)
    expect(await rows('submitted_address')).toHaveLength(1)
    const operations = await rows('processing_operation')
    expect(operations).toHaveLength(2)
    for (const operation of operations)
      expect(operation).toMatchObject({
        request_id: response.body.requestId,
        status: 'PENDING',
        delivery_mode: 'FLAT_FILE',
        batch_id: null,
      })
    expect(await rows('flat_file_batch')).toHaveLength(0)
    expect(await rows('processing_attempt')).toHaveLength(0)
    const plaintext = encryption.decrypt(
      saved!.raw_payload_encrypted,
      `request:${response.body.requestId}:payload`,
    )
    expect(JSON.parse(plaintext)).toEqual(validRequest)
    expect(plaintext).not.toContain('synthetic-A')
    const [person] = await rows('request_person')
    for (const [column, value] of [
      ['drivers_license_number', validRequest.person.driversLicenseNumber],
      ['phn', validRequest.person.phn],
      ['security_keyword', validRequest.person.securityKeyword],
    ]) {
      const encrypted = person![`${column}_encrypted`]
      expect(Buffer.from(encrypted).toString()).not.toContain(value)
      expect(encryption.decrypt(encrypted, `request:${response.body.requestId}:${column}`)).toBe(
        value,
      )
    }
  })
  it('returns the same ID on identical replay without duplicate rows', async () => {
    const first = await submit().expect(202)
    const { lastName, ...person } = validRequest.person
    const second = await submit({ ...validRequest, person: { lastName, ...person } }).expect(202)
    expect(second.body).toEqual(first.body)
    expect(await rows('address_change_request')).toHaveLength(1)
    expect(await rows('processing_operation')).toHaveLength(2)
  })
  it('rejects reuse of a key for changed data', async () => {
    await submit().expect(202)
    await submit({ ...validRequest, effectiveDate: '2027-02-01' }).expect(409)
    expect(await rows('address_change_request')).toHaveLength(1)
  })

  it('handles overlapping HTTP replays without creating duplicate rows', async () => {
    const responses = await Promise.all([submit().expect(202), submit().expect(202)])
    expect(responses[0]!.body).toEqual(responses[1]!.body)
    expect(await rows('address_change_request')).toHaveLength(1)
    expect(await rows('processing_operation')).toHaveLength(2)
  })

  it('accepts only one of overlapping submissions with different keys', async () => {
    const responses = await Promise.all([
      submit(),
      submit({ ...validRequest, idempotencyKey: 'different-key' }),
    ])
    expect(responses.map((response) => response.status).sort()).toEqual([202, 409])
    expect(await rows('address_change_request')).toHaveLength(1)
  })
  it('blocks another active request but permits another resident using the same key', async () => {
    await submit().expect(202)
    await submit({ ...validRequest, idempotencyKey: 'different-key' }).expect(409)
    await submit(validRequest, 'synthetic-B').expect(202)
    expect(await rows('address_change_request')).toHaveLength(2)
  })
  it.each(['COMPLETED', 'CLOSED'])(
    'allows a new request after %s while preserving old-key replay',
    async (status) => {
      const first = await submit().expect(202)
      await pg.query('UPDATE address_change.address_change_request SET status = $1', [status])
      const second = await submit({ ...validRequest, idempotencyKey: 'new-key' }).expect(202)
      expect(second.body.requestId).not.toBe(first.body.requestId)
      expect((await submit().expect(202)).body).toEqual(first.body)
    },
  )
  it('keeps FAILED requests active for controlled retry/closure', async () => {
    await submit().expect(202)
    await pg.exec("UPDATE address_change.address_change_request SET status = 'FAILED'")
    await submit({ ...validRequest, idempotencyKey: 'new-key' }).expect(409)
  })
  it('uses server delivery configuration and maps notifyMsp to HEALTH only', async () => {
    await pg.exec(
      "UPDATE address_change.partner_system SET delivery_mode = 'REALTIME' WHERE partner_code = 'HEALTH'",
    )
    await submit({
      ...validRequest,
      notificationIntent: { notifyIcbc: false, notifyMsp: true },
    }).expect(202)
    const result = await pg.query(
      `SELECT p.partner_code, o.delivery_mode FROM address_change.processing_operation o JOIN address_change.partner_system p USING (partner_id)`,
    )
    expect(result.rows).toEqual([{ partner_code: 'HEALTH', delivery_mode: 'REALTIME' }])
  })
  it('preserves Unicode, apostrophes and separate mailing address verbatim', async () => {
    const name = 'Sḵwx̱wú7mesh O’Test ᐊᓂᔑᓈᐯ'
    const mailing = {
      ...validRequest.newAddress,
      addressLineOne: "42 Test's Way",
      locality: 'W̱SÁNEĆ',
    }
    await submit({
      ...validRequest,
      person: { ...validRequest.person, firstName: name },
      isBillingAddressSame: false,
      mailingAddress: mailing,
    }).expect(202)
    expect((await rows('request_person'))[0]?.first_name).toBe(name)
    expect((await rows('submitted_address'))[0]).toMatchObject({
      is_mailing_address_same: false,
      mailing_address_line_one: mailing.addressLineOne,
      mailing_city: mailing.locality,
    })
  })
  it('rolls back every row if the second partner operation fails', async () => {
    failOperationNumber = 2
    const response = await submit().expect(503)
    expect(JSON.stringify(response.body)).not.toContain('private data')
    for (const table of [
      'address_change_request',
      'request_person',
      'submitted_address',
      'processing_operation',
    ])
      expect(await rows(table)).toHaveLength(0)
    failOperationNumber = undefined
    await submit().expect(202)
  })
  it('retries aborted database transactions, with a bounded retry count', async () => {
    transientFailures = 2
    await submit().expect(202)
    expect(await rows('address_change_request')).toHaveLength(1)
    transientFailures = 10
    await submit(validRequest, 'synthetic-B').expect(503)
    expect(transientFailures).toBe(7)
  })
  it.each([
    "UPDATE address_change.partner_system SET active = false WHERE partner_code = 'ICBC'",
    "UPDATE address_change.status_type SET active = false WHERE status_category = 'OPERATION' AND status_code = 'PENDING'",
  ])('does not partially accept unavailable partner/status configuration', async (sql) => {
    await pg.exec(sql)
    await submit().expect(503)
    expect(await rows('address_change_request')).toHaveLength(0)
  })
  it('requires a bearer token and rejects invalid tokens', async () => {
    await request(app.getHttpServer()).post('/api/v1/address-change').send(validRequest).expect(401)
    await submit(validRequest, 'invalid').expect(401)
    expect(await rows('address_change_request')).toHaveLength(0)
  })
  it.each([
    { ...validRequest, ownerSub: 'untrusted-user' },
    { ...validRequest, person: { ...validRequest.person, dateOfBirth: 'private-invalid-value' } },
    { ...validRequest, isBillingAddressSame: false },
    { ...validRequest, notificationIntent: { notifyIcbc: false, notifyMsp: false } },
    { ...validRequest, requestedDeliveries: ['ICBC'] },
  ])('rejects invalid/client-controlled fields without reflecting private values', async (body) => {
    const response = await submit(body).expect(400)
    expect(response.body.message).toBe('Invalid request body')
    expect(JSON.stringify(response.body)).not.toMatch(
      /private-invalid-value|synthetic keyword|untrusted-user/,
    )
    expect(await rows('address_change_request')).toHaveLength(0)
  })

  describe('drafts', () => {
    const draft = { step: 2, values: { effectiveDate: '2027-01-01', notifyIcbc: true } }
    const saveDraft = (body: object, token = 'synthetic-A') =>
      request(app.getHttpServer())
        .put('/api/v1/address-change/drafts')
        .set('Authorization', `Bearer ${token}`)
        .send(body)
    const readDraft = (id: string, token = 'synthetic-A') =>
      request(app.getHttpServer())
        .get(`/api/v1/address-change/drafts/${id}`)
        .set('Authorization', `Bearer ${token}`)

    it('creates, updates and reads an encrypted draft without child rows', async () => {
      const created = await saveDraft({ idempotencyKey: 'draft-key', draft }).expect(200)
      const next = { step: 3, values: { ...draft.values, secret: 'synthetic keyword' } }
      const updated = await saveDraft({ idempotencyKey: 'draft-key', draft: next }).expect(200)
      expect(updated.body).toEqual(created.body)
      const [saved] = await rows('address_change_request')
      expect(saved).toMatchObject({ status: 'DRAFT', effective_date: null })
      expect(Buffer.from(saved!.raw_payload_encrypted).toString()).not.toContain('synthetic')
      expect(await rows('request_person')).toHaveLength(0)
      const read = await readDraft(created.body.requestId).expect(200)
      expect(read.body).toEqual({
        requestId: created.body.requestId,
        idempotencyKey: 'draft-key',
        status: 'DRAFT',
        draft: next,
      })
    })
    it('lists a draft with no effective date', async () => {
      await saveDraft({ idempotencyKey: 'draft-key', draft }).expect(200)
      const list = await request(app.getHttpServer())
        .get('/api/v1/address-change')
        .set('Authorization', 'Bearer synthetic-A')
        .expect(200)
      expect(list.body).toEqual([
        expect.objectContaining({ status: 'DRAFT', effectiveDate: null, operations: [] }),
      ])
    })
    it('promotes the draft to SUBMITTED on submit with the same request id', async () => {
      const created = await saveDraft({ idempotencyKey: validRequest.idempotencyKey, draft })
      const response = await submit().expect(202)
      expect(response.body.requestId).toBe(created.body.requestId)
      expect(await rows('address_change_request')).toHaveLength(1)
      expect((await rows('address_change_request'))[0]).toMatchObject({
        status: 'SUBMITTED',
        effective_date: expect.anything(),
      })
      expect(await rows('processing_operation')).toHaveLength(2)
      await readDraft(created.body.requestId).expect(404)
      await saveDraft({ idempotencyKey: validRequest.idempotencyKey, draft }).expect(409)
    })
    it('allows only one active request per resident and isolates owners', async () => {
      const created = await saveDraft({ idempotencyKey: 'draft-key', draft }).expect(200)
      await saveDraft({ idempotencyKey: 'other-key', draft }).expect(409)
      await submit({ ...validRequest, idempotencyKey: 'other-key' }).expect(409)
      await readDraft(created.body.requestId, 'synthetic-B').expect(404)
      await saveDraft({ idempotencyKey: 'draft-key', draft }, 'synthetic-B').expect(200)
    })
    it('rejects malformed drafts and non-UUID ids', async () => {
      await saveDraft({ idempotencyKey: 'draft-key', draft: { step: 'x' } }).expect(400)
      await saveDraft({ idempotencyKey: 'draft-key', draft, extra: true }).expect(400)
      await readDraft('not-a-uuid').expect(400)
    })
    it('maps BCSC to its own operation', async () => {
      await submit({
        ...validRequest,
        notificationIntent: { notifyBcsc: true, notifyIcbc: false, notifyMsp: false },
      }).expect(202)
      const result = await pg.query(
        `SELECT p.partner_code FROM address_change.processing_operation o JOIN address_change.partner_system p USING (partner_id)`,
      )
      expect(result.rows).toEqual([{ partner_code: 'BCSC' }])
    })
  })
})
