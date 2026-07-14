'use client'

/**
 * Compass Rose — SVG compass with optional route bearing needle.
 * Shows cardinal (N/S/E/W) and intercardinal (NE/NW/SE/SW) directions.
 * When `bearing` is provided, renders a yellow needle pointing in that direction
 * with a numeric readout in the center.
 */

interface CompassRoseProps {
  size?: number
  bearing?: number | null
}

export function CompassRose({ size = 64, bearing = null }: CompassRoseProps) {
  const r = size / 2
  const inner = r * 0.55
  const tick = r * 0.12
  const labelR = r * 0.78

  const dirs = [
    { angle: 0, label: 'N', major: true },
    { angle: 45, label: 'NE', major: false },
    { angle: 90, label: 'E', major: true },
    { angle: 135, label: 'SE', major: false },
    { angle: 180, label: 'S', major: true },
    { angle: 225, label: 'SW', major: false },
    { angle: 270, label: 'W', major: true },
    { angle: 315, label: 'NW', major: false },
  ]

  const hasBearing = bearing != null && Number.isFinite(bearing)
  const bearingRad = hasBearing ? (bearing! * Math.PI) / 180 : 0

  return (
    <div className="pointer-events-none absolute bottom-2 right-2 z-[1000]" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
        {/* Background circle */}
        <circle cx={r} cy={r} r={r - 1} fill="rgba(0,0,0,0.45)" stroke="rgba(255,255,255,0.15)" strokeWidth={1} />

        {/* Tick marks + direction labels */}
        {dirs.map(({ angle, label, major }) => {
          const rad = (angle * Math.PI) / 180
          const cos = Math.cos(rad)
          const sin = Math.sin(rad)
          const outerX = r + cos * (r - 4)
          const outerY = r + sin * (r - 4)
          const innerX = r + cos * (r - (major ? tick * 2.2 : tick * 1.4))
          const innerY = r + sin * (r - (major ? tick * 2.2 : tick * 1.4))
          const labelX = r + cos * labelR
          const labelY = r + sin * labelR

          return (
            <g key={angle}>
              <line
                x1={innerX} y1={innerY}
                x2={outerX} y2={outerY}
                stroke={angle === 0 ? '#ef4444' : 'rgba(255,255,255,0.7)'}
                strokeWidth={major ? 1.8 : 1}
                strokeLinecap="round"
              />
              <text
                x={labelX}
                y={labelY}
                textAnchor="middle"
                dominantBaseline="central"
                fill={angle === 0 ? '#ef4444' : angle === 180 ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.6)'}
                fontSize={major ? 9 : 7}
                fontWeight={major ? 700 : 400}
                fontFamily="system-ui, sans-serif"
              >
                {label}
              </text>
            </g>
          )
        })}

        {/* Route bearing needle */}
        {hasBearing && (
          <g>
            {/* Needle line from center outward at bearing angle */}
            <line
              x1={r}
              y1={r}
              x2={r + Math.sin(bearingRad) * (r - 8)}
              y2={r - Math.cos(bearingRad) * (r - 8)}
              stroke="#facc15"
              strokeWidth={2}
              strokeLinecap="round"
            />
            {/* Needle tip */}
            <circle
              cx={r + Math.sin(bearingRad) * (r - 8)}
              cy={r - Math.cos(bearingRad) * (r - 8)}
              r={2.5}
              fill="#facc15"
            />
          </g>
        )}

        {/* Center: bearing readout or diamond */}
        {hasBearing ? (
          <text
            x={r}
            y={r + 1}
            textAnchor="middle"
            dominantBaseline="central"
            fill="#facc15"
            fontSize={8}
            fontWeight={700}
            fontFamily="system-ui, sans-serif"
          >
            {String(Math.round(bearing!)).padStart(3, '0')}°
          </text>
        ) : (
          <>
            <polygon
              points={`${r},${r - 3} ${r + 2.5},${r} ${r},${r + 3} ${r - 2.5},${r}`}
              fill="rgba(255,255,255,0.8)"
            />
            <polygon
              points={`${r},${r - inner} ${r + 3},${r - 3} ${r},${r - 6} ${r - 3},${r - 3}`}
              fill="#ef4444"
            />
          </>
        )}
      </svg>
    </div>
  )
}
