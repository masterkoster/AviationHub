'use client'

import { useState } from 'react'
import {
  File,
  FileImage,
  FileText,
  FileSpreadsheet,
  Trash2,
  Download,
  Loader2,
  Eye,
} from 'lucide-react'
import { type DocumentRecord, formatFileSize, fileIconFromMime } from '@/desktop/lib/document-store'
import { ConfirmDialog } from '@/desktop/components/confirm-dialog'
import { notifyDeleted } from '@/desktop/lib/toast-helpers'

interface DocumentGridProps {
  documents: DocumentRecord[]
  onDelete?: (doc: DocumentRecord) => Promise<void>
  onPreview?: (doc: DocumentRecord) => void
  loading?: boolean
  emptyMessage?: string
}

function DocIcon({ mime, className }: { mime: string; className?: string }) {
  const icon = fileIconFromMime(mime)
  switch (icon) {
    case 'image':
      return <FileImage className={className || 'h-5 w-5'} />
    case 'pdf':
      return <FileText className={className || 'h-5 w-5 text-destructive'} />
    case 'spreadsheet':
      return <FileSpreadsheet className={className || 'h-5 w-5 text-emerald-500'} />
    default:
      return <File className={className || 'h-5 w-5'} />
  }
}

export function DocumentGrid({ documents, onDelete, onPreview, loading, emptyMessage }: DocumentGridProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<DocumentRecord | null>(null)

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Loading documents...
      </div>
    )
  }

  if (documents.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        {emptyMessage || 'No documents yet'}
      </div>
    )
  }

  function openDeleteDialog(doc: DocumentRecord) {
    setDeleteTarget(doc)
  }

  function closeDeleteDialog() {
    setDeleteTarget(null)
  }

  async function handleConfirmDelete() {
    const doc = deleteTarget
    if (!doc || !onDelete) return
    setDeletingId(doc.id)
    try {
      await onDelete(doc)
      notifyDeleted('Document')
    } finally {
      setDeletingId(null)
      setDeleteTarget(null)
    }
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {documents.map((doc) => (
          <div
            key={doc.id}
            className="group relative flex flex-col items-center gap-1.5 rounded-lg border border-border bg-card p-3 transition-all hover:border-primary/50 hover:shadow-sm"
          >
            {/* Thumbnail for images */}
            {doc.mime_type.startsWith('image/') ? (
              <div className="flex h-20 w-full items-center justify-center overflow-hidden rounded-md bg-muted/30">
                <DocIcon mime={doc.mime_type} className="h-8 w-8 text-muted-foreground/50" />
              </div>
            ) : (
              <div className="flex h-20 w-full items-center justify-center rounded-md bg-muted/30">
                <DocIcon mime={doc.mime_type} className="h-8 w-8" />
              </div>
            )}

            <p className="w-full truncate text-center text-xs font-medium" title={doc.file_name}>
              {doc.file_name}
            </p>
            <p className="text-[10px] text-muted-foreground">{formatFileSize(doc.file_size)}</p>

            {/* Hover actions */}
            <div className="absolute inset-0 flex items-center justify-center gap-1.5 rounded-lg bg-background/80 opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100">
              {onPreview && (
                <button
                  onClick={() => onPreview(doc)}
                  aria-label={`View ${doc.file_name}`}
                  className="flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground hover:bg-primary/90"
                >
                  <Eye className="h-3 w-3" /> View
                </button>
              )}
              <button
                onClick={() => {
                  const a = document.createElement('a')
                  a.href = `tauri://localhost/${doc.storage_path}`
                  a.download = doc.file_name
                  a.click()
                }}
                aria-label={`Download ${doc.file_name}`}
                className="rounded-md border border-border bg-card p-1 text-muted-foreground hover:bg-muted"
                title="Download"
              >
                <Download className="h-3.5 w-3.5" />
              </button>
              {onDelete && (
                <button
                  onClick={() => openDeleteDialog(doc)}
                  disabled={deletingId === doc.id}
                  aria-label={`Delete ${doc.file_name}`}
                  className="rounded-md border border-border bg-card p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                  title="Delete"
                >
                  {deletingId === doc.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) closeDeleteDialog()
        }}
        onConfirm={handleConfirmDelete}
        title="Delete document?"
        description={`Are you sure you want to delete "${deleteTarget?.file_name}"? This action cannot be undone.`}
        loading={deletingId !== null}
      />
    </>
  )
}
