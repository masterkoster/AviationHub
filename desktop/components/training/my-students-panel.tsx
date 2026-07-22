'use client'

import { useMemo, useState } from 'react'
import { Loader2, UserPlus, Check, X, PenLine, Users } from 'lucide-react'
import {
  cloudApi,
  type TrainingRelationship,
  type EndorsementRequestRow,
  type EndorsementTemplate,
} from '@/apps/desktop/src/lib/cloud-api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { notifyError, notifyCreated } from '@/desktop/lib/toast-helpers'
import { toast } from '@/components/ui/use-toast'
import SignaturePad, { type SignatureValue } from '@/desktop/components/training/signature-pad'

interface Props {
  myUserId: string
  relationships: TrainingRelationship[]
  endorsementRequests: EndorsementRequestRow[]
  templates: EndorsementTemplate[]
  loading: boolean
  error: string | null
  onRefresh: () => void
}

export default function MyStudentsPanel({
  myUserId,
  relationships,
  endorsementRequests,
  templates,
  loading,
  error,
  onRefresh,
}: Props) {
  const instructorRels = useMemo(
    () => relationships.filter((r) => r.myRole === 'instructor'),
    [relationships]
  )
  const pendingIncoming = useMemo(
    () => instructorRels.filter((r) => r.status === 'pending' && r.canRespond),
    [instructorRels]
  )
  const activeStudents = useMemo(
    () => instructorRels.filter((r) => r.status === 'active'),
    [instructorRels]
  )
  const studentNameById = useMemo(() => {
    const map = new Map<string, { name: string | null; username: string | null }>()
    for (const r of instructorRels) {
      map.set(r.counterpart.userId, { name: r.counterpart.name, username: r.counterpart.username })
    }
    return map
  }, [instructorRels])

  const pendingSignRequests = useMemo(
    () => endorsementRequests.filter((r) => r.instructorId === myUserId && r.status === 'pending'),
    [endorsementRequests, myUserId]
  )

  const [respondingId, setRespondingId] = useState<string | null>(null)
  const [signRequest, setSignRequest] = useState<EndorsementRequestRow | null>(null)
  const [addUsername, setAddUsername] = useState('')
  const [addGoal, setAddGoal] = useState('')
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

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

  async function handleAddStudent(e: React.FormEvent) {
    e.preventDefault()
    const username = addUsername.trim()
    if (!username) return
    setAdding(true)
    setAddError(null)
    try {
      await cloudApi.createTrainingRelationship({
        counterpartUsername: username,
        myRole: 'instructor',
        goal: addGoal.trim() || undefined,
      })
      notifyCreated('Student invite')
      setAddUsername('')
      setAddGoal('')
      onRefresh()
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Failed to invite student')
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
        <Users className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">My Students</h3>
      </div>

      <div className="space-y-5 p-4">
        {error && <p className="text-sm text-destructive">{error}</p>}

        {/* Add a student */}
        <form onSubmit={handleAddStudent} className="flex flex-wrap items-end gap-2">
          <div className="min-w-[160px] flex-1">
            <Label htmlFor="add-student-username" className="mb-1.5">Add a student (username)</Label>
            <Input
              id="add-student-username"
              value={addUsername}
              onChange={(e) => setAddUsername(e.target.value)}
              placeholder="jsmith"
              autoComplete="off"
            />
          </div>
          <div className="min-w-[160px] flex-1">
            <Label htmlFor="add-student-goal" className="mb-1.5">
              Goal <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="add-student-goal"
              value={addGoal}
              onChange={(e) => setAddGoal(e.target.value)}
              placeholder="e.g. Private Pilot"
            />
          </div>
          <Button type="submit" disabled={adding || !addUsername.trim()}>
            {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            Invite
          </Button>
        </form>
        {addError && <p className="text-sm text-destructive">{addError}</p>}

        {/* Pending incoming requests */}
        {pendingIncoming.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">Pending requests</p>
            <div className="space-y-2">
              {pendingIncoming.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2"
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {r.counterpart.name || r.counterpart.username || 'Unknown pilot'}
                    </p>
                    {r.goal && <p className="text-xs text-muted-foreground">{r.goal}</p>}
                  </div>
                  <div className="flex gap-1.5">
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
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Active roster */}
        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground">Active students</p>
          {activeStudents.length === 0 ? (
            <p className="text-sm text-muted-foreground">No students yet.</p>
          ) : (
            <div className="space-y-2">
              {activeStudents.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2"
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {r.counterpart.name || r.counterpart.username || 'Unknown pilot'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {r.counterpart.username ? `@${r.counterpart.username}` : ''}
                      {r.goal ? ` · ${r.goal}` : ''}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pending endorsement requests to sign */}
        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground">Endorsement requests</p>
          {pendingSignRequests.length === 0 ? (
            <p className="text-sm text-muted-foreground">No endorsement requests waiting on your signature.</p>
          ) : (
            <div className="space-y-2">
              {pendingSignRequests.map((req) => {
                const student = studentNameById.get(req.studentId)
                return (
                  <div
                    key={req.id}
                    className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2"
                  >
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {student?.name || student?.username || 'A student'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {req.template?.name || 'Endorsement request'}
                        {req.message ? ` — "${req.message}"` : ''}
                      </p>
                    </div>
                    <Button size="sm" onClick={() => setSignRequest(req)}>
                      <PenLine className="h-3.5 w-3.5" />
                      Review &amp; sign
                    </Button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <SignEndorsementDialog
        request={signRequest}
        student={signRequest ? studentNameById.get(signRequest.studentId) ?? null : null}
        templates={templates}
        open={!!signRequest}
        onOpenChange={(open) => { if (!open) setSignRequest(null) }}
        onSigned={() => {
          setSignRequest(null)
          onRefresh()
        }}
      />
    </div>
  )
}

function SignEndorsementDialog({
  request,
  student,
  templates,
  open,
  onOpenChange,
  onSigned,
}: {
  request: EndorsementRequestRow | null
  student: { name: string | null; username: string | null } | null
  templates: EndorsementTemplate[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onSigned: () => void
}) {
  const [signature, setSignature] = useState<SignatureValue | null>(null)
  const [certNumber, setCertNumber] = useState('')
  const [notes, setNotes] = useState('')
  const [signing, setSigning] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const template = request?.templateId ? templates.find((t) => t.id === request.templateId) : null

  async function handleSign() {
    if (!request || !signature) return
    setSigning(true)
    setFormError(null)
    try {
      await cloudApi.signEndorsement({
        templateId: request.templateId || template?.id || '',
        studentId: request.studentId,
        type: signature.type,
        svgData: signature.svgData,
        typedName: signature.typedName,
        certNumber: certNumber.trim() || undefined,
        notes: notes.trim() || undefined,
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
      })
      await cloudApi.updateEndorsementRequest(request.id, 'approved')
      toast({ title: 'Endorsement signed', description: 'The signed endorsement has been recorded.' })
      onSigned()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to sign endorsement')
    } finally {
      setSigning(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setSignature(null)
          setCertNumber('')
          setNotes('')
          setFormError(null)
        }
        onOpenChange(next)
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Sign endorsement</DialogTitle>
          <DialogDescription>
            {student?.name || student?.username || 'This student'} is requesting{' '}
            {template?.name || 'an endorsement'}.
          </DialogDescription>
        </DialogHeader>

        {template?.text && (
          <div className="max-h-32 overflow-y-auto rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
            {template.text}
          </div>
        )}

        <div className="space-y-3">
          <div>
            <Label className="mb-1.5">Signature</Label>
            <SignaturePad onChange={setSignature} disabled={signing} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="sign-cert-number" className="mb-1.5">
                Certificate # <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="sign-cert-number"
                value={certNumber}
                onChange={(e) => setCertNumber(e.target.value)}
                placeholder="e.g. 1234567CFI"
              />
            </div>
            <div>
              <Label htmlFor="sign-notes" className="mb-1.5">
                Notes <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="sign-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional notes"
              />
            </div>
          </div>
        </div>

        {formError && <p className="text-sm text-destructive">{formError}</p>}

        <DialogFooter>
          <Button onClick={handleSign} disabled={!signature || signing}>
            {signing ? <Loader2 className="h-4 w-4 animate-spin" /> : <PenLine className="h-4 w-4" />}
            {signing ? 'Signing…' : 'Sign endorsement'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
