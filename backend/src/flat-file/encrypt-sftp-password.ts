import { encryptSecret, loadCredentialKey } from './sftp-credential.crypto'

// Reads the password from stdin so it never appears in shell history or process listings.
async function readStdin(): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
    .toString('utf8')
    .replace(/\r?\n$/, '')
}

async function main(): Promise<void> {
  const password = await readStdin()
  if (!password) {
    throw new Error('Provide the SFTP password on stdin')
  }
  const envelope = encryptSecret(password, loadCredentialKey())
  process.stdout.write(`\\x${envelope.toString('hex')}\n`)
}

main().catch((err: Error) => {
  process.stderr.write(`${err.message}\n`)
  process.exitCode = 1
})
