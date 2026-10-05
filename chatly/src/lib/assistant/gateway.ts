import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import {
  request as httpRequest,
  type ClientRequest,
  type IncomingMessage,
  type RequestOptions,
} from 'node:http'
import { request as httpsRequest } from 'node:https'
import { assistantResponse, type AiChatGateway, type AiChatRequest } from './schema'

type RequestFunction = (
  url: URL,
  options: RequestOptions,
  callback: (response: IncomingMessage) => void
) => ClientRequest

type Transport = {
  resolve: (hostname: string) => Promise<{ address: string; family: number }>
  request: RequestFunction
}

const defaultTransport: Transport = {
  resolve: (hostname: string) => lookup(hostname, { family: 4 }),

  request: (url, options, callback) => {
    if (url.protocol === 'http:') {
      return httpRequest(url, options, callback)
    }

    return httpsRequest(url, options, callback)
  },
}

function isLocalDevelopmentWebhook(url: URL) {
  return (
    process.env.N8N_ASSISTANT_ALLOW_LOCALHOST === 'true' &&
    url.protocol === 'http:' &&
    (url.hostname === 'localhost' || url.hostname === '127.0.0.1')
  )
}

export function validateWebhook(value: string) {
  const url = new URL(value)

  const allowed = (process.env.N8N_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean)

  const localDevelopment = isLocalDevelopmentWebhook(url)

  if (
    (!localDevelopment && url.protocol !== 'https:') ||
    url.username ||
    url.password ||
    url.hash ||
    (!localDevelopment && isIP(url.hostname.replace(/^\[|\]$/g, ''))) ||
    !allowed.includes(url.origin)
  ) {
    throw new Error('INVALID_WEBHOOK')
  }

  return url
}

export function isPublicIPv4(address: string) {
  if (isIP(address) !== 4) return false

  const [a, b] = address.split('.').map(Number)

  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && [0, 168].includes(b)) ||
    (a === 198 && [18, 19, 51].includes(b)) ||
    (a === 203 && b === 0)
  )
}

export class N8nChatGateway implements AiChatGateway {
  constructor(
    private url: string,
    private secret: string,
    private timeoutMs: number,
    private transport: Transport = defaultTransport
  ) {}

  async sendMessage(input: AiChatRequest) {
    const url = validateWebhook(this.url)
    const localDevelopment = isLocalDevelopmentWebhook(url)

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)

    try {
      const address = await Promise.race([
        this.transport.resolve(url.hostname),

        new Promise<never>((_, reject) =>
          controller.signal.addEventListener(
            'abort',
            () => reject(new Error('N8N_TIMEOUT')),
            { once: true }
          )
        ),
      ])

      // localhost chỉ được phép trong development.
      if (localDevelopment) {
        if (!address.address.startsWith('127.')) {
          throw new Error('INVALID_WEBHOOK')
        }
      } else {
        // Production vẫn chỉ cho public IPv4.
        if (!isPublicIPv4(address.address)) {
          throw new Error('INVALID_WEBHOOK')
        }
      }

      const body = await new Promise<string>((resolve, reject) => {
        const req = this.transport.request(
          url,
          {
            method: 'POST',
            family: 4,
            signal: controller.signal,

            lookup: (_hostname, _options, callback) =>
              callback(null, address.address, 4),

            headers: {
              'Content-Type': 'application/json',
              'X-N8N-SECRET': this.secret,
            },
          },

          (res) => {
            if (res.statusCode !== 200) {
              res.destroy()
              reject(new Error('N8N_UNAVAILABLE'))
              return
            }

            const chunks: Buffer[] = []
            let size = 0

            res.on('data', (chunk: Buffer) => {
              size += chunk.length

              if (size > 262144) {
                res.destroy()
                reject(new Error('N8N_INVALID_RESPONSE'))
              } else {
                chunks.push(chunk)
              }
            })

            res.on('error', () => reject(new Error('N8N_UNAVAILABLE')))

            res.on('end', () =>
              resolve(Buffer.concat(chunks).toString('utf8'))
            )
          }
        )

        req.on('error', () =>
          reject(
            new Error(
              controller.signal.aborted
                ? 'N8N_TIMEOUT'
                : 'N8N_UNAVAILABLE'
            )
          )
        )

        req.end(JSON.stringify(input))
      })

      try {
        const result = assistantResponse.parse(JSON.parse(body))

        if (
          result.requestId !== input.requestId ||
          result.conversationId !== input.conversation.id
        ) {
          throw new Error('mismatch')
        }

        return result
      } catch {
        throw new Error('N8N_INVALID_RESPONSE')
      }
    } catch (error) {
      if (controller.signal.aborted) {
        throw new Error('N8N_TIMEOUT')
      }

      if (
        error instanceof Error &&
        [
          'INVALID_WEBHOOK',
          'N8N_UNAVAILABLE',
          'N8N_INVALID_RESPONSE',
        ].includes(error.message)
      ) {
        throw error
      }

      throw new Error('N8N_UNAVAILABLE')
    } finally {
      clearTimeout(timer)
    }
  }
}
