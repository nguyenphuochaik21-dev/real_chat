import 'server-only'
import { z } from 'zod'
import { aiService, validateChatUrl } from './server'
import { executionApiConfig } from './execution-control'
import { requestPinnedWebhook, resolveWebhookAddress } from './transport'

export type N8nStopResult =
  'not_configured' | 'awaiting_execution' | 'stopped' | 'already_finished' | 'failed'

const executionResult = z.object({ status: z.string() })

async function stopExecution(executionId: string): Promise<'stopped' | 'already_finished'> {
  const config = executionApiConfig()
  if (!config) throw new Error('N8N_CONTROL_CONFIGURATION')
  const url = validateChatUrl(`${config.url}/executions/${executionId}/stop`)
  const signal = AbortSignal.timeout(5000)
  const address = await resolveWebhookAddress(url, signal)
  const headers = { 'X-N8N-API-KEY': config.key, 'Content-Type': 'application/json' }
  let response = await requestPinnedWebhook(url, address, headers, '', signal)
  if ([400, 404, 409].includes(response.status)) {
    response = await requestPinnedWebhook(
      url.replace(/\/stop$/, ''),
      address,
      headers,
      '',
      signal,
      'GET'
    )
  }
  if (!response.ok) throw new Error('N8N_STOP_FAILED')
  const result = executionResult.parse(await response.json())
  if (result.status === 'canceled') return 'stopped'
  if (['success', 'error', 'crashed'].includes(result.status)) return 'already_finished'
  throw new Error('N8N_STOP_NOT_CONFIRMED')
}

export async function stopRecordedExecution(
  id: string,
  channel: 'assistant' | 'agent',
  userId: string,
  conversationId: string
): Promise<N8nStopResult> {
  const service = aiService()
  const table = channel === 'agent' ? 'ai_turns' : 'chat_assistant_requests'
  let configured = false
  try {
    const config = executionApiConfig()
    configured = Boolean(config)
    if (!configured) return 'not_configured'
    const { data, error } = await service
      .from(table)
      .select('status,n8n_execution_id,n8n_stop_status,n8n_api_url')
      .eq('id', id)
      .eq('user_id', userId)
      .eq('conversation_id', conversationId)
      .single()
    if (error || !data) throw new Error('N8N_STOP_FAILED')
    if (data.status !== 'cancelled') return 'already_finished'
    if (!data.n8n_execution_id) return 'awaiting_execution'
    if (data.n8n_api_url !== config?.url) throw new Error('N8N_INSTANCE_CHANGED')
    if (data.n8n_stop_status === 'stopped' || data.n8n_stop_status === 'already_finished')
      return data.n8n_stop_status
    const status = await stopExecution(data.n8n_execution_id)
    const { error: saveError } = await service
      .from(table)
      .update({ n8n_stop_status: status })
      .eq('id', id)
      .eq('user_id', userId)
    if (saveError) throw new Error('N8N_STOP_FAILED')
    return status
  } catch {
    if (configured) {
      await service
        .from(table)
        .update({ n8n_stop_status: 'failed' })
        .eq('id', id)
        .eq('user_id', userId)
        .eq('status', 'cancelled')
        .is('n8n_stop_status', null)
    }
    return 'failed'
  }
}
