# 02 - Database Schema (Supabase)

> **Phase 1 chưa dùng database** — section này thiết kế sẵn cho Phase 2.

## Tables

### `profiles`
Lưu thông tin công khai của user (1-1 với `auth.users`).

```sql
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  bio TEXT,
  phone TEXT UNIQUE,
  last_seen TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_profiles_username ON profiles(username);
```

### `conversations`
Đại diện cho một cuộc trò chuyện 1-1 (sẽ mở rộng cho group ở Phase 2).

```sql
CREATE TYPE conversation_type AS ENUM ('direct', 'group'); -- Phase 2+

CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type conversation_type DEFAULT 'direct',
  title TEXT, -- null cho direct, tên group cho group
  avatar_url TEXT,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  last_message_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_conversations_last_message ON conversations(last_message_at DESC);
```

### `conversation_participants`
Many-to-many giữa users và conversations.

```sql
CREATE TABLE conversation_participants (
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  last_read_at TIMESTAMPTZ DEFAULT NOW(),
  is_pinned BOOLEAN DEFAULT FALSE,
  is_muted BOOLEAN DEFAULT FALSE,
  is_archived BOOLEAN DEFAULT FALSE,
  PRIMARY KEY (conversation_id, user_id)
);

CREATE INDEX idx_participants_user ON conversation_participants(user_id);
CREATE INDEX idx_participants_conv_user ON conversation_participants(user_id, conversation_id);
```

### `messages`
Tin nhắn trong cuộc trò chuyện.

```sql
CREATE TYPE message_status AS ENUM ('sending', 'sent', 'delivered', 'read', 'failed');

CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  status message_status DEFAULT 'sent',
  reply_to UUID REFERENCES messages(id) ON DELETE SET NULL,
  edited_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at DESC);
CREATE INDEX idx_messages_sender ON messages(sender_id);
```

## Row Level Security (RLS)

### Helper function: lấy user hiện tại
```sql
CREATE OR REPLACE FUNCTION auth.current_user_id()
RETURNS UUID AS $$
  SELECT auth.uid();
$$ LANGUAGE SQL STABLE;
```

### Helper: kiểm tra có phải participant
```sql
CREATE OR REPLACE FUNCTION is_conversation_participant(conv_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM conversation_participants
    WHERE conversation_id = conv_id
    AND user_id = auth.uid()
  );
$$ LANGUAGE SQL STABLE SECURITY DEFINER;
```

### Policies

```sql
-- profiles: mọi user đã đăng nhập đều xem được, chỉ sửa của mình
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Profiles are viewable by authenticated users"
  ON profiles FOR SELECT
  TO authenticated
  USING (true);
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());
CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid());

-- conversations: chỉ participants xem được
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Participants can view conversation"
  ON conversations FOR SELECT
  TO authenticated
  USING (is_conversation_participant(id));
CREATE POLICY "Users can create conversations"
  ON conversations FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());
CREATE POLICY "Participants can update conversation"
  ON conversations FOR UPDATE
  TO authenticated
  USING (is_conversation_participant(id));

-- conversation_participants
ALTER TABLE conversation_participants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Participants can view other participants"
  ON conversation_participants FOR SELECT
  TO authenticated
  USING (is_conversation_participant(conversation_id));
CREATE POLICY "Users can join conversations they're invited to"
  ON conversation_participants FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own participation"
  ON conversation_participants FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid());

-- messages
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Participants can view messages"
  ON messages FOR SELECT
  TO authenticated
  USING (is_conversation_participant(conversation_id));
CREATE POLICY "Users can send messages to conversations they're in"
  ON messages FOR INSERT
  TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND is_conversation_participant(conversation_id)
  );
CREATE POLICY "Senders can update own messages"
  ON messages FOR UPDATE
  TO authenticated
  USING (sender_id = auth.uid());
CREATE POLICY "Senders can delete own messages"
  ON messages FOR DELETE
  TO authenticated
  USING (sender_id = auth.uid());
```

## Realtime setup

```sql
-- Enable realtime trên messages
ALTER PUBLICATION supabase_realtime ADD TABLE messages;

-- Pattern: dùng broadcast channels (xem docs/05-api-routes.md)
-- cho chat realtime, không phụ thuộc postgres_changes
```

## Seed data (development)

```sql
-- Tạo 5 user mẫu + 3 conversations + 20 messages
-- File: supabase/seed.sql
```

## Migrations order

1. `20250101000001_create_profiles.sql`
2. `20250101000002_create_conversations.sql`
3. `20250101000003_create_participants.sql`
4. `20250101000004_create_messages.sql`
5. `20250101000005_create_helpers_and_rls.sql`
6. `20250101000006_create_realtime.sql`
