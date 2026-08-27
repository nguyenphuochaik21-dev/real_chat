# 04 - UI Design Specification

## Design tokens

### Colors

#### Light mode
```css
:root {
  /* Primary */
  --color-primary-50:  #eef2ff;
  --color-primary-100: #e0e7ff;
  --color-primary-500: #6366f1;  /* Indigo chính */
  --color-primary-600: #4f46e5;
  --color-primary-700: #4338ca;

  /* Backgrounds */
  --bg-app:           #ffffff;
  --bg-sidebar:       #f9fafb;
  --bg-panel:         #ffffff;
  --bg-hover:         #f3f4f6;
  --bg-message-in:    #ffffff;
  --bg-message-out:   #6366f1;

  /* Text */
  --text-primary:     #111827;
  --text-secondary:   #6b7280;
  --text-muted:       #9ca3af;
  --text-on-primary:  #ffffff;

  /* Borders */
  --border-default:   #e5e7eb;
  --border-strong:    #d1d5db;

  /* Status */
  --color-online:     #10b981;  /* Green */
  --color-offline:    #9ca3af;
  --color-busy:       #ef4444;
  --color-away:       #f59e0b;

  /* Message status */
  --color-checkmark:  #60a5fa;  /* Read receipt */
}
```

#### Dark mode
```css
:root[data-theme="dark"] {
  --bg-app:           #0f172a;
  --bg-sidebar:       #1e293b;
  --bg-panel:         #1e293b;
  --bg-hover:         #334155;
  --bg-message-in:    #334155;
  --bg-message-out:   #6366f1;

  --text-primary:     #f1f5f9;
  --text-secondary:   #cbd5e1;
  --text-muted:       #94a3b8;

  --border-default:   #334155;
  --border-strong:    #475569;
}
```

### Typography
- **Font family**: Inter (Google Fonts) + system fallbacks
- **Sizes**:
  - `text-xs`: 0.75rem (12px) — captions, time stamps
  - `text-sm`: 0.875rem (14px) — body, list items
  - `text-base`: 1rem (16px) — chat messages
  - `text-lg`: 1.125rem (18px) — panel headers
  - `text-xl`: 1.25rem (20px) — page titles
  - `text-2xl`: 1.5rem (24px) — display

### Spacing
- Padding panel: `p-4` (16px)
- Padding item: `p-3` (12px)
- Gap: `gap-2` (8px), `gap-3` (12px)
- Border radius:
  - `rounded-lg`: 0.5rem (8px) — panels, inputs
  - `rounded-xl`: 0.75rem (12px) — cards
  - `rounded-2xl`: 1rem (16px) — bubbles
  - `rounded-full`: 9999px — avatars, badges

### Shadows
- `shadow-sm`: subtle (cards)
- `shadow-md`: medium (popovers)
- `shadow-lg`: prominent (modals)
- `shadow-xl`: dramatic (info panel)

### Animations
- Panel slide: `transition-transform duration-300 ease-in-out`
- Message appear: `animate-fade-in`
- Hover: `transition-colors duration-150`

---

## Layout grid

App sử dụng CSS Grid với 4 cột linh hoạt:

```
┌─────────┬──────────────┬───────────────────┬──────────────┐
│ Sidebar │ Chats list   │ Chat view         │ Info panel   │
│ 64px    │ 320px        │ flex-1 (min 480px)│ 320px        │
│         │              │                   │ (conditional)│
└─────────┴──────────────┴───────────────────┴──────────────┘
```

Responsive:
- ≥1280px: cả 4 panels
- ≥1024px: 3 panels (ẩn info)
- ≥768px: 2 panels (chats list + active view)
- <768px: 1 panel (mobile-first redesign — Phase 6)

---

## Component library

### Avatar
- Shape: round (`rounded-full`)
- Sizes: `sm` (32px), `md` (40px), `lg` (56px), `xl` (96px)
- Status indicator: dot ở góc dưới phải (online/offline)
- Fallback: initials trên background colored theo username hash

### Conversation Item
- Layout: avatar + (name + last message) + (time + badges)
- Active state: `bg-primary-50` (light) / `bg-primary-900/30` (dark)
- Hover: `bg-hover`
- Pin icon ở góc phải trên
- Unread badge: primary color, rounded-full

### Message Bubble
- Max width: 75% width
- Padding: `px-4 py-2`
- Border radius:
  - Outgoing: `rounded-2xl rounded-br-md`
  - Incoming: `rounded-2xl rounded-bl-md`
- Time + status ở dưới cùng phải (outgoing)
- Tail/corner: bo nhỏ một phía để chỉ hướng

### Chat Input
- Layout: [emoji] [textarea] [send]
- Auto-resize textarea
- Send button: chỉ enable khi có content
- Placeholder: "Type a message..."

### Info Panel
- Header gradient: `bg-gradient-to-b from-primary-500 to-purple-500`
- Avatar lớn với status dot
- Action buttons hàng ngang (Call, Video, Mute, Search)
- Sections dạng card với icon bên trái

---

## Iconography

Dùng **lucide-react**. Map icon → use:

| Icon | Component |
|------|-----------|
| `MessageSquare` | Chats nav, message bubble count |
| `Users` | Contacts nav |
| `Phone` | Calls nav, voice call |
| `Video` | Video call |
| `Star` | Favorites nav |
| `CircleDot` | Status nav |
| `Settings` | Settings nav |
| `Search` | Search bars |
| `Send` | Send message |
| `Smile` | Emoji picker |
| `Paperclip` | Attach file |
| `Pin` | Pin conversation |
| `Bell` / `BellOff` | Mute |
| `PhoneIncoming` / `PhoneOutgoing` / `PhoneMissed` | Call direction |
| `Check` / `CheckCheck` | Message status |
| `ArrowLeft` | Back navigation |
| `X` | Close panel |
| `MoreVertical` | Dropdown menu |
| `QrCode` | Profile QR |
| `Moon` / `Sun` | Theme toggle |
| `LogOut` | Logout |
| `UserPlus` | Add contact |
| `Trash2` | Delete |
| `Edit` | Edit |
| `Camera` | Change avatar |
| `Shield` | Privacy/security |
| `Database` | Storage |
| `HelpCircle` | Help |
| `Share2` | Invite |

---

## Mock data shapes

```typescript
// lib/mock/types.ts

export interface MockUser {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string;       // hoặc null để dùng initial fallback
  bio?: string;
  phone?: string;
  email?: string;
  status: 'online' | 'offline' | 'away' | 'busy';
  last_seen?: string;       // ISO datetime
}

export interface MockConversation {
  id: string;
  type: 'direct';
  participant: MockUser;    // user kia trong direct chat
  last_message: MockMessage;
  unread_count: number;
  is_pinned: boolean;
  is_muted: boolean;
  is_archived: boolean;
}

export interface MockMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  created_at: string;       // ISO datetime
  status: 'sending' | 'sent' | 'delivered' | 'read';
}

export interface MockCall {
  id: string;
  participant: MockUser;
  type: 'voice' | 'video';
  direction: 'incoming' | 'outgoing' | 'missed';
  started_at: string;       // ISO datetime
  duration_seconds?: number;
}

export interface MockStatus {
  id: string;
  user: MockUser;
  media_url: string;        // image/video thumbnail
  caption?: string;
  created_at: string;
  viewed: boolean;
  view_count: number;
}
```

---

## Theming implementation

```typescript
// components/theme-provider.tsx
'use client'
import { ThemeProvider as NextThemesProvider } from 'next-themes'

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="data-theme"
      defaultTheme="system"
      enableSystem
      themes={['light', 'dark']}
    >
      {children}
    </NextThemesProvider>
  )
}
```

Toggle UI:
```typescript
'use client'
import { useTheme } from 'next-themes'
import { Moon, Sun } from 'lucide-react'

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  return (
    <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
      {theme === 'dark' ? <Sun /> : <Moon />}
    </button>
  )
}
```
