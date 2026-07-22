'use client'

import { useEffect, useRef, useState } from 'react'
import { Search, Loader2 } from 'lucide-react'
import { cloudApi } from '@/apps/desktop/src/lib/cloud-api'
import { Input } from '@/components/ui/input'

type Airport = { icao: string; name: string; city?: string; state?: string }

/**
 * Controlled airport search box with a suggestions dropdown. `value` is the
 * current ICAO filter; typing a name/city ("la") surfaces matching airports and
 * picking one sets `value` to its ICAO. Backed by cloudApi.searchAirports.
 */
export function AirportSearch({
  value,
  onChange,
  placeholder = 'ICAO or name (e.g. KPAO)',
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  const [query, setQuery] = useState(value)
  const [results, setResults] = useState<Airport[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [justPicked, setJustPicked] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  // Keep local text in sync when the parent clears/changes the value externally.
  useEffect(() => {
    setQuery(value)
  }, [value])

  // Debounced search. Skips the fetch immediately after a pick.
  useEffect(() => {
    if (justPicked) {
      setJustPicked(false)
      return
    }
    const term = query.trim()
    if (term.length < 2) {
      setResults([])
      setOpen(false)
      return
    }
    let alive = true
    setLoading(true)
    const t = setTimeout(async () => {
      try {
        const res = await cloudApi.searchAirports(term)
        if (!alive) return
        setResults(Array.isArray(res) ? res.slice(0, 8) : [])
        setOpen(true)
      } catch {
        if (alive) setResults([])
      } finally {
        if (alive) setLoading(false)
      }
    }, 250)
    return () => {
      alive = false
      clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  // Close on outside click.
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  function pick(a: Airport) {
    setJustPicked(true)
    setQuery(a.icao)
    onChange(a.icao)
    setOpen(false)
  }

  return (
    <div ref={boxRef} className="relative">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={query}
        onChange={(e) => {
          const v = e.target.value.toUpperCase()
          setQuery(v)
          onChange(v)
        }}
        onFocus={() => {
          if (results.length > 0) setOpen(true)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false)
        }}
        placeholder={placeholder}
        maxLength={40}
        className="pl-8 uppercase"
        autoComplete="off"
      />
      {loading && (
        <Loader2 className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
      )}
      {open && results.length > 0 && (
        <ul className="absolute z-50 mt-1 max-h-72 w-[min(22rem,90vw)] overflow-auto rounded-md border border-border bg-popover p-1 shadow-md">
          {results.map((a) => (
            <li key={a.icao}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(a)}
                className="flex w-full items-baseline gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted"
              >
                <span className="font-mono font-semibold">{a.icao}</span>
                <span className="truncate text-muted-foreground">
                  {a.name}
                  {a.city ? ` · ${a.city}` : ''}
                  {a.state ? `, ${a.state.replace(/^US-/, '')}` : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
