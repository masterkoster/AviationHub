"use client";

import { SessionProvider } from "next-auth/react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { GlobalNav, NAV_HEIGHT } from "@/components/global-nav";
import { ModuleNav } from "./module-nav";
import { AuthModalProvider } from "./AuthModalContext";
import LoginModal from "./LoginModal";
import ChatWidget from "./chat-widget";
import { getModuleByPath } from "@/lib/modules";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";

export function Providers({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isHomePage = pathname === "/";
  const isV1 = pathname.startsWith("/v1");
  const isDesktop = pathname.startsWith("/desktop");
  const isLandingPage = pathname === "/";
  const currentModule = pathname ? getModuleByPath(pathname) : undefined;

  // Check if current page has a sub-nav (marketplace, fuel-saver)
  const hasSubNav = pathname.startsWith("/marketplace") || pathname.startsWith("/fuel-saver");

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
          <>
            {!isV1 && !isDesktop && !isLandingPage && <GlobalNav />}
            {!isHomePage && !isV1 && !isDesktop && !isLandingPage && currentModule && currentModule.menu && currentModule.menu.length > 0 && (
              <ModuleNav module={currentModule} />
            )}
            <div className={isHomePage || isV1 || isDesktop || isLandingPage ? "" : ""} style={isHomePage || isV1 || isDesktop || isLandingPage ? undefined : { paddingTop: NAV_HEIGHT + (hasSubNav ? 40 : 0) }}>
              {children}
            </div>
            {!isV1 && !isDesktop && !isLandingPage && <LoginModal />}
            {!isV1 && !isDesktop && !isLandingPage && <ChatWidget />}
            {!isDesktop && <Toaster position="top-right" richColors />}
          </>
        </AuthModalProvider>
      </ThemeProvider>
    </SessionProvider>
  );
}
