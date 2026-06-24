'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { ArrowLeft, Loader2, Save, User } from 'lucide-react'

export default function ProfilePage() {
  const router = useRouter()
  const { status } = useSession()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const [name, setName] = useState('')
  const [homeAirport, setHomeAirport] = useState('')
  const [medicalExpiry, setMedicalExpiry] = useState('')
  const [medicalClass, setMedicalClass] = useState('')
  const [bfrExpiry, setBfrExpiry] = useState('')

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/v1/login')
  }, [status, router])

  useEffect(() => {
    if (status !== 'authenticated') return
    fetch('/api/v1/profile')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return
        setName(data.user?.name || '')
        setHomeAirport(data.homeAirport || '')
        setMedicalExpiry(data.user?.medicalExpiry?.split('T')[0] || '')
        setMedicalClass(data.user?.medicalClass || '')
        setBfrExpiry(data.user?.bfrExpiry?.split('T')[0] || '')
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [status])

  const handleSave = async () => {
    setSaving(true)
    setSaved(false)
    try {
      await fetch('/api/v1/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          homeAirport: homeAirport.toUpperCase() || null,
          medicalExpiry: medicalExpiry || null,
          medicalClass: medicalClass || null,
          bfrExpiry: bfrExpiry || null,
        }),
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch {}
    setSaving(false)
  }

  if (status === 'loading' || loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="p-1.5 rounded-md hover:bg-muted transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <User className="h-5 w-5" />
          Profile
        </h1>
      </div>

      <div className="space-y-6">
        {/* Personal */}
        <Section title="Personal">
          <Field label="Name">
            <input type="text" value={name} onChange={e => setName(e.target.value)} className="input" />
          </Field>
        </Section>

        {/* Home Airport */}
        <Section title="Home Airport">
          <Field label="ICAO Code">
            <input type="text" value={homeAirport} onChange={e => setHomeAirport(e.target.value)}
              placeholder="e.g. KDTW" className="input" />
          </Field>
          <p className="text-xs text-muted-foreground">
            Set your home airport to see live weather on the dashboard.
          </p>
        </Section>

        {/* Credentials */}
        <Section title="Credentials">
          <Field label="Medical Expiry">
            <input type="date" value={medicalExpiry} onChange={e => setMedicalExpiry(e.target.value)} className="input" />
          </Field>
          <Field label="Medical Class">
            <select value={medicalClass} onChange={e => setMedicalClass(e.target.value)} className="input">
              <option value="">Not set</option>
              <option value="1">First Class</option>
              <option value="2">Second Class</option>
              <option value="3">Third Class</option>
            </select>
          </Field>
          <Field label="Flight Review (BFR) Expiry">
            <input type="date" value={bfrExpiry} onChange={e => setBfrExpiry(e.target.value)} className="input" />
          </Field>
        </Section>
      </div>

      {/* Save */}
      <div className="flex items-center gap-3 pt-2">
        <button onClick={handleSave} disabled={saving}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save Profile
        </button>
        {saved && <span className="text-sm text-emerald-500">Saved!</span>}
      </div>

      <style jsx>{`
        .input {
          width: 100%;
          padding: 0.5rem 0.75rem;
          border-radius: 0.375rem;
          border: 1px solid var(--border);
          background: var(--background);
          font-size: 0.875rem;
          outline: none;
        }
        .input:focus {
          box-shadow: 0 0 0 2px var(--ring);
        }
      `}</style>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <h2 className="text-sm font-semibold">{title}</h2>
      {children}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-muted-foreground mb-1">{label}</label>
      {children}
    </div>
  )
}
