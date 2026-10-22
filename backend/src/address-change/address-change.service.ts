import { randomUUID } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import {
  ConflictException,
  HttpException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common'
import { Prisma } from '../../generated/prisma/client.js'
import { PrismaService } from '../prisma.service'
import type {
  AddressChangeAcknowledgement,
  AddressChangeRequest,
  AddressChangeSummary,
} from './address-change.contract'
import { RequestEncryptionService } from './request-encryption.service'

type StoredRequest = { request_id: string; raw_payload_encrypted: Uint8Array }
type Partner = { partner_id: string; partner_code: string; delivery_mode: string }
type RequestSummaryRow = {
  request_id: string
  status: string
  effective_date: string
  created_at: Date
  partner_code: string | null
  delivery_mode: string | null
  operation_status: string | null
}

@Injectable()
export class AddressChangeService {
  constructor(
    private readonly database: PrismaService,
    private readonly encryption: RequestEncryptionService,
  ) {}

  async list(ownerSub: string): Promise<AddressChangeSummary[]> {
    if (!ownerSub?.trim()) throw new UnauthorizedException('A validated subject is required')
    const rows = await this.database.$queryRaw<RequestSummaryRow[]>`
      SELECT r.request_id::text, r.status, r.effective_date::text, r.created_at,
             p.partner_code, o.delivery_mode, o.status AS operation_status
      FROM address_change.address_change_request r
      LEFT JOIN address_change.processing_operation o ON o.request_id = r.request_id
      LEFT JOIN address_change.partner_system p ON p.partner_id = o.partner_id
      WHERE r.owner_sub = ${ownerSub}
      ORDER BY r.created_at DESC, p.partner_code ASC`
    const requests = new Map<string, AddressChangeSummary>()
    for (const row of rows) {
      const existing = requests.get(row.request_id)
      if (existing) {
        if (row.partner_code && row.delivery_mode && row.operation_status) {
          existing.operations.push({
            partnerCode: row.partner_code,
            deliveryMode: row.delivery_mode,
            status: row.operation_status,
          })
        }
        continue
      }
      requests.set(row.request_id, {
        requestId: row.request_id,
        status: row.status,
        effectiveDate: row.effective_date,
        createdAt: new Date(row.created_at).toISOString(),
        operations:
          row.partner_code && row.delivery_mode && row.operation_status
            ? [
                {
                  partnerCode: row.partner_code,
                  deliveryMode: row.delivery_mode,
                  status: row.operation_status,
                },
              ]
            : [],
      })
    }
    return [...requests.values()]
  }

  async submit(
    body: AddressChangeRequest,
    ownerSub: string,
  ): Promise<AddressChangeAcknowledgement> {
    if (!ownerSub?.trim()) throw new UnauthorizedException('A validated subject is required')
    // Retry only aborted DB transactions, never a partner call (none happens during intake).
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.save(body, ownerSub)
      } catch (error) {
        if (error instanceof HttpException) throw error
        const dbError = error as { code?: string; meta?: { code?: string } }
        const retryable =
          ['P2034', 'P2002'].includes(dbError.code ?? '') ||
          ['40001', '40P01', '23505'].includes(dbError.meta?.code ?? '')
        if (retryable && attempt < 2) continue
        // Raw DB errors can include submitted values; never expose/log them.
        throw new ServiceUnavailableException(
          'Request could not be saved; retry with the same idempotency key',
        )
      }
    }
    throw new ServiceUnavailableException('Request could not be saved')
  }

  private save(
    body: AddressChangeRequest,
    ownerSub: string,
  ): Promise<AddressChangeAcknowledgement> {
    return this.database.$transaction(
      async (tx) => {
        // Serialize intake for one resident across API replicas. Transaction-scoped
        // locking also works through transaction-mode PgBouncer; collisions only wait.
        await tx.$queryRaw`SELECT 1::int AS locked FROM pg_advisory_xact_lock(hashtextextended(${ownerSub}, 0))`
        const existing = await tx.$queryRaw<StoredRequest[]>`
          SELECT request_id, raw_payload_encrypted
          FROM address_change.address_change_request
          WHERE owner_sub = ${ownerSub} AND idempotency_key = ${body.idempotencyKey}`
        const previous = existing[0]
        if (previous) {
          const stored = JSON.parse(
            this.encryption.decrypt(
              previous.raw_payload_encrypted,
              `request:${previous.request_id}:payload`,
            ),
          )
          if (!isDeepStrictEqual(stored, JSON.parse(JSON.stringify(body)))) {
            throw new ConflictException('Idempotency key was already used for a different request')
          }
          return { requestId: previous.request_id }
        }
        const active = await tx.$queryRaw<{ request_id: string }[]>`
          SELECT request_id FROM address_change.address_change_request
          WHERE owner_sub = ${ownerSub} AND status NOT IN ('COMPLETED', 'CLOSED') LIMIT 1`
        if (active.length)
          throw new ConflictException('An address-change request is already active')

        const codes = [
          ...(body.notificationIntent.notifyIcbc ? ['ICBC'] : []),
          ...(body.notificationIntent.notifyMsp ? ['HEALTH'] : []),
        ]
        const partners = await tx.$queryRaw<Partner[]>`
          SELECT partner_id, partner_code, delivery_mode FROM address_change.partner_system
          WHERE active = true AND partner_code IN (${Prisma.join(codes)})
          ORDER BY partner_code FOR SHARE`
        if (partners.length !== codes.length) {
          throw new ServiceUnavailableException('A selected partner is unavailable for submission')
        }
        const statuses = await tx.$queryRaw<{ status_code: string }[]>`
          SELECT status_code FROM address_change.status_type WHERE active = true AND
          ((status_category = 'REQUEST' AND status_code = 'SUBMITTED') OR
           (status_category = 'OPERATION' AND status_code = 'PENDING')) FOR SHARE`
        if (statuses.length !== 2) {
          throw new ServiceUnavailableException('Submission statuses are not configured')
        }

        const requestId = randomUUID()
        const payload = this.encryption.encrypt(
          JSON.stringify(body),
          `request:${requestId}:payload`,
        )
        const secret = (value: string | null | undefined, field: string) =>
          value == null ? null : this.encryption.encrypt(value, `request:${requestId}:${field}`)
        const person = body.person
        // Encrypt before any insert; a missing key can never cause a plaintext fallback.
        const licence = secret(person.driversLicenseNumber, 'drivers_license_number')
        const phn = secret(person.phn, 'phn')
        const keyword = secret(person.securityKeyword, 'security_keyword')
        await tx.$executeRaw`
          INSERT INTO address_change.address_change_request
            (request_id, owner_sub, idempotency_key, raw_payload_encrypted, effective_date,
             status, created_by, updated_by)
          VALUES (${requestId}::uuid, ${ownerSub}, ${body.idempotencyKey}, ${payload},
                  ${body.effectiveDate}::date, 'SUBMITTED', ${ownerSub}, ${ownerSub})`
        await tx.$executeRaw`
          INSERT INTO address_change.request_person
            (request_id, first_name, first_middle_initial, second_middle_initial, last_name,
             date_of_birth, email_address, daytime_phone, drivers_license_number_encrypted,
             height_cm, weight_kg, phn_encrypted, security_keyword_encrypted, created_by, updated_by)
          VALUES (${requestId}::uuid, ${person.firstName}, ${person.firstMiddleInitial ?? null},
                  ${person.secondMiddleInitial ?? null}, ${person.lastName}, ${person.dateOfBirth}::date,
                  ${person.emailAddress ?? null}, ${person.daytimePhone ?? null}, ${licence},
                  ${person.heightCm ?? null}, ${person.weightKg ?? null}, ${phn}, ${keyword},
                  ${ownerSub}, ${ownerSub})`
        const old = body.oldAddress
        const next = body.newAddress
        // Existing frontend calls this isBillingAddressSame, but its UI collects
        // mailing-address intent. Preserve wire compatibility and map explicitly.
        const mailing = body.isBillingAddressSame ? undefined : body.mailingAddress
        await tx.$executeRaw`
          INSERT INTO address_change.submitted_address
            (request_id, old_address_line_one, old_address_line_two, old_city, old_province,
             old_postal_code, old_country, new_address_line_one, new_address_line_two, new_city,
             new_province, new_postal_code, new_country, is_mailing_address_same,
             mailing_address_line_one, mailing_address_line_two, mailing_city, mailing_province,
             mailing_postal_code, mailing_country, created_by, updated_by)
          VALUES (${requestId}::uuid, ${old.addressLineOne}, ${old.addressLineTwo ?? null},
                  ${old.locality}, ${old.region}, ${old.postalCode}, ${old.country},
                  ${next.addressLineOne}, ${next.addressLineTwo ?? null}, ${next.locality},
                  ${next.region}, ${next.postalCode}, ${next.country}, ${body.isBillingAddressSame},
                  ${mailing?.addressLineOne ?? null}, ${mailing?.addressLineTwo ?? null},
                  ${mailing?.locality ?? null}, ${mailing?.region ?? null},
                  ${mailing?.postalCode ?? null}, ${mailing?.country ?? null}, ${ownerSub}, ${ownerSub})`
        for (const partner of partners) {
          await tx.$executeRaw`
            INSERT INTO address_change.processing_operation
              (request_id, partner_id, delivery_mode, status, created_by, updated_by)
            VALUES (${requestId}::uuid, ${partner.partner_id}::uuid, ${partner.delivery_mode},
                    'PENDING', ${ownerSub}, ${ownerSub})`
        }
        return { requestId }
      },
      { isolationLevel: 'ReadCommitted', maxWait: 5000, timeout: 15000 },
    )
  }
}
