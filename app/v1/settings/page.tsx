'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useSession, signOut } from 'next-auth/react'
import { useTheme } from 'next-themes'
import { ArrowLeft, Loader2, Save, Settings, Sun, Moon, Monitor, Trash2 } from 'lucide-react'

export default function SettingsPage() {
  const router = useRouter()
  const { data: session, status } = useSession()
  const { theme, setTheme, resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const [notifications, setNotifications] = useState({
    emailNotifications: true,
    currencyReminders: true,
    maintenanceAlerts: true,
  })

  const [units, setUnits] = useState({
    distance: 'nautical',
    temperature: 'fahrenheit',
    timeFormat: '24h',
    dateFormat: 'MM/DD/YYYY',
  })

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/v1/login')
  }, [status, router])

  useEffect(() => {
    if (status !== 'authenticated') return
    fetch('/api/v1/profile')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return
        const prefs = data.preferences || {}
        const notif = data.notifications || {}
        setUnits({
          distance: prefs.distanceUnit || 'nautical',
          temperature: prefs.temperatureUnit || 'fahrenheit',
          timeFormat: prefs.timeFormat || '24h',
          dateFormat: prefs.dateFormat || 'MM/DD/YYYY',
        })
        setNotifications({
          emailNotifications: notif.emailNotifications !== false,
          currencyReminders: notif.currencyReminders !== false,
          maintenanceAlerts: notif.maintenanceAlerts !== false,
        })
      })
      .catch(() => {})
  }, [status])

  const handleSave = async () => {
    setSaving(true)
    setSaved(false)
    try {
      await fetch('/api/v1/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notifications, units }),
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch {}
    setSaving(false)
  }

  const handleDeleteAccount = async () => {
    if (!confirm('Are you sure you want to delete your account? This will permanently delete all your data. This action cannot be undone.')) return
    if (!confirm('This is your final warning. All your data will be permanently deleted. Continue?')) return

    setDeleting(true)
    try {
      const res = await fetch('/api/auth/delete-account', { method: 'DELETE' })
      if (res.ok) {
        alert('Your account has been deleted.')
        signOut({ callbackUrl: '/v1/login' })
      } else {
        const data = await res.json()
        alert('Failed to delete account: ' + (data.error || 'Unknown error'))
      }
    } catch {
      alert('Error deleting account')
    }
    setDeleting(false)
  }

  if (status === 'loading') {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="p-1.5 rounded-md hover:bg-muted transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Settings className="h-5 w-5" />
          Settings
        </h1>
      </div>

      <div className="space-y-6">
        {/* Account */}
        <Section title="Account">
          <div className="flex items-center justify-between py-1">
            <span className="text-xs text-muted-foreground">Email</span>
            <span className="text-sm font-medium">{session?.user?.email}</span>
          </div>
          <div className="border-t border-border" />
          <div className="flex items-center justify-between py-1">
            <span className="text-xs text-muted-foreground">Name</span>
            <span className="text-sm font-medium">{session?.user?.name || 'Not set'}</span>
          </div>
        </Section>

        {/* Appearance */}
        <Section title="Appearance">
          <p className="text-xs text-muted-foreground mb-2">Choose your preferred theme</p>
          <div className="flex items-center gap-2">
            {[
              { value: 'light', label: 'Light', icon: Sun },
              { value: 'dark', label: 'Dark', icon: Moon },
              { value: 'system', label: 'System', icon: Monitor },
            ].map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                onClick={() => setTheme(value)}
                disabled={!mounted}
                className={`flex items-center gap-1.5 rounded-md border px-3 py-2 text-xs font-medium transition-colors ${
                  theme === value
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-card hover:bg-muted text-muted-foreground'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>
          {mounted && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              Currently using {resolvedTheme === 'dark' ? 'dark' : 'light'} theme
              {theme === 'system' ? ' (following system)' : ''}
            </p>
          )}
        </Section>

        {/* Notifications */}
        <Section title="Notifications">
          <Toggle
            label="Email Notifications"
            description="Receive updates via email"
            checked={notifications.emailNotifications}
            onChange={(v) => setNotifications({ ...notifications, emailNotifications: v })}
          />
          <div className="border-t border-border" />
          <Toggle
            label="Currency Reminders"
            description="Reminders for expiring licenses and currency"
            checked={notifications.currencyReminders}
            onChange={(v) => setNotifications({ ...notifications, currencyReminders: v })}
          />
          <div className="border-t border-border" />
          <Toggle
            label="Maintenance Alerts"
            description="Get notified about upcoming maintenance items"
            checked={notifications.maintenanceAlerts}
            onChange={(v) => setNotifications({ ...notifications, maintenanceAlerts: v })}
          />
        </Section>

        {/* Units & Display */}
        <Section title="Units & Display">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Distance Units">
              <select value={units.distance} onChange={e => setUnits({ ...units, distance: e.target.value })} className="input">
                <option value="nautical">Nautical Miles</option>
                <option value="statute">Statute Miles</option>
                <option value="kilometers">Kilometers</option>
              </select>
            </Field>
            <Field label="Temperature">
              <select value={units.temperature} onChange={e => setUnits({ ...units, temperature: e.target.value })} className="input">
                <option value="fahrenheit">Fahrenheit (°F)</option>
                <option value="celsius">Celsius (°C)</option>
              </select>
            </Field>
            <Field label="Time Format">
              <select value={units.timeFormat} onChange={e => setUnits({ ...units, timeFormat: e.target.value })} className="input">
                <option value="12h">12-hour (3:45 PM)</option>
                <option value="24h">24-hour (15:45)</option>
              </select>
            </Field>
            <Field label="Date Format">
              <select value={units.dateFormat} onChange={e => setUnits({ ...units, dateFormat: e.target.value })} className="input">
                <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                <option value="YYYY-MM-DD">YYYY-MM-DD</option>
              </select>
            </Field>
          </div>
        </Section>

        {/* Danger Zone */}
        <div className="rounded-lg border border-destructive/30 bg-card p-4 space-y-3">
          <h2 className="text-sm font-semibold text-destructive">Danger Zone</h2>
          <p className="text-xs text-muted-foreground">
            Once you delete your account, there is no going back. Please be certain.
          </p>
          <button
            onClick={handleDeleteAccount}
            disabled={deleting}
            className="inline-flex items-center gap-2 rounded-md bg-destructive/20 px-3 py-2 text-xs font-medium text-destructive hover:bg-destructive/30 transition-colors disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {deleting ? 'Deleting...' : 'Delete Account'}
          </button>
        </div>
      </div>

      {/* Save */}
      <div className="flex items-center gap-3 pt-2">
        <button onClick={handleSave} disabled={saving}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save Settings
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

function Toggle({ label, description, checked, onChange }: {
  label: string
  description: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between py-1">
      <div>
        <p className="text-xs font-medium">{label}</p>
        <p className="text-[11px] text-muted-foreground">{description}</p>
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
          checked ? 'bg-primary' : 'bg-muted-foreground/30'
        }`}
      >
        <span
          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
            checked ? 'translate-x-[18px]' : 'translate-x-[3px]'
          }`}
        />
      </button>
    </div>
  )
}
