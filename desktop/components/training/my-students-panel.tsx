'use client'

import { useEffect, useMemo, useState } from 'react'
import { Loader2, UserPlus, Check, X, PenLine, Users, ChevronRight } from 'lucide-react'
import {
  cloudApi,
  type TrainingRelationship,
  type EndorsementRequestRow,
  type EndorsementTemplate,
} from '@/apps/desktop/src/lib/cloud-api'
import { cn } from '@/lib/utils'
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
  // Map studentId -> count of pending sign requests, for the master list badge.
  const pendingByStudent = useMemo(() => {
    const map = new Map<string, number>()
    for (const req of pendingSignRequests) {
      map.set(req.studentId, (map.get(req.studentId) || 0) + 1)
    }
    return map
  }, [pendingSignRequests])

  const [respondingId, setRespondingId] = useState<string | null>(null)
  const [signRequest, setSignRequest] = useState<EndorsementRequestRow | null>(null)
  const [addUsername, setAddUsername] = useState('')
  const [addGoal, setAddGoal] = useState('')
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null)

  // Keep the selection valid as the roster changes (e.g. after a refresh).
  useEffect(() => {
    if (selectedStudentId && !activeStudents.some((r) => r.counterpart.userId === selectedStudentId)) {
      setSelectedStudentId(null)
    }
  }, [activeStudents, selectedStudentId])

  const selectedRel = useMemo(
    () => activeStudents.find((r) => r.counterpart.userId === selectedStudentId) ?? null,
    [activeStudents, selectedStudentId]
  )
  const selectedRequests = useMemo(
    () => (selectedStudentId ? pendingSignRequests.filter((r) => r.studentId === selectedStudentId) : []),
    [pendingSignRequests, selectedStudentId]
  )

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

        {/* ── Master–detail: active roster (left) + selected student (right) ── */}
        {activeStudents.length === 0 ? (
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">Active students</p>
            <p className="text-sm text-muted-foreground">No students yet.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4 lg:flex-row">
            {/* Master list */}
            <div className="shrink-0 lg:w-[220px]">
              <p className="mb-2 text-xs font-medium text-muted-foreground">
                Active students ({activeStudents.length})
              </p>
              <ul className="space-y-1">
                {activeStudents.map((r) => {
                  const active = r.counterpart.userId === selectedStudentId
                  const pending = pendingByStudent.get(r.counterpart.userId) || 0
                  return (
                    <li key={r.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedStudentId(r.counterpart.userId)}
                        className={cn(
                          'flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left transition-colors',
                          active
                            ? 'border-primary/40 bg-primary/10'
                            : 'border-border bg-background hover:bg-muted'
                        )}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-foreground">
                            {r.counterpart.name || r.counterpart.username || 'Unknown pilot'}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {r.counterpart.username ? `@${r.counterpart.username}` : ''}
                            {r.goal ? ` · ${r.goal}` : ''}
                          </p>
                        </div>
                        {pending > 0 && (
                          <span className="shrink-0 rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                            {pending}
                          </span>
                        )}
                        <ChevronRight
                          className={cn(
                            'h-3.5 w-3.5 shrink-0',
                            active ? 'text-primary' : 'text-muted-foreground/50'
                          )}
                        />
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>

            {/* Detail pane */}
            <div className="min-w-0 flex-1 rounded-lg border border-border bg-background/50 p-4">
              {!selectedRel ? (
                <div className="flex h-full min-h-[140px] flex-col items-center justify-center text-center">
                  <Users className="h-6 w-6 text-muted-foreground/40" />
                  <p className="mt-2 text-sm font-medium text-foreground">Select a student</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Choose a student to view their details and endorsement requests.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Detail header */}
                  <div>
                    <p className="text-base font-semibold text-foreground">
                      {selectedRel.counterpart.name || selectedRel.counterpart.username || 'Unknown pilot'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {selectedRel.counterpart.username ? `@${selectedRel.counterpart.username}` : ''}
                      {selectedRel.goal ? ` · ${selectedRel.goal}` : ''}
                    </p>
                  </div>

                  {/* Endorsement requests to sign, scoped to this student */}
                  <div>
                    <p className="mb-2 text-xs font-medium text-muted-foreground">
                      Endorsement requests
                    </p>
                    {selectedRequests.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No endorsement requests waiting on your signature.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {selectedRequests.map((req) => (
                          <div
                            key={req.id}
                            className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-foreground">
                                {req.template?.name || 'Endorsement request'}
                              </p>
                              {req.message && (
                                <p className="truncate text-xs text-muted-foreground">
                                  &ldquo;{req.message}&rdquo;
                                </p>
                              )}
                            </div>
                            <Button size="sm" onClick={() => setSignRequest(req)}>
                              <PenLine className="h-3.5 w-3.5" />
                              Review &amp; sign
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
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
