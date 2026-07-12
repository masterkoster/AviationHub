'use client';

import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import LayerPanel from './components/layer-panel'
import type { LayerState, RadarSource, BasemapMode } from './components/layer-panel'
import MetarStations from './components/metar-stations'
import type { MetarStation } from './components/metar-stations'
import WeatherPopup from './components/weather-popup'
import HazardLayer from './components/hazard-layer'
import RadarLegend from './components/radar-legend'
import { fetchRadarFrames } from '@/desktop/lib/weather-fetch'

// Fix Leaflet default icons (works in production builds)
const markerIconUrl = new URL('leaflet/dist/images/marker-icon.png', import.meta.url).toString();
const markerIconRetinaUrl = new URL('leaflet/dist/images/marker-icon-2x.png', import.meta.url).toString();
const markerShadowUrl = new URL('leaflet/dist/images/marker-shadow.png', import.meta.url).toString();

L.Icon.Default.mergeOptions({
  iconUrl: markerIconUrl,
  iconRetinaUrl: markerIconRetinaUrl,
  shadowUrl: markerShadowUrl,
});

export default function WeatherRadarMap() {
  const mapRef = useRef<L.Map | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const baseLayerRef = useRef<L.TileLayer | null>(null);
  const radarLayerARef = useRef<L.TileLayer | null>(null);
  const radarLayerBRef = useRef<L.TileLayer | null>(null);
  const activeRadarLayerRef = useRef<'A' | 'B'>('A');
  const transitionRafRef = useRef<number | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const frameIndexRef = useRef(0);
  const playTokenRef = useRef(0);

  const [radarMode, setRadarMode] = useState<RadarSource>('mrms');
  const [clockMs, setClockMs] = useState(() => Date.now());
  const radarTileErrorRef = useRef(0);
  const [layers, setLayers] = useState<LayerState>({ radar: true, metar: false, hazards: false });
  const [selectedStation, setSelectedStation] = useState<MetarStation | null>(null);
  const [rainviewerFrames, setRainviewerFrames] = useState<Array<{ time: number; path: string }> | null>(null);

  const MRMS_STEP_MIN = 2;
  const MRMS_WINDOW_MIN = 120;
  const MRMS_LATENCY_MIN = 10;

  useEffect(() => {
    const t = window.setInterval(() => setClockMs(Date.now()), 60_000);
    return () => window.clearInterval(t);
  }, []);

  const mrmsBaseUtcMs = useMemo(() => {
    const d = new Date(clockMs);
    // floor to minute
    d.setUTCSeconds(0, 0);
    // floor to even minute
    d.setUTCMinutes(d.getUTCMinutes() - (d.getUTCMinutes() % MRMS_STEP_MIN));
    // latency
    d.setUTCMinutes(d.getUTCMinutes() - MRMS_LATENCY_MIN);
    return d.getTime();
  }, [clockMs]);

  function formatUtcStamp(ms: number) {
    const d = new Date(ms);
    const y = d.getUTCFullYear();
    const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
    const da = String(d.getUTCDate()).padStart(2, '0');
    const h = String(d.getUTCHours()).padStart(2, '0');
    const mi = String(d.getUTCMinutes()).padStart(2, '0');
    return `${y}${mo}${da}${h}${mi}`;
  }

  const frames = useMemo(() => {
    if (radarMode === 'nexrad') {
      const mins = [55, 50, 45, 40, 35, 30, 25, 20, 15, 10, 5, 0];
      return mins.map((m) => ({ minutesAgo: m, kind: 'nexrad' as const }));
    }

    // MRMS archived frames every 2 minutes.
    const out: Array<{ minutesAgo: number; kind: 'mrms'; ts: string }> = [];
    for (let m = MRMS_WINDOW_MIN; m >= 0; m -= MRMS_STEP_MIN) {
      const ts = formatUtcStamp(mrmsBaseUtcMs - m * 60_000);
      out.push({ minutesAgo: m, kind: 'mrms', ts });
    }
    return out;
  }, [radarMode, mrmsBaseUtcMs]);

  const [frameIndex, setFrameIndex] = useState(frames.length - 1);

  useEffect(() => {
    // When mode/frames change, keep index in range and default to newest.
    setFrameIndex((prev) => {
      if (!frames.length) return 0;
      if (prev >= 0 && prev < frames.length) return prev;
      return frames.length - 1;
    });
  }, [frames.length]);

  const [jumpIcao, setJumpIcao] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [loadingFrames, setLoadingFrames] = useState(false);
  const [radarOpacity, setRadarOpacity] = useState(0.72);
  const [basemap, setBasemap] = useState<'light' | 'dark'>('light');
  const [showLegend, setShowLegend] = useState(false);
  const [speedMs, setSpeedMs] = useState(450);
  const [preloadEnabled, setPreloadEnabled] = useState(true);

  // Frames are fixed for IEM (0-55 minutes). No fetch needed.
  useEffect(() => {
    // Initialize map
    const map = L.map('weather-radar-map', {
      center: [39.8283, -98.5795], // Center of US
      zoom: 6,
      zoomControl: false,
    });

    mapRef.current = map;
    setMapReady(true);

    L.control
      .zoom({ position: 'bottomright' })
      .addTo(map);

    baseLayerRef.current = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '© OpenStreetMap, © CARTO',
      maxZoom: 19,
    }).addTo(map);

    const pauseOnMove = () => setIsPlaying(false);
    map.on('movestart', pauseOnMove);
    map.on('zoomstart', pauseOnMove);

    return () => {
      playTokenRef.current += 1;
      if (transitionRafRef.current) {
        cancelAnimationFrame(transitionRafRef.current);
        transitionRafRef.current = null;
      }
      setMapReady(false);
      map.off('movestart', pauseOnMove);
      map.off('zoomstart', pauseOnMove);
      map.remove();
    };
  }, []);

  useEffect(() => {
    const layer = baseLayerRef.current;
    if (!layer) return;

    const url = basemap === 'dark'
      ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
      : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
    layer.setUrl(url);
  }, [basemap]);

  // ── RainViewer frame fetch ──
  useEffect(() => {
    if (radarMode !== 'rainviewer') return
    let cancelled = false
    fetchRadarFrames().then((data) => {
      if (!cancelled && data.past.length > 0) setRainviewerFrames(data.past)
    })
    return () => { cancelled = true }
  }, [radarMode])

  const currentFrame = frames[frameIndex] || null;
  const currentTileUrl = useMemo(() => {
    if (radarMode === 'rainviewer') {
      if (!rainviewerFrames?.length) return null
      // Use latest frame
      const frame = rainviewerFrames[rainviewerFrames.length - 1]
      return `https://tilecache.rainviewer.com/v2/radar/${frame.time}/256/{z}/{x}/{y}/2/1_1.png`
    }
    if (!currentFrame) return null;
    if (currentFrame.kind === 'mrms') {
      const layer = `mrms::lcref-${currentFrame.ts}`;
      return `https://mesonet{s}.agron.iastate.edu/cache/tile.py/1.0.0/${encodeURIComponent(layer)}-900913/{z}/{x}/{y}.png`;
    }

    const m = currentFrame.minutesAgo;
    const layer = m === 0 ? 'nexrad-n0q' : `nexrad-n0q-m${String(m).padStart(2, '0')}m`;
    return `https://mesonet{s}.agron.iastate.edu/cache/tile.py/1.0.0/${layer}-900913/{z}/{x}/{y}.png`;
  }, [currentFrame, radarMode, rainviewerFrames]);

  useEffect(() => {
    frameIndexRef.current = frameIndex;
  }, [frameIndex]);

  function tileUrlForFrame(frame: any) {
    if (radarMode === 'rainviewer') {
      if (!rainviewerFrames?.length) return null
      const f = rainviewerFrames[rainviewerFrames.length - 1]
      return `https://tilecache.rainviewer.com/v2/radar/${f.time}/256/{z}/{x}/{y}/2/1_1.png`
    }
    if (frame?.kind === 'mrms') {
      const layer = `mrms::lcref-${frame.ts}`;
      return `https://mesonet{s}.agron.iastate.edu/cache/tile.py/1.0.0/${encodeURIComponent(layer)}-900913/{z}/{x}/{y}.png`;
    }
    const m = Number(frame?.minutesAgo) || 0;
    const layer = m === 0 ? 'nexrad-n0q' : `nexrad-n0q-m${String(m).padStart(2, '0')}m`;
    return `https://mesonet{s}.agron.iastate.edu/cache/tile.py/1.0.0/${layer}-900913/{z}/{x}/{y}.png`;
  }

  // Ensure radar layers exist once the map is ready.
  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;
    if (!currentTileUrl) return;

    if (!radarLayerARef.current) {
      radarLayerARef.current = L.tileLayer(currentTileUrl, {
        attribution: 'Radar © Iowa Environmental Mesonet',
        opacity: radarOpacity,
        maxZoom: 12,
        zIndex: 500,
        subdomains: ['1', '2', '3'],
        updateWhenIdle: true,
        updateWhenZooming: false,
        keepBuffer: 4,
      }).addTo(map);

      radarLayerARef.current.on('tileerror', () => {
        radarTileErrorRef.current += 1;
        // If MRMS is missing/unavailable, fall back to NEXRAD.
        if (radarMode === 'mrms' && radarTileErrorRef.current >= 8) {
          setRadarMode('nexrad');
          setNotice('High-res radar temporarily unavailable. Switched to standard radar.');
        }
      });
    }

    if (!radarLayerBRef.current) {
      radarLayerBRef.current = L.tileLayer(currentTileUrl, {
        attribution: 'Radar © Iowa Environmental Mesonet',
        opacity: 0,
        maxZoom: 12,
        zIndex: 501,
        subdomains: ['1', '2', '3'],
        updateWhenIdle: true,
        updateWhenZooming: false,
        keepBuffer: 4,
      }).addTo(map);

      radarLayerBRef.current.on('tileerror', () => {
        radarTileErrorRef.current += 1;
        if (radarMode === 'mrms' && radarTileErrorRef.current >= 8) {
          setRadarMode('nexrad');
          setNotice('High-res radar temporarily unavailable. Switched to standard radar.');
        }
      });
    }
  }, [currentTileUrl, radarOpacity, mapReady]);

  useEffect(() => {
    radarTileErrorRef.current = 0;
  }, [radarMode]);

  // Keep opacity in sync.
  useEffect(() => {
    if (activeRadarLayerRef.current === 'A') {
      radarLayerARef.current?.setOpacity(radarOpacity);
      radarLayerBRef.current?.setOpacity(0);
    } else {
      radarLayerBRef.current?.setOpacity(radarOpacity);
      radarLayerARef.current?.setOpacity(0);
    }
  }, [radarOpacity]);

  // When scrubbing (not playing), snap the active layer to the selected frame.
  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;
    if (isPlaying) return;
    if (!currentFrame) return;

    const active = activeRadarLayerRef.current;
    const activeLayer = active === 'A' ? radarLayerARef.current : radarLayerBRef.current;
    const inactiveLayer = active === 'A' ? radarLayerBRef.current : radarLayerARef.current;
    if (!activeLayer || !inactiveLayer) return;

    const url = tileUrlForFrame(currentFrame);
    if (url) activeLayer.setUrl(url);
    activeLayer.setOpacity(radarOpacity);
    inactiveLayer.setOpacity(0);
  }, [currentFrame, isPlaying, mapReady, radarOpacity]);

  // Playback loop with smooth cross-fade.
  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;
    if (!isPlaying) return;
    if (frames.length < 2) return;

    const token = ++playTokenRef.current;

    const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

    const waitForVisibleTiles = (layer: L.TileLayer, timeoutMs: number) => {
      return new Promise<void>((resolve) => {
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          layer.off('load', onLoad);
          window.clearTimeout(timer);
          resolve();
        };

        const onLoad = () => finish();
        layer.on('load', onLoad);
        const timer = window.setTimeout(() => finish(), timeoutMs);
      });
    };

    const fade = (activeLayer: L.TileLayer, inactiveLayer: L.TileLayer, duration: number) => {
      return new Promise<void>((resolve) => {
        const start = performance.now();
        const tick = (now: number) => {
          if (playTokenRef.current !== token) {
            resolve();
            return;
          }
          const t = Math.min(1, (now - start) / duration);
          const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
          activeLayer.setOpacity((1 - eased) * radarOpacity);
          inactiveLayer.setOpacity(eased * radarOpacity);

          if (t < 1) {
            transitionRafRef.current = requestAnimationFrame(tick);
            return;
          }

          transitionRafRef.current = null;
          resolve();
        };

        transitionRafRef.current = requestAnimationFrame(tick);
      });
    };

    const run = async () => {
      while (playTokenRef.current === token) {
        const curIdx = frameIndexRef.current;
        const nextIdx = (curIdx + 1) % frames.length;
        const cur = frames[curIdx];
        const next = frames[nextIdx];
        if (!cur || !next) return;

        const activeKey = activeRadarLayerRef.current;
        const activeLayer = activeKey === 'A' ? radarLayerARef.current : radarLayerBRef.current;
        const inactiveLayer = activeKey === 'A' ? radarLayerBRef.current : radarLayerARef.current;
        if (!activeLayer || !inactiveLayer) return;

        const curUrl = tileUrlForFrame(cur);
        const nextUrl = tileUrlForFrame(next);
        if (curUrl) activeLayer.setUrl(curUrl);
        if (nextUrl) inactiveLayer.setUrl(nextUrl);
        activeLayer.setOpacity(radarOpacity);
        inactiveLayer.setOpacity(0);

        if (preloadEnabled) {
          // Wait briefly for the next frame tiles to load before fading.
          await waitForVisibleTiles(inactiveLayer, 900);
        }

        // Favor continuous blending over pauses.
        const fadeDuration = Math.max(260, Math.min(1400, Math.round(speedMs)));
        await fade(activeLayer, inactiveLayer, fadeDuration);

        if (playTokenRef.current !== token) return;

        activeRadarLayerRef.current = activeKey === 'A' ? 'B' : 'A';
        setFrameIndex(nextIdx);

        // No extra rest; keep it moving.
      }
    };

    run();

    return () => {
      playTokenRef.current += 1;
      if (transitionRafRef.current) {
        cancelAnimationFrame(transitionRafRef.current);
        transitionRafRef.current = null;
      }
    };
  }, [isPlaying, mapReady, radarOpacity, speedMs, frames, preloadEnabled]);

  const frameLabel = useMemo(() => {
    if (!currentFrame) return '—';
    try {
      if (currentFrame.kind === 'mrms') {
        const then = mrmsBaseUtcMs - currentFrame.minutesAgo * 60_000;
        return new Date(then).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }
      const then = Date.now() - currentFrame.minutesAgo * 60_000;
      return new Date(then).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  }, [currentFrame, mrmsBaseUtcMs]);

  const frameRelativeLabel = useMemo(() => {
    if (!currentFrame) return '';
    const extra = currentFrame.kind === 'mrms' ? MRMS_LATENCY_MIN : 0;
    const total = currentFrame.minutesAgo + extra;
    return total <= 0 ? 'now' : `${total}m ago`;
  }, [currentFrame]);


  async function jumpToAirport() {
    const map = mapRef.current;
    if (!mapReady || !map) return;
    const icao = jumpIcao.trim().toUpperCase();
    if (!icao) return;

    setNotice(null);
    try {
      const res = await fetch(`/api/airports/${encodeURIComponent(icao)}`);
      if (!res.ok) {
        setNotice('Airport not found. Try ICAO (KDTW) or IATA (DTW).');
        return;
      }
      const data = await res.json();
      const lat = Number(data.latitude);
      const lon = Number(data.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        setNotice('Airport location missing.');
        return;
      }

      map.setView([lat, lon], Math.max(map.getZoom(), 8), { animate: true });

      if (markerRef.current && map.hasLayer(markerRef.current)) {
        map.removeLayer(markerRef.current);
        markerRef.current = null;
      }

      markerRef.current = L.marker([lat, lon]).addTo(map);
      const label = `${data.name || icao}${data.city ? ` • ${data.city}` : ''}`;
      markerRef.current.bindPopup(label).openPopup();
    } catch (error) {
      console.error('Airport jump failed', error);
      setNotice('Failed to jump to airport.');
    }
  }

  function jumpToMyLocation() {
    const map = mapRef.current;
    if (!mapReady || !map) return;
    setNotice(null);

    if (!navigator.geolocation) {
      setNotice('Geolocation not available in this browser.');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        map.setView([lat, lon], Math.max(map.getZoom(), 8), { animate: true });
      },
      () => setNotice('Location permission denied by browser settings.'),
      { enableHighAccuracy: false, timeout: 6000 }
    );
  }

  function zoomIn() {
    mapRef.current?.zoomIn();
  }

  function zoomOut() {
    mapRef.current?.zoomOut();
  }

  return (
    <div className="relative h-full bg-slate-950">
      {/* Map Container */}
      <div id="weather-radar-map" className="h-full w-full" />

      {/* Overlay layers (null-rendering — they manage Leaflet map layers) */}
      <MetarStations
        map={mapRef.current}
        enabled={layers.metar}
        onStationClick={setSelectedStation}
      />
      <HazardLayer
        map={mapRef.current}
        enabled={layers.hazards}
      />

      {/* Weather popup (on station click) */}
      {selectedStation && (
        <div className="absolute top-24 right-4 z-[1000] pointer-events-auto" style={{ maxWidth: 'calc(100% - 2rem)' }}>
          <WeatherPopup station={selectedStation} onClose={() => setSelectedStation(null)} />
        </div>
      )}

      {/* Legend toggle */}
      <RadarLegend show={showLegend} onClose={() => setShowLegend(false)} />

      {/* Top bar — radar source + timestamp */}
      <div className="absolute top-0 left-0 right-0 z-[1000] px-4 pt-4 pointer-events-none">
        <div className="mx-auto max-w-6xl">
          <div className="pointer-events-auto flex items-center gap-3 rounded-2xl border border-slate-200/10 bg-slate-900/60 backdrop-blur-xl shadow-xl px-3 py-3">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-emerald-400" />
              <div className="text-sm font-semibold text-white">
                {radarMode === 'mrms' ? 'MRMS' : radarMode === 'nexrad' ? 'NEXRAD' : 'RainViewer'}
              </div>
              <div className="text-xs text-slate-300">{frameLabel}{frameRelativeLabel ? ` • ${frameRelativeLabel}` : ''}</div>
            </div>
            <div className="flex-1" />
            <button
              onClick={() => setPreloadEnabled((v) => !v)}
              className="text-xs px-3 py-2 rounded-full bg-slate-800/70 hover:bg-slate-700/70 text-slate-200 border border-slate-700"
              title="Preload tiles before fading"
            >
              Preload: {preloadEnabled ? 'On' : 'Off'}
            </button>
          </div>
        </div>
      </div>

      {/* Left tool rail */}
      <div className="absolute top-24 left-4 z-[1000] pointer-events-auto">
        <div className="flex flex-col gap-2 rounded-2xl border border-slate-200/10 bg-slate-900/60 backdrop-blur-xl shadow-xl p-2">
          {/* Layer panel button + dropdown */}
          <LayerPanel
            layers={layers}
            onToggle={(layer) => setLayers((prev) => ({ ...prev, [layer]: !prev[layer] }))}
            radarSource={radarMode}
            onRadarSourceChange={setRadarMode}
            basemap={basemap}
            onBasemapChange={setBasemap}
            radarOpacity={radarOpacity}
            onRadarOpacityChange={setRadarOpacity}
          />
          <button
            onClick={jumpToMyLocation}
            className="h-10 w-10 rounded-xl bg-slate-800/70 hover:bg-slate-700/70 border border-slate-700 text-slate-200 text-sm"
            title="Use my location"
          >
            ⦿
          </button>
          <button
            onClick={() => setShowLegend((v) => !v)}
            className="h-10 w-10 rounded-xl bg-slate-800/70 hover:bg-slate-700/70 border border-slate-700 text-slate-200 text-sm"
            title="Legend"
          >
            ≋
          </button>
        </div>
      </div>

      {/* Search box */}
      <div className="absolute top-24 left-1/2 -translate-x-1/2 z-[1000] w-[min(520px,calc(100%-2rem))] pointer-events-auto">
        <div className="rounded-2xl border border-slate-200/10 bg-slate-900/60 backdrop-blur-xl shadow-xl px-3 py-2 flex items-center gap-2">
          <div className="text-slate-300 text-sm">Go to</div>
          <input
            value={jumpIcao}
            onChange={(e) => setJumpIcao(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') jumpToAirport();
            }}
            placeholder="Airport code (DTW / KDTW)"
            className="flex-1 bg-transparent outline-none text-white text-sm placeholder:text-slate-500"
          />
          <button
            onClick={jumpToAirport}
            className="px-3 py-2 rounded-xl bg-emerald-500/90 hover:bg-emerald-400 text-white text-sm"
          >
            Go
          </button>
        </div>
        {notice && (
          <div className="mt-2 text-xs text-amber-200 bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2">
            {notice}
          </div>
        )}
      </div>

      {/* Bottom timeline */}
      <div className="absolute bottom-4 left-4 right-4 z-[1000] pointer-events-none">
        <div className="mx-auto max-w-6xl pointer-events-auto">
          <div className="rounded-2xl border border-slate-200/10 bg-slate-900/60 backdrop-blur-xl shadow-xl px-4 py-3">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setIsPlaying((p) => !p)}
                disabled={frames.length < 2}
                className={`px-3 py-2 rounded-xl text-sm font-medium border border-slate-700 disabled:opacity-50 disabled:cursor-not-allowed ${
                  isPlaying ? 'bg-red-500/80 hover:bg-red-400 text-white' : 'bg-slate-800/70 hover:bg-slate-700/70 text-white'
                }`}
              >
                {isPlaying ? 'Pause' : 'Play'}
              </button>

              <div className="flex-1">
                <input
                  type="range"
                  min={0}
                  max={Math.max(0, frames.length - 1)}
                  value={Math.min(frameIndex, Math.max(0, frames.length - 1))}
                  onChange={(e) => {
                    setIsPlaying(false);
                    setFrameIndex(Number(e.target.value));
                  }}
                  disabled={!frames.length}
                  className="w-full"
                />
                <div className="mt-1 flex items-center justify-between text-[11px] text-slate-300">
                  <span>{loadingFrames ? 'Loading frames…' : frames.length ? 'Past radar' : 'No data'}</span>
                  <span>{frameLabel}{frameRelativeLabel ? ` • ${frameRelativeLabel}` : ''}</span>
                </div>
              </div>

              <div className="hidden md:flex items-center gap-2">
                <div className="text-[11px] text-slate-300">Opacity</div>
                <input
                  type="range"
                  min={0.2}
                  max={0.95}
                  step={0.01}
                  value={radarOpacity}
                  onChange={(e) => setRadarOpacity(Number(e.target.value))}
                />
              </div>

              <div className="hidden lg:flex items-center gap-2">
                <div className="text-[11px] text-slate-300">Speed</div>
                <select
                  value={speedMs}
                  onChange={(e) => setSpeedMs(Number(e.target.value))}
                  className="bg-slate-800/70 border border-slate-700 rounded-xl px-2 py-2 text-xs text-white"
                >
                  <option value={300}>Fast</option>
                  <option value={450}>Normal</option>
                  <option value={700}>Slow</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Zoom buttons */}
      <div className="absolute bottom-28 right-4 z-[1000] pointer-events-auto">
        <div className="flex flex-col gap-2 rounded-2xl border border-slate-200/10 bg-slate-900/60 backdrop-blur-xl shadow-xl p-2">
          <button
            onClick={zoomIn}
            className="h-10 w-10 rounded-xl bg-slate-800/70 hover:bg-slate-700/70 border border-slate-700 text-slate-200 text-lg"
            title="Zoom in"
          >
            +
          </button>
          <button
            onClick={zoomOut}
            className="h-10 w-10 rounded-xl bg-slate-800/70 hover:bg-slate-700/70 border border-slate-700 text-slate-200 text-lg"
            title="Zoom out"
          >
            −
          </button>
        </div>
      </div>

      {/* Legend (toggle) */}
      {showLegend && (
        <div className="absolute top-24 right-4 z-[1000] pointer-events-auto w-[260px]">
          <div className="rounded-2xl border border-slate-200/10 bg-slate-900/60 backdrop-blur-xl shadow-xl p-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-white">Intensity</div>
              <button
                onClick={() => setShowLegend(false)}
                className="text-xs text-slate-300 hover:text-white"
              >
                Close
              </button>
            </div>
            <div className="mt-3 space-y-2">
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded bg-blue-300" />
                <span className="text-xs text-slate-200">Light</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded bg-blue-500" />
                <span className="text-xs text-slate-200">Moderate</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded bg-yellow-500" />
                <span className="text-xs text-slate-200">Heavy</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded bg-red-500" />
                <span className="text-xs text-slate-200">Severe</span>
              </div>
            </div>
            <div className="mt-3 text-[11px] text-slate-400">
              Radar tiles: RainViewer.
            </div>
          </div>
        </div>
      )}

      {/* Empty state overlay */}
      {!loadingFrames && frames.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="bg-slate-900/60 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-200">
            No radar frames available right now.
          </div>
        </div>
      )}
    </div>
  );
}
