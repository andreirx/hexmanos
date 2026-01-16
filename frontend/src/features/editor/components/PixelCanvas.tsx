import { useRef, useEffect, useState, useCallback } from "react"

interface PixelCanvasProps {
  width: number
  height: number
  pixelSize?: number
  initialZoom?: number
  minZoom?: number
  maxZoom?: number
  gridColor?: string
  showGrid?: boolean
  onPixelClick?: (x: number, y: number) => void
  onPixelDraw?: (x: number, y: number) => void
  onLineDraw?: (x0: number, y0: number, x1: number, y1: number) => void
  pixels?: Uint8ClampedArray
  className?: string
}

export function PixelCanvas({
  width,
  height,
  pixelSize = 1,
  initialZoom = 8,
  minZoom = 1,
  maxZoom = 64,
  gridColor = "#333333",
  showGrid = true,
  onPixelClick,
  onPixelDraw,
  onLineDraw,
  pixels,
  className,
}: PixelCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState(initialZoom)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isDrawing, setIsDrawing] = useState(false)
  const [isPanning, setIsPanning] = useState(false)
  const lastPanPoint = useRef({ x: 0, y: 0 })
  const lastDrawnPixel = useRef<{ x: number; y: number } | null>(null)

  const effectivePixelSize = pixelSize * zoom

  const getPixelCoords = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current
      if (!canvas) return null

      const rect = canvas.getBoundingClientRect()
      const x = Math.floor((clientX - rect.left - pan.x) / effectivePixelSize)
      const y = Math.floor((clientY - rect.top - pan.y) / effectivePixelSize)

      if (x >= 0 && x < width && y >= 0 && y < height) {
        return { x, y }
      }
      return null
    },
    [pan, effectivePixelSize, width, height]
  )

  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")
    if (!canvas || !ctx) return

    // Disable image smoothing for crisp pixels
    ctx.imageSmoothingEnabled = false

    // Clear canvas
    ctx.fillStyle = "#1a1a1a"
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    ctx.save()
    ctx.translate(pan.x, pan.y)

    // Draw pixels if provided
    if (pixels) {
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const i = (y * width + x) * 4
          const r = pixels[i]
          const g = pixels[i + 1]
          const b = pixels[i + 2]
          const a = pixels[i + 3]

          if (a > 0) {
            ctx.fillStyle = `rgba(${r},${g},${b},${a / 255})`
            ctx.fillRect(
              x * effectivePixelSize,
              y * effectivePixelSize,
              effectivePixelSize,
              effectivePixelSize
            )
          }
        }
      }
    }

    // Draw grid
    if (showGrid && zoom >= 4) {
      ctx.strokeStyle = gridColor
      ctx.lineWidth = 1

      // Vertical lines
      for (let x = 0; x <= width; x++) {
        ctx.beginPath()
        ctx.moveTo(x * effectivePixelSize + 0.5, 0)
        ctx.lineTo(x * effectivePixelSize + 0.5, height * effectivePixelSize)
        ctx.stroke()
      }

      // Horizontal lines
      for (let y = 0; y <= height; y++) {
        ctx.beginPath()
        ctx.moveTo(0, y * effectivePixelSize + 0.5)
        ctx.lineTo(width * effectivePixelSize, y * effectivePixelSize + 0.5)
        ctx.stroke()
      }
    }

    // Draw canvas border
    ctx.strokeStyle = "#666"
    ctx.lineWidth = 2
    ctx.strokeRect(0, 0, width * effectivePixelSize, height * effectivePixelSize)

    ctx.restore()
  }, [pixels, width, height, effectivePixelSize, pan, showGrid, gridColor, zoom])

  // Redraw on changes
  useEffect(() => {
    drawCanvas()
  }, [drawCanvas])

  // Handle mouse wheel for zoom
  const handleWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault()
      const delta = e.deltaY > 0 ? -1 : 1
      setZoom((prevZoom) => {
        const newZoom = Math.max(minZoom, Math.min(maxZoom, prevZoom + delta))
        return newZoom
      })
    },
    [minZoom, maxZoom]
  )

  // Attach wheel listener
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    container.addEventListener("wheel", handleWheel, { passive: false })
    return () => container.removeEventListener("wheel", handleWheel)
  }, [handleWheel])

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      // Middle click or Alt+click for panning
      setIsPanning(true)
      lastPanPoint.current = { x: e.clientX, y: e.clientY }
    } else if (e.button === 0) {
      // Left click for drawing
      setIsDrawing(true)
      const coords = getPixelCoords(e.clientX, e.clientY)
      if (coords) {
        onPixelClick?.(coords.x, coords.y)
        onPixelDraw?.(coords.x, coords.y)
        lastDrawnPixel.current = coords
      }
    }
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      const dx = e.clientX - lastPanPoint.current.x
      const dy = e.clientY - lastPanPoint.current.y
      setPan((prev) => ({ x: prev.x + dx, y: prev.y + dy }))
      lastPanPoint.current = { x: e.clientX, y: e.clientY }
    } else if (isDrawing) {
      const coords = getPixelCoords(e.clientX, e.clientY)
      if (coords) {
        // If we have a line draw callback and a previous point, draw a line
        if (onLineDraw && lastDrawnPixel.current) {
          const prev = lastDrawnPixel.current
          if (prev.x !== coords.x || prev.y !== coords.y) {
            onLineDraw(prev.x, prev.y, coords.x, coords.y)
          }
        } else {
          // Fallback to single pixel draw
          onPixelDraw?.(coords.x, coords.y)
        }
        lastDrawnPixel.current = coords
      }
    }
  }

  const handleMouseUp = () => {
    setIsDrawing(false)
    setIsPanning(false)
    lastDrawnPixel.current = null
  }

  const handleMouseLeave = () => {
    setIsDrawing(false)
    setIsPanning(false)
    lastDrawnPixel.current = null
  }

  const canvasWidth = Math.max(width * effectivePixelSize + Math.abs(pan.x) * 2, 400)
  const canvasHeight = Math.max(height * effectivePixelSize + Math.abs(pan.y) * 2, 400)

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ overflow: "hidden", cursor: isPanning ? "grabbing" : "crosshair" }}
    >
      <canvas
        ref={canvasRef}
        width={canvasWidth}
        height={canvasHeight}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        style={{ display: "block" }}
      />
    </div>
  )
}
