import { N8nError } from './errors'

export async function watchAiCancellation(readStatus: () => Promise<string | null>) {
  const controller = new AbortController()
  let disposed = false
  let checking = false
  async function check() {
    if (disposed || checking || controller.signal.aborted) return
    checking = true
    try {
      if ((await readStatus()) === 'cancelled' && !disposed) {
        controller.abort(new N8nError('AI_CANCELLED'))
      }
    } finally {
      checking = false
    }
  }
  await check()
  const timer = setInterval(() => {
    void check().catch(() => undefined)
  }, 1000)
  return {
    signal: controller.signal,
    dispose() {
      disposed = true
      clearInterval(timer)
    },
  }
}
