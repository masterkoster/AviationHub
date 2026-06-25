'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { Info } from 'lucide-react'

interface CTA {
  label: string
  href: string
}

interface LocalModePlaceholderProps {
  title: string
  description: string | ReactNode
  cta?: CTA
  icon?: ReactNode
}

export function LocalModePlaceholder({ title, description, cta, icon }: LocalModePlaceholderProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
        {icon || <Info className="h-5 w-5" />}
      </div>
      <h1 className="text-lg font-semibold text-foreground">{title}</h1>
      <p className="max-w-sm text-base text-muted-foreground">{description}</p>
      {cta && (
        <Link
          href={cta.href}
          className="mt-2 rounded-md bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-wide text-primary-foreground transition-colors hover:bg-primary/90"
        >
          {cta.label}
        </Link>
      )}
    </div>
  )
}
