"use client";

import { SessionProvider } from "next-auth/react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { GlobalNav, NAV_HEIGHT } from "@/components/global-nav";
import { ModuleNav } from "./module-nav";
import { AuthModalProvider } from "./AuthModalContext";
import LoginModal from "./LoginModal";
import ChatWidget from "./chat-widget";
import OfflineBanner from "./offline-banner";
import ConflictModal from "./conflicts-modal";
import { getModuleByPath } from "@/lib/modules";
import { ThemeProvider } from "@/components/theme-provider";

export function Providers({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isHomePage = pathname === "/";
  const currentModule = pathname ? getModuleByPath(pathname) : undefined;
  const [showConflicts, setShowConflicts] = useState(false);

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
            <GlobalNav />
            {!isHomePage && currentModule && currentModule.menu && currentModule.menu.length > 0 && (
              <ModuleNav module={currentModule} />
            )}
            <div className={isHomePage ? "" : ""} style={isHomePage ? undefined : { paddingTop: NAV_HEIGHT + (hasSubNav ? 40 : 0) }}>
              {children}
            </div>
            <OfflineBanner onSyncNow={() => setShowConflicts(true)} />
            <ConflictModal
              isOpen={showConflicts}
              onClose={() => setShowConflicts(false)}
              onResolved={() => {}}
            />
            <LoginModal />
            <ChatWidget />
          </>
        </AuthModalProvider>
      </ThemeProvider>
    </SessionProvider>
  );
}
