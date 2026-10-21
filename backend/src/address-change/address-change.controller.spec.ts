import { Test } from '@nestjs/testing'
import { VersioningType } from '@nestjs/common'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { AddressChangeController } from './address-change.controller'

const validRequest = {
  idempotencyKey: 'request-key-123',
  effectiveDate: '2027-01-01',
  isBillingAddressSame: true,
  person: {
    firstName: 'Jane',
    firstMiddleInitial: 'A',
    secondMiddleInitial: null,
    lastName: 'Doe',
    dateOfBirth: '1990-02-03',
    emailAddress: 'jane@example.test',
    daytimePhone: '+1 250 555 0100',
    driversLicenseNumber: '00123456',
    heightCm: 170,
    weightKg: 65,
    securityKeyword: 'private keyword',
    phn: '0012345678',
  },
  oldAddress: {
    country: 'CA',
    addressLineOne: '1 Old Street',
    addressLineTwo: null,
    locality: 'Victoria',
    region: 'BC',
    postalCode: 'V8V 1X4',
  },
  newAddress: {
    country: 'CA',
    addressLineOne: '2 New Street',
    addressLineTwo: 'Unit 5',
    locality: 'Vancouver',
    region: 'BC',
    postalCode: 'V5K 0A1',
  },
  notificationIntent: {
    notifyIcbc: false,
    notifyMsp: true,
  },
}

describe('AddressChangeController', () => {
  let app: INestApplication

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [AddressChangeController],
    }).compile()

    app = module.createNestApplication()
    app.setGlobalPrefix('api')
    app.enableVersioning({
      type: VersioningType.URI,
      prefix: 'v',
    })
    await app.init()
  })

  afterAll(async () => {
    await app.close()
  })

  it('accepts the frontend payload and acknowledges with a request ID', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/address-change')
      .send(validRequest)
      .expect(202)

    expect(response.body).toEqual({
      requestId: expect.any(String),
    })
    expect(response.body.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    )
  })

  it('generates a unique request ID for each accepted request', async () => {
    const first = await request(app.getHttpServer())
      .post('/api/v1/address-change')
      .send(validRequest)
      .expect(202)
    const second = await request(app.getHttpServer())
      .post('/api/v1/address-change')
      .send({ ...validRequest, idempotencyKey: 'request-key-456' })
      .expect(202)

    expect(first.body.requestId).not.toBe(second.body.requestId)
  })

  it('rejects invalid payloads without returning submitted values', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/address-change')
      .send({
        ...validRequest,
        person: { ...validRequest.person, dateOfBirth: 'private-invalid-value' },
      })
      .expect(400)

    expect(response.body.message).toBe('Invalid request body')
    expect(JSON.stringify(response.body)).not.toContain('private-invalid-value')
    expect(JSON.stringify(response.body)).not.toContain('private keyword')
  })

  it('rejects client-supplied ownership and unknown fields', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/address-change')
      .send({ ...validRequest, ownerSub: 'untrusted-user' })
      .expect(400)

    expect(response.body.message).toBe('Invalid request body')
    expect(JSON.stringify(response.body)).not.toContain('untrusted-user')
  })
})
