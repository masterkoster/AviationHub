'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Eraser, PenLine, Type } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface SignatureValue {
  type: 'drawn' | 'typed'
  svgData?: string
  typedName?: string
}

interface SignaturePadProps {
  onChange: (sig: SignatureValue | null) => void
  disabled?: boolean
}

const CANVAS_WIDTH = 480
const CANVAS_HEIGHT = 150

type Point = [number, number]

function buildSvg(strokes: Point[][], width: number, height: number): string {
  const paths = strokes
    .filter((stroke) => stroke.length > 0)
    .map((stroke) => {
      const d = stroke
        .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`)
        .join(' ')
      return `<path d="${d}" fill="none" stroke="black" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"/>`
    })
    .join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">${paths}</svg>`
}

/**
 * Reusable signature capture widget — draw (canvas strokes -> SVG) or type
 * a name (rendered in a cursive style). Fires `onChange` with the current
 * signature value (or null when empty) as the user interacts.
 */
export default function SignaturePad({ onChange, disabled }: SignaturePadProps) {
  const [mode, setMode] = useState<'draw' | 'typed'>('draw')
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const strokesRef = useRef<Point[][]>([])
  const drawingRef = useRef(false)
  const [hasDrawing, setHasDrawing] = useState(false)
  const [typedName, setTypedName] = useState('')

  const redraw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.lineWidth = 2.25
    ctx.strokeStyle = getComputedStyle(canvas).color || '#111'
    for (const stroke of strokesRef.current) {
      if (stroke.length === 0) continue
      ctx.beginPath()
      ctx.moveTo(stroke[0][0], stroke[0][1])
      for (const [x, y] of stroke.slice(1)) ctx.lineTo(x, y)
      ctx.stroke()
    }
  }, [])

  useEffect(() => {
    redraw()
  }, [redraw, mode])

  const getPoint = useCallback((e: React.PointerEvent<HTMLCanvasElement>): Point => {
    const canvas = canvasRef.current
    if (!canvas) return [0, 0]
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    return [(e.clientX - rect.left) * scaleX, (e.clientY - rect.top) * scaleY]
  }, [])

  const emitDrawn = useCallback(() => {
    const hasAny = strokesRef.current.some((s) => s.length > 1)
    setHasDrawing(hasAny)
    if (!hasAny) {
      onChange(null)
      return
    }
    onChange({ type: 'drawn', svgData: buildSvg(strokesRef.current, CANVAS_WIDTH, CANVAS_HEIGHT) })
  }, [onChange])

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (disabled) return
      e.currentTarget.setPointerCapture(e.pointerId)
      drawingRef.current = true
      strokesRef.current.push([getPoint(e)])
      redraw()
    },
    [disabled, getPoint, redraw]
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!drawingRef.current || disabled) return
      const stroke = strokesRef.current[strokesRef.current.length - 1]
      stroke.push(getPoint(e))
      redraw()
    },
    [disabled, getPoint, redraw]
  )

  const endStroke = useCallback(() => {
    if (!drawingRef.current) return
    drawingRef.current = false
    emitDrawn()
  }, [emitDrawn])

  const handleClear = useCallback(() => {
    strokesRef.current = []
    drawingRef.current = false
    setHasDrawing(false)
    setTypedName('')
    redraw()
    onChange(null)
  }, [onChange, redraw])

  const handleModeChange = useCallback(
    (next: 'draw' | 'typed') => {
      if (next === mode) return
      setMode(next)
      strokesRef.current = []
      drawingRef.current = false
      setHasDrawing(false)
      setTypedName('')
      onChange(null)
    },
    [mode, onChange]
  )

  const handleTypedChange = useCallback(
    (value: string) => {
      setTypedName(value)
      const trimmed = value.trim()
      onChange(trimmed ? { type: 'typed', typedName: trimmed } : null)
    },
    [onChange]
  )

  return (
    <div className="rounded-lg border border-border bg-background">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex gap-1">
          <button
            type="button"
            disabled={disabled}
            onClick={() => handleModeChange('draw')}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
              mode === 'draw'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            )}
          >
            <PenLine className="h-3.5 w-3.5" />
            Draw
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => handleModeChange('typed')}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
              mode === 'typed'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            )}
          >
            <Type className="h-3.5 w-3.5" />
            Type
          </button>
        </div>
        <button
          type="button"
          disabled={disabled || (mode === 'draw' ? !hasDrawing : !typedName)}
          onClick={handleClear}
          className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
        >
          <Eraser className="h-3.5 w-3.5" />
          Clear
        </button>
      </div>

      <div className="p-3">
        {mode === 'draw' ? (
          <div className="relative">
            <canvas
              ref={canvasRef}
              width={CANVAS_WIDTH}
              height={CANVAS_HEIGHT}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={endStroke}
              onPointerLeave={endStroke}
              onPointerCancel={endStroke}
              className={cn(
                'w-full touch-none rounded-md border border-dashed border-border bg-card text-foreground',
                disabled ? 'cursor-not-allowed opacity-60' : 'cursor-crosshair'
              )}
              style={{ height: CANVAS_HEIGHT, aspectRatio: `${CANVAS_WIDTH} / ${CANVAS_HEIGHT}` }}
            />
            {!hasDrawing && (
              <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-muted-foreground/50">
                Sign here
              </p>
            )}
          </div>
        ) : (
          <div className="flex h-[150px] flex-col items-center justify-center gap-3 rounded-md border border-dashed border-border bg-card px-4">
            <input
              type="text"
              value={typedName}
              disabled={disabled}
              onChange={(e) => handleTypedChange(e.target.value)}
              placeholder="Type your full name"
              className="w-full max-w-xs rounded-md border border-border bg-background px-3 py-1.5 text-center text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-60"
            />
            {typedName.trim() && (
              <p
                className="max-w-full truncate text-2xl text-foreground"
                style={{ fontFamily: "'Brush Script MT', 'Segoe Script', cursive" }}
              >
                {typedName.trim()}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
