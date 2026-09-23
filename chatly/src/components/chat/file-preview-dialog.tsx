'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Download, X } from 'lucide-react'
import { getMediaUrl } from '@/lib/supabase/storage'
import { MediaDownloadButton } from './media-download-button'

interface FilePreviewDialogProps {
  path: string
  name: string
  mimeType: string | null
  size: number | null
  onClose: () => void
}

type Preview =
  | { kind: 'pdf'; url: string }
  | { kind: 'text'; text: string }
  | { kind: 'sheet'; rows: string[][] }
  | { kind: 'unsupported' }

const MAX_PARSED_BYTES = 10 * 1024 * 1024
const MAX_SHEET_ROWS = 200
const MAX_SHEET_COLUMNS = 30

export function FilePreviewDialog({ path, name, mimeType, size, onClose }: FilePreviewDialogProps) {
  const [preview, setPreview] = useState<Preview | null>(null)
  const [error, setError] = useState(false)
  const extension = name.split('.').pop()?.toLowerCase()

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  useEffect(() => {
    let active = true
    let objectUrl: string | null = null
    const controller = new AbortController()

    async function load() {
      if (
        mimeType !== 'application/pdf' &&
        extension !== 'pdf' &&
        extension !== 'docx' &&
        extension !== 'xlsx' &&
        extension !== 'csv' &&
        extension !== 'txt'
      ) {
        setPreview({ kind: 'unsupported' })
        return
      }
      if (
        mimeType !== 'application/pdf' &&
        extension !== 'pdf' &&
        size &&
        size > MAX_PARSED_BYTES
      ) {
        setPreview({ kind: 'unsupported' })
        return
      }
      try {
        const signedUrl = await getMediaUrl(path)
        const response = await fetch(signedUrl, { signal: controller.signal })
        if (!response.ok) throw new Error('Preview download failed')
        const blob = await response.blob()
        if (!active) return
        if (mimeType !== 'application/pdf' && extension !== 'pdf' && blob.size > MAX_PARSED_BYTES) {
          setPreview({ kind: 'unsupported' })
        } else if (mimeType === 'application/pdf' || extension === 'pdf') {
          objectUrl = URL.createObjectURL(blob)
          setPreview({ kind: 'pdf', url: objectUrl })
        } else if (extension === 'docx') {
          const mammoth = await import('mammoth')
          const result = await mammoth.extractRawText({ arrayBuffer: await blob.arrayBuffer() })
          if (active) setPreview({ kind: 'text', text: result.value })
        } else if (extension === 'xlsx') {
          const { default: readXlsxFile } = await import('read-excel-file/browser')
          const [sheet] = await readXlsxFile(blob)
          const rows = sheet?.data ?? []
          if (active) {
            setPreview({
              kind: 'sheet',
              rows: rows
                .slice(0, MAX_SHEET_ROWS)
                .map((row) => row.slice(0, MAX_SHEET_COLUMNS).map((cell) => String(cell ?? ''))),
            })
          }
        } else {
          const text = await blob.text()
          if (active) setPreview({ kind: 'text', text: text.slice(0, 200_000) })
        }
      } catch {
        if (active) setError(true)
      }
    }

    void load()
    return () => {
      active = false
      controller.abort()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [path, mimeType, extension, size])

  if (typeof document === 'undefined') return null

  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 p-2 sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-label={`Xem trước ${name}`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="flex h-[min(90vh,900px)] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-[var(--bg-panel)]">
        <header className="flex min-w-0 items-center gap-2 border-b border-[var(--border-default)] p-3 sm:p-4">
          <h2 className="min-w-0 flex-1 truncate font-semibold" title={name}>
            {name}
          </h2>
          <MediaDownloadButton path={path} filename={name} />
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="rounded-lg p-2 hover:bg-[var(--bg-hover)]"
          >
            <X className="h-5 w-5" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-auto p-3 sm:p-5">
          {error ? (
            <p role="alert">Không thể mở bản xem trước. Bạn vẫn có thể tải tệp xuống.</p>
          ) : !preview ? (
            <div className="flex h-full items-center justify-center" aria-busy="true">
              Đang mở tệp…
            </div>
          ) : preview.kind === 'pdf' ? (
            <iframe src={preview.url} title={name} className="h-full w-full rounded-lg bg-white" />
          ) : preview.kind === 'text' ? (
            <pre className="font-sans text-sm leading-6 break-words whitespace-pre-wrap">
              {preview.text || 'Tệp trống'}
            </pre>
          ) : preview.kind === 'sheet' ? (
            <div className="overflow-auto rounded-lg border border-[var(--border-default)]">
              <table className="w-full border-collapse text-left text-sm">
                <tbody>
                  {preview.rows.map((row, rowIndex) => (
                    <tr key={rowIndex}>
                      {row.map((cell, columnIndex) => (
                        <td
                          key={columnIndex}
                          className="min-w-24 border border-[var(--border-default)] p-2 align-top"
                        >
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
              <Download className="h-8 w-8 text-[var(--text-muted)]" />
              <p>Định dạng này chưa hỗ trợ xem trực tiếp. Vui lòng tải tệp xuống để mở.</p>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
