"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AppModule } from "@/lib/modules";

interface ModuleNavProps {
  module: AppModule;
}

export function ModuleNav({ module }: ModuleNavProps) {
  if (!module.menu || module.menu.length === 0) {
    return null;
  }

  const pathname = usePathname();

  return (
    <div className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center gap-2 px-4 py-3 lg:px-8">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <span className="text-muted-foreground/70">{module.icon}</span>
          <span>{module.name}</span>
        </div>
        <span className="h-4 w-px bg-border/60" aria-hidden="true" />
        <nav className="flex items-center gap-1 overflow-x-auto">
          {module.menu.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
