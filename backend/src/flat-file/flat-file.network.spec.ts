import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'

type Labels = Record<string, string>

function render(path: string, parameters: Record<string, string>) {
  return JSON.parse(
    execFileSync(
      'oc',
      [
        'process',
        '--local',
        '-f',
        resolve(process.cwd(), '..', path),
        '-o',
        'json',
        ...Object.entries(parameters).map(([key, value]) => `-p=${key}=${value}`),
      ],
      { encoding: 'utf8' },
    ),
  ).items
}

const matches = (selector: Labels, labels: Labels) =>
  Object.entries(selector).every(([key, value]) => labels[key] === value)

let hasOc = false
try {
  execFileSync('oc', ['version', '--client'], { stdio: 'ignore' })
  hasOc = true
} catch {}

describe.skipIf(!hasOc)('flat-file worker database ingress', () => {
  it('allows the worker and backend, excludes other previews, and isolates HTTP traffic', () => {
    const objects = render('backend/openshift.deploy.yml', {
      NAME: 'address-change',
      ZONE: '123',
      IMAGE_TAG: 'fixture',
      DB_HOST: 'address-change-123-database',
      DB_RUNTIME_SECRET: 'address-change-123-database',
      DB_MIGRATION_SECRET: 'address-change-123-database',
      OIDC_ISSUER: 'https://example.invalid',
      OIDC_AUDIENCE: 'fixture',
      OIDC_JWKS_URI: 'https://example.invalid/jwks',
      OIDC_SUBMISSION_SCOPE: 'fixture',
      ENCRYPTION_KEY_ID: 'fixture',
    })
    const worker = objects.find((object: { kind: string }) => object.kind === 'CronJob').spec
      .jobTemplate.spec.template.metadata.labels
    const backend = objects.find((object: { kind: string }) => object.kind === 'Deployment').spec
      .template.metadata.labels
    const service = objects.find((object: { kind: string }) => object.kind === 'Service')
    const policy = render('common/openshift.database-init.yml', {
      NAME: 'address-change',
      ZONE: '123',
      DB_PASSWORD: 'offline-fixture',
    }).find((object: { kind: string }) => object.kind === 'NetworkPolicy')
    const selectors = policy.spec.ingress[0].from.map(
      (peer: { podSelector: { matchLabels: Labels } }) => peer.podSelector.matchLabels,
    ) as Labels[]
    expect(worker.worker).toBe('address-change-123-flat-files')
    expect(worker.deployment).toBeUndefined()
    expect(selectors.some((selector) => matches(selector, worker))).toBe(true)
    expect(selectors.some((selector) => matches(selector, backend))).toBe(true)
    expect(
      selectors.some((selector) =>
        matches(selector, {
          app: 'address-change-456',
          worker: 'address-change-456-flat-files',
        }),
      ),
    ).toBe(false)
    expect(selectors.some((selector) => matches(selector, { app: 'address-change-123' }))).toBe(
      false,
    )
    expect(matches(service.spec.selector, worker)).toBe(false)
    expect(matches(service.spec.selector, backend)).toBe(true)
  })
})
