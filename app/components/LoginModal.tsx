'use client';

/**
 * LoginModal - Animated modal for signing in or creating an account
 *
 * Rendered at the app level (in ClientLayout) and hidden by default.
 * Shows/hides based on the AuthModalContext state and opens to the mode
 * (login vs signup) requested by whichever button triggered it.
 *
 * Features:
 * - Animated split-panel layout with a branded aviation side
 * - Sliding tab toggle between Sign In and Sign Up
 * - Staggered field entrance animations
 * - AJAX login (no page redirect) using NextAuth
 * - Auto-redirects after successful login if redirectTo is set
 * - "Continue as Guest" option + "Forgot password" link
 */

import { useState, useEffect } from 'react';
import { useSession, signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Plane,
  X,
  User,
  Mail,
  Lock,
  Eye,
  EyeOff,
  Loader2,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';
import { useAuthModal } from './AuthModalContext';

const highlights = [
  'Live fuel prices at 3,000+ FBOs',
  'Flight planning + E6B that just works',
  'Club scheduling & training tracking',
];

export default function LoginModal() {
  const { isOpen, initialMode, closeModal, redirectTo } = useAuthModal();
  const { data: session } = useSession();
  const router = useRouter();

  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Sync mode with whichever button opened the modal, and reset the form
  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      setUsername('');
      setEmail('');
      setPassword('');
      setName('');
      setError('');
      setShowPassword(false);
      setLoading(false);
    }
  }, [isOpen, initialMode]);

  // Reset error state when switching tabs
  useEffect(() => {
    setError('');
  }, [mode]);

  // Close + redirect if already logged in
  useEffect(() => {
    if (session?.user && isOpen) {
      closeModal();
      if (redirectTo) {
        router.push(redirectTo);
      }
    }
  }, [session, isOpen, redirectTo, closeModal, router]);

  // Lock body scroll while open
  useEffect(() => {
    if (isOpen) {
      const original = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = original;
      };
    }
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeModal();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, closeModal]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (mode === 'login') {
      const result = await signIn('credentials', {
        username,
        password,
        redirect: false,
      });

      setLoading(false);

      if (result?.error) {
        setError('Invalid username or password');
      } else if (result?.ok) {
        closeModal();
        window.location.href = redirectTo || '/dashboard';
      }
    } else {
      // Signup validation
      if (!username || username.length < 3) {
        setError('Username is required (min 3 characters)');
        setLoading(false);
        return;
      }
      if (!email) {
        setError('Email is required');
        setLoading(false);
        return;
      }
      try {
        const res = await fetch('/api/auth/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, email, password, name }),
        });

        const data = await res.json();
        setLoading(false);

        if (!res.ok) {
          setError(data.error || 'Signup failed');
        } else {
          const result = await signIn('credentials', {
            username,
            password,
            redirect: false,
          });

          if (result?.ok) {
            closeModal();
            if (redirectTo) {
              router.push(redirectTo);
            } else {
              router.refresh();
            }
          }
        }
      } catch {
        setLoading(false);
        setError('Something went wrong');
      }
    }
  };

  const isLogin = mode === 'login';

  const inputClass =
    'w-full rounded-xl border border-border bg-background/60 py-3 pl-11 pr-4 text-sm text-foreground placeholder:text-muted-foreground/70 transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30';

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={isLogin ? 'Sign in' : 'Create account'}
    >
      {/* Backdrop */}
      <div
        className="auth-backdrop absolute inset-0 bg-background/70 backdrop-blur-md"
        onClick={closeModal}
      />

      {/* Modal */}
      <div className="auth-modal relative grid max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-3xl border border-border bg-card shadow-2xl shadow-primary/10 md:grid-cols-2">
        {/* Close button */}
        <button
          onClick={closeModal}
          aria-label="Close"
          className="absolute right-4 top-4 z-20 flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <X className="h-4.5 w-4.5" />
        </button>

        {/* ===== Branded panel ===== */}
        <aside className="relative hidden flex-col justify-between overflow-hidden bg-primary p-10 text-primary-foreground md:flex">
          {/* Animated grid + orbs */}
          <div className="auth-grid pointer-events-none absolute inset-0 opacity-60" />
          <div className="auth-orb pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-primary-foreground/10 blur-2xl" />
          <div
            className="auth-orb pointer-events-none absolute -bottom-20 -left-10 h-52 w-52 rounded-full bg-primary-foreground/10 blur-2xl"
            style={{ animationDelay: '1.5s' }}
          />
          {/* Drifting plane */}
          <Plane className="auth-plane pointer-events-none absolute left-0 top-1/2 h-10 w-10 text-primary-foreground/40" />

          <div className="relative z-10 flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-foreground/15 backdrop-blur-sm">
              <Plane className="h-5 w-5" />
            </div>
            <span className="text-lg font-bold tracking-tight">AviationHub</span>
          </div>

          <div className="relative z-10">
            <h3 className="text-2xl font-extrabold leading-tight text-balance">
              {isLogin ? 'Welcome back to the cockpit.' : 'Your flight deck, all in one place.'}
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-primary-foreground/80 text-pretty">
              {isLogin
                ? 'Sign in to pick up right where you left off.'
                : 'Join 2,400+ pilots flying smarter every day.'}
            </p>

            <ul className="mt-7 flex flex-col gap-3">
              {highlights.map((item, i) => (
                <li
                  key={item}
                  className="auth-field flex items-center gap-3 text-sm text-primary-foreground/90"
                  style={{ animationDelay: `${0.15 + i * 0.1}s` }}
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-foreground/15">
                    <ShieldCheck className="h-3.5 w-3.5" />
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <p className="relative z-10 text-xs text-primary-foreground/60">
            Free to try -- no credit card required.
          </p>
        </aside>

        {/* ===== Form panel ===== */}
        <div className="relative flex flex-col justify-center p-8 sm:p-10">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-foreground">
              {isLogin ? 'Sign in' : 'Create your account'}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {isLogin ? 'Enter your details to continue.' : 'Start using AviationHub for free.'}
            </p>
          </div>

          {/* Sliding tab toggle */}
          <div className="relative mb-6 grid grid-cols-2 rounded-xl border border-border bg-background/60 p-1">
            <span
              className="absolute inset-y-1 w-[calc(50%-0.25rem)] rounded-lg bg-primary shadow-sm transition-transform duration-300 ease-out"
              style={{ transform: isLogin ? 'translateX(0.125rem)' : 'translateX(calc(100% + 0.25rem))' }}
            />
            <button
              type="button"
              onClick={() => setMode('login')}
              className={`relative z-10 rounded-lg py-2 text-sm font-medium transition-colors ${
                isLogin ? 'text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => setMode('signup')}
              className={`relative z-10 rounded-lg py-2 text-sm font-medium transition-colors ${
                !isLogin ? 'text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Sign Up
            </button>
          </div>

          {/* Error */}
          {error && (
            <div className="auth-field mb-4 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {/* Form -- key forces re-mount so fields re-animate on mode switch */}
          <form key={mode} onSubmit={handleSubmit} className="flex flex-col gap-4">
            {!isLogin && (
              <div className="auth-field" style={{ animationDelay: '0.04s' }}>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Name</label>
                <div className="relative">
                  <User className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className={inputClass}
                    placeholder="Your name"
                    required
                  />
                </div>
              </div>
            )}

            <div className="auth-field" style={{ animationDelay: '0.1s' }}>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Username</label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={username}
                  onChange={(e) =>
                    setUsername(
                      isLogin ? e.target.value : e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ''),
                    )
                  }
                  className={inputClass}
                  placeholder={isLogin ? 'your username' : 'johndoe123'}
                  required
                />
              </div>
            </div>

            {!isLogin && (
              <div className="auth-field" style={{ animationDelay: '0.16s' }}>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={inputClass}
                    placeholder="you@example.com"
                    required
                  />
                </div>
              </div>
            )}

            <div className="auth-field" style={{ animationDelay: '0.22s' }}>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                {isLogin ? 'Password' : 'Create password'}
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`${inputClass} pr-11`}
                  placeholder="••••••••"
                  required
                  minLength={6}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {isLogin && (
              <div className="-mt-1 flex justify-end">
                <Link
                  href="/forgot-password"
                  onClick={closeModal}
                  className="text-xs font-medium text-primary transition-colors hover:text-primary/80"
                >
                  Forgot password?
                </Link>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="auth-field group mt-1 flex items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-60"
              style={{ animationDelay: '0.28s' }}
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {isLogin ? 'Signing in...' : 'Creating account...'}
                </>
              ) : (
                <>
                  {isLogin ? 'Sign In' : 'Create Account'}
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </>
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="relative my-5">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-card px-3 text-xs text-muted-foreground">or</span>
            </div>
          </div>

          <button
            onClick={closeModal}
            className="rounded-xl border border-border py-3 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
          >
            Continue as Guest
          </button>

          <p className="mt-5 text-center text-xs text-muted-foreground">
            By continuing, you agree to our{' '}
            <Link href="/terms" className="text-foreground underline underline-offset-2 hover:text-primary">
              Terms
            </Link>{' '}
            and{' '}
            <Link href="/privacy" className="text-foreground underline underline-offset-2 hover:text-primary">
              Privacy Policy
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
