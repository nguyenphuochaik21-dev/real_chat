# Plan: Mobile Chat & Localization Upgrade

## Phase 1 — Mobile layout and chat header

- [x] Prevent horizontal overflow in the chat layout, message list, composer, and dialogs.
- [x] Display only the final two words of long contact names in the chat header.
- [x] Keep voice call, video call, and the three-dot menu visible; move search and media actions into the menu.

## Phase 2 — Conversation search

- [x] Open search from the conversation options menu.
- [x] Scope results to the active conversation and support date filters.
- [x] Scroll to and highlight the selected message.

## Phase 3 — Message composer and attachments

- [x] Replace the one-line input with an auto-growing multiline textarea.
- [x] Preserve Enter for line breaks and use Ctrl/Cmd+Enter as the keyboard send shortcut.
- [x] Combine images/videos into one multi-file control.
- [x] Combine documents/audio into one multi-file control.
- [x] Add emoji and sticker tabs; stickers send directly as messages.

## Phase 4 — Vietnamese and navigation cleanup

- [x] Add a lightweight Vietnamese/English translation provider.
- [x] Default to Vietnamese, persist the selected language, and update the document language.
- [x] Add the language selector to Settings and localize primary user flows.
- [x] Remove Favorites from navigation, protected routes, and application pages.

## Phase 5 — Verification

- [x] Run Prettier, ESLint, strict TypeScript, and the production build.
- [x] Recheck each requested behavior against the implementation and mobile constraints.
