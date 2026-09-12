import { create } from 'zustand'
import type { Tables } from '@/types'

type Message = Tables<'messages'>

interface MessageActionsState {
  // Reply state
  isReplying: boolean
  replyToMessage: Message | null
  setReplyTo: (message: Message | null) => void
  clearReply: () => void

  // Edit state
  isEditing: boolean
  editingMessage: Message | null
  setEditingMessage: (message: Message | null) => void
  clearEdit: () => void

  // Context menu state
  contextMenuOpen: boolean
  contextMenuPosition: { x: number; y: number }
  contextMenuTarget: Message | null
  openContextMenu: (message: Message, position: { x: number; y: number }) => void
  closeContextMenu: () => void

  // Forward modal state
  forwardModalOpen: boolean
  messagesToForward: Message[]
  openForwardModal: (messages: Message[]) => void
  closeForwardModal: () => void
  reset: () => void
}

const initialState = {
  isReplying: false,
  replyToMessage: null,
  isEditing: false,
  editingMessage: null,
  contextMenuOpen: false,
  contextMenuPosition: { x: 0, y: 0 },
  contextMenuTarget: null,
  forwardModalOpen: false,
  messagesToForward: [],
}

export const useMessageActionsStore = create<MessageActionsState>((set) => ({
  // Reply state
  ...initialState,
  setReplyTo: (message) => set({ isReplying: !!message, replyToMessage: message }),
  clearReply: () => set({ isReplying: false, replyToMessage: null }),

  // Edit state
  setEditingMessage: (message) => set({ isEditing: !!message, editingMessage: message }),
  clearEdit: () => set({ isEditing: false, editingMessage: null }),

  // Context menu state
  openContextMenu: (message, position) =>
    set({
      contextMenuOpen: true,
      contextMenuPosition: position,
      contextMenuTarget: message,
    }),
  closeContextMenu: () =>
    set({
      contextMenuOpen: false,
      contextMenuPosition: { x: 0, y: 0 },
      contextMenuTarget: null,
    }),

  // Forward modal state
  openForwardModal: (messages) =>
    set({
      forwardModalOpen: true,
      messagesToForward: messages,
    }),
  closeForwardModal: () =>
    set({
      forwardModalOpen: false,
      messagesToForward: [],
    }),
  reset: () => set(initialState),
}))
