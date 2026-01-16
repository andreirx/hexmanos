import { useRef, useEffect, useState, useCallback } from "react"

interface PixelCanvasProps {
  width: number
  height: number
  initialZoom?: number
  minZoom?: number
  maxZoom?: number
  gridColor?: string
  showGrid?: boolean
  pixels: Uint8ClampedArray
  color: [number, number, number, number] // RGBA tuple for current draw color
  onCommit: (pixels: Uint8ClampedArray) => void // Called on mouseup with final state
  className?: string
}

export function PixelCanvas({
  width,
  height,
  initialZoom = 8,
  minZoom = 1,
  maxZoom = 64,
  gridColor = "#333333",
  showGrid = true,
  pixels,
  color,
  onCommit,
  className,
}: PixelCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const offscreenRef = useRef<HTMLCanvasElement | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Mutable ref for live pixel data - NO REACT RENDERS during draw
  const livePixelsRef = useRef<Uint8ClampedArray>(new Uint8ClampedArray(pixels))
  const lastDrawnPixel = useRef<{ x: number; y: number } | null>(null)
  const isDirty = useRef(false) // Track if we need to commit on mouseup

  const [zoom, setZoom] = useState(initialZoom)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isDrawing, setIsDrawing] = useState(false)
  const [isPanning, setIsPanning] = useState(false)
  const lastPanPoint = useRef({ x: 0, y: 0 })

  // Initialize offscreen canvas
  useEffect(() => {
    if (!offscreenRef.current) {
      offscreenRef.current = document.createElement("canvas")
    }
    offscreenRef.current.width = width
    offscreenRef.current.height = height
  }, [width, height])

  // Sync ref from props when external changes happen (undo/redo, load)
  useEffect(() => {
    livePixelsRef.current = new Uint8ClampedArray(pixels)
    render()
  }, [pixels])

  const getPixelCoords = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current
      if (!canvas) return null

      const rect = canvas.getBoundingClientRect()
      const x = Math.floor((clientX - rect.left - pan.x) / zoom)
      const y = Math.floor((clientY - rect.top - pan.y) / zoom)

      if (x >= 0 && x < width && y >= 0 && y < height) {
        return { x, y }
      }
      return null
    },
    [pan, zoom, width, height]
  )

  // Draw a single pixel directly to the mutable ref (NO REACT)
  const drawPixelDirect = useCallback(
    (x: number, y: number) => {
      if (x < 0 || x >= width || y < 0 || y >= height) return
      const i = (y * width + x) * 4
      livePixelsRef.current[i] = color[0]
      livePixelsRef.current[i + 1] = color[1]
      livePixelsRef.current[i + 2] = color[2]
      livePixelsRef.current[i + 3] = color[3]
      isDirty.current = true
    },
    [color, width, height]
  )

  // Bresenham's line algorithm - draws directly to ref
  const drawLineDirect = useCallback(
    (x0: number, y0: number, x1: number, y1: number) => {
      const dx = Math.abs(x1 - x0)
      const dy = Math.abs(y1 - y0)
      const sx = x0 < x1 ? 1 : -1
      const sy = y0 < y1 ? 1 : -1
      let err = dx - dy

      let x = x0
      let y = y0

      while (true) {
        drawPixelDirect(x, y)
        if (x === x1 && y === y1) break
        const e2 = 2 * err
        if (e2 > -dy) {
          err -= dy
          x += sx
        }
        if (e2 < dx) {
          err += dx
          y += sy
        }
      }
    },
    [drawPixelDirect]
  )

  // Raw canvas render - NO REACT INVOLVED
  const render = useCallback(() => {
    const canvas = canvasRef.current
    const offscreen = offscreenRef.current
    const ctx = canvas?.getContext("2d")
    const offCtx = offscreen?.getContext("2d")
    if (!canvas || !ctx || !offscreen || !offCtx) return

    // Step A: Write live pixels into offscreen canvas
    const imageData = new ImageData(
      new Uint8ClampedArray(livePixelsRef.current),
      width,
      height
    )
    offCtx.putImageData(imageData, 0, 0)

    // Step B: Clear main canvas
    ctx.fillStyle = "#1a1a1a"
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // Step C: Draw offscreen canvas onto main canvas with transform
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

      ctx.beginPath()
      for (let x = 0; x <= width; x++) {
        const px = x * zoom + 0.5
        ctx.moveTo(px, 0)
        ctx.lineTo(px, height * zoom)
      }
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
  }, [width, height, pan, showGrid, gridColor, zoom])

  // Re-render when zoom/pan changes (these are UI state, not pixel data)
  useEffect(() => {
    render()
  }, [render])

  // Handle mouse wheel for zoom
  const handleWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault()
      const delta = e.deltaY > 0 ? -1 : 1
      setZoom((prevZoom) => Math.max(minZoom, Math.min(maxZoom, prevZoom + delta)))
    },
    [minZoom, maxZoom]
  )

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    container.addEventListener("wheel", handleWheel, { passive: false })
    return () => container.removeEventListener("wheel", handleWheel)
  }, [handleWheel])

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      setIsPanning(true)
      lastPanPoint.current = { x: e.clientX, y: e.clientY }
    } else if (e.button === 0) {
      setIsDrawing(true)
      isDirty.current = false
      const coords = getPixelCoords(e.clientX, e.clientY)
      if (coords) {
        drawPixelDirect(coords.x, coords.y)
        lastDrawnPixel.current = coords
        render() // Direct render, no React
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
        if (lastDrawnPixel.current) {
          const prev = lastDrawnPixel.current
          if (prev.x !== coords.x || prev.y !== coords.y) {
            // Draw line directly to ref - NO REACT RENDER
            drawLineDirect(prev.x, prev.y, coords.x, coords.y)
            render() // Direct canvas paint
          }
        } else {
          drawPixelDirect(coords.x, coords.y)
          render()
        }
        lastDrawnPixel.current = coords
      }
    }
  }

  const handleMouseUp = () => {
    if (isDrawing && isDirty.current) {
      // COMMIT: Only now do we update React state
      onCommit(new Uint8ClampedArray(livePixelsRef.current))
    }
    setIsDrawing(false)
    setIsPanning(false)
    lastDrawnPixel.current = null
    isDirty.current = false
  }

  const handleMouseLeave = () => {
    if (isDrawing && isDirty.current) {
      onCommit(new Uint8ClampedArray(livePixelsRef.current))
    }
    setIsDrawing(false)
    setIsPanning(false)
    lastDrawnPixel.current = null
    isDirty.current = false
  }

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
