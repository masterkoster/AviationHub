'use client';

import { useSession, signOut } from 'next-auth/react';
import Link from 'next/link';
import { useState } from 'react';
import { useTheme } from 'next-themes';
import { useRouter } from 'next/navigation';
import { useAuthModal } from '../components/AuthModalContext';

export default function SettingsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const { openLoginModal } = useAuthModal();
  const { theme, setTheme } = useTheme();

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

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-background text-foreground p-8">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-2xl font-bold mb-6">Settings</h1>
          <div className="text-muted-foreground">Loading...</div>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-background text-foreground p-8">
        <div className="max-w-2xl mx-auto text-center py-16">
          <h1 className="text-2xl font-bold mb-4">Settings</h1>
          <p className="text-muted-foreground mb-6">Sign in to access settings</p>
          <button onClick={() => openLoginModal()} className="inline-block bg-primary hover:bg-primary/90 text-primary-foreground px-6 py-3 rounded-lg font-medium">
            Sign In
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground p-4 md:p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold mb-6">Settings</h1>

        <div className="space-y-6">
          {/* Account Section */}
          <div className="bg-card rounded-lg p-6 border border-border">
            <h2 className="text-lg font-semibold mb-4">Account</h2>
            <div className="space-y-3">
              <div className="flex justify-between py-2 border-b border-border">
                <span className="text-muted-foreground">Email</span>
                <span>{session.user?.email}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-border">
                <span className="text-muted-foreground">Name</span>
                <span>{session.user?.name || 'Not set'}</span>
              </div>
            </div>
          </div>

          {/* Preferences Section */}
          <div className="bg-card rounded-lg p-6 border border-border">
            <h2 className="text-lg font-semibold mb-4">Preferences</h2>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">Email Notifications</div>
                  <div className="text-sm text-muted-foreground">Receive updates about your trips</div>
                </div>
                <button className="bg-primary w-12 h-6 rounded-full relative transition-colors">
                  <span className="absolute right-1 top-1 bg-primary-foreground w-4 h-4 rounded-full transition-transform"></span>
                </button>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">Dark Mode</div>
                  <div className="text-sm text-muted-foreground">Use dark theme</div>
                </div>
                <button
                  onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                  className="bg-primary w-12 h-6 rounded-full relative transition-colors"
                >
                  <span className="absolute right-1 top-1 bg-primary-foreground w-4 h-4 rounded-full transition-transform"></span>
                </button>
              </div>
            </div>
          </div>

          {/* Data Cache Section */}
          <div className="bg-card rounded-lg p-6 border border-border">
            <h2 className="text-lg font-semibold mb-4">Data Cache</h2>
            <div className="space-y-3">
              <Link 
                href="/data-status"
                className="block w-full bg-secondary hover:bg-secondary/80 text-center text-foreground py-2 rounded-lg transition-colors"
              >
                View Data Cache Status
              </Link>
              <p className="text-xs text-muted-foreground/60">
                See what airport data is cached and how old it is. Fuel prices are automatically updated every 72 hours.
              </p>
            </div>
          </div>

          {/* Danger Zone */}
          <div className="bg-card rounded-lg p-6 border border-destructive/30">
            <h2 className="text-lg font-semibold mb-4 text-destructive">Danger Zone</h2>
            <div className="space-y-3">
              <button 
                onClick={handleDeleteAccount}
                disabled={deleting}
                className="w-full bg-destructive/20 hover:bg-destructive/30 text-destructive py-2 rounded-lg transition-colors disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : 'Delete Account'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
