import { lookup } from 'node:dns/promises'
import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { isIP } from 'node:net'
import { N8nError } from './errors'

function isPublicIPv4(value: string) {
  if (isIP(value) !== 4) return false
  const [a, b, c] = value.split('.').map(Number)
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 &&
      (b === 168 || (b === 0 && c === 0) || (b === 0 && c === 2) || (b === 88 && c === 99))) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113)
  )
}

export async function resolveWebhookAddress(value: string, signal: AbortSignal) {
  const url = new URL(value)
  const local =
    process.env.NODE_ENV === 'development' &&
    url.protocol === 'http:' &&
    ['localhost', '127.0.0.1'].includes(url.hostname)
  if (!local && (url.protocol !== 'https:' || isIP(url.hostname))) {
    throw new N8nError('N8N_CONFIGURATION')
  }
  let addresses: Array<{ address: string; family: number }>
  try {
    addresses = await Promise.race([
      lookup(url.hostname, { family: 4, all: true }),
      new Promise<never>((_, reject) =>
        signal.addEventListener('abort', () => reject(new N8nError('N8N_TIMEOUT')), {
          once: true,
        })
      ),
    ])
  } catch (error) {
    if (error instanceof N8nError) throw error
    throw new N8nError('N8N_UNAVAILABLE')
  }
  if (
    !addresses.length ||
    addresses.some(({ address }) => (local ? !address.startsWith('127.') : !isPublicIPv4(address)))
  ) {
    throw new N8nError('N8N_CONFIGURATION')
  }
  return addresses[0].address
}

export async function requestPinnedWebhook(
  value: string,
  address: string,
  headers: Record<string, string>,
  body: string,
  signal: AbortSignal,
  method: 'POST' | 'GET' = 'POST'
) {
  const url = new URL(value)
  const request = url.protocol === 'https:' ? httpsRequest : httpRequest
  return new Promise<Response>((resolve, reject) => {
    const req = request(
      url,
      {
        method,
        family: 4,
        signal,
        headers: { ...headers, 'Content-Length': Buffer.byteLength(body) },
        lookup: (_hostname, _options, callback) => callback(null, address, 4),
      },
      (res) => {
        const chunks: Buffer[] = []
        let size = 0
        res.on('data', (chunk: Buffer) => {
          size += chunk.length
          if (size > 256_000) {
            res.destroy()
            reject(new N8nError('N8N_INVALID_RESPONSE'))
          } else {
            chunks.push(chunk)
          }
        })
        res.on('error', () =>
          reject(new N8nError(signal.aborted ? 'N8N_TIMEOUT' : 'N8N_UNAVAILABLE'))
        )
        res.on('end', () => {
          const status = res.statusCode ?? 502
          resolve(
            new Response([204, 205, 304].includes(status) ? null : Buffer.concat(chunks), {
              status,
            })
          )
        })
      }
    )
    req.on('error', () => reject(new N8nError(signal.aborted ? 'N8N_TIMEOUT' : 'N8N_UNAVAILABLE')))
    req.end(method === 'GET' ? undefined : body)
  })
}
