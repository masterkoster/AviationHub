'use client'

import { useState, useEffect } from 'react'
import useSWR from 'swr'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Plane, Plus, Pencil, Trash2, Loader2, PlaneIcon } from 'lucide-react'

const fetcher = (url: string) => fetch(url).then(r => r.json())

const engineTypes = [
  { value: 'single', label: 'Single Engine' },
  { value: 'multi', label: 'Multi Engine' },
  { value: 'turbine', label: 'Turbine' },
  { value: 'jet', label: 'Jet' },
  { value: 'rotorcraft', label: 'Rotorcraft' },
  { value: 'glider', label: 'Glider' },
  { value: 'lighter-than-air', label: 'Lighter Than Air' },
]

const categoryClasses = [
  { value: 'ASEL', label: 'Airplane - Single Engine Land' },
  { value: 'AMEL', label: 'Airplane - Multi Engine Land' },
  { value: 'ASES', label: 'Airplane - Single Engine Sea' },
  { value: 'AMES', label: 'Airplane - Multi Engine Sea' },
  { value: 'HELO', label: 'Helicopter' },
  { value: 'GYRO', label: 'Gyroplane' },
  { value: 'BALLOON', label: 'Balloon' },
  { value: 'BLIMP', label: 'Blimp' },
  { value: 'WEIGHT-SHIFT', label: 'Weight-Shift Control' },
  { value: 'PARACHUTE', label: 'Parachute' },
]

export default function MyAircraftPage() {
  const { data, isLoading, mutate } = useSWR('/api/logbook/aircraft', fetcher)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingAircraft, setEditingAircraft] = useState<any>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    nNumber: '',
    nickname: '',
    categoryClass: '',
    engineType: '',
    notes: '',
  })

  const aircraft = data?.aircraft || []

  const resetForm = () => {
    setForm({ nNumber: '', nickname: '', categoryClass: '', engineType: '', notes: '' })
    setEditingAircraft(null)
    setError(null)
  }

  const openAddDialog = () => {
    resetForm()
    setDialogOpen(true)
  }

  const openEditDialog = (ac: any) => {
    setEditingAircraft(ac)
    setForm({
      nNumber: ac.nNumber || '',
      nickname: ac.nickname || '',
      categoryClass: ac.categoryClass || '',
      engineType: ac.engineType || '',
      notes: ac.notes || '',
    })
    setDialogOpen(true)
  }

  const handleSubmit = async () => {
    if (!form.nNumber.trim()) {
      setError('Aircraft registration is required')
      return
    }

    setSaving(true)
    setError(null)

    try {
      const url = editingAircraft 
        ? `/api/logbook/aircraft/${editingAircraft.id}`
        : '/api/logbook/aircraft'
      
      const method = editingAircraft ? 'PUT' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to save aircraft')
      }

      setDialogOpen(false)
      resetForm()
      mutate()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to remove this aircraft?')) return

    try {
      const res = await fetch(`/api/logbook/aircraft/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete')
      mutate()
    } catch (err) {
      console.error('Failed to delete:', err)
    }
  }

  const getDisplayName = (ac: any) => {
    if (ac.nickname) return `${ac.nickname} (${ac.nNumber})`
    return ac.nNumber
  }

  const getCategoryLabel = (value: string) => {
    return categoryClasses.find(c => c.value === value)?.label || value
  }

  const getEngineLabel = (value: string) => {
    return engineTypes.find(e => e.value === value)?.label || value
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border bg-card/50 px-6 py-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">My Aircraft</h1>
            <p className="text-sm text-muted-foreground">
              Manage your aircraft for quick access when logging flights
            </p>
          </div>
          <Button onClick={openAddDialog} className="bg-primary hover:bg-primary/90 gap-2">
            <Plus className="w-4 h-4" /> Add Aircraft
          </Button>
        </div>
      </div>

      <div className="px-6 py-6">
        {isLoading ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              Loading aircraft...
            </CardContent>
          </Card>
        ) : aircraft.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <PlaneIcon className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Aircraft Yet</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Add your aircraft to quickly log flights without re-entering details.
              </p>
              <Button onClick={openAddDialog} className="gap-2">
                <Plus className="w-4 h-4" /> Add Your First Aircraft
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {aircraft.map((ac: any) => (
              <Card key={ac.id} className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Plane className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <CardTitle className="text-lg">{getDisplayName(ac)}</CardTitle>
                        <p className="text-sm text-muted-foreground font-mono">{ac.nNumber}</p>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => openEditDialog(ac)}
                        className="h-8 w-8"
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => handleDelete(ac.id)}
                        className="h-8 w-8 text-destructive hover:text-destructive"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="space-y-2 text-sm">
                    {ac.categoryClass && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Category/Class:</span>
                        <span className="text-right">{getCategoryLabel(ac.categoryClass)}</span>
                      </div>
                    )}
                    {ac.engineType && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Engine:</span>
                        <span className="text-right">{getEngineLabel(ac.engineType)}</span>
                      </div>
                    )}
                    {ac.model && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Model:</span>
                        <span className="text-right">{ac.model.manufacturer} {ac.model.model}</span>
                      </div>
                    )}
                    {ac.notes && (
                      <div className="pt-2 border-t">
                        <p className="text-muted-foreground text-xs">{ac.notes}</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingAircraft ? 'Edit Aircraft' : 'Add Aircraft'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {error && (
              <div className="p-3 bg-destructive/10 border border-destructive rounded-lg text-destructive text-sm">
                {error}
              </div>
            )}
            <div className="grid gap-4">
              <div>
                <Label htmlFor="nNumber">Aircraft Registration *</Label>
                <Input
                  id="nNumber"
                  value={form.nNumber}
                  onChange={(e) => setForm({ ...form, nNumber: e.target.value.toUpperCase() })}
                  placeholder="N12345"
                  className="uppercase"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  FAA N-number or equivalent
                </p>
              </div>
              <div>
                <Label htmlFor="nickname">Nickname</Label>
                <Input
                  id="nickname"
                  value={form.nickname}
                  onChange={(e) => setForm({ ...form, nickname: e.target.value })}
                  placeholder="e.g., My Cheroke"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="categoryClass">Category/Class</Label>
                  <select
                    id="categoryClass"
                    value={form.categoryClass}
                    onChange={(e) => setForm({ ...form, categoryClass: e.target.value })}
                    className="w-full h-9 px-3 rounded-lg bg-secondary/60 border border-border text-foreground focus:outline-none focus:border-primary text-sm"
                  >
                    <option value="">Select...</option>
                    {categoryClasses.map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label htmlFor="engineType">Engine Type</Label>
                  <select
                    id="engineType"
                    value={form.engineType}
                    onChange={(e) => setForm({ ...form, engineType: e.target.value })}
                    className="w-full h-9 px-3 rounded-lg bg-secondary/60 border border-border text-foreground focus:outline-none focus:border-primary text-sm"
                  >
                    <option value="">Select...</option>
                    {engineTypes.map((e) => (
                      <option key={e.value} value={e.value}>{e.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <Label htmlFor="notes">Notes</Label>
                <textarea
                  id="notes"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="Any additional notes..."
                  rows={2}
                  className="w-full px-3 py-2 rounded-lg bg-secondary/60 border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary text-sm resize-none"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              {editingAircraft ? 'Save Changes' : 'Add Aircraft'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
