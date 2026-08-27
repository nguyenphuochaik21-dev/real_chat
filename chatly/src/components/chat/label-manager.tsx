'use client'

import { useState } from 'react'
import { Tag, Plus, X, Check, Trash2, Edit2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { Tables } from '@/types'

type Label = Tables<'conversation_labels'>

interface LabelManagerProps {
  isOpen: boolean
  onClose: () => void
  conversationId: string
  currentLabels: Label[]
  allLabels: Label[]
  onAssignLabel: (labelId: string) => Promise<void>
  onRemoveLabel: (labelId: string) => Promise<void>
  onCreateLabel: (name: string, color: string) => Promise<{ success: boolean; label?: Label }>
  onDeleteLabel: (labelId: string) => Promise<void>
}

const PRESET_COLORS = [
  '#8B5CF6', // Purple (default)
  '#EF4444', // Red
  '#F97316', // Orange
  '#EAB308', // Yellow
  '#22C55E', // Green
  '#14B8A6', // Teal
  '#3B82F6', // Blue
  '#EC4899', // Pink
]

function ColorPicker({
  selectedColor,
  onColorSelect,
}: {
  selectedColor: string
  onColorSelect: (color: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {PRESET_COLORS.map((color) => (
        <button
          key={color}
          onClick={() => onColorSelect(color)}
          className={cn(
            'h-6 w-6 rounded-full transition-transform',
            selectedColor === color && 'ring-2 ring-offset-2 ring-offset-[var(--bg-panel)] scale-110'
          )}
          style={{ backgroundColor: color }}
        />
      ))}
      <input
        type="color"
        value={selectedColor}
        onChange={(e) => onColorSelect(e.target.value)}
        className="h-6 w-6 cursor-pointer rounded-full border-0 p-0"
      />
    </div>
  )
}

export function LabelManager({
  isOpen,
  onClose,
  conversationId,
  currentLabels,
  allLabels,
  onAssignLabel,
  onRemoveLabel,
  onCreateLabel,
  onDeleteLabel,
}: LabelManagerProps) {
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [newLabelName, setNewLabelName] = useState('')
  const [newLabelColor, setNewLabelColor] = useState(PRESET_COLORS[0])
  const [isCreating, setIsCreating] = useState(false)

  if (!isOpen) return null

  const isLabelAssigned = (labelId: string) => {
    return currentLabels.some((l) => l.id === labelId)
  }

  const handleToggleLabel = async (label: Label) => {
    if (isLabelAssigned(label.id)) {
      await onRemoveLabel(label.id)
    } else {
      await onAssignLabel(label.id)
    }
  }

  const handleCreateLabel = async () => {
    if (!newLabelName.trim()) return

    setIsCreating(true)
    try {
      const result = await onCreateLabel(newLabelName.trim(), newLabelColor)
      if (result.success && result.label) {
        await onAssignLabel(result.label.id)
        setNewLabelName('')
        setNewLabelColor(PRESET_COLORS[0])
        setShowCreateForm(false)
      }
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/50"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-[var(--bg-panel)] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border-default)] p-4">
          <div className="flex items-center gap-2">
            <Tag className="h-5 w-5 text-primary-500" />
            <h2 className="font-semibold text-[var(--text-primary)]">Labels</h2>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Content */}
        <div className="max-h-96 overflow-y-auto p-4">
          {/* Labels list */}
          <div className="space-y-2">
            {allLabels.length === 0 && !showCreateForm ? (
              <p className="py-4 text-center text-sm text-[var(--text-muted)]">
                No labels yet. Create one to organize your conversations.
              </p>
            ) : (
              allLabels.map((label) => (
                <div
                  key={label.id}
                  className="group flex items-center justify-between rounded-lg border border-[var(--border-default)] p-3 transition-colors hover:bg-[var(--bg-hover)]"
                >
                  <button
                    onClick={() => handleToggleLabel(label)}
                    className="flex flex-1 items-center gap-3"
                  >
                    {/* Color dot */}
                    <div
                      className="h-4 w-4 rounded-full"
                      style={{ backgroundColor: label.color || '#8B5CF6' }}
                    />

                    {/* Label name */}
                    <span className="flex-1 text-left text-sm text-[var(--text-primary)]">
                      {label.name}
                    </span>

                    {/* Check mark if assigned */}
                    {isLabelAssigned(label.id) && (
                      <Check className="h-4 w-4 text-primary-500" />
                    )}
                  </button>

                  {/* Delete button (on hover) */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      if (confirm(`Delete label "${label.name}"?`)) {
                        onDeleteLabel(label.id)
                      }
                    }}
                    className="ml-2 rounded p-1 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-red-500/20"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-red-500" />
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Create new label form */}
          {showCreateForm ? (
            <div className="mt-4 rounded-lg border border-[var(--border-default)] p-4">
              <p className="mb-3 text-sm font-medium text-[var(--text-secondary)]">New Label</p>

              <Input
                placeholder="Label name"
                value={newLabelName}
                onChange={(e) => setNewLabelName(e.target.value)}
                className="mb-3"
                autoFocus
              />

              <p className="mb-2 text-xs text-[var(--text-muted)]">Color</p>
              <ColorPicker
                selectedColor={newLabelColor}
                onColorSelect={setNewLabelColor}
              />

              <div className="mt-4 flex justify-end gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setShowCreateForm(false)
                    setNewLabelName('')
                    setNewLabelColor(PRESET_COLORS[0])
                  }}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleCreateLabel}
                  disabled={!newLabelName.trim() || isCreating}
                >
                  Create
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="ghost"
              className="mt-4 w-full justify-start"
              onClick={() => setShowCreateForm(true)}
            >
              <Plus className="mr-2 h-4 w-4" />
              Create new label
            </Button>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-[var(--border-default)] p-4">
          <p className="text-xs text-[var(--text-muted)]">
            Click a label to assign or remove it from this conversation.
          </p>
        </div>
      </div>
    </>
  )
}
