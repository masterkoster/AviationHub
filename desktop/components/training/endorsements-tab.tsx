'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, FileSignature, Award } from 'lucide-react'
import { cloudApi, type EndorsementRecord } from '@/apps/desktop/src/lib/cloud-api'
import { ErrorCard } from '@/desktop/components/error-card'

function formatDate(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export default function EndorsementsTab() {
  const [records, setRecords] = useState<EndorsementRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await cloudApi.listEndorsements()
      setRecords(res.endorsements)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load endorsements')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-border bg-card p-10">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return <ErrorCard message={error} onRetry={load} />
  }

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Award className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Endorsements</h3>
      </div>

      {records.length === 0 ? (
        <div className="p-12 text-center">
          <FileSignature className="mx-auto h-8 w-8 text-muted-foreground/50" />
          <p className="mt-3 text-sm font-medium text-foreground">No endorsements yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Signed endorsements you issue or receive will appear here.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {records.map((rec) => {
            const title = rec.template?.title || rec.template?.code || 'Endorsement'
            // As a student, the counterpart signing is the instructor;
            // as an instructor, the counterpart is the student.
            const counterpart =
              rec.myRole === 'student'
                ? rec.instructorName || 'Instructor'
                : rec.studentName || 'Student'
            const counterpartLabel = rec.myRole === 'student' ? 'Signed by' : 'Issued to'
            return (
              <li key={rec.id} className="flex items-start justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{title}</p>
                  <p className="text-xs text-muted-foreground">
                    {counterpartLabel} {counterpart}
                    {rec.notes ? ` — ${rec.notes}` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="text-xs text-muted-foreground">{formatDate(rec.signedAt)}</span>
                  <span
                    className={
                      'rounded-full px-2 py-0.5 text-[10px] font-medium ' +
                      (rec.myRole === 'instructor'
                        ? 'bg-primary/10 text-primary'
                        : 'bg-muted text-muted-foreground')
                    }
                  >
                    {rec.myRole === 'instructor' ? 'Issued' : 'Received'}
                  </span>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
