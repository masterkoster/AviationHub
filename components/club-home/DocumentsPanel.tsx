'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Loader2, FileText, Download, Trash2, Upload, X } from 'lucide-react'
import type { DocumentMeta } from './types'
import { formatDate, formatFileSize } from './utils'

interface DocumentsPanelProps {
  groupId: string
  documents: DocumentMeta[]
  loading: boolean
  error: string | null
  canManage: boolean
  currentUserId: string | null
  setDocuments: React.Dispatch<React.SetStateAction<DocumentMeta[]>>
}

function categoryLabel(category: string) {
  return category.charAt(0).toUpperCase() + category.slice(1)
}

export function DocumentsPanel({ groupId, documents, loading, error, canManage, currentUserId, setDocuments }: DocumentsPanelProps) {
  const [showUpload, setShowUpload] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('general')
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  async function handleUpload() {
    if (!file) return
    setUploading(true)
    setUploadError(null)
    try {
      const formData = new FormData()
      formData.append('file', file)
      if (name.trim()) formData.append('name', name.trim())
      if (description.trim()) formData.append('description', description.trim())
      formData.append('category', category)

      const res = await fetch(`/api/groups/${groupId}/documents`, { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) {
        setUploadError(data.error || 'Failed to upload document')
        return
      }
      setDocuments(prev => [data, ...prev])
      setFile(null)
      setName('')
      setDescription('')
      setCategory('general')
      setShowUpload(false)
    } catch {
      setUploadError('Network error')
    } finally {
      setUploading(false)
    }
  }

  async function handleDelete(doc: DocumentMeta) {
    setBusyId(doc.id)
    try {
      const res = await fetch(`/api/groups/${groupId}/documents/${doc.id}`, { method: 'DELETE' })
      if (!res.ok) return
      setDocuments(prev => prev.filter(d => d.id !== doc.id))
    } finally {
      setBusyId(null)
    }
  }

  const grouped = documents.reduce<Record<string, DocumentMeta[]>>((acc, doc) => {
    const key = doc.category || 'general'
    if (!acc[key]) acc[key] = []
    acc[key].push(doc)
    return acc
  }, {})
  const categories = Object.keys(grouped).sort()

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <CardTitle>Documents</CardTitle>
          </div>
          {canManage && (
            <Button size="sm" variant={showUpload ? 'outline' : 'default'} onClick={() => setShowUpload(v => !v)}>
              {showUpload ? <><X className="mr-2 h-4 w-4" />Cancel</> : <><Upload className="mr-2 h-4 w-4" />Upload</>}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {showUpload && canManage && (
          <div className="space-y-3 rounded-lg border border-border p-4">
            <input
              type="file"
              className="w-full text-sm"
              onChange={e => setFile(e.target.files?.[0] || null)}
            />
            <input
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Display name (optional)"
              value={name}
              onChange={e => setName(e.target.value)}
            />
            <input
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Description (optional)"
              value={description}
              onChange={e => setDescription(e.target.value)}
            />
            <select
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={category}
              onChange={e => setCategory(e.target.value)}
            >
              <option value="general">General</option>
              <option value="bylaws">Bylaws</option>
              <option value="insurance">Insurance</option>
              <option value="checklists">Checklists</option>
              <option value="forms">Forms</option>
              <option value="minutes">Meeting Minutes</option>
            </select>
            <div className="flex justify-end">
              <Button size="sm" onClick={handleUpload} disabled={uploading || !file}>
                {uploading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Uploading…</> : 'Upload Document'}
              </Button>
            </div>
            {uploadError && <p className="text-sm text-destructive">{uploadError}</p>}
          </div>
        )}

        {loading && <p className="text-sm text-muted-foreground">Loading documents…</p>}
        {error && <p className="text-sm text-destructive">{error}</p>}
        {!loading && !error && documents.length === 0 && (
          <p className="text-sm text-muted-foreground">No documents yet.</p>
        )}

        <div className="space-y-4">
          {categories.map(cat => (
            <div key={cat} className="space-y-2">
              <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wide">{categoryLabel(cat)}</p>
              <div className="space-y-2">
                {grouped[cat].map(doc => {
                  const canDelete = canManage || doc.uploadedBy?.id === currentUserId
                  return (
                    <div key={doc.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                      <div className="space-y-0.5 min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{doc.name}</p>
                        {doc.description && <p className="text-xs text-muted-foreground truncate">{doc.description}</p>}
                        <p className="text-xs text-muted-foreground">
                          {formatFileSize(doc.fileSize)} · {formatDate(doc.createdAt)}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <a href={`/api/groups/${groupId}/documents/${doc.id}`} download>
                          <Button size="icon" variant="ghost" className="h-7 w-7" title="Download">
                            <Download className="h-3.5 w-3.5" />
                          </Button>
                        </a>
                        {canDelete && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            disabled={busyId === doc.id}
                            onClick={() => handleDelete(doc)}
                            title="Delete"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
