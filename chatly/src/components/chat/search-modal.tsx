'use client'

import { useState, useEffect, useRef } from 'react'
import {
  Search,
  X,
  MessageSquare,
  User,
  Calendar,
  ImageIcon,
  FileText,
  ArrowLeft,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useSearch, type Profile, type SearchResult } from '@/hooks/use-search'
import { Avatar } from '@/components/ui/avatar'
import { useI18n } from '@/lib/i18n'

interface SearchModalProps {
  isOpen: boolean
  onClose: () => void
  conversationId?: string
  onSelectMessage?: (message: SearchResult, conversationId: string) => void
  onSelectContact?: (profile: Profile) => void
  currentUserId: string
}

function formatSearchDate(dateStr: string | null, dateLocale: string, yesterday: string): string {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))

  if (days === 0) {
    return date.toLocaleTimeString(dateLocale, { hour: '2-digit', minute: '2-digit' })
  } else if (days === 1) {
    return yesterday
  } else if (days < 7) {
    return date.toLocaleDateString(dateLocale, { weekday: 'short' })
  } else {
    return date.toLocaleDateString(dateLocale, { month: 'short', day: 'numeric' })
  }
}

function HighlightedText({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>

  const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'))

  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <mark key={i} className="rounded bg-yellow-200 px-0.5 dark:bg-yellow-800">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  )
}

function SearchFiltersBar({
  filters,
  onFiltersChange,
}: {
  filters: { dateFrom?: string; dateTo?: string; senderId?: string }
  onFiltersChange: (filters: { dateFrom?: string; dateTo?: string; senderId?: string }) => void
}) {
  const { t } = useI18n()
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [tempDateFrom, setTempDateFrom] = useState(filters.dateFrom || '')
  const [tempDateTo, setTempDateTo] = useState(filters.dateTo || '')

  const hasActiveFilters = filters.dateFrom || filters.dateTo || filters.senderId

  const applyFilters = () => {
    onFiltersChange({
      dateFrom: tempDateFrom || undefined,
      dateTo: tempDateTo || undefined,
      senderId: filters.senderId,
    })
    setShowDatePicker(false)
  }

  const clearFilters = () => {
    setTempDateFrom('')
    setTempDateTo('')
    onFiltersChange({})
    setShowDatePicker(false)
  }

  return (
    <div className="border-b border-[var(--border-default)] bg-[var(--bg-secondary)] px-4 py-2">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowDatePicker(!showDatePicker)}
          className={cn(
            'gap-1.5 text-xs',
            hasActiveFilters && 'bg-primary-500/20 text-primary-500'
          )}
        >
          <Calendar className="h-3.5 w-3.5" />
          {filters.dateFrom || filters.dateTo ? t('search.dateFiltered') : t('search.date')}
        </Button>

        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="text-xs">
            <X className="mr-1 h-3 w-3" />
            {t('common.clear')}
          </Button>
        )}
      </div>

      {showDatePicker && (
        <div className="mt-2 flex items-center gap-2 rounded-lg bg-[var(--bg-panel)] p-2">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-[var(--text-muted)]">{t('search.from')}:</span>
            <input
              type="date"
              value={tempDateFrom}
              onChange={(e) => setTempDateFrom(e.target.value)}
              className="rounded border border-[var(--border-default)] bg-[var(--bg-input)] px-2 py-1 text-xs"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-[var(--text-muted)]">{t('search.to')}:</span>
            <input
              type="date"
              value={tempDateTo}
              onChange={(e) => setTempDateTo(e.target.value)}
              className="rounded border border-[var(--border-default)] bg-[var(--bg-input)] px-2 py-1 text-xs"
            />
          </div>
          <Button size="sm" onClick={applyFilters} className="ml-auto">
            {t('common.apply')}
          </Button>
        </div>
      )}
    </div>
  )
}

function SearchResultItem({
  result,
  query,
  currentUserId,
  onClick,
}: {
  result: SearchResult
  query: string
  currentUserId: string
  onClick: () => void
}) {
  const { t, dateLocale } = useI18n()
  const isFromMe = result.sender_id === currentUserId
  const isMedia = result.content_type && result.content_type !== 'text'

  return (
    <button
      onClick={onClick}
      className="w-full text-left transition-colors hover:bg-[var(--bg-hover)]"
    >
      <div className="flex gap-3 p-3">
        {/* Type icon */}
        <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--bg-secondary)]">
          {isMedia ? (
            result.content_type === 'image' ? (
              <ImageIcon className="text-primary-500 h-4 w-4" />
            ) : (
              <FileText className="text-primary-500 h-4 w-4" />
            )
          ) : (
            <MessageSquare className="h-4 w-4 text-[var(--text-muted)]" />
          )}
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-[var(--text-secondary)]">
              {result.conversation_title || t('chat.selectConversation')}
            </span>
            <span className="text-xs text-[var(--text-muted)]">
              {formatSearchDate(result.created_at, dateLocale, t('search.yesterday'))}
            </span>
          </div>

          {isMedia && result.media_name ? (
            <p className="mt-0.5 truncate text-sm text-[var(--text-primary)]">
              <HighlightedText text={result.media_name} query={query} />
            </p>
          ) : (
            <p className="mt-0.5 line-clamp-2 text-sm text-[var(--text-primary)]">
              <HighlightedText text={result.content} query={query} />
            </p>
          )}

          {isFromMe && (
            <span className="mt-1 text-xs text-[var(--text-muted)]">{t('common.you')}</span>
          )}
        </div>
      </div>
    </button>
  )
}

export function SearchModal({
  isOpen,
  onClose,
  conversationId,
  onSelectMessage,
  onSelectContact,
  currentUserId,
}: SearchModalProps) {
  const { t } = useI18n()
  const [inputValue, setInputValue] = useState('')
  const [activeTab, setActiveTab] = useState<'messages' | 'contacts'>('messages')
  const [filters, setSearchFilters] = useState<{
    dateFrom?: string
    dateTo?: string
    senderId?: string
  }>({})
  const inputRef = useRef<HTMLInputElement>(null)
  const {
    state,
    search,
    searchContacts,
    setFilters: updateFilters,
    clearSearch,
  } = useSearch(conversationId)

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen) {
      const timeoutId = window.setTimeout(() => inputRef.current?.focus(), 100)
      return () => window.clearTimeout(timeoutId)
    }
    const timeoutId = window.setTimeout(() => {
      setInputValue('')
      clearSearch()
    }, 0)
    return () => window.clearTimeout(timeoutId)
  }, [isOpen, clearSearch])

  // Search when input changes
  useEffect(() => {
    if (activeTab === 'messages') {
      search(inputValue)
    } else {
      searchContacts(inputValue)
    }
  }, [inputValue, activeTab, search, searchContacts])

  // Handle filters change
  const handleFiltersChange = (newFilters: {
    dateFrom?: string
    dateTo?: string
    senderId?: string
  }) => {
    setSearchFilters(newFilters)
    updateFilters(newFilters)
  }

  const handleSelectMessage = (result: SearchResult) => {
    if (result.conversation_id && onSelectMessage) {
      onSelectMessage(result, result.conversation_id)
    }
    // Close modal after a short delay to allow navigation
    setTimeout(onClose, 100)
  }

  const handleSelectContact = (profile: Profile) => {
    if (onSelectContact) {
      onSelectContact(profile)
    }
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 sm:pt-20">
      <div
        className="flex h-full w-full flex-col overflow-hidden bg-[var(--bg-panel)] shadow-2xl sm:mx-4 sm:h-auto sm:max-h-[calc(100dvh-10rem)] sm:max-w-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-[var(--border-default)] p-4">
          <Button variant="ghost" size="icon-sm" onClick={onClose}>
            <ArrowLeft className="h-5 w-5" />
          </Button>

          <div className="relative flex-1">
            <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
            <Input
              ref={inputRef}
              type="text"
              placeholder={conversationId ? t('search.placeholder') : t('search.globalPlaceholder')}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              className="pl-10"
            />
            {inputValue && (
              <button
                onClick={() => setInputValue('')}
                className="absolute top-1/2 right-3 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* Tabs */}
        {!conversationId && (
          <div className="flex border-b border-[var(--border-default)]">
            <button
              onClick={() => setActiveTab('messages')}
              className={cn(
                'flex flex-1 items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors',
                activeTab === 'messages'
                  ? 'border-primary-500 text-primary-500 border-b-2'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              )}
            >
              <MessageSquare className="h-4 w-4" />
              {t('search.messages')}
            </button>
            <button
              onClick={() => setActiveTab('contacts')}
              className={cn(
                'flex flex-1 items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors',
                activeTab === 'contacts'
                  ? 'border-primary-500 text-primary-500 border-b-2'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              )}
            >
              <User className="h-4 w-4" />
              {t('search.contacts')}
            </button>
          </div>
        )}

        {/* Filters (messages tab only) */}
        {activeTab === 'messages' && (
          <SearchFiltersBar filters={filters} onFiltersChange={handleFiltersChange} />
        )}

        {/* Results */}
        <ScrollArea className="min-h-0 flex-1 sm:max-h-96">
          {state.loading &&
          !(activeTab === 'messages' ? state.results.length : state.contacts.length) ? (
            <div className="flex items-center justify-center py-8">
              <div className="border-primary-500 h-6 w-6 animate-spin rounded-full border-2 border-t-transparent" />
            </div>
          ) : activeTab === 'messages' ? (
            state.results.length > 0 ? (
              <div className="py-2">
                <p className="px-4 py-2 text-xs text-[var(--text-muted)]">
                  {t('search.results', { count: state.total })}
                </p>
                {state.results.map((result) => (
                  <SearchResultItem
                    key={result.id}
                    result={result}
                    query={inputValue}
                    currentUserId={currentUserId}
                    onClick={() => handleSelectMessage(result)}
                  />
                ))}
              </div>
            ) : inputValue.trim() ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Search className="h-12 w-12 text-[var(--text-muted)]" />
                <p className="mt-3 font-medium text-[var(--text-primary)]">
                  {t('search.noMessages')}
                </p>
                <p className="mt-1 text-sm text-[var(--text-muted)]">{t('search.tryAgain')}</p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Search className="h-12 w-12 text-[var(--text-muted)]" />
                <p className="mt-3 font-medium text-[var(--text-primary)]">{t('search.start')}</p>
                <p className="mt-1 text-sm text-[var(--text-muted)]">{t('search.startHint')}</p>
              </div>
            )
          ) : state.contacts.length > 0 ? (
            <div className="py-2">
              {state.contacts.map((contact) => (
                <button
                  key={contact.id}
                  onClick={() => handleSelectContact(contact)}
                  className="flex w-full items-center gap-3 px-4 py-3 hover:bg-[var(--bg-hover)]"
                >
                  <Avatar user={contact} size="md" />
                  <div className="text-left">
                    <p className="font-medium text-[var(--text-primary)]">{contact.display_name}</p>
                    <p className="text-xs text-[var(--text-muted)]">@{contact.username}</p>
                  </div>
                </button>
              ))}
            </div>
          ) : inputValue.trim() ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <User className="h-12 w-12 text-[var(--text-muted)]" />
              <p className="mt-3 font-medium text-[var(--text-primary)]">
                {t('search.noContacts')}
              </p>
              <p className="mt-1 text-sm text-[var(--text-muted)]">{t('search.contactHint')}</p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <User className="h-12 w-12 text-[var(--text-muted)]" />
              <p className="mt-3 font-medium text-[var(--text-primary)]">
                {t('search.startContacts')}
              </p>
              <p className="mt-1 text-sm text-[var(--text-muted)]">
                {t('search.startContactsHint')}
              </p>
            </div>
          )}
        </ScrollArea>
      </div>
    </div>
  )
}
