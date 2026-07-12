'use client';

/**
 * LoginModal - The actual modal component for signing in or creating an account
 * 
 * This component is rendered at the app level (in ClientLayout) and is hidden by default.
 * It shows/hides based on the AuthModalContext state.
 * 
 * Features:
 * - Toggle between Sign In and Sign Up tabs
 * - Full form validation
 * - AJAX login (no page redirect) using NextAuth
 * - Auto-redirects after successful login if redirectTo is set
 * - "Continue as Guest" option
 * - "Forgot password" link
 * 
 * Connected to: AuthModalContext for global state management
 */

import { useState, useEffect } from 'react';
import { useSession, signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthModal } from './AuthModalContext';

export default function LoginModal() {
  const { isOpen, closeModal, redirectTo } = useAuthModal();
  const { data: session, status } = useSession();
  const router = useRouter();
  
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Reset form when modal opens/closes or mode changes
  useEffect(() => {
    if (isOpen) {
      setUsername('');
      setEmail('');
      setPassword('');
      setName('');
      setError('');
      setLoading(false);
    }
  }, [isOpen, mode]);

  // Redirect if already logged in
  useEffect(() => {
    if (session?.user && isOpen) {
      closeModal();
      if (redirectTo) {
        router.push(redirectTo);
      }
    }
  }, [session, isOpen, redirectTo, closeModal, router]);

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
        // Use window.location for guaranteed redirect
        window.location.href = '/dashboard';
      }
    } else {
      // Signup - validate required fields
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
          // Auto-login after signup - use username
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
      } catch (err) {
        setLoading(false);
        setError('Something went wrong');
      }
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={closeModal}
      />
      
      {/* Modal */}
      <div className="relative bg-slate-800 rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl border border-slate-700">
        {/* Close button */}
        <button
          onClick={closeModal}
          className="absolute top-4 right-4 text-slate-400 hover:text-white text-xl"
        >
          ✕
        </button>

        {/* Header */}
        <div className="text-center mb-6">
          <h2 className="text-2xl font-bold text-white">
            {mode === 'login' ? 'Welcome Back' : 'Create Account'}
          </h2>
          <p className="text-slate-400 mt-1">
            {mode === 'login' ? 'Sign in to your account' : 'Start using AviationHub for free'}
          </p>
        </div>

        {/* Toggle between login/signup */}
        <div className="flex bg-slate-700 rounded-lg p-1 mb-6">
          <button
            type="button"
            onClick={() => setMode('login')}
            className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition ${
              mode === 'login' 
                ? 'bg-slate-600 text-white' 
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => setMode('signup')}
            className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition ${
              mode === 'signup' 
                ? 'bg-slate-600 text-white' 
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Sign Up
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'signup' && (
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-xl border border-slate-600 bg-slate-700 px-4 py-3 text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
                placeholder="Your name"
                required={mode === 'signup'}
              />
            </div>
          )}

          {mode === 'signup' && (
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ''))}
                className="w-full rounded-xl border border-slate-600 bg-slate-700 px-4 py-3 text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
                placeholder="johndoe123"
                required={mode === 'signup'}
              />
            </div>
          )}

          {mode === 'signup' && (
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-slate-600 bg-slate-700 px-4 py-3 text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
                placeholder="you@example.com"
                required
              />
            </div>
          )}

          {mode === 'login' && (
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full rounded-xl border border-slate-600 bg-slate-700 px-4 py-3 text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
                placeholder="your username"
                required
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              {mode === 'login' ? 'Password' : 'Create Password'}
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-slate-600 bg-slate-700 px-4 py-3 text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
              placeholder="••••••••"
              required
              minLength={6}
            />
          </div>

          {mode === 'login' && (
            <div className="flex justify-end">
              <Link 
                href="/desktop/forgot-password" 
                onClick={closeModal}
                className="text-sm text-emerald-400 hover:text-emerald-300"
              >
                Forgot password?
              </Link>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-emerald-500 py-3 font-semibold text-white transition-all hover:bg-emerald-400 disabled:opacity-50"
          >
            {loading 
              ? (mode === 'login' ? 'Signing in...' : 'Creating account...') 
              : (mode === 'login' ? 'Sign In' : 'Create Account')
            }
          </button>
        </form>

        {/* Divider */}
        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-700"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-slate-800 text-slate-500">or</span>
          </div>
        </div>

        {/* Continue as guest */}
        <button
          onClick={closeModal}
          className="w-full rounded-xl border border-slate-600 py-3 font-medium text-slate-300 transition-all hover:bg-slate-700"
        >
          Continue as Guest
        </button>

        {/* Footer note */}
        <p className="text-center text-xs text-slate-500 mt-4">
          By continuing, you agree to our{' '}
          <Link href="/terms" className="text-slate-300 hover:text-white underline underline-offset-2">
            Terms of Service
          </Link>{' '}
          and{' '}
          <Link href="/privacy" className="text-slate-300 hover:text-white underline underline-offset-2">
            Privacy Policy
          </Link>.
        </p>
      </div>
    </div>
  );
}
