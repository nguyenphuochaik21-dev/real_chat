export type AiAgent = {
  id: string
  name: string
  description: string
  welcome_message: string
  avatar_url: string
  enabled: boolean
  available_to_users: boolean
  is_default: boolean
  legacy_connection_pending: boolean
  archived_at: string | null
  created_at: string
}

export type AiConversation = {
  id: string
  agent_id: string | null
  agent_name: string | null
  historical_agent_id: string | null
  user_id: string
  title: string
  created_at: string
}

export type AiTurn = {
  id: string
  conversation_id: string
  user_id: string
  content: string
  reply: string | null
  status: 'processing' | 'completed' | 'failed' | 'uncertain' | 'cancelled'
  error_message: string | null
  error_code: string | null
  reply_attachments: AiOutputAttachment[]
  created_at: string
}

export type N8nExecutionState = {
  n8n_execution_id: string | null
  n8n_api_url: string | null
  n8n_stop_status: 'stopped' | 'already_finished' | 'failed' | null
}

type Table<Row> = { Row: Row; Insert: Partial<Row>; Update: Partial<Row>; Relationships: [] }

export type AiTables = {
  ai_agents: Table<AiAgent>
  ai_connections: Table<{
    agent_id: string
    chat_url: string
    credentials: string | null
    auth_type: 'none' | 'basic' | 'header_secret'
    auth_header_name: string
    protocol: 'chat' | 'legacy'
    timeout_ms: number
    last_tested_at: string | null
    last_status: string
    last_latency_ms: number | null
    last_error_code: string | null
  }>
  ai_conversations: Table<AiConversation>
  ai_turns: Table<AiTurn & N8nExecutionState>
}

export type AiFunctions = {
  get_completed_ai_history: {
    Args: { p_user_id: string; p_conversation_id: string; p_channel: 'assistant' | 'agent' }
    Returns: { content: string; reply: string }[]
  }
  register_n8n_execution: {
    Args: {
      p_user_id: string
      p_conversation_id: string
      p_id: string
      p_agent_id: string
      p_channel: 'assistant' | 'agent'
      p_execution_id: string
      p_api_url: string
    }
    Returns: AiTurn['status']
  }
  cancel_ai_generation: {
    Args: {
      p_user_id: string
      p_conversation_id: string
      p_id: string
      p_content: string
      p_channel: 'assistant' | 'agent'
    }
    Returns: { status: AiTurn['status']; turn?: AiTurn }
  }
  create_ai_conversation: {
    Args: { p_user_id: string; p_agent_id: string }
    Returns: string
  }
  delete_ai_conversation: {
    Args: { p_user_id: string; p_conversation_id: string }
    Returns: boolean
  }
  begin_ai_turn: {
    Args: { p_user_id: string; p_conversation_id: string; p_id: string; p_content: string }
    Returns: { turn: AiTurn; claimed: boolean }
  }
  save_ai_agent: {
    Args: {
      p_id: string
      p_name: string
      p_description: string
      p_welcome: string
      p_avatar: string
      p_enabled: boolean
      p_url: string
      p_credentials: string | null
      p_replace_credentials: boolean
    }
    Returns: undefined
  }
  save_ai_agent_v2: {
    Args: {
      p_id: string
      p_name: string
      p_description: string
      p_welcome: string
      p_avatar: string
      p_enabled: boolean
      p_available: boolean
      p_default: boolean
      p_archived: boolean
      p_url: string
      p_auth_type: string
      p_auth_header: string
      p_protocol: string
      p_timeout_ms: number
      p_credentials: string | null
      p_replace_credentials: boolean
    }
    Returns: undefined
  }
}
import type { AiOutputAttachment } from '@/lib/ai/protocol'
