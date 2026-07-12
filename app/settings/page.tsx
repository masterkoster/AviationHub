'use client';

import { useEffect, useState } from 'react';
import { useSession, signOut } from 'next-auth/react';
import Link from 'next/link';
import { useTheme } from 'next-themes';
import { useAuthModal } from '../components/AuthModalContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import {
  Settings,
  Bell,
  Globe,
  Shield,
  Database,
  Save,
  Download,
  Trash2,
  Key,
  Clock,
  ChevronRight,
  AlertCircle,
  Sun,
  Moon,
  Monitor,
} from 'lucide-react';

export default function SettingsPage() {
  const { data: session, status } = useSession();
  const [deleting, setDeleting] = useState(false);
  const { openLoginModal } = useAuthModal();
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [unsavedChanges, setUnsavedChanges] = useState(false);

  const [notifications, setNotifications] = useState({
    maintenanceAlerts: true,
    currencyReminders: true,
    weatherAlerts: false,
    emailNotifications: true,
    smsNotifications: false,
    pushNotifications: true,
  });

  const [units, setUnits] = useState({
    distance: 'nautical',
    temperature: 'fahrenheit',
    timeFormat: '24h',
    dateFormat: 'MM/DD/YYYY',
  });

  const [security, setSecurity] = useState({
    twoFactorEnabled: false,
    loginAlerts: true,
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (status !== 'authenticated') return;
    let cancelled = false;

    async function loadSettings() {
      try {
        const res = await fetch('/api/profile');
        if (!res.ok) return;
        const data = await res.json();
        const prefs = data.preferences || {};
        const notif = data.notifications || {};

        if (!cancelled) {
          setUnits({
            distance: prefs?.distanceUnit || 'nautical',
            temperature: prefs?.temperatureUnit || 'fahrenheit',
            timeFormat: prefs?.timeFormat || '24h',
            dateFormat: prefs?.dateFormat || 'MM/DD/YYYY',
          });

          setNotifications({
            maintenanceAlerts: !!notif?.maintenanceAlerts,
            currencyReminders: !!notif?.currencyReminders,
            weatherAlerts: !!notif?.weatherAlerts,
            emailNotifications: !!notif?.emailNotifications,
            smsNotifications: !!notif?.smsNotifications,
            pushNotifications: !!notif?.pushNotifications,
          });
        }
      } catch (error) {
        console.error('Failed to load settings', error);
      }
    }

    loadSettings();
    return () => { cancelled = true; };
  }, [status]);

  const handleSaveSettings = async () => {
    try {
      const res = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notifications, units }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to save settings');
      }
      setUnsavedChanges(false);
      alert('Settings saved successfully!');
    } catch (error: any) {
      alert(error.message || 'Failed to save settings');
    }
  };

  const handleDeleteAccount = async () => {
    if (!confirm('Are you sure you want to delete your account? This will permanently delete all your data including flight plans, aircraft, and group memberships. This action cannot be undone.')) {
      return;
    }
    if (!confirm('This is your final warning. All your data will be permanently deleted. Continue?')) {
      return;
    }

    setDeleting(true);
    try {
      const res = await fetch('/api/auth/delete-account', { method: 'DELETE' });
      if (res.ok) {
        alert('Your account has been deleted.');
        signOut({ callbackUrl: '/' });
      } else {
        const data = await res.json();
        alert('Failed to delete account: ' + (data.error || 'Unknown error'));
      }
    } catch (err) {
      alert('Error deleting account');
    }
    setDeleting(false);
  };

  const selectClass = 'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-background pt-[44px]">
        <main className="p-6">
          <div className="mx-auto max-w-[900px]">
            <h1 className="text-2xl font-bold mb-6">Settings</h1>
            <p className="text-muted-foreground">Loading...</p>
          </div>
        </main>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-background pt-[44px]">
        <main className="p-6">
          <div className="mx-auto max-w-[900px] text-center py-16">
            <h1 className="text-2xl font-bold mb-4">Settings</h1>
            <p className="text-muted-foreground mb-6">Sign in to access settings</p>
            <Button onClick={() => openLoginModal()}>Sign In</Button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pt-[44px]">
      <header className="sticky top-[44px] z-50 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/60">
        <div className="flex h-16 items-center gap-4 px-6">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <Settings className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-lg font-semibold">Settings</span>
          </div>
          <div className="ml-auto flex items-center gap-4">
            {unsavedChanges && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                Unsaved changes
              </span>
            )}
            <Button variant="ghost" size="sm" onClick={() => window.history.back()}>
              Back
            </Button>
          </div>
        </div>
      </header>

      <main className="p-6">
        <div className="mx-auto max-w-[900px] space-y-6">
          <div className="space-y-1">
            <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
            <p className="text-muted-foreground">
              Manage your preferences, notifications, and account settings
            </p>
          </div>

          {/* Account */}
          <Card>
            <CardHeader>
              <CardTitle>Account</CardTitle>
              <CardDescription>Your account information</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between py-2">
                <span className="text-sm text-muted-foreground">Email</span>
                <span className="text-sm font-medium">{session.user?.email}</span>
              </div>
              <Separator />
              <div className="flex items-center justify-between py-2">
                <span className="text-sm text-muted-foreground">Name</span>
                <span className="text-sm font-medium">{session.user?.name || 'Not set'}</span>
              </div>
            </CardContent>
          </Card>

          {/* Appearance */}
          <Card>
            <CardHeader>
              <CardTitle>Appearance</CardTitle>
              <CardDescription>Choose your preferred theme</CardDescription>
            </CardHeader>
            <CardContent>
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
                    className={`flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors ${
                      theme === value
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border bg-card hover:bg-muted text-muted-foreground'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </button>
                ))}
              </div>
              {mounted && (
                <p className="mt-3 text-xs text-muted-foreground">
                  Currently using {resolvedTheme === 'dark' ? 'dark' : 'light'} theme
                  {theme === 'system' ? ' (following system)' : ''}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Notification Preferences */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5" />
                Notification Preferences
              </CardTitle>
              <CardDescription>Control when and how you receive alerts</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="maintenance">Maintenance Alerts</Label>
                  <p className="text-xs text-muted-foreground">Get notified about upcoming maintenance items</p>
                </div>
                <Switch
                  id="maintenance"
                  checked={notifications.maintenanceAlerts}
                  onCheckedChange={(checked) => {
                    setNotifications({ ...notifications, maintenanceAlerts: checked });
                    setUnsavedChanges(true);
                  }}
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="currency">Currency Reminders</Label>
                  <p className="text-xs text-muted-foreground">Reminders for expiring licenses and currency</p>
                </div>
                <Switch
                  id="currency"
                  checked={notifications.currencyReminders}
                  onCheckedChange={(checked) => {
                    setNotifications({ ...notifications, currencyReminders: checked });
                    setUnsavedChanges(true);
                  }}
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="weather">Weather Alerts</Label>
                  <p className="text-xs text-muted-foreground">Get notified about weather changes at your home airport</p>
                </div>
                <Switch
                  id="weather"
                  checked={notifications.weatherAlerts}
                  onCheckedChange={(checked) => {
                    setNotifications({ ...notifications, weatherAlerts: checked });
                    setUnsavedChanges(true);
                  }}
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="emailNotif">Email Notifications</Label>
                  <p className="text-xs text-muted-foreground">Receive notifications via email</p>
                </div>
                <Switch
                  id="emailNotif"
                  checked={notifications.emailNotifications}
                  onCheckedChange={(checked) => {
                    setNotifications({ ...notifications, emailNotifications: checked });
                    setUnsavedChanges(true);
                  }}
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="sms">SMS Notifications</Label>
                  <p className="text-xs text-muted-foreground">Receive notifications via text message</p>
                </div>
                <Switch
                  id="sms"
                  checked={notifications.smsNotifications}
                  onCheckedChange={(checked) => {
                    setNotifications({ ...notifications, smsNotifications: checked });
                    setUnsavedChanges(true);
                  }}
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="push">Push Notifications</Label>
                  <p className="text-xs text-muted-foreground">Receive browser push notifications</p>
                </div>
                <Switch
                  id="push"
                  checked={notifications.pushNotifications}
                  onCheckedChange={(checked) => {
                    setNotifications({ ...notifications, pushNotifications: checked });
                    setUnsavedChanges(true);
                  }}
                />
              </div>
            </CardContent>
          </Card>

          {/* Units & Display */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-5 w-5" />
                Units & Display
              </CardTitle>
              <CardDescription>Customize measurement units and display formats</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="distance">Distance Units</Label>
                  <select
                    id="distance"
                    className={selectClass}
                    value={units.distance}
                    onChange={(e) => {
                      setUnits({ ...units, distance: e.target.value });
                      setUnsavedChanges(true);
                    }}
                  >
                    <option value="nautical">Nautical Miles</option>
                    <option value="statute">Statute Miles</option>
                    <option value="kilometers">Kilometers</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="temperature">Temperature Units</Label>
                  <select
                    id="temperature"
                    className={selectClass}
                    value={units.temperature}
                    onChange={(e) => {
                      setUnits({ ...units, temperature: e.target.value });
                      setUnsavedChanges(true);
                    }}
                  >
                    <option value="fahrenheit">Fahrenheit (°F)</option>
                    <option value="celsius">Celsius (°C)</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="timeFormat">Time Format</Label>
                  <select
                    id="timeFormat"
                    className={selectClass}
                    value={units.timeFormat}
                    onChange={(e) => {
                      setUnits({ ...units, timeFormat: e.target.value });
                      setUnsavedChanges(true);
                    }}
                  >
                    <option value="12h">12-hour (3:45 PM)</option>
                    <option value="24h">24-hour (15:45)</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="dateFormat">Date Format</Label>
                  <select
                    id="dateFormat"
                    className={selectClass}
                    value={units.dateFormat}
                    onChange={(e) => {
                      setUnits({ ...units, dateFormat: e.target.value });
                      setUnsavedChanges(true);
                    }}
                  >
                    <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                    <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                    <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => window.location.reload()}>Cancel</Button>
                <Button className="gap-2" onClick={handleSaveSettings}>
                  <Save className="h-4 w-4" />
                  Save Changes
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Security */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Account Security
              </CardTitle>
              <CardDescription>Manage your password and security settings</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <Button variant="outline" className="w-full justify-between">
                <div className="flex items-center gap-2">
                  <Key className="h-4 w-4" />
                  <span>Change Password</span>
                </div>
                <ChevronRight className="h-4 w-4" />
              </Button>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="2fa">Two-Factor Authentication</Label>
                  <p className="text-xs text-muted-foreground">Add an extra layer of security to your account</p>
                </div>
                <Switch
                  id="2fa"
                  checked={security.twoFactorEnabled}
                  onCheckedChange={(checked) =>
                    setSecurity({ ...security, twoFactorEnabled: checked })
                  }
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="loginAlerts">Login Alerts</Label>
                  <p className="text-xs text-muted-foreground">Get notified of new logins to your account</p>
                </div>
                <Switch
                  id="loginAlerts"
                  checked={security.loginAlerts}
                  onCheckedChange={(checked) =>
                    setSecurity({ ...security, loginAlerts: checked })
                  }
                />
              </div>

              <Separator />

              <Button variant="outline" className="w-full justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  <span>View Login History</span>
                </div>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </CardContent>
          </Card>

          {/* Data & Privacy */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                Data & Privacy
              </CardTitle>
              <CardDescription>Manage your data and privacy settings</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button variant="outline" className="w-full justify-between">
                <div className="flex items-center gap-2">
                  <Download className="h-4 w-4" />
                  <span>Export Your Data</span>
                </div>
                <ChevronRight className="h-4 w-4" />
              </Button>

              <Link
                href="/data-status"
                className="flex w-full items-center justify-between rounded-md border border-input bg-background px-4 py-2.5 text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Database className="h-4 w-4" />
                  <span>View Data Cache Status</span>
                </div>
                <ChevronRight className="h-4 w-4" />
              </Link>
              <p className="text-xs text-muted-foreground">
                See what airport data is cached and how old it is. Fuel prices are automatically updated every 72 hours.
              </p>

              <Separator />

              <div className="rounded-lg bg-destructive/10 border border-destructive/50 p-4 space-y-3">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-5 w-5 text-destructive mt-0.5" />
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-destructive">Danger Zone</p>
                    <p className="text-xs text-muted-foreground">
                      Once you delete your account, there is no going back. Please be certain.
                    </p>
                  </div>
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  className="gap-2"
                  onClick={handleDeleteAccount}
                  disabled={deleting}
                >
                  <Trash2 className="h-4 w-4" />
                  {deleting ? 'Deleting...' : 'Delete Account'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
