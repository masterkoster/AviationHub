'use client'

import { useState, useRef } from 'react'
import { Upload, X, Loader2, FileWarning } from 'lucide-react'
import { validateFile } from '@/desktop/lib/document-store'

interface DocumentUploaderProps {
  onUpload: (file: File) => Promise<void>
  accept?: string
  maxSizeMB?: number
}

export function DocumentUploader({ onUpload, accept, maxSizeMB = 10 }: DocumentUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleFile(file: File) {
    setError(null)

    const mime = file.type || 'application/octet-stream'
    const err = validateFile(file.name, mime, file.size)
    if (err) {
      setError(err)
      return
    }

    if (file.size > maxSizeMB * 1024 * 1024) {
      setError(`File exceeds ${maxSizeMB} MB limit`)
      return
    }

    setUploading(true)
    try {
      await onUpload(file)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    e.target.value = ''
  }

  return (
    <div>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed p-6 text-sm transition-colors ${
          dragOver
            ? 'border-primary bg-primary/5 text-primary'
            : 'border-border bg-muted/20 text-muted-foreground hover:border-primary/50 hover:text-foreground'
        }`}
      >
        {uploading ? (
          <Loader2 className="h-6 w-6 animate-spin" />
        ) : (
          <Upload className="h-6 w-6" />
        )}
        <span className="font-medium">
          {uploading ? 'Uploading...' : 'Drop a file here or click to browse'}
        </span>
        <span className="text-[11px]">
          Photos, PDFs, documents — up to {maxSizeMB} MB
        </span>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={accept || '.jpg,.jpeg,.png,.gif,.webp,.heic,.pdf,.doc,.docx,.xlsx,.csv'}
        className="hidden"
        onChange={handleChange}
      />
      {error && (
        <div className="mt-2 flex items-start gap-1.5 rounded-md bg-destructive/10 p-2 text-xs text-destructive">
          <FileWarning className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {error}
        </div>
      )}
    </div>
  )
}
