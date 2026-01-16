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
  const offscreenRef = useRef<HTMLCanvasElement | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState(initialZoom)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isDrawing, setIsDrawing] = useState(false)
  const [isPanning, setIsPanning] = useState(false)
  const lastPanPoint = useRef({ x: 0, y: 0 })
  const lastDrawnPixel = useRef<{ x: number; y: number } | null>(null)

  // Initialize offscreen canvas
  useEffect(() => {
    if (!offscreenRef.current) {
      offscreenRef.current = document.createElement("canvas")
    }
    offscreenRef.current.width = width
    offscreenRef.current.height = height
  }, [width, height])

  const getPixelCoords = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current
      if (!canvas) return null

      const rect = canvas.getBoundingClientRect()
      // Account for zoom when calculating pixel coordinates
      const x = Math.floor((clientX - rect.left - pan.x) / zoom)
      const y = Math.floor((clientY - rect.top - pan.y) / zoom)

      if (x >= 0 && x < width && y >= 0 && y < height) {
        return { x, y }
      }
      return null
    },
    [pan, zoom, width, height]
  )

  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current
    const offscreen = offscreenRef.current
    const ctx = canvas?.getContext("2d")
    const offCtx = offscreen?.getContext("2d")
    if (!canvas || !ctx || !offscreen || !offCtx) return

    // Step A: Write pixels into offscreen canvas using putImageData (O(1))
    if (pixels) {
      const imageData = new ImageData(new Uint8ClampedArray(pixels), width, height)
      offCtx.putImageData(imageData, 0, 0)
    } else {
      offCtx.clearRect(0, 0, width, height)
    }

    // Step B: Clear main canvas
    ctx.fillStyle = "#1a1a1a"
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // Step C: Draw offscreen canvas onto main canvas with transform (O(1))
    ctx.imageSmoothingEnabled = false
    ctx.save()
    ctx.translate(pan.x, pan.y)
    ctx.scale(zoom, zoom)
    ctx.drawImage(offscreen, 0, 0)
    ctx.restore()

    // Draw grid on top (only if zoom > 4)
    if (showGrid && zoom >= 4) {
      ctx.save()
      ctx.translate(pan.x, pan.y)
      ctx.strokeStyle = gridColor
      ctx.lineWidth = 1

      // Use a single path for all grid lines (more efficient)
      ctx.beginPath()

      // Vertical lines
      for (let x = 0; x <= width; x++) {
        const px = x * zoom + 0.5
        ctx.moveTo(px, 0)
        ctx.lineTo(px, height * zoom)
      }

      // Horizontal lines
      for (let y = 0; y <= height; y++) {
        const py = y * zoom + 0.5
        ctx.moveTo(0, py)
        ctx.lineTo(width * zoom, py)
      }

      ctx.stroke()
      ctx.restore()
    }

    // Draw canvas border
    ctx.save()
    ctx.translate(pan.x, pan.y)
    ctx.strokeStyle = "#666"
    ctx.lineWidth = 2
    ctx.strokeRect(0, 0, width * zoom, height * zoom)
    ctx.restore()
  }, [pixels, width, height, pan, showGrid, gridColor, zoom])

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

  // Calculate canvas size based on zoom and pan
  const canvasWidth = Math.max(width * zoom + Math.abs(pan.x) * 2, 512)
  const canvasHeight = Math.max(height * zoom + Math.abs(pan.y) * 2, 512)

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
