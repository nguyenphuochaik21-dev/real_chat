import type { AssistantConfig } from '@/lib/assistant/schema'
import type { Json } from './database'
import type { N8nExecutionState } from './ai'

type Table<Row> = {
  Row: { [Key in keyof Row]: Row[Key] }
  Insert: Partial<Row>
  Update: Partial<Row>
  Relationships: []
}
export type AssistantTables = {
  chat_assistant_config: Table<AssistantConfig>
  chat_assistant_requests: Table<
    N8nExecutionState & {
      id: string
      conversation_id: string
      user_id: string
      content: string
      status: 'processing' | 'completed' | 'failed' | 'cancelled'
      error_code: string | null
      created_at: string
    }
  >
}
export type AssistantFunctions = {
  fail_chat_assistant_request: {
    Args: { p_id: string; p_error: string }
    Returns: 'processing' | 'completed' | 'failed' | 'cancelled'
  }
  open_chat_assistant: { Args: { p_user_id: string }; Returns: string }
  open_default_ai_assistant: { Args: { p_user_id: string }; Returns: string }
  begin_default_ai_assistant_request: {
    Args: { p_user_id: string; p_conversation_id: string; p_id: string; p_content: string }
    Returns: boolean
  }
  begin_chat_assistant_request: {
    Args: { p_user_id: string; p_conversation_id: string; p_id: string; p_content: string }
    Returns: boolean
  }
  finish_chat_assistant_request: {
    Args: { p_id: string; p_text: string; p_metadata: Json }
    Returns: undefined
  }
}
