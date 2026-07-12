'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbSeparator,
  BreadcrumbPage,
} from '@/components/ui/breadcrumb'
import { useDesktopAuth } from '@/desktop/hooks/use-desktop-auth'
import { getAgendaItemById, type AgendaItem } from '@/apps/desktop/src/lib/local-agenda'
import { DocumentUploader } from '@/desktop/components/document-uploader'
import { DocumentGrid } from '@/desktop/components/document-grid'
import {
  getDocuments,
  saveDocument,
  deleteDocument,
  type DocumentRecord,
} from '@/desktop/lib/document-store'

export default function CalendarItemDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { mode, localUser, cloudUser } = useDesktopAuth()
  const [item, setItem] = useState<AgendaItem | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [docs, setDocs] = useState<DocumentRecord[]>([])
  const [docsLoading, setDocsLoading] = useState(false)

  const userId = mode === 'local' ? localUser?.id : (cloudUser?.id || 'cloud-default')

  useEffect(() => {
    async function load() {
      if (!userId || !id) return
      const row = await getAgendaItemById(userId, id)
      setItem(row)
      setLoaded(true)
    }
    load()
  }, [userId, id])

  // Load documents for this agenda item
  useEffect(() => {
    if (!item || !userId) return
    loadDocs()
  }, [item, userId])

  async function loadDocs() {
    if (!userId || !id) return
    setDocsLoading(true)
    try {
      const result = await getDocuments('flight', id)
      setDocs(result)
    } finally {
      setDocsLoading(false)
    }
  }

  async function handleUpload(file: File) {
    if (!userId) return
    const buf = await file.arrayBuffer()
    const bytes = new Uint8Array(buf)
    await saveDocument(userId, 'flight', id, file.name, bytes, file.type || 'application/octet-stream')
    await loadDocs()
  }

  async function handleDelete(doc: DocumentRecord) {
    await deleteDocument(doc.id)
    await loadDocs()
  }

  if (!loaded) {
    return <div className="mx-auto max-w-3xl p-6 text-sm text-muted-foreground">Loading item...</div>
  }

  if (!item) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <button onClick={() => router.back()} className="mb-4 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-lg font-semibold">Item not found</p>
          <p className="mt-1 text-sm text-muted-foreground">This calendar item does not exist or has been deleted.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl p-6">
      <Breadcrumb className="mb-4">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/desktop/calendar">Calendar</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{item.title}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <button onClick={() => router.back()} className="mb-4 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back
      </button>
      <h1 className="text-2xl font-bold">{item.title}</h1>
      <p className="mt-1 text-xs text-muted-foreground">{item.itemType} • {item.status}</p>

      <div className="mt-4 rounded-lg border border-border bg-card p-4">
        <p className="text-sm whitespace-pre-wrap">{item.details || 'No details'}</p>
        <p className="mt-3 text-xs text-muted-foreground">{formatWhen(item.startsAt || item.dueAt)}</p>
      </div>

      <div className="mt-4 flex gap-2">
        <Link href={`/desktop/calendar/${item.id}/edit`} className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted">
          Edit
        </Link>
        {item.relatedHref && (
          <Link href={item.relatedHref} className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            Open Related
          </Link>
        )}
      </div>

      {/* Documents */}
      <div className="mt-6">
        <h2 className="text-sm font-semibold mb-3">Attachments</h2>
        <div className="mb-4 max-w-md">
          <DocumentUploader onUpload={handleUpload} />
        </div>
        <DocumentGrid
          documents={docs}
          onDelete={handleDelete}
          loading={docsLoading}
          emptyMessage="No attachments for this item yet."
        />
      </div>
    </div>
  )
}

function formatWhen(value: string | null): string {
  if (!value) return 'No date set'
  const d = new Date(value)
  if (isNaN(d.getTime())) return 'No date set'
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}
