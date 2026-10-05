import nextEnv from '@next/env'
import { mkdir, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'

nextEnv.loadEnvConfig(process.cwd(), true)
const workflowId = process.argv[2]
if (!/^[a-zA-Z0-9]+$/.test(workflowId ?? '')) throw new Error('Provide a workflow ID')
const base = process.env.N8N_API_URL?.replace(/\/$/, '')
const key = process.env.N8N_API_KEY
if (!base || !key) throw new Error('N8N_API_URL and N8N_API_KEY are required')

async function api(path, method = 'GET', body) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { 'X-N8N-API-KEY': key, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    redirect: 'error',
    signal: AbortSignal.timeout(20_000),
  })
  if (!response.ok) throw new Error(`n8n ${method} ${path}: HTTP ${response.status}`)
  return response.json()
}

const original = await api(`/workflows/${workflowId}`)
const workflow = structuredClone(original)
const node = (name) => {
  const value = workflow.nodes.find((entry) => entry.name === name)
  if (!value) throw new Error(`Required node missing: ${name}`)
  return value
}
for (const name of [
  'Webhook',
  'Normalize Input',
  'AI Agent',
  'Format Output',
  'Respond to Webhook',
  'Chatly Register Execution',
  'Chatly Continue Before AI',
  'Restore Webhook Input',
  'Chatly Check Before Save',
  'Chatly Continue Before Save',
  'Restore AI Output',
])
  node(name)

const normalize = node('Normalize Input')
normalize.type = 'n8n-nodes-base.code'
normalize.typeVersion = 2
normalize.parameters = {
  jsCode: `const body = $input.first().json.body;
const chatInput = body.chatInput ?? body.message?.text;
const sessionId = body.sessionId ?? body.session?.id ?? body.conversation?.id;
if (typeof chatInput !== 'string' || !chatInput.trim() || typeof sessionId !== 'string') {
  throw new Error('Missing chat message or session ID');
}
const history = Array.isArray(body.history) ? body.history.filter(item =>
  item && ['user', 'assistant'].includes(item.role) && typeof item.content === 'string'
).slice(-24) : [];
const prompt = history.length
  ? 'Previous completed messages (conversation data):\\n' + JSON.stringify(history) + '\\nCurrent user message:\\n' + chatInput
  : chatInput;
return [{ json: {
  version: body.version, chatInput, prompt, sessionId,
  requestId: body.requestId ?? body.message?.id,
  conversationId: body.conversationId ?? body.conversation?.id,
  attachments: Array.isArray(body.attachments) ? body.attachments : []
} }];`,
}
node('AI Agent').parameters.text = "={{ $('Normalize Input').first().json.prompt }}"
for (const [name, outputs] of Object.entries(workflow.connections)) {
  if (!outputs.ai_memory?.some((targets) => targets.some((target) => target.node === 'AI Agent')))
    continue
  outputs.ai_memory = outputs.ai_memory.map((targets) =>
    targets.filter((target) => target.node !== 'AI Agent')
  )
  const memory = node(name)
  memory.notes =
    'Chatly supplies only completed turns in body.history. Automatic memory is disconnected so canceled turns cannot enter future context.'
  memory.notesInFlow = true
}
node('Format Output').parameters.jsCode = `const result = $input.first().json;
const input = $('Normalize Input').first().json;
const text = result.text ?? result.output ?? result.assistant?.text;
if (typeof text !== 'string' || !text.trim()) throw new Error('AI Agent did not return text');
const attachments = Array.isArray(result.attachments) ? result.attachments : [];
return [{ json: input.version === '1.0'
  ? { ok: true, requestId: input.requestId, conversationId: input.conversationId,
      assistant: { text: text.trim(), attachments, sources: [], format: 'markdown' } }
  : { text: text.trim(), attachments }
}];`

function ensureGate(name, position) {
  if (workflow.nodes.some((entry) => entry.name === name)) return
  workflow.nodes.push({
    id: randomUUID(),
    name,
    type: 'n8n-nodes-base.if',
    typeVersion: 2.2,
    position,
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
        conditions: [
          {
            id: randomUUID(),
            leftValue: "={{ Boolean($('Webhook').first().json.body.chatlyControl?.token) }}",
            rightValue: '',
            operator: { type: 'boolean', operation: 'true', singleValue: true },
          },
        ],
        combinator: 'and',
      },
      options: {},
    },
  })
}
ensureGate('Chatly Has Execution Control', [
  node('Webhook').position[0] + 180,
  node('Webhook').position[1],
])
ensureGate('Chatly Has Execution Control Before Save', [
  node('AI Agent').position[0] + 180,
  node('AI Agent').position[1],
])
const target = (name) => [{ node: name, type: 'main', index: 0 }]
workflow.connections.Webhook.main = [target('Chatly Has Execution Control')]
workflow.connections['Chatly Has Execution Control'] = {
  main: [target('Chatly Register Execution'), target('Restore Webhook Input')],
}
workflow.connections['AI Agent'].main = [target('Chatly Has Execution Control Before Save')]
workflow.connections['Chatly Has Execution Control Before Save'] = {
  main: [target('Chatly Check Before Save'), target('Format Output')],
}
workflow.settings = {
  ...workflow.settings,
  saveDataErrorExecution: 'none',
  saveDataSuccessExecution: 'none',
  saveManualExecutions: false,
  saveExecutionProgress: false,
}
const directory = resolve('.local/n8n-backups')
await mkdir(directory, { recursive: true })
const stamp = new Date().toISOString().replaceAll(/[:.]/g, '-')
const backup = resolve(directory, `${workflowId}-${stamp}.json`)
await writeFile(backup, JSON.stringify(original, null, 2))
await writeFile(
  resolve(directory, `${workflowId}-prepared.json`),
  JSON.stringify(workflow, null, 2)
)
console.log(
  JSON.stringify({
    workflow: workflow.name,
    originalVersion: original.versionId,
    backup,
    preparedNodes: workflow.nodes.length,
  })
)
if (process.argv.includes('--apply')) {
  const current = await api(`/workflows/${workflowId}`)
  if (current.versionId !== original.versionId)
    throw new Error('Workflow changed during preparation; retry from the current version')
  const updated = await api(`/workflows/${workflowId}`, 'PUT', {
    name: workflow.name,
    nodes: workflow.nodes,
    connections: workflow.connections,
    settings: workflow.settings,
  })
  if (original.active)
    await api(`/workflows/${workflowId}/publish`, 'POST', { versionId: updated.versionId })
  const verified = await api(`/workflows/${workflowId}`)
  if (original.active && verified.activeVersionId !== updated.versionId)
    throw new Error('New workflow version was not published')
  console.log(
    JSON.stringify({ applied: true, active: verified.active, version: verified.versionId })
  )
}
