'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { SessionProvider } from 'next-auth/react';

import { AuthModalProvider } from './AuthModalContext';
import LoginModal from './LoginModal';
import ChatWidget from './chat-widget';
import { GlobalHeader } from './global-header';
import { ModuleNav } from './module-nav';
import { getModuleByPath } from '@/lib/modules';

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isHomePage = pathname === '/';
  const currentModule = pathname ? getModuleByPath(pathname) : undefined;

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        registrations.forEach((registration) => registration.unregister());
      });
    }
  }, []);

  const mainPadding = isHomePage
    ? ''
    : '';

  return (
    <SessionProvider>
      <AuthModalProvider>
        <>
          {!isHomePage && (
            <>
              <GlobalHeader />
              {currentModule && currentModule.menu && currentModule.menu.length > 0 && (
                <ModuleNav module={currentModule} />
              )}
            </>
          )}
          <main className={mainPadding}>{children}</main>
          <LoginModal />
          <ChatWidget />
        </>
      </AuthModalProvider>
    </SessionProvider>
  );
}
