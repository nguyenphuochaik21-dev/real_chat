export type AiAgent = {
  id: string
  name: string
  description: string
  welcome_message: string
  avatar_url: string
  enabled: boolean
  created_at: string
}

export type AiConversation = {
  id: string
  agent_id: string
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
  status: 'processing' | 'completed' | 'failed' | 'uncertain'
  error_message: string | null
  created_at: string
}

type Table<Row> = { Row: Row; Insert: Partial<Row>; Update: Partial<Row>; Relationships: [] }

export type AiTables = {
  ai_agents: Table<AiAgent>
  ai_connections: Table<{
    agent_id: string
    chat_url: string
    credentials: string | null
  }>
  ai_conversations: Table<AiConversation>
  ai_turns: Table<AiTurn>
}

export type AiFunctions = {
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
}
