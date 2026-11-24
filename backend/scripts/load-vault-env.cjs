const { readFileSync } = require('node:fs')

const files = JSON.parse(process.env.VAULT_ENV_FILES)
const requiredKeys = JSON.parse(process.env.VAULT_REQUIRED_KEYS || '[]')
if (!Array.isArray(files) || files.length === 0 || files.some((file) => typeof file !== 'string')) {
  throw new Error('VAULT_ENV_FILES must be a nonempty JSON array of file paths')
}
if (!Array.isArray(requiredKeys) || requiredKeys.some((key) => typeof key !== 'string')) {
  throw new Error('VAULT_REQUIRED_KEYS must be a JSON array of environment variable names')
}

const values = new Map()
for (const file of files) {
  const group = JSON.parse(readFileSync(file, 'utf8'))
  if (group === null || Array.isArray(group) || typeof group !== 'object') {
    throw new Error('Vault environment file must contain a JSON object')
  }
  for (const [key, value] of Object.entries(group)) {
    if (!/^[A-Z_][A-Z0-9_]*$/.test(key) || typeof value !== 'string') {
      throw new Error('Vault environment entries must have valid names and string values')
    }
    if (values.has(key)) {
      throw new Error(`Duplicate Vault environment variable: ${key}`)
    }
    values.set(key, value)
  }
}
for (const key of requiredKeys) {
  if (!values.get(key)?.trim()) {
    throw new Error(`Vault configuration is missing ${key}`)
  }
}
for (const [key, value] of values) {
  process.env[key] = value
}
