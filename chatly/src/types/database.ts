export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: '14.15'
  }
  public: {
    Tables: {
      conversation_participants: {
        Row: {
          conversation_id: string
          is_archived: boolean | null
          is_muted: boolean | null
          is_pinned: boolean | null
          joined_at: string | null
          last_read_at: string | null
          role: Database['public']['Enums']['group_member_role']
          user_id: string
        }
        Insert: {
          conversation_id: string
          is_archived?: boolean | null
          is_muted?: boolean | null
          is_pinned?: boolean | null
          joined_at?: string | null
          last_read_at?: string | null
          role?: Database['public']['Enums']['group_member_role']
          user_id: string
        }
        Update: {
          conversation_id?: string
          is_archived?: boolean | null
          is_muted?: boolean | null
          is_pinned?: boolean | null
          joined_at?: string | null
          last_read_at?: string | null
          role?: Database['public']['Enums']['group_member_role']
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'conversation_participants_conversation_id_fkey'
            columns: ['conversation_id']
            isOneToOne: false
            referencedRelation: 'conversations'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'conversation_participants_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      conversations: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          created_by: string | null
          id: string
          last_message_at: string | null
          title: string | null
          type: Database['public']['Enums']['conversation_type'] | null
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          last_message_at?: string | null
          title?: string | null
          type?: Database['public']['Enums']['conversation_type'] | null
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          last_message_at?: string | null
          title?: string | null
          type?: Database['public']['Enums']['conversation_type'] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'conversations_created_by_fkey'
            columns: ['created_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      messages: {
        Row: {
          content: string
          conversation_id: string | null
          content_type: Database['public']['Enums']['message_content_type'] | null
          created_at: string | null
          deleted_at: string | null
          edited_at: string | null
          id: string
          media_mime_type: string | null
          media_name: string | null
          media_size: number | null
          media_thumbnail_url: string | null
          media_url: string | null
          reply_to: string | null
          sender_id: string | null
          status: Database['public']['Enums']['message_status'] | null
        }
        Insert: {
          content: string
          content_type?: Database['public']['Enums']['message_content_type'] | null
          conversation_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          media_mime_type?: string | null
          media_name?: string | null
          media_size?: number | null
          media_thumbnail_url?: string | null
          media_url?: string | null
          reply_to?: string | null
          sender_id?: string | null
          status?: Database['public']['Enums']['message_status'] | null
        }
        Update: {
          content?: string
          content_type?: Database['public']['Enums']['message_content_type'] | null
          conversation_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          media_mime_type?: string | null
          media_name?: string | null
          media_size?: number | null
          media_thumbnail_url?: string | null
          media_url?: string | null
          reply_to?: string | null
          sender_id?: string | null
          status?: Database['public']['Enums']['message_status'] | null
        }
        Relationships: [
          {
            foreignKeyName: 'messages_conversation_id_fkey'
            columns: ['conversation_id']
            isOneToOne: false
            referencedRelation: 'conversations'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'messages_reply_to_fkey'
            columns: ['reply_to']
            isOneToOne: false
            referencedRelation: 'messages'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'messages_sender_id_fkey'
            columns: ['sender_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string | null
          display_name: string
          id: string
          is_suspended: boolean
          last_seen: string | null
          phone: string | null
          role: string
          status: 'online' | 'offline' | 'away' | 'busy' | null
          updated_at: string | null
          username: string
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string | null
          display_name: string
          id: string
          is_suspended?: boolean
          last_seen?: string | null
          phone?: string | null
          role?: string
          status?: 'online' | 'offline' | 'away' | 'busy' | null
          updated_at?: string | null
          username: string
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string | null
          display_name?: string
          id?: string
          is_suspended?: boolean
          last_seen?: string | null
          phone?: string | null
          role?: string
          status?: 'online' | 'offline' | 'away' | 'busy' | null
          updated_at?: string | null
          username?: string
        }
        Relationships: []
      }
      friendships: {
        Row: {
          addressee_id: string
          created_at: string
          id: string
          requester_id: string
          responded_at: string | null
          status: Database['public']['Enums']['friendship_status']
          updated_at: string
        }
        Insert: {
          addressee_id: string
          created_at?: string
          id?: string
          requester_id: string
          responded_at?: string | null
          status?: Database['public']['Enums']['friendship_status']
          updated_at?: string
        }
        Update: {
          addressee_id?: string
          created_at?: string
          id?: string
          requester_id?: string
          responded_at?: string | null
          status?: Database['public']['Enums']['friendship_status']
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'friendships_addressee_id_fkey'
            columns: ['addressee_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'friendships_requester_id_fkey'
            columns: ['requester_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      admin_audit_logs: {
        Row: {
          action: string
          admin_id: string | null
          created_at: string
          details: Json
          id: string
          target_user_id: string | null
        }
        Insert: {
          action: string
          admin_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          target_user_id?: string | null
        }
        Update: {
          action?: string
          admin_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          target_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'admin_audit_logs_admin_id_fkey'
            columns: ['admin_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'admin_audit_logs_target_user_id_fkey'
            columns: ['target_user_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      message_reactions: {
        Row: {
          id: string
          message_id: string
          user_id: string
          emoji: string
          created_at: string | null
        }
        Insert: {
          id?: string
          message_id: string
          user_id: string
          emoji: string
          created_at?: string | null
        }
        Update: {
          id?: string
          message_id?: string
          user_id?: string
          emoji?: string
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'message_reactions_message_id_fkey'
            columns: ['message_id']
            isOneToOne: false
            referencedRelation: 'messages'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'message_reactions_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      starred_messages: {
        Row: {
          id: string
          message_id: string
          user_id: string
          created_at: string | null
        }
        Insert: {
          id?: string
          message_id: string
          user_id: string
          created_at?: string | null
        }
        Update: {
          id?: string
          message_id?: string
          user_id?: string
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'starred_messages_message_id_fkey'
            columns: ['message_id']
            isOneToOne: false
            referencedRelation: 'messages'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'starred_messages_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      scheduled_messages: {
        Row: {
          id: string
          conversation_id: string | null
          sender_id: string | null
          content: string | null
          content_type: string | null
          media_url: string | null
          media_thumbnail_url: string | null
          media_name: string | null
          media_size: number | null
          media_mime_type: string | null
          reply_to: string | null
          scheduled_at: string | null
          status: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          conversation_id?: string | null
          sender_id?: string | null
          content?: string | null
          content_type?: string | null
          media_url?: string | null
          media_thumbnail_url?: string | null
          media_name?: string | null
          media_size?: number | null
          media_mime_type?: string | null
          reply_to?: string | null
          scheduled_at?: string | null
          status?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          conversation_id?: string | null
          sender_id?: string | null
          content?: string | null
          content_type?: string | null
          media_url?: string | null
          media_thumbnail_url?: string | null
          media_name?: string | null
          media_size?: number | null
          media_mime_type?: string | null
          reply_to?: string | null
          scheduled_at?: string | null
          status?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'scheduled_messages_conversation_id_fkey'
            columns: ['conversation_id']
            isOneToOne: false
            referencedRelation: 'conversations'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'scheduled_messages_sender_id_fkey'
            columns: ['sender_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      conversation_labels: {
        Row: {
          id: string
          user_id: string | null
          name: string | null
          color: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          user_id?: string | null
          name?: string | null
          color?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string | null
          name?: string | null
          color?: string | null
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'conversation_labels_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      conversation_label_map: {
        Row: {
          conversation_id: string | null
          label_id: string | null
          created_at: string | null
        }
        Insert: {
          conversation_id?: string | null
          label_id?: string | null
          created_at?: string | null
        }
        Update: {
          conversation_id?: string | null
          label_id?: string | null
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'conversation_label_map_conversation_id_fkey'
            columns: ['conversation_id']
            isOneToOne: false
            referencedRelation: 'conversations'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'conversation_label_map_label_id_fkey'
            columns: ['label_id']
            isOneToOne: false
            referencedRelation: 'conversation_labels'
            referencedColumns: ['id']
          },
        ]
      }
      user_blocks: {
        Row: {
          id: string
          blocker_id: string | null
          blocked_id: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          blocker_id?: string | null
          blocked_id?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          blocker_id?: string | null
          blocked_id?: string | null
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'user_blocks_blocker_id_fkey'
            columns: ['blocker_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'user_blocks_blocked_id_fkey'
            columns: ['blocked_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      push_subscriptions: {
        Row: {
          id: string
          user_id: string | null
          endpoint: string | null
          p256dh: string | null
          auth: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          user_id?: string | null
          endpoint?: string | null
          p256dh?: string | null
          auth?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string | null
          endpoint?: string | null
          p256dh?: string | null
          auth?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'push_subscriptions_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      call_sessions: {
        Row: {
          id: string
          caller_id: string
          callee_id: string
          conversation_id: string | null
          call_type: Database['public']['Enums']['call_type'] | null
          status: Database['public']['Enums']['call_session_status'] | null
          offer_sdp: string | null
          answer_sdp: string | null
          ice_candidates: Json | null
          started_at: string | null
          answered_at: string | null
          ended_at: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          caller_id: string
          callee_id: string
          conversation_id?: string | null
          call_type?: Database['public']['Enums']['call_type'] | null
          status?: Database['public']['Enums']['call_session_status'] | null
          offer_sdp?: string | null
          answer_sdp?: string | null
          ice_candidates?: Json | null
          started_at?: string | null
          answered_at?: string | null
          ended_at?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          caller_id?: string
          callee_id?: string
          conversation_id?: string | null
          call_type?: Database['public']['Enums']['call_type'] | null
          status?: Database['public']['Enums']['call_session_status'] | null
          offer_sdp?: string | null
          answer_sdp?: string | null
          ice_candidates?: Json | null
          started_at?: string | null
          answered_at?: string | null
          ended_at?: string | null
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'call_sessions_caller_id_fkey'
            columns: ['caller_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'call_sessions_callee_id_fkey'
            columns: ['callee_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'call_sessions_conversation_id_fkey'
            columns: ['conversation_id']
            isOneToOne: false
            referencedRelation: 'conversations'
            referencedColumns: ['id']
          },
        ]
      }
      call_history: {
        Row: {
          id: string
          session_id: string | null
          caller_id: string
          callee_id: string
          conversation_id: string | null
          call_type: Database['public']['Enums']['call_type'] | null
          direction: Database['public']['Enums']['call_direction'] | null
          status: Database['public']['Enums']['call_session_status'] | null
          duration_seconds: number | null
          started_at: string | null
          ended_at: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          session_id?: string | null
          caller_id: string
          callee_id: string
          conversation_id?: string | null
          call_type?: Database['public']['Enums']['call_type'] | null
          direction?: Database['public']['Enums']['call_direction'] | null
          status?: Database['public']['Enums']['call_session_status'] | null
          duration_seconds?: number | null
          started_at?: string | null
          ended_at?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          session_id?: string | null
          caller_id?: string
          callee_id?: string
          conversation_id?: string | null
          call_type?: Database['public']['Enums']['call_type'] | null
          direction?: Database['public']['Enums']['call_direction'] | null
          status?: Database['public']['Enums']['call_session_status'] | null
          duration_seconds?: number | null
          started_at?: string | null
          ended_at?: string | null
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'call_history_session_id_fkey'
            columns: ['session_id']
            isOneToOne: false
            referencedRelation: 'call_sessions'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'call_history_caller_id_fkey'
            columns: ['caller_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'call_history_callee_id_fkey'
            columns: ['callee_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'call_history_conversation_id_fkey'
            columns: ['conversation_id']
            isOneToOne: false
            referencedRelation: 'conversations'
            referencedColumns: ['id']
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_list_users: {
        Args: Record<PropertyKey, never>
        Returns: {
          avatar_url: string | null
          created_at: string | null
          display_name: string
          email: string | null
          friend_count: number
          id: string
          is_suspended: boolean
          last_seen: string | null
          role: string
          status: string | null
          username: string
        }[]
      }
      admin_update_user: {
        Args: { p_is_suspended: boolean; p_role: string; p_user_id: string }
        Returns: boolean
      }
      bootstrap_chatly_admin: {
        Args: { p_email: string }
        Returns: string
      }
      create_group_conversation: {
        Args: { p_member_ids: string[]; p_title: string }
        Returns: string
      }
      delete_conversation_permanently: {
        Args: { p_conversation_id: string }
        Returns: boolean
      }
      remove_friendship: {
        Args: { p_friendship_id: string }
        Returns: boolean
      }
      respond_friend_request: {
        Args: { p_accept: boolean; p_friendship_id: string }
        Returns: unknown
      }
      send_friend_request: {
        Args: { p_addressee_id: string }
        Returns: unknown
      }
      is_conversation_participant: {
        Args: { conv_id: string }
        Returns: boolean
      }
      send_scheduled_message: {
        Args: { scheduled_message_id: string }
        Returns: string
      }
      initiate_call: {
        Args: {
          p_callee_id: string
          p_conversation_id: string
          p_call_type: Database['public']['Enums']['call_type']
        }
        Returns: unknown
      }
      update_call_status: {
        Args: {
          p_session_id: string
          p_status: Database['public']['Enums']['call_session_status']
          p_answer_sdp?: string
        }
        Returns: unknown
      }
      end_call: {
        Args: {
          p_session_id: string
          p_status?: Database['public']['Enums']['call_session_status']
        }
        Returns: unknown
      }
      expire_stale_calls_for_current_user: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      invite_group_members: {
        Args: { p_conversation_id: string; p_user_ids: string[] }
        Returns: number
      }
      is_group_admin: {
        Args: { p_conversation_id: string; p_user_id?: string }
        Returns: boolean
      }
      is_group_owner: {
        Args: { p_conversation_id: string; p_user_id?: string }
        Returns: boolean
      }
      leave_group: {
        Args: { p_conversation_id: string }
        Returns: boolean
      }
      remove_group_member: {
        Args: { p_conversation_id: string; p_user_id: string }
        Returns: boolean
      }
      set_group_member_role: {
        Args: {
          p_conversation_id: string
          p_role: Database['public']['Enums']['group_member_role']
          p_user_id: string
        }
        Returns: boolean
      }
      update_group_details: {
        Args: { p_avatar_url?: string; p_conversation_id: string; p_title: string }
        Returns: boolean
      }
      get_call_history: {
        Args: { p_user_id?: string; p_limit?: number }
        Returns: unknown
      }
      get_conversation_summaries: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      get_admin_dashboard_stats: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      is_chatly_admin: {
        Args: { p_user_id?: string }
        Returns: boolean
      }
    }
    Enums: {
      conversation_type: 'direct' | 'group'
      group_member_role: 'owner' | 'admin' | 'member'
      message_content_type: 'text' | 'image' | 'video' | 'audio' | 'file'
      message_status: 'sending' | 'sent' | 'delivered' | 'read' | 'failed'
      scheduled_message_status: 'pending' | 'sent' | 'cancelled'
      call_type: 'voice' | 'video'
      call_direction: 'incoming' | 'outgoing'
      call_session_status:
        'pending' | 'ringing' | 'answered' | 'declined' | 'missed' | 'ended' | 'failed'
      friendship_status: 'pending' | 'accepted' | 'declined'
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema['CompositeTypes'] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      conversation_type: ['direct', 'group'],
      group_member_role: ['owner', 'admin', 'member'],
      message_content_type: ['text', 'image', 'video', 'audio', 'file'],
      message_status: ['sending', 'sent', 'delivered', 'read', 'failed'],
      scheduled_message_status: ['pending', 'sent', 'cancelled'],
      call_type: ['voice', 'video'],
      call_direction: ['incoming', 'outgoing'],
      call_session_status: [
        'pending',
        'ringing',
        'answered',
        'declined',
        'missed',
        'ended',
        'failed',
      ],
      friendship_status: ['pending', 'accepted', 'declined'],
    },
  },
} as const
