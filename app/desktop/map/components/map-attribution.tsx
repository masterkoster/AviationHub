'use client'

import type { MapBaseLayer } from '@/shared/components/map/maplibre-style'

type AttributionDetail = 'minimal' | 'standard' | 'full'

interface MapAttributionProps {
  baseLayer: MapBaseLayer
  detail: AttributionDetail
}

interface AttributionLinks {
  name: string
  url: string
}

const ATTRIBUTIONS: Record<MapBaseLayer, Record<AttributionDetail, { text: string; links?: AttributionLinks[] }>> = {
  osm: {
    minimal: { text: '© OpenStreetMap' },
    standard: { text: '© OpenStreetMap contributors' },
    full: {
      text: '© OpenStreetMap contributors',
      links: [{ name: 'openstreetmap.org/copyright', url: 'https://openstreetmap.org/copyright' }],
    },
  },
  satellite: {
    minimal: { text: '© Esri' },
    standard: { text: '© Esri — World Imagery' },
    full: {
      text: '© Esri — Maxar, Earthstar Geographics',
      links: [{ name: 'esri.com', url: 'https://www.esri.com' }],
    },
  },
  terrain: {
    minimal: { text: '© OpenTopoMap' },
    standard: { text: '© OpenTopoMap — SRTM' },
    full: {
      text: '© OpenTopoMap — SRTM/ASTER data, CC BY-SA',
      links: [{ name: 'opentopomap.org', url: 'https://opentopomap.org' }],
    },
  },
  dark: {
    minimal: { text: '© CartoDB' },
    standard: { text: '© CartoDB — Dark Matter' },
    full: {
      text: '© CartoDB — carto.com/about/maps, CC BY 3.0',
      links: [{ name: 'carto.com', url: 'https://carto.com/about/maps' }],
    },
  },
  aero: {
    minimal: { text: '© Esri — NGA' },
    standard: { text: '© Esri — NGA World Navigation Charts' },
    full: {
      text: '© Esri — NGA ONC 1:1M via ArcGIS Online',
      links: [{ name: 'arcgis.com', url: 'https://www.arcgis.com' }],
    },
  },
}

export function MapAttribution({ baseLayer, detail }: MapAttributionProps) {
  const entry = ATTRIBUTIONS[baseLayer]?.[detail] ?? ATTRIBUTIONS.osm[detail]
  const text = entry.text
  const links = entry.links

  // ── Minimal: bare, no chrome ──
  if (detail === 'minimal') {
    return (
      <div className="pointer-events-none absolute bottom-1 left-1 z-[1000]">
        <span className="inline-block px-1 text-[10px] leading-tight text-muted-foreground/60 select-none">
          {text}
        </span>
      </div>
    )
  }

  // ── Standard: subtle card ──
  if (detail === 'standard') {
    return (
      <div className="pointer-events-none absolute bottom-1 left-1 z-[1000]">
        <div className="rounded bg-background/50 px-2 py-1 text-[11px] leading-snug text-muted-foreground/80 border border-border/20 select-none">
          {text}
        </div>
      </div>
    )
  }

  // ── Full: prominent card with clickable links ──
  return (
    <div className="pointer-events-none absolute bottom-1 left-1 z-[1000]">
      <div className="pointer-events-auto rounded-md bg-background/75 px-2.5 py-1.5 text-[12px] leading-snug text-muted-foreground border border-border/40 backdrop-blur-sm shadow-sm">
        <span>{text}</span>
        {links && links.length > 0 && (
          <span className="ml-1">
            {links.map((link, i) => (
              <span key={link.url}>
                {i === 0 ? ' — ' : ', '}
                <a
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline decoration-dotted underline-offset-2 text-foreground/70 hover:text-foreground transition-colors"
                >
                  {link.name}
                </a>
              </span>
            ))}
          </span>
        )}
      </div>
    </div>
  )
}
