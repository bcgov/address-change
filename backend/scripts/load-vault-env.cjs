const { readFileSync } = require('node:fs')

// Parser diagnostics can include input snippets, so discard the original error.
function parseJson(value, description) {
  try {
    return JSON.parse(value)
  } catch {
    throw new Error(`Invalid JSON in ${description}`)
  }
}

const files = parseJson(process.env.VAULT_ENV_FILES, 'VAULT_ENV_FILES')
const requiredKeys = parseJson(process.env.VAULT_REQUIRED_KEYS || '[]', 'VAULT_REQUIRED_KEYS')
if (!Array.isArray(files) || files.length === 0 || files.some((file) => typeof file !== 'string')) {
  throw new Error('VAULT_ENV_FILES must be a nonempty JSON array of file paths')
}
if (!Array.isArray(requiredKeys) || requiredKeys.some((key) => typeof key !== 'string')) {
  throw new Error('VAULT_REQUIRED_KEYS must be a JSON array of environment variable names')
}

const overrideKeys = parseJson(process.env.VAULT_OVERRIDE_KEYS || '[]', 'VAULT_OVERRIDE_KEYS')
if (!Array.isArray(overrideKeys) || overrideKeys.some((key) => typeof key !== 'string')) {
  throw new Error('VAULT_OVERRIDE_KEYS must be a JSON array of environment variable names')
}
// TEST/PROD require database credentials from Vault. DEV/PR databases use their
// generated OpenShift credentials, so their injected database JSON is empty.
if (process.env.VAULT_DATABASE_ENABLED === 'true') {
  requiredKeys.push('POSTGRES_USER', 'POSTGRES_PASSWORD')
}
const values = new Map()
for (const file of files) {
  let contents
  try {
    contents = readFileSync(file, 'utf8')
  } catch {
    throw new Error(`Cannot read Vault environment file ${file}`)
  }
  const group = parseJson(contents, `Vault environment file ${file}`)
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
    if (Object.hasOwn(process.env, key) && !overrideKeys.includes(key)) {
      throw new Error(`Vault environment variable is already configured: ${key}`)
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
