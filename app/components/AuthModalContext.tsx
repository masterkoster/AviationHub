'use client';

/**
 * AuthModalContext - Global state for login/signup modal
 * 
 * This context allows any component in the app to trigger the login modal
 * without needing to pass props down through multiple layers.
 * 
 * Usage:
 *   const { openLoginModal } = useAuthModal();
 *   <button onClick={() => openLoginModal()}>Sign In</button>
 * 
 * Optional redirect after login:
 *   openLoginModal('/dashboard');
 */

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

type AuthMode = 'login' | 'signup';

interface AuthModalContextType {
  isOpen: boolean;
  initialMode: AuthMode;
  openLoginModal: (redirectTo?: string) => void;
  openSignupModal: (redirectTo?: string) => void;
  closeModal: () => void;
  redirectTo?: string;
}

const AuthModalContext = createContext<AuthModalContextType | undefined>(undefined);

export function AuthModalProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [initialMode, setInitialMode] = useState<AuthMode>('login');
  const [redirectTo, setRedirectTo] = useState<string | undefined>();

  const openLoginModal = useCallback((redirect?: string) => {
    setInitialMode('login');
    setRedirectTo(redirect);
    setIsOpen(true);
  }, []);

  const openSignupModal = useCallback((redirect?: string) => {
    setInitialMode('signup');
    setRedirectTo(redirect);
    setIsOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setIsOpen(false);
    setRedirectTo(undefined);
  }, []);

  return (
    <AuthModalContext.Provider value={{ isOpen, initialMode, openLoginModal, openSignupModal, closeModal, redirectTo }}>
      {children}
    </AuthModalContext.Provider>
  );
}

export function useAuthModal() {
  const context = useContext(AuthModalContext);
  if (context === undefined) {
    throw new Error('useAuthModal must be used within an AuthModalProvider');
  }
  return context;
}
