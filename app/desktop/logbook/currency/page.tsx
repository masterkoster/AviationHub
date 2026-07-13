'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useDesktopAuth } from '@/desktop/hooks/use-desktop-auth'
import { cloudApi } from '@/apps/desktop/src/lib/cloud-api'
import {
  getLocalCurrencyRules,
  createLocalCurrencyRule,
  updateLocalCurrencyRule,
  deleteLocalCurrencyRule,
  initializeDefaultCurrencyRules,
  type LocalCurrencyRule,
  type CurrencyStatus,
} from '@/apps/desktop/src/lib/local-currency'
import { ConfirmDialog } from '@/desktop/components/confirm-dialog'
import { ErrorCard } from '@/desktop/components/error-card'
import { Plus, Pencil, Trash2, X, Save, Shield, AlertTriangle, CheckCircle, Clock, Award } from 'lucide-react'
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbSeparator,
  BreadcrumbPage,
} from '@/components/ui/breadcrumb'
import { notifyCreated, notifySaved, notifyDeleted, notifyError } from '@/desktop/lib/toast-helpers'

type CloudCurrencyRule = {
  code: string
  name: string
  status: string
  daysRemaining?: number | null
  completed?: number
  required?: number
  unit?: string
}

const statusConfig: Record<CurrencyStatus, { icon: typeof CheckCircle; color: string; bg: string }> = {
  current: { icon: CheckCircle, color: 'text-emerald-600', bg: 'bg-emerald-500/10' },
  expiring: { icon: Clock, color: 'text-amber-600', bg: 'bg-amber-500/10' },
  expired: { icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-500/10' },
  unknown: { icon: Shield, color: 'text-muted-foreground', bg: 'bg-muted' },
}

export default function DesktopCurrencyPage() {
  const router = useRouter()
  const { mode, status, localUser } = useDesktopAuth()
  const [localRules, setLocalRules] = useState<LocalCurrencyRule[]>([])
  const [cloudRules, setCloudRules] = useState<CloudCurrencyRule[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState({ name: '', code: '', required: '', completed: '', unit: '', nextDue: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const loadRules = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      if (mode === 'local' && localUser) {
        await initializeDefaultCurrencyRules(localUser.id)
        const rules = await getLocalCurrencyRules(localUser.id)
        setLocalRules(rules)
      } else if (status === 'authenticated') {
        const data = await cloudApi.getCurrency()
        setCloudRules(Array.isArray(data) ? (data as unknown as CloudCurrencyRule[]) : [])
      }
    } catch (err) {
      console.error('[desktop/currency] load failed', err)
      setLoadError(err instanceof Error ? err.message : 'Failed to load currency rules')
    } finally {
      setLoading(false)
    }
  }, [mode, status, localUser])

  useEffect(() => {
    loadRules()
  }, [loadRules])

  const resetForm = () => {
    setFormData({ name: '', code: '', required: '', completed: '', unit: '', nextDue: '' })
    setEditingId(null)
    setShowForm(false)
    setError('')
  }

  const handleEdit = (rule: LocalCurrencyRule) => {
    setFormData({
      name: rule.name,
      code: rule.code,
      required: rule.required?.toString() || '',
      completed: rule.completed?.toString() || '',
      unit: rule.unit || '',
      nextDue: rule.nextDue || '',
    })
    setEditingId(rule.id)
    setShowForm(true)
  }

  const handleDelete = (id: string) => {
    setDeleteTargetId(id)
    setConfirmOpen(true)
  }

  const handleConfirmDelete = async () => {
    if (!deleteTargetId) return
    setDeleting(true)
    try {
      await deleteLocalCurrencyRule(deleteTargetId)
      notifyDeleted('Rule')
      await loadRules()
    } catch (err) {
      console.error('[desktop/currency] delete failed', err)
      notifyError('Currency Rule', err instanceof Error ? err.message : 'Failed to delete rule')
    } finally {
      setDeleting(false)
      setConfirmOpen(false)
      setDeleteTargetId(null)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!localUser) return

    const name = formData.name.trim()
    if (!name) {
      setError('Name is required')
      return
    }

    setSaving(true)
    setError('')
    try {
      if (editingId) {
        await updateLocalCurrencyRule(editingId, {
          name,
          required: formData.required ? parseInt(formData.required, 10) : undefined,
          completed: formData.completed ? parseInt(formData.completed, 10) : undefined,
          unit: formData.unit.trim() || undefined,
          nextDue: formData.nextDue || null,
        })
        notifySaved('Rule')
      } else {
        await createLocalCurrencyRule({
          userId: localUser.id,
          code: formData.code.trim().toUpperCase().replace(/\s+/g, '_') || name.toUpperCase().replace(/\s+/g, '_'),
          name,
          required: formData.required ? parseInt(formData.required, 10) : undefined,
          completed: formData.completed ? parseInt(formData.completed, 10) : undefined,
          unit: formData.unit.trim() || undefined,
          nextDue: formData.nextDue || null,
        })
        notifyCreated('Rule')
      }
      resetForm()
      await loadRules()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save rule')
    } finally {
      setSaving(false)
    }
  }

  const renderStatusBadge = (ruleStatus: CurrencyStatus) => {
    const config = statusConfig[ruleStatus] || statusConfig.unknown
    const Icon = config.icon
    return (
      <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${config.color} ${config.bg}`}>
        <Icon className="h-3 w-3" />
        {ruleStatus.charAt(0).toUpperCase() + ruleStatus.slice(1)}
      </span>
    )
  }

  const renderRuleProgress = (rule: { completed?: number | null; required?: number | null; daysRemaining?: number | null; unit?: string | null }) => {
    if (rule.completed != null && rule.required != null) {
      const pct = Math.min(100, (rule.completed / rule.required) * 100)
      return (
        <div className="mt-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{rule.completed}/{rule.required} {rule.unit || ''}</span>
            <span>{Math.round(pct)}%</span>
          </div>
          <div className="mt-1 h-1.5 w-full rounded-full bg-muted">
            <div className={`h-1.5 rounded-full ${pct >= 100 ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ width: `${pct}%` }} />
          </div>
        </div>
      )
    }
    if (rule.daysRemaining != null) {
      return (
        <p className="mt-1 text-xs text-muted-foreground">
          {rule.daysRemaining < 0 ? `Expired ${Math.abs(rule.daysRemaining)} days ago` : `${rule.daysRemaining} days remaining`}
        </p>
      )
    }
    return <p className="mt-1 text-xs text-muted-foreground">No tracking data</p>
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/desktop/logbook">Logbook</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Currency</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Currency</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            {mode === 'local' ? 'Track your FAA currency requirements' : 'Cloud-synced currency tracking'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push('/desktop/profile?add=license')}
            className="flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted"
            title="Add or update your pilot certificates, ratings, and flight review"
          >
            <Award className="h-4 w-4" />
            Certificates &amp; licenses
          </button>
          {mode === 'local' && !showForm && !loading && !loadError && (
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="h-4 w-4" />
              Add Rule
            </button>
          )}
        </div>
      </div>

      {mode === 'local' && showForm && (
        <form onSubmit={handleSubmit} className="rounded-lg border border-border bg-card p-4">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-medium">{editingId ? 'Edit Currency Rule' : 'Add Currency Rule'}</h2>
            <button type="button" onClick={resetForm} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Name *</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData((f) => ({ ...f, name: e.target.value }))}
                placeholder="Night Passenger Currency"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                maxLength={100}
                autoFocus
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Due Date</label>
              <input
                type="date"
                value={formData.nextDue}
                onChange={(e) => setFormData((f) => ({ ...f, nextDue: e.target.value }))}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Required Count</label>
              <input
                type="number"
                value={formData.required}
                onChange={(e) => setFormData((f) => ({ ...f, required: e.target.value }))}
                placeholder="3"
                min="0"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Completed Count</label>
              <input
                type="number"
                value={formData.completed}
                onChange={(e) => setFormData((f) => ({ ...f, completed: e.target.value }))}
                placeholder="0"
                min="0"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Unit</label>
              <input
                type="text"
                value={formData.unit}
                onChange={(e) => setFormData((f) => ({ ...f, unit: e.target.value }))}
                placeholder="landings (90 days)"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                maxLength={50}
              />
            </div>
          </div>
          {error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={resetForm}
              className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {saving ? 'Saving...' : editingId ? 'Update' : 'Add'}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-lg border border-border bg-card p-4">
              <div className="h-3 w-20 animate-pulse rounded bg-muted" />
              <div className="mt-2 h-4 w-32 animate-pulse rounded bg-muted" />
              <div className="mt-3 h-2 w-full animate-pulse rounded bg-muted" />
              <div className="mt-1 h-2 w-3/4 animate-pulse rounded bg-muted" />
            </div>
          ))}
        </div>
      ) : loadError ? (
        <ErrorCard message={loadError} onRetry={loadRules} />
      ) : mode === 'local' ? (
        localRules.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-muted/20 p-8 text-center">
            <Shield className="mx-auto h-10 w-10 text-muted-foreground/50" />
            <p className="mt-2 text-sm text-muted-foreground">No currency rules yet. Add your first rule to start tracking.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {localRules.map((rule) => (
              <div key={rule.id} className="rounded-lg border border-border bg-card p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{rule.name}</p>
                      {renderStatusBadge(rule.status)}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">{rule.authority}</p>
                    {renderRuleProgress(rule)}
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => handleEdit(rule)}
                      aria-label="Edit rule"
                      className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                      title="Edit"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(rule.id)}
                      aria-label="Delete rule"
                      className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      ) : cloudRules.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
          No currency rules found in your cloud account.
        </div>
      ) : (
        <div className="space-y-3">
          {cloudRules.map((rule) => (
            <div key={rule.code} className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">{rule.name}</p>
                <span className="rounded-full bg-muted px-2 py-0.5 text-[11px]">{rule.status}</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {rule.completed !== undefined && rule.required !== undefined
                  ? `${rule.completed}/${rule.required} ${rule.unit || ''}`
                  : rule.daysRemaining !== undefined && rule.daysRemaining !== null
                    ? `${rule.daysRemaining} days remaining`
                    : '—'}
              </p>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        onConfirm={handleConfirmDelete}
        title="Delete Rule"
        description="Delete this currency rule?"
        destructive
        loading={deleting}
      />
    </div>
  )
}
