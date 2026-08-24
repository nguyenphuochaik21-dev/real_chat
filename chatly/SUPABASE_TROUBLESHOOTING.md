# Phase 2 - Troubleshooting & Verification

## Status

✅ Authentication hoạt động (đăng ký/đăng nhập)
✅ Profile auto-created qua trigger
✅ Chats list load từ Supabase
⚠️ **Lỗi: Không nhắn tin được khi click từ Contacts**

## Nguyên nhân lỗi

Khi click vào contact để bắt đầu chat, hàm `startConversation` trong [contacts/page.tsx](src/app/(chat)/contacts/page.tsx) gọi:
1. Tạo conversation mới với `created_by = currentUserId` ✅
2. Insert 2 participants: user hiện tại + contact ❌

Bước 2 fail vì:
- RLS policy `"Users can join conversations"` cho phép `user_id = auth.uid()` insert
- Nhưng với user **không phải current user** (contact), policy này block

## Giải pháp

Cập nhật RLS policy để cho phép cả 2 user được thêm vào participants khi tạo conversation mới.
