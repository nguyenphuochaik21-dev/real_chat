---
name: supabase-rls-template
description: Template viết RLS policies an toàn cho Supabase
---

# Supabase RLS Template

Khi viết Row Level Security policies cho Supabase, dùng template này.

## Khi nào dùng
- Tạo table mới cần RLS
- Review policy hiện tại
- Audit security

## Quy trình

### 1. ENABLE RLS

**Mọi table có user data phải ENABLE RLS**:

```sql
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
```

Không có RLS = mọi authenticated user có full quyền.

### 2. Helper functions

Tạo helper function để tái sử dụng logic:

```sql
-- Kiểm tra user hiện tại có phải participant của conversation không
CREATE OR REPLACE FUNCTION is_conversation_participant(conv_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM conversation_participants
    WHERE conversation_id = conv_id
    AND user_id = auth.uid()
  );
$$ LANGUAGE SQL STABLE SECURITY DEFINER;
```

`SECURITY DEFINER` = chạy với quyền của function owner, bypass RLS của bảng được query. Cẩn thận khi dùng.

### 3. Policy templates

#### SELECT (Read)

```sql
-- User đọc được rows của mình
CREATE POLICY "Users read own data"
  ON X FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- User đọc được rows trong conversation mà mình là participant
CREATE POLICY "Participants read"
  ON messages FOR SELECT
  TO authenticated
  USING (is_conversation_participant(conversation_id));

-- Public read (cẩn thận!)
CREATE POLICY "Public read"
  ON X FOR SELECT
  TO authenticated
  USING (true);  -- CHỈ dùng cho data thực sự public
```

#### INSERT (Create)

```sql
-- User tạo row với user_id của mình
CREATE POLICY "Users create own"
  ON X FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- User gửi message vào conversation mình là participant
CREATE POLICY "Send messages"
  ON messages FOR INSERT
  TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND is_conversation_participant(conversation_id)
  );
```

#### UPDATE (Modify)

```sql
-- User update được row của mình
CREATE POLICY "Users update own"
  ON X FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())        -- existing row phải thuộc user
  WITH CHECK (user_id = auth.uid());  -- new state cũng phải thuộc user

-- ⚠️ QUAN TRỌNG: cả USING và WITH CHECK
-- USING: filter rows có thể update
-- WITH CHECK: validate data mới
```

#### DELETE

```sql
-- User xóa row của mình
CREATE POLICY "Users delete own"
  ON X FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- Soft delete: thường không cho DELETE thật, dùng UPDATE deleted_at
```

### 4. Anti-patterns

❌ **KHÔNG BAO GIỜ**:
```sql
-- Quá permissive
USING (true)  -- cho bất kỳ table nào có user data

-- Thiếu auth check
USING (id IS NOT NULL)

-- Cho phép user fake identity
WITH CHECK (user_id = ANY(ARRAY['user1', 'user2']))  -- bypass

-- Không check conversation membership
USING (conversation_id = 'fixed-uuid')  -- ai cũng đọc được
```

### 5. Testing RLS

```sql
-- Set role để test như user khác
SET ROLE authenticated;
SET request.jwt.claim.sub TO 'test-user-id';

-- Query và verify kết quả
SELECT * FROM messages;  -- chỉ thấy của mình

-- Reset
RESET ROLE;
```

Trong code, test qua:
```typescript
// Test với user A
const { data: aData } = await supabase
  .from('messages')
  .select('*')
  .eq('conversation_id', convId)
// Phải chỉ thấy messages trong conversation mà A là participant

// Test với user B (không phải participant)
const { data: bData } = await supabase
  .from('messages')
  .select('*')
  .eq('conversation_id', convId)
// Phải thấy mảng rỗng
```

### 6. Realtime considerations

Realtime channels tự respect RLS:

```sql
-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE messages;

-- Client subscribe
const channel = supabase.channel('messages-channel')
  .on('postgres_changes',
      { event: '*', schema: 'public', table: 'messages' },
      handler)
  .subscribe()
-- Client chỉ nhận events cho rows mà RLS cho phép đọc
```

Với broadcast (recommended cho chat):
```typescript
// Phải manually check authorization trước khi broadcast
// RLS không áp dụng cho broadcast channel
```

### 7. Common patterns cho Chatly

**Conversation visibility**:
```sql
CREATE POLICY "Participants see their conversations"
  ON conversations FOR SELECT
  TO authenticated
  USING (is_conversation_participant(id));
```

**Message visibility**:
```sql
CREATE POLICY "Participants see messages"
  ON messages FOR SELECT
  TO authenticated
  USING (is_conversation_participant(conversation_id));
```

**Send message**:
```sql
CREATE POLICY "Participants can send"
  ON messages FOR INSERT
  TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND is_conversation_participant(conversation_id)
  );
```

**Edit own message**:
```sql
CREATE POLICY "Sender can edit"
  ON messages FOR UPDATE
  TO authenticated
  USING (sender_id = auth.uid())
  WITH CHECK (sender_id = auth.uid());
```

**Delete own message**:
```sql
CREATE POLICY "Sender can delete"
  ON messages FOR DELETE
  TO authenticated
  USING (sender_id = auth.uid());
```

## Checklist khi review RLS

- [ ] Mọi table có user data đều `ENABLE RLS`
- [ ] Mỗi table có ít nhất 1 policy cho mỗi operation cần thiết
- [ ] Không có `USING (true)` cho data private
- [ ] UPDATE có cả USING và WITH CHECK
- [ ] INSERT có WITH CHECK validate user_id từ auth.uid()
- [ ] Test với nhiều user khác nhau
- [ ] Realtime subscription respect RLS (đúng cho postgres_changes, cần manual check cho broadcast)
