import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { z } from 'zod'

const credentials = z.object({ url: z.url(), secret: z.string().min(16) })
function key() {
  const value = Buffer.from(process.env.AI_CONFIG_ENCRYPTION_KEY ?? '', 'base64')
  if (value.length !== 32) throw new Error('INTERNAL_ERROR')
  return value
}

export function encryptConnection(value: z.infer<typeof credentials>) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key(), iv)
  cipher.setAAD(Buffer.from('chatly-assistant-v1'))
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64')
}

export function decryptConnection(value: string) {
  const bytes = Buffer.from(value, 'base64')
  const decipher = createDecipheriv('aes-256-gcm', key(), bytes.subarray(0, 12))
  decipher.setAAD(Buffer.from('chatly-assistant-v1'))
  decipher.setAuthTag(bytes.subarray(12, 28))
  return credentials.parse(
    JSON.parse(
      Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8')
    )
  )
}
