'use client'

import { useState, useMemo } from 'react'
import { Search, BookOpen, Menu } from 'lucide-react'
import { GLOSSARY_ENTRIES, type GlossaryEntry } from '@/desktop/lib/glossary-data'

const TABS = [
  { id: 'all', label: 'All' },
  { id: 'aviation', label: 'Aviation Terms' },
  { id: 'feature', label: 'Features' },
] as const

type TabId = (typeof TABS)[number]['id']

export default function GlossaryPage() {
  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState<TabId>('all')

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    let entries = GLOSSARY_ENTRIES

    if (activeTab !== 'all') {
      entries = entries.filter((e) => e.category === activeTab)
    }

    if (q) {
      entries = entries.filter(
        (e) =>
          e.term.toLowerCase().includes(q) ||
          e.definition.toLowerCase().includes(q),
      )
    }

    return entries
  }, [search, activeTab])

  return (
    <div className="p-6">
      <div className="mx-auto max-w-4xl space-y-6">
        {/* ── Header ── */}
        <div className="rounded-lg border border-border bg-card shadow-sm">
          <div className="p-5">
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4" />
              <h1 className="text-lg font-semibold">Aviation Glossary</h1>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Aviation terms, abbreviations, and feature descriptions for AviationHub.
            </p>
          </div>
        </div>

        {/* ── Search + Tabs ── */}
        <div className="rounded-lg border border-border bg-card shadow-sm">
          <div className="p-4">
            {/* Search */}
            <div className="relative mb-4">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search terms or definitions..."
                className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            {/* Tabs */}
            <div className="flex gap-1 border-b border-border pb-3">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    activeTab === tab.id
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Count */}
            <p className="mt-3 text-xs text-muted-foreground">
              {filtered.length} {filtered.length === 1 ? 'entry' : 'entries'}
              {search && ` matching "${search}"`}
            </p>
          </div>
        </div>

        {/* ── Results ── */}
        {filtered.length === 0 ? (
          <div className="rounded-lg border border-border bg-card p-8 text-center shadow-sm">
            <Menu className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {search
                ? `No entries matching "${search}". Try a different search term.`
                : 'No entries in this category.'}
            </p>
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {filtered.map((entry) => (
              <GlossaryCard key={entry.term} entry={entry} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function GlossaryCard({ entry }: { entry: GlossaryEntry }) {
  return (
    <div className="group rounded-lg border border-border bg-card p-3 shadow-sm transition-colors hover:border-primary/30 hover:bg-muted/20">
      <div className="mb-1 flex items-center gap-2">
        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {entry.category === 'aviation' ? 'AV' : 'FEATURE'}
        </span>
      </div>
      <h3 className="text-sm font-semibold group-hover:text-primary">{entry.term}</h3>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{entry.definition}</p>
    </div>
  )
}
