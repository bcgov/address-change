import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'

const loader = readFileSync(resolve(process.cwd(), 'scripts/load-vault-env.cjs'), 'utf8')

function load(
  files: Record<string, string>,
  required: string[] = [],
  existing: Record<string, string> = {},
) {
  const env = {
    ...existing,
    VAULT_ENV_FILES: JSON.stringify(Object.keys(files)),
    VAULT_REQUIRED_KEYS: JSON.stringify(required),
  }
  runInNewContext(loader, {
    process: { env },
    require: () => ({
      readFileSync: (file: string) => {
        if (!(file in files)) throw new Error('File unavailable')
        return files[file]
      },
    }),
  })
  return env as Record<string, string>
}

describe('Vault environment loader', () => {
  it('loads multiple groups and preserves literal credential characters', () => {
    const secret = 'quotes "\n$()\\'
    const env = load(
      { '/vault/a.json': JSON.stringify({ FIRST: secret }), '/vault/b.json': '{"SECOND":"value"}' },
      ['FIRST', 'SECOND'],
    )
    expect(env.FIRST).toBe(secret)
    expect(env.SECOND).toBe('value')
  })

  it('rejects duplicate keys across files', () => {
    expect(() => load({ a: '{"KEY":"one"}', b: '{"KEY":"two"}' })).toThrow(
      'Duplicate Vault environment variable: KEY',
    )
  })

  it('rejects missing and blank required values', () => {
    expect(() => load({ a: '{}' }, ['KEY'])).toThrow('missing KEY')
    expect(() => load({ a: '{"KEY":"  "}' }, ['KEY'])).toThrow('missing KEY')
  })

  it.each(['null', '[]', '"text"', '{"KEY":42}', '{"bad-key":"value"}'])(
    'rejects invalid environment data %s',
    (contents) => {
      expect(() => load({ a: contents })).toThrow()
    },
  )

  it('sanitizes malformed JSON without leaking content or a cause', () => {
    const credential = 'sensitive-fixture-value'
    try {
      load({ '/vault/fixture.json': `{"KEY":"${credential}" BROKEN}` })
      throw new Error('Expected the loader to reject malformed JSON')
    } catch (error) {
      expect(String(error)).toBe(
        'Error: Invalid JSON in Vault environment file /vault/fixture.json',
      )
      expect(String((error as Error).stack)).not.toContain(credential)
      expect((error as Error & { cause?: unknown }).cause).toBeUndefined()
    }
  })

  it('uses Vault database values when explicitly replacing legacy credentials', () => {
    const env = load(
      { db: '{"POSTGRES_USER":"runtime","POSTGRES_PASSWORD":"vault-password"}' },
      [],
      {
        VAULT_DATABASE_ENABLED: 'true',
        VAULT_OVERRIDE_KEYS: '["POSTGRES_USER","POSTGRES_PASSWORD"]',
        POSTGRES_USER: 'legacy',
        POSTGRES_PASSWORD: 'legacy-password',
      },
    )
    expect(env.POSTGRES_USER).toBe('runtime')
    expect(env.POSTGRES_PASSWORD).toBe('vault-password')
  })

  it('requires both database values from Vault even if legacy credentials exist', () => {
    expect(() =>
      load({ db: '{}' }, [], {
        VAULT_DATABASE_ENABLED: 'true',
        POSTGRES_USER: 'legacy',
        POSTGRES_PASSWORD: 'legacy',
      }),
    ).toThrow('missing POSTGRES_USER')
  })

  it('rejects collisions with existing container configuration', () => {
    expect(() => load({ a: '{"LOG_LEVEL":"debug"}' }, [], { LOG_LEVEL: 'info' })).toThrow(
      'Vault environment variable is already configured: LOG_LEVEL',
    )
  })
})
