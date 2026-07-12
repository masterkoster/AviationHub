"use client";

import { SessionProvider } from "next-auth/react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { GlobalNav, NAV_HEIGHT } from "@/components/global-nav";
import { AppShell } from "@/components/shell/app-shell";
import { isShellPath } from "@/components/shell/shell-nav";
import { AuthModalProvider } from "./AuthModalContext";
import LoginModal from "./LoginModal";
import ChatWidget from "./chat-widget";
import OfflineBanner from "./offline-banner";
import ConflictModal from "./conflicts-modal";
import { ThemeProvider } from "@/components/theme-provider";

export function Providers({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isV1 = pathname.startsWith("/v1");
  const isDesktop = pathname.startsWith("/desktop");
  const isLandingPage = pathname === "/";
  const isBare = isV1 || isDesktop || isLandingPage;
  const inShell = !isBare && isShellPath(pathname);
  const [showConflicts, setShowConflicts] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        registrations.forEach((registration) => registration.unregister());
      });
    }
  }, []);

  return (
    <SessionProvider>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        <AuthModalProvider>
          {inShell ? (
            // Unified app shell: persona sidebar, command palette, shortcuts
            <>
              <AppShell>{children}</AppShell>
              <OfflineBanner onSyncNow={() => setShowConflicts(true)} />
              <ConflictModal
                isOpen={showConflicts}
                onClose={() => setShowConflicts(false)}
                onResolved={() => {}}
              />
              <LoginModal />
            </>
          ) : (
            // Public/marketing pages (and bare surfaces: /, /v1, /desktop)
            <>
              {!isBare && <GlobalNav />}
              <div style={isBare ? undefined : { paddingTop: NAV_HEIGHT }}>
                {children}
              </div>
              {!isBare && <OfflineBanner onSyncNow={() => setShowConflicts(true)} />}
              <ConflictModal
                isOpen={showConflicts}
                onClose={() => setShowConflicts(false)}
                onResolved={() => {}}
              />
              {!isBare && <LoginModal />}
              {!isBare && <ChatWidget />}
            </>
          )}
        </AuthModalProvider>
      </ThemeProvider>
    </SessionProvider>
  );
}
