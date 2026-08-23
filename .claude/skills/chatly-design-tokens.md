---
name: chatly-design-tokens
description: Áp dụng design system Chatly (màu, spacing, typography)
---

# Chatly Design Tokens Skill

Khi tạo component cho dự án Chatly, dùng design tokens này để giữ nhất quán.

## Khi nào dùng
- Tạo component mới
- Style bất kỳ element nào
- User hỏi về màu sắc, spacing, typography

## Tokens

### Colors (Tailwind class)

**Primary (Indigo)**
- `bg-primary-50` đến `bg-primary-950` — theo Tailwind palette mặc định
- Main brand: `bg-primary-500` (#6366f1), `bg-primary-600` (#4f46e5)
- Text on primary: `text-white`
- Hover: `hover:bg-primary-600`

**Semantic**
- Online: `bg-emerald-500` (green-500)
- Offline: `bg-gray-400`
- Busy: `bg-red-500`
- Away: `bg-amber-500`

**Surfaces**
- App bg: `bg-white dark:bg-slate-900`
- Sidebar bg: `bg-gray-50 dark:bg-slate-800`
- Panel bg: `bg-white dark:bg-slate-800`
- Hover bg: `bg-gray-100 dark:bg-slate-700`
- Border: `border-gray-200 dark:border-slate-700`

**Message bubbles**
- Incoming: `bg-white dark:bg-slate-700`
- Outgoing: `bg-primary-500 text-white`
- Time text incoming: `text-gray-500 dark:text-gray-400`
- Time text outgoing: `text-white/70`

### Spacing

- Panel padding: `p-4` hoặc `px-4 py-3`
- Item padding: `p-3` hoặc `px-3 py-2`
- Vertical gap: `space-y-2`, `space-y-3`
- Horizontal gap: `gap-2`, `gap-3`
- Avatar + content: `gap-3`

### Border Radius

- Avatars, badges: `rounded-full`
- Bubbles: `rounded-2xl rounded-br-md` (outgoing) / `rounded-2xl rounded-bl-md` (incoming)
- Cards, panels: `rounded-xl`
- Inputs, buttons: `rounded-lg`
- Avatars small (sm): `rounded-full`

### Typography

- Page title: `text-xl font-semibold`
- Panel header: `text-lg font-semibold`
- List item title: `text-sm font-medium`
- Body: `text-sm`
- Caption: `text-xs text-gray-500 dark:text-gray-400`
- Timestamp: `text-xs text-gray-400`

### Shadows

- Popover: `shadow-md`
- Modal: `shadow-xl`
- Card (rare): `shadow-sm`

### Animations

- Transition: `transition-all duration-200`
- Panel slide: `transition-transform duration-300 ease-in-out`
- Hover: `transition-colors duration-150`

## Ví dụ component

```tsx
import { cn } from '@/lib/utils'

export const ConversationItem = ({ active, name, message, time, unread }) => (
  <div className={cn(
    "flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors",
    active
      ? "bg-primary-50 dark:bg-primary-900/30"
      : "hover:bg-gray-100 dark:hover:bg-slate-700"
  )}>
    <Avatar name={name} />
    <div className="flex-1 min-w-0">
      <p className="text-sm font-medium truncate">{name}</p>
      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{message}</p>
    </div>
    <span className="text-xs text-gray-400">{time}</span>
    {unread > 0 && (
      <span className="bg-primary-500 text-white text-xs rounded-full px-2 py-0.5">
        {unread}
      </span>
    )}
  </div>
)
```

## Theme switching

Luôn dùng `dark:` prefix cho mọi màu để support dark mode:

```tsx
// ❌ Bad - hardcoded
<div className="bg-white text-gray-900">

// ✅ Good - theme-aware
<div className="bg-white dark:bg-slate-900 text-gray-900 dark:text-gray-100">

// ✅ Best - dùng CSS variables
<div className="bg-app text-primary">
```
(đòi hỏi CSS variables defined in globals.css)
```

## Tham khảo
- `docs/04-ui-spec.md` để xem đầy đủ tokens
- Template gốc: https://html.designstream.co.in/chatly/
