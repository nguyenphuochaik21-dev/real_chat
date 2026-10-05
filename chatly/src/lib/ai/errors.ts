export type N8nErrorCode =
  | 'AI_CANCELLED'
  | 'N8N_TIMEOUT'
  | 'N8N_UNAVAILABLE'
  | 'N8N_INVALID_RESPONSE'
  | 'N8N_AUTH_FAILED'
  | 'N8N_CONFIGURATION'
  | 'N8N_WORKFLOW_ERROR'

export class N8nError extends Error {
  constructor(public code: N8nErrorCode) {
    super(code)
  }
}
