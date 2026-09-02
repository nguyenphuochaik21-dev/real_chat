import type { Database, Json } from './database'

export type { Database, Json }
export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row']
export type InsertOf<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert']
export type UpdateOf<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update']
export type PublicProfile = Pick<
  Tables<'profiles'>,
  'id' | 'username' | 'display_name' | 'avatar_url' | 'bio' | 'status' | 'last_seen' | 'created_at'
>
