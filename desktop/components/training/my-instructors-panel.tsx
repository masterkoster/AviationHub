'use client'

import { useMemo, useState } from 'react'
import { Loader2, UserPlus, Check, X, GraduationCap, FileSignature } from 'lucide-react'
import {
  cloudApi,
  type TrainingRelationship,
  type EndorsementTemplate,
} from '@/apps/desktop/src/lib/cloud-api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { notifyError, notifyCreated } from '@/desktop/lib/toast-helpers'

interface Props {
  relationships: TrainingRelationship[]
  templates: EndorsementTemplate[]
  loading: boolean
  error: string | null
  onRefresh: () => void
}

const STATUS_LABEL: Record<TrainingRelationship['status'], string> = {
  pending: 'Pending',
  active: 'Active',
  declined: 'Declined',
  ended: 'Ended',
}

export default function MyInstructorsPanel({ relationships, templates, loading, error, onRefresh }: Props) {
  const studentRels = useMemo(
    () => relationships.filter((r) => r.myRole === 'student' && r.status !== 'declined' && r.status !== 'ended'),
    [relationships]
  )
  const activeInstructors = useMemo(() => studentRels.filter((r) => r.status === 'active'), [studentRels])

  const [respondingId, setRespondingId] = useState<string | null>(null)
  const [addUsername, setAddUsername] = useState('')
  const [addGoal, setAddGoal] = useState('')
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  const [requestFor, setRequestFor] = useState<TrainingRelationship | null>(null)

  async function respond(id: string, action: 'accept' | 'decline') {
    setRespondingId(id)
    try {
      await cloudApi.respondTrainingRelationship(id, action)
      onRefresh()
    } catch (err) {
      notifyError('Training request', err instanceof Error ? err.message : 'Failed to respond')
    } finally {
      setRespondingId(null)
    }
  }

  async function handleRequestInstructor(e: React.FormEvent) {
    e.preventDefault()
    const username = addUsername.trim()
    if (!username) return
    setAdding(true)
    setAddError(null)
    try {
      await cloudApi.createTrainingRelationship({
        counterpartUsername: username,
        myRole: 'student',
        goal: addGoal.trim() || undefined,
      })
      notifyCreated('Instructor request')
      setAddUsername('')
      setAddGoal('')
      onRefresh()
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Failed to request instructor')
    } finally {
      setAdding(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-border bg-card p-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <GraduationCap className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">My Instructors</h3>
      </div>

      <div className="space-y-5 p-4">
        {error && <p className="text-sm text-destructive">{error}</p>}

        {/* Request an instructor */}
        <form onSubmit={handleRequestInstructor} className="flex flex-wrap items-end gap-2">
          <div className="min-w-[160px] flex-1">
            <Label htmlFor="request-instructor-username" className="mb-1.5">Request an instructor (username)</Label>
            <Input
              id="request-instructor-username"
              value={addUsername}
              onChange={(e) => setAddUsername(e.target.value)}
              placeholder="cfi_jane"
              autoComplete="off"
            />
          </div>
          <div className="min-w-[160px] flex-1">
            <Label htmlFor="request-instructor-goal" className="mb-1.5">
              Goal <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="request-instructor-goal"
              value={addGoal}
              onChange={(e) => setAddGoal(e.target.value)}
              placeholder="e.g. Instrument Rating"
            />
          </div>
          <Button type="submit" disabled={adding || !addUsername.trim()}>
            {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            Request
          </Button>
        </form>
        {addError && <p className="text-sm text-destructive">{addError}</p>}

        {/* Relationships list */}
        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground">Instructors</p>
          {studentRels.length === 0 ? (
            <p className="text-sm text-muted-foreground">You&apos;re not enrolled with an instructor yet.</p>
          ) : (
            <div className="space-y-2">
              {studentRels.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2"
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {r.counterpart.name || r.counterpart.username || 'Unknown instructor'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {STATUS_LABEL[r.status]}
                      {r.goal ? ` · ${r.goal}` : ''}
                    </p>
                  </div>
                  <div className="flex gap-1.5">
                    {r.status === 'pending' && r.canRespond && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={respondingId === r.id}
                          onClick={() => respond(r.id, 'accept')}
                        >
                          <Check className="h-3.5 w-3.5" />
                          Accept
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={respondingId === r.id}
                          onClick={() => respond(r.id, 'decline')}
                        >
                          <X className="h-3.5 w-3.5" />
                          Decline
                        </Button>
                      </>
                    )}
                    {r.status === 'active' && (
                      <Button size="sm" variant="outline" onClick={() => setRequestFor(r)}>
                        <FileSignature className="h-3.5 w-3.5" />
                        Request endorsement
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <RequestEndorsementDialog
        instructor={requestFor}
        templates={templates}
        open={!!requestFor}
        onOpenChange={(open) => { if (!open) setRequestFor(null) }}
        onRequested={() => {
          setRequestFor(null)
          onRefresh()
        }}
      />
    </div>
  )
}

function RequestEndorsementDialog({
  instructor,
  templates,
  open,
  onOpenChange,
  onRequested,
}: {
  instructor: TrainingRelationship | null
  templates: EndorsementTemplate[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onRequested: () => void
}) {
  const [templateId, setTemplateId] = useState<string>('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  async function handleSubmit() {
    if (!instructor) return
    setSubmitting(true)
    setFormError(null)
    try {
      await cloudApi.createEndorsementRequest({
        instructorId: instructor.counterpart.userId,
        templateId: templateId || undefined,
        message: message.trim() || undefined,
      })
      notifyCreated('Endorsement request')
      setTemplateId('')
      setMessage('')
      onRequested()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to request endorsement')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setTemplateId('')
          setMessage('')
          setFormError(null)
        }
        onOpenChange(next)
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Request an endorsement</DialogTitle>
          <DialogDescription>
            Ask {instructor?.counterpart.name || instructor?.counterpart.username || 'your instructor'} to sign an
            endorsement.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label htmlFor="request-endorsement-template" className="mb-1.5">
              Endorsement <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Select value={templateId || undefined} onValueChange={setTemplateId}>
              <SelectTrigger id="request-endorsement-template" className="w-full">
                <SelectValue placeholder="Choose an endorsement…" />
              </SelectTrigger>
              <SelectContent>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.authority ? `[${t.authority}] ` : ''}
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="request-endorsement-message" className="mb-1.5">
              Message <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="request-endorsement-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="e.g. Ready for solo cross-country"
            />
          </div>
        </div>

        {formError && <p className="text-sm text-destructive">{formError}</p>}

        <DialogFooter>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSignature className="h-4 w-4" />}
            {submitting ? 'Sending…' : 'Send request'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
