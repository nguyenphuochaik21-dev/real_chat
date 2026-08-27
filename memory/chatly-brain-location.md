---
name: chatly-brain-location
description: Chatly brain location và key bugs
metadata:
  type: reference
---

# Chatly Brain Location

## Bộ não dự án
```
c:\Users\haiko\chatly-brain\
```

## Đọc khi bắt đầu session
1. `c:\Users\haiko\chatly-brain\00-overview.md` - Tổng quan
2. `c:\Users\haiko\chatly-brain\01-bug-tracker.md` - Bugs
3. `c:\Users\haiko\chatly-brain\04-quick-ref.md` - Quick ref

## Project Location
```
c:\Users\haiko\chat\
```

## Bug Mute Đã Fix (2026-08-26)
- **File có bug**: `chatly/src/components/layout/sidebar.tsx`
- **Hàm**: `setupNotificationSubscription` (dòng ~77-130)
- **Vấn đề**: Không check is_muted, is_archived, user_blocks
- **Đã fix**: Thêm các checks như trong use-notifications.ts

## File quan trọng cần đọc
- `chatly/src/hooks/use-notifications.ts` - Notification logic (có checks đúng)
- `chatly/src/stores/notification-store.ts` - Zustand store
- `chatly/src/lib/actions/conversations.ts` - Server actions
