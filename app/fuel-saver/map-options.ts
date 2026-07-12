// SSR-safe map option types/defaults. Kept separate from MapControls.tsx so
// server-rendered code can import them without pulling in react-leaflet,
// which touches `window` at module scope.

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
