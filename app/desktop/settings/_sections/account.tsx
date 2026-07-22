'use client'

import { useState, useEffect } from 'react'
import { User, Loader2, KeyRound } from 'lucide-react'
import { useDesktopAuth } from '@/desktop/hooks/use-desktop-auth'
import { updateLocalUser, verifyPin, hasRecoveryPinProvisioned, provisionRecoveryPin } from '@/desktop/lib/local-auth'
import { notifySaved, notifyError } from '@/desktop/lib/toast-helpers'
import { SectionHeading, SettingsCard } from '@/desktop/components/settings-ui'
import { RecoveryPinRevealDialog } from '@/desktop/components/recovery-pin-reveal-dialog'

export function AccountSection() {
  const { mode, localUser, cloudUser } = useDesktopAuth()
  const isLocal = mode === 'local' && localUser !== null

  const [displayName, setDisplayName] = useState('')
  const [homeAirport, setHomeAirport] = useState('')
  const [nameSaving, setNameSaving] = useState(false)
  const [airportSaving, setAirportSaving] = useState(false)

  // PIN change
  const [currentPin, setCurrentPin] = useState('')
  const [newPin, setNewPin] = useState('')
  const [pinSaving, setPinSaving] = useState(false)
  const [pinError, setPinError] = useState('')
  const [pinSuccess, setPinSuccess] = useState(false)

  // Recovery PIN
  const [recoveryPinSet, setRecoveryPinSet] = useState<boolean | null>(null)
  const [generatingRecoveryPin, setGeneratingRecoveryPin] = useState(false)
  const [recoveryPinReveal, setRecoveryPinReveal] = useState<string | null>(null)
  const [recoveryPinGenError, setRecoveryPinGenError] = useState('')

  useEffect(() => {
    if (localUser) {
      setDisplayName(localUser.name)
      setHomeAirport(localUser.homeAirport || '')
      hasRecoveryPinProvisioned(localUser.id).then(setRecoveryPinSet)
    }
  }, [localUser])

  async function handleGenerateRecoveryPin() {
    if (!localUser) return
    setGeneratingRecoveryPin(true)
    setRecoveryPinGenError('')
    try {
      const rp = await provisionRecoveryPin(localUser.id)
      setRecoveryPinReveal(rp)
    } catch (err) {
      setRecoveryPinGenError(err instanceof Error ? err.message : 'Failed to generate recovery PIN')
    } finally {
      setGeneratingRecoveryPin(false)
    }
  }

  function handleRecoveryPinAcknowledge() {
    setRecoveryPinReveal(null)
    setRecoveryPinSet(true)
  }

  async function handleSaveName() {
    if (!localUser) return
    setNameSaving(true)
    try {
      await updateLocalUser(localUser.id, { name: displayName })
      notifySaved('Display name')
    } catch (err) {
      notifyError('Name', err instanceof Error ? err.message : 'Failed to save name')
    } finally {
      setNameSaving(false)
    }
  }

  async function handleSaveHomeAirport() {
    if (!localUser) return
    setAirportSaving(true)
    try {
      await updateLocalUser(localUser.id, { homeAirport })
      notifySaved('Home airport')
    } catch (err) {
      notifyError('Home airport', err instanceof Error ? err.message : 'Failed to save home airport')
    } finally {
      setAirportSaving(false)
    }
  }

  async function handleSavePin() {
    if (!localUser) return
    setPinError('')
    setPinSuccess(false)
    const pinDigits = newPin.replace(/\D/g, '')
    if (pinDigits.length < 4 || pinDigits.length > 8) {
      setPinError('PIN must be 4 to 8 digits')
      return
    }
    setPinSaving(true)
    try {
      if (localUser.pin) {
        if (!currentPin) {
          setPinError('Enter your current PIN')
          setPinSaving(false)
          return
        }
        const valid = await verifyPin(localUser.id, currentPin)
        if (!valid) {
          setPinError('Current PIN is incorrect')
          setPinSaving(false)
          return
        }
      }
      await updateLocalUser(localUser.id, { pin: pinDigits })
      setPinSuccess(true)
      setCurrentPin('')
      setNewPin('')
      notifySaved('PIN')
    } catch (err) {
      setPinError(err instanceof Error ? err.message : 'Failed to update PIN')
    } finally {
      setPinSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <SectionHeading
        icon={<User className="h-4 w-4" />}
        title="Account"
        description="Manage your profile and security settings."
      />

      {/* Mode display */}
      <SettingsCard>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Mode</p>
            <p className="text-sm font-medium">{mode === 'cloud' ? 'Cloud Sync' : 'Local'}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">User</p>
            <p className="text-sm font-medium">{localUser?.name || cloudUser?.name || 'Unknown'}</p>
          </div>
        </div>
      </SettingsCard>

      {/* Display name */}
      {isLocal && (
        <SettingsCard>
          <div className="space-y-2">
            <div>
              <label className="mb-1 block text-[11px] text-muted-foreground">Display Name</label>
              <div className="flex gap-2">
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="h-8 flex-1 rounded-md border border-input bg-background px-2.5 text-xs outline-none focus:ring-2 focus:ring-ring"
                />
                <button
                  onClick={handleSaveName}
                  disabled={nameSaving || !displayName.trim()}
                  className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
                >
                  {nameSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                  Save
                </button>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-[11px] text-muted-foreground">Home Airport</label>
              <div className="flex gap-2">
                <input
                  value={homeAirport}
                  onChange={(e) => setHomeAirport(e.target.value.toUpperCase())}
                  placeholder="e.g. KJFK"
                  className="h-8 flex-1 rounded-md border border-input bg-background px-2.5 font-mono text-xs outline-none focus:ring-2 focus:ring-ring"
                />
                <button
                  onClick={handleSaveHomeAirport}
                  disabled={airportSaving}
                  className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
                >
                  {airportSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                  Save
                </button>
              </div>
            </div>
          </div>
        </SettingsCard>
      )}

      {/* PIN management */}
      {isLocal && (
        <SettingsCard>
          <div className="space-y-2">
            <p className="text-xs font-medium">Change PIN</p>
            {localUser?.pin && (
              <div>
                <label className="mb-1 block text-[11px] text-muted-foreground">Current PIN</label>
                <input
                  type="password"
                  value={currentPin}
                  onChange={(e) => setCurrentPin(e.target.value)}
                  className="h-8 w-full rounded-md border border-input bg-background px-2.5 text-xs outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            )}
            <div>
              <label className="mb-1 block text-[11px] text-muted-foreground">New PIN (4-8 digits)</label>
              <input
                type="password"
                value={newPin}
                onChange={(e) => setNewPin(e.target.value)}
                className="h-8 w-full rounded-md border border-input bg-background px-2.5 text-xs outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            {pinError && <p className="text-[11px] text-destructive">{pinError}</p>}
            {pinSuccess && <p className="text-[11px] text-emerald-600">PIN updated successfully.</p>}
            <button
              onClick={handleSavePin}
              disabled={pinSaving || !newPin}
              className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {pinSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
              Update PIN
            </button>
            <p className="text-[11px] text-muted-foreground">
              Your recovery PIN is unaffected by changing your main PIN — it never changes.
            </p>
          </div>
        </SettingsCard>
      )}

      {/* Recovery PIN */}
      {isLocal && (
        <SettingsCard>
          <div className="space-y-2">
            <p className="flex items-center gap-1.5 text-xs font-medium">
              <KeyRound className="h-3.5 w-3.5 text-muted-foreground" /> Recovery PIN
            </p>
            {recoveryPinSet === null && (
              <p className="text-[11px] text-muted-foreground">Checking status…</p>
            )}
            {recoveryPinSet === true && (
              <p className="text-[11px] text-muted-foreground">
                A recovery PIN is set for this profile. It was shown once when it was created and
                can&apos;t be viewed again — it never changes.
              </p>
            )}
            {recoveryPinSet === false && (
              <>
                <p className="text-[11px] text-muted-foreground">
                  This profile doesn&apos;t have a recovery PIN yet. Generate one now — you&apos;ll
                  need it to restore a backup if you ever forget your main PIN.
                </p>
                {recoveryPinGenError && (
                  <p className="text-[11px] text-destructive">{recoveryPinGenError}</p>
                )}
                <button
                  onClick={handleGenerateRecoveryPin}
                  disabled={generatingRecoveryPin}
                  className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
                >
                  {generatingRecoveryPin ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                  Generate recovery PIN
                </button>
              </>
            )}
          </div>
        </SettingsCard>
      )}

      {/* Cloud mode info */}
      {mode === 'cloud' && (
        <SettingsCard>
          <p className="text-xs text-muted-foreground">
            Cloud account settings are managed through the web dashboard. To change your email or password, visit the web app.
          </p>
        </SettingsCard>
      )}

      <RecoveryPinRevealDialog
        open={recoveryPinReveal !== null}
        recoveryPin={recoveryPinReveal}
        onAcknowledge={handleRecoveryPinAcknowledge}
      />
    </div>
  )
}
