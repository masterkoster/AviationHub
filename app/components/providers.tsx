"use client";

import { SessionProvider } from "next-auth/react";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

import { GlobalNav, NAV_HEIGHT } from "@/components/global-nav";
import { AppShell } from "@/components/shell/app-shell";
import { isShellPath } from "@/components/shell/shell-nav";
import { AuthModalProvider } from "./AuthModalContext";
import LoginModal from "./LoginModal";
import ChatWidget from "./chat-widget";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";

export function Providers({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isV1 = pathname.startsWith("/v1");
  const isDesktop = pathname.startsWith("/desktop");
  const isLandingPage = pathname === "/";
  const isBare = isV1 || isDesktop || isLandingPage;
  const inShell = !isBare && isShellPath(pathname);

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
              <LoginModal />
            </>
          ) : (
            // Public/marketing pages (and bare surfaces: /, /v1, /desktop)
            <>
              {!isBare && <GlobalNav />}
              <div style={isBare ? undefined : { paddingTop: NAV_HEIGHT }}>
                {children}
              </div>
              {!isBare && <LoginModal />}
              {!isBare && <ChatWidget />}
            </>
          )}
          {!isDesktop && <Toaster position="top-right" richColors />}
        </AuthModalProvider>
      </ThemeProvider>
    </SessionProvider>
  );
}
