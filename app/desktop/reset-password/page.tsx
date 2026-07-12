'use client'

// Password reset page — desktop layout

import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Monitor, Loader2, Check, ArrowLeft } from 'lucide-react';

function ResetForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token');
  const email = searchParams.get('email');

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (!token || !email) {
      setMessage({ type: 'error', text: 'Invalid reset link. Please request a new one.' });
    }
  }, [token, email]);

  const passwordsMatch = newPassword === confirmPassword;
  const canSubmit = !isLoading && token && email && newPassword.length >= 6 && passwordsMatch;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: 'Passwords do not match' });
      return;
    }
    if (newPassword.length < 6) {
      setMessage({ type: 'error', text: 'Password must be at least 6 characters' });
      return;
    }

    setIsLoading(true);
    setMessage(null);

    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, token, newPassword }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage({ type: 'success', text: 'Password reset successful!' });
        setTimeout(() => router.push('/desktop/login'), 1500);
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to reset password' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Something went wrong. Try again.' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-sm space-y-6 rounded-xl border border-border bg-card p-8 shadow-sm">
      <div className="flex flex-col items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
          <Monitor className="h-6 w-6 text-primary-foreground" />
        </div>
        <div className="text-center">
          <h1 className="text-xl font-bold">Reset password</h1>
          <p className="text-sm text-muted-foreground">
            {message?.type === 'success' ? 'All set!' : 'Enter your new password'}
          </p>
        </div>
      </div>

      {email && (
        <div className="rounded-md border border-border bg-muted/50 px-4 py-3 text-xs text-muted-foreground">
          Resetting for <span className="font-medium text-foreground">{email}</span>
        </div>
      )}

      {message && (
        <div className={`rounded-md border p-4 text-sm ${
          message.type === 'success'
            ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
            : 'border-destructive/20 bg-destructive/10 text-destructive'
        }`}>
          <div className="flex items-center gap-2">
            {message.type === 'success' && <Check className="h-4 w-4" />}
            {message.text}
          </div>
        </div>
      )}

      {/* Always show form — error messages appear above, user can retry */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="np" className="block text-sm font-medium mb-1.5">New password</label>
          <input
            id="np"
            type="password"
            value={newPassword}
            onChange={e => setNewPassword(e.target.value)}
            required
            minLength={6}
            autoComplete="new-password"
            autoFocus
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            placeholder="Minimum 6 characters"
          />
        </div>
        <div>
          <label htmlFor="cp" className="block text-sm font-medium mb-1.5">Confirm password</label>
          <input
            id="cp"
            type="password"
            value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
            required
            minLength={6}
            autoComplete="new-password"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            placeholder="Re-enter new password"
          />
          {confirmPassword.length > 0 && !passwordsMatch && (
            <p className="mt-1 text-xs text-destructive">Passwords do not match</p>
          )}
          {newPassword.length > 0 && newPassword.length < 6 && (
            <p className="mt-1 text-xs text-muted-foreground">Minimum 6 characters</p>
          )}
        </div>
        <button
          type="submit"
          disabled={!canSubmit}
          className="w-full flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
          Reset Password
        </button>
      </form>

      <div className="text-center">
        <Link href="/desktop/login" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground underline">
          <ArrowLeft className="h-3 w-3" />
          Back to Sign In
        </Link>
      </div>
    </div>
  );
}

export default function DesktopResetPasswordPage() {
  return (
    <div className="flex min-h-full items-center justify-center bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/5 via-background to-background p-4">
      <Suspense fallback={
        <div className="w-full max-w-sm rounded-xl border border-border bg-card p-8 shadow-sm text-center">
          <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
        </div>
      }>
        <ResetForm />
      </Suspense>
    </div>
  );
}

