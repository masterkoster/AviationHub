'use client';

import { useState, useEffect } from 'react';
import { LayersControl, TileLayer, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

export interface MapLayerOptions {
  baseLayer: 'osm' | 'satellite' | 'terrain' | 'dark';
  showLarge: boolean;
  showMedium: boolean;
  showSmall: boolean;
  showSeaplane: boolean;
  showTerrain: boolean;
  showAirspaces: boolean;
  showFuelPrices: boolean;
  showStatePrices: boolean;
  showTfrs: boolean;
  showPireps: boolean;
  performanceMode: boolean;
}

interface MapControlsProps {
  options: MapLayerOptions;
  onOptionsChange: (options: MapLayerOptions) => void;
}

// Layer configuration
const LAYERS = {
  osm: {
    name: 'OSM',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors'
  },
  satellite: {
    name: 'Sat',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; Esri'
  },
  terrain: {
    name: 'Terrain',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenTopoMap'
  },
  dark: {
    name: 'Dark',
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; CartoDB'
  }
};

export function MapControls({ options, onOptionsChange }: MapControlsProps) {
  const [isCollapsed, setIsCollapsed] = useState(true);

  const toggleOption = (key: keyof MapLayerOptions) => {
    if (key === 'baseLayer') return;
    onOptionsChange({
      ...options,
      [key]: !options[key as keyof MapLayerOptions]
    });
  };

  const setBaseLayer = (layer: MapLayerOptions['baseLayer']) => {
    onOptionsChange({ ...options, baseLayer: layer });
  };

  return (
    <div className={`absolute bottom-4 right-4 z-[1000] transition-all`}>
      {/* Toggle Button */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="bg-slate-800/95 hover:bg-slate-700 text-white p-2 rounded-lg shadow-xl border border-slate-700 mb-2"
        title={isCollapsed ? 'Show Map Controls' : 'Hide Map Controls'}
      >
        {isCollapsed ? '☰' : '✕'}
      </button>

      {!isCollapsed && (
        <div className="bg-slate-800/95 backdrop-blur rounded-lg shadow-xl border border-slate-700 w-48 max-h-[60vh] overflow-y-auto">
          {/* Layer Selector */}
          <div className="p-3 border-b border-slate-700">
            <div className="text-xs font-medium text-slate-400 mb-2 uppercase tracking-wide">Map Layer</div>
            <div className="grid grid-cols-2 gap-1">
              {(Object.keys(LAYERS) as MapLayerOptions['baseLayer'][]).map((layer) => (
                <button
                  key={layer}
                  onClick={() => setBaseLayer(layer)}
                  className={`px-2 py-1.5 text-xs rounded transition-colors ${
                    options.baseLayer === layer
                      ? 'bg-sky-500 text-white'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
                >
                  {LAYERS[layer].name}
                </button>
              ))}
            </div>
          </div>

          {/* Airport Filters */}
          <div className="p-3 border-b border-slate-700">
            <div className="text-xs font-medium text-slate-400 mb-2 uppercase tracking-wide">Airports</div>
            <div className="space-y-1.5">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={options.showLarge}
                  onChange={() => toggleOption('showLarge')}
                  className="w-4 h-4 rounded bg-slate-700 border-slate-600 text-sky-500"
                />
                <span className="text-sm">
                  <span className="inline-block w-2 h-2 rounded-full bg-red-500 mr-1"></span>
                  Large
                </span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={options.showMedium}
                  onChange={() => toggleOption('showMedium')}
                  className="w-4 h-4 rounded bg-slate-700 border-slate-600 text-sky-500"
                />
                <span className="text-sm">
                  <span className="inline-block w-2 h-2 rounded-full bg-amber-500 mr-1"></span>
                  Medium
                </span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={options.showSmall}
                  onChange={() => toggleOption('showSmall')}
                  className="w-4 h-4 rounded bg-slate-700 border-slate-600 text-sky-500"
                />
                <span className="text-sm">
                  <span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-1"></span>
                  Small
                </span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={options.showSeaplane}
                  onChange={() => toggleOption('showSeaplane')}
                  className="w-4 h-4 rounded bg-slate-700 border-slate-600 text-sky-500"
                />
                <span className="text-sm">
                  <span className="inline-block w-2 h-2 rounded-full bg-blue-500 mr-1"></span>
                  Seaplane
                </span>
              </label>
            </div>
          </div>

          {/* Overlays */}
          <div className="p-3">
            <div className="text-xs font-medium text-slate-400 mb-2 uppercase tracking-wide">Overlays</div>
            <div className="space-y-1.5">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={options.showFuelPrices}
                  onChange={() => toggleOption('showFuelPrices')}
                  className="w-4 h-4 rounded bg-slate-700 border-slate-600 text-sky-500"
                />
                <span className="text-sm">💰 Fuel Prices</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={options.showStatePrices}
                  onChange={() => toggleOption('showStatePrices')}
                  className="w-4 h-4 rounded bg-slate-700 border-slate-600 text-sky-500"
                />
                <span className="text-sm">🗺️ State Prices</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={options.showTerrain}
                  onChange={() => toggleOption('showTerrain')}
                  className="w-4 h-4 rounded bg-slate-700 border-slate-600 text-sky-500"
                />
                <span className="text-sm">🏔️ Terrain</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={options.showTfrs}
                  onChange={() => toggleOption('showTfrs')}
                  className="w-4 h-4 rounded bg-slate-700 border-slate-600 text-red-500"
                />
                <span className="text-sm">🔴 TFRs</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={options.showPireps}
                  onChange={() => toggleOption('showPireps')}
                  className="w-4 h-4 rounded bg-slate-700 border-slate-600 text-purple-500"
                />
                <span className="text-sm">🛩️ PIREPs</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={options.performanceMode}
                  onChange={() => toggleOption('performanceMode')}
                  className="w-4 h-4 rounded bg-slate-700 border-slate-600 text-green-500"
                />
                <span className="text-sm">⚡ Performance Mode</span>
              </label>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Default options
export const DEFAULT_MAP_OPTIONS: MapLayerOptions = {
  baseLayer: 'osm',
  showLarge: true,
  showMedium: true,
  showSmall: true,
  showSeaplane: false,
  showTerrain: false,
  showAirspaces: false,
  showFuelPrices: true,
  showStatePrices: true,
  showTfrs: true,
  showPireps: true,
  performanceMode: false
};

// Tile layer component for the map
export function MapTileLayer({ baseLayer }: { baseLayer: MapLayerOptions['baseLayer'] }) {
  const layer = LAYERS[baseLayer];
  return (
    <TileLayer
      key={baseLayer}
      url={layer.url}
      attribution={layer.attribution}
    />
  );
}

export { LAYERS };
