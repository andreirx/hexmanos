import { useRef, useEffect, useState, useCallback } from "react"

export type CanvasTool = "pencil" | "eraser" | "select"

export interface Selection {
  x: number
  y: number
  width: number
  height: number
  pixels: Uint8ClampedArray | null // The selected pixels (copied when selection is made)
}

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
  brushSize?: number // 1, 2, 4, 8, etc.
  tool?: CanvasTool
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
  brushSize = 1,
  tool = "pencil",
  onCommit,
  className,
}: PixelCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const offscreenRef = useRef<HTMLCanvasElement | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Mutable ref for live pixel data - NO REACT RENDERS during draw
  const livePixelsRef = useRef<Uint8ClampedArray>(new Uint8ClampedArray(pixels))
  const lastDrawnPixel = useRef<{ x: number; y: number } | null>(null)
  const isDirty = useRef(false)

  const [zoom, setZoom] = useState(initialZoom)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isDrawing, setIsDrawing] = useState(false)
  const [isPanning, setIsPanning] = useState(false)
  const lastPanPoint = useRef({ x: 0, y: 0 })

  // Selection state
  const [selection, setSelection] = useState<Selection | null>(null)
  const [isSelecting, setIsSelecting] = useState(false)
  const [isDraggingSelection, setIsDraggingSelection] = useState(false)
  const [isResizingSelection, setIsResizingSelection] = useState(false)
  const [resizeHandle, setResizeHandle] = useState<string | null>(null)
  const selectionStart = useRef<{ x: number; y: number } | null>(null)
  const dragStart = useRef<{ x: number; y: number; selX: number; selY: number } | null>(null)

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

  // Clear selection when tool changes away from select
  useEffect(() => {
    if (tool !== "select" && selection) {
      commitSelection()
    }
  }, [tool])

  const getPixelCoords = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current
      if (!canvas) return null

      const rect = canvas.getBoundingClientRect()
      const x = Math.floor((clientX - rect.left - pan.x) / zoom)
      const y = Math.floor((clientY - rect.top - pan.y) / zoom)

      return { x, y }
    },
    [pan, zoom]
  )

  const isInBounds = (x: number, y: number) => x >= 0 && x < width && y >= 0 && y < height

  // Draw a single pixel directly to the mutable ref (NO REACT)
  const drawPixelDirect = useCallback(
    (px: number, py: number) => {
      const half = Math.floor(brushSize / 2)
      for (let dy = 0; dy < brushSize; dy++) {
        for (let dx = 0; dx < brushSize; dx++) {
          const x = px - half + dx
          const y = py - half + dy
          if (!isInBounds(x, y)) continue
          const i = (y * width + x) * 4
          livePixelsRef.current[i] = color[0]
          livePixelsRef.current[i + 1] = color[1]
          livePixelsRef.current[i + 2] = color[2]
          livePixelsRef.current[i + 3] = color[3]
        }
      }
      isDirty.current = true
    },
    [color, width, height, brushSize]
  )

  // Bresenham's line algorithm with brush size
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

  // Copy pixels from a region
  const copyRegion = (x: number, y: number, w: number, h: number): Uint8ClampedArray => {
    const data = new Uint8ClampedArray(w * h * 4)
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        const srcX = x + dx
        const srcY = y + dy
        if (isInBounds(srcX, srcY)) {
          const srcI = (srcY * width + srcX) * 4
          const dstI = (dy * w + dx) * 4
          data[dstI] = livePixelsRef.current[srcI]
          data[dstI + 1] = livePixelsRef.current[srcI + 1]
          data[dstI + 2] = livePixelsRef.current[srcI + 2]
          data[dstI + 3] = livePixelsRef.current[srcI + 3]
        }
      }
    }
    return data
  }

  // Clear a region (set to transparent)
  const clearRegion = (x: number, y: number, w: number, h: number) => {
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        const px = x + dx
        const py = y + dy
        if (isInBounds(px, py)) {
          const i = (py * width + px) * 4
          livePixelsRef.current[i] = 0
          livePixelsRef.current[i + 1] = 0
          livePixelsRef.current[i + 2] = 0
          livePixelsRef.current[i + 3] = 0
        }
      }
    }
  }

  // Paste pixels to a region with nearest-neighbor scaling
  const pasteRegion = (
    srcPixels: Uint8ClampedArray,
    srcW: number,
    srcH: number,
    dstX: number,
    dstY: number,
    dstW: number,
    dstH: number
  ) => {
    for (let dy = 0; dy < dstH; dy++) {
      for (let dx = 0; dx < dstW; dx++) {
        const px = dstX + dx
        const py = dstY + dy
        if (!isInBounds(px, py)) continue

        // Nearest-neighbor sampling
        const srcX = Math.floor((dx / dstW) * srcW)
        const srcY = Math.floor((dy / dstH) * srcH)
        const srcI = (srcY * srcW + srcX) * 4

        // Only paste non-transparent pixels
        if (srcPixels[srcI + 3] > 0) {
          const dstI = (py * width + px) * 4
          livePixelsRef.current[dstI] = srcPixels[srcI]
          livePixelsRef.current[dstI + 1] = srcPixels[srcI + 1]
          livePixelsRef.current[dstI + 2] = srcPixels[srcI + 2]
          livePixelsRef.current[dstI + 3] = srcPixels[srcI + 3]
        }
      }
    }
  }

  // Commit selection back to canvas
  const commitSelection = useCallback(() => {
    if (!selection || !selection.pixels) return

    // Paste the selection pixels at current position
    const origW = Math.round(selection.pixels.length / 4 / (selection.height || 1))
    const origH = selection.pixels.length / 4 / origW

    pasteRegion(
      selection.pixels,
      origW,
      origH,
      selection.x,
      selection.y,
      selection.width,
      selection.height
    )

    isDirty.current = true
    setSelection(null)
    render()
    onCommit(new Uint8ClampedArray(livePixelsRef.current))
  }, [selection, width, onCommit])

  // Check if point is inside selection
  const isInSelection = (x: number, y: number): boolean => {
    if (!selection) return false
    return (
      x >= selection.x &&
      x < selection.x + selection.width &&
      y >= selection.y &&
      y < selection.y + selection.height
    )
  }

  // Check if point is on a resize handle (returns handle name or null)
  const getResizeHandle = (x: number, y: number): string | null => {
    if (!selection) return null
    const { x: sx, y: sy, width: sw, height: sh } = selection
    const handleSize = Math.max(2, Math.ceil(4 / zoom))

    // Corner handles
    if (Math.abs(x - sx) <= handleSize && Math.abs(y - sy) <= handleSize) return "nw"
    if (Math.abs(x - (sx + sw)) <= handleSize && Math.abs(y - sy) <= handleSize) return "ne"
    if (Math.abs(x - sx) <= handleSize && Math.abs(y - (sy + sh)) <= handleSize) return "sw"
    if (Math.abs(x - (sx + sw)) <= handleSize && Math.abs(y - (sy + sh)) <= handleSize) return "se"

    return null
  }

  // Raw canvas render
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

    // Draw selection overlay
    if (selection) {
      ctx.save()
      ctx.translate(pan.x, pan.y)

      // Draw selection pixels if we have them (floating selection)
      if (selection.pixels) {
        const selCanvas = document.createElement("canvas")
        const origW = Math.round(selection.pixels.length / 4 / (selection.height || 1))
        const origH = selection.pixels.length / 4 / origW
        selCanvas.width = origW
        selCanvas.height = origH
        const selCtx = selCanvas.getContext("2d")!
        const selImageData = new ImageData(new Uint8ClampedArray(selection.pixels), origW, origH)
        selCtx.putImageData(selImageData, 0, 0)

        ctx.imageSmoothingEnabled = false
        ctx.drawImage(
          selCanvas,
          selection.x * zoom,
          selection.y * zoom,
          selection.width * zoom,
          selection.height * zoom
        )
      }

      // Draw selection border (marching ants)
      ctx.strokeStyle = "#fff"
      ctx.lineWidth = 1
      ctx.setLineDash([4, 4])
      ctx.strokeRect(
        selection.x * zoom,
        selection.y * zoom,
        selection.width * zoom,
        selection.height * zoom
      )
      ctx.setLineDash([])

      // Draw resize handles
      const handleSize = 6
      ctx.fillStyle = "#fff"
      ctx.strokeStyle = "#000"
      ctx.lineWidth = 1
      const corners = [
        [selection.x * zoom, selection.y * zoom],
        [(selection.x + selection.width) * zoom, selection.y * zoom],
        [selection.x * zoom, (selection.y + selection.height) * zoom],
        [(selection.x + selection.width) * zoom, (selection.y + selection.height) * zoom],
      ]
      for (const [cx, cy] of corners) {
        ctx.fillRect(cx - handleSize / 2, cy - handleSize / 2, handleSize, handleSize)
        ctx.strokeRect(cx - handleSize / 2, cy - handleSize / 2, handleSize, handleSize)
      }

      ctx.restore()
    }

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
  }, [width, height, pan, showGrid, gridColor, zoom, selection])

  // Re-render when zoom/pan/selection changes
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
      return
    }

    if (e.button !== 0) return

    const coords = getPixelCoords(e.clientX, e.clientY)
    if (!coords) return

    if (tool === "select") {
      const handle = getResizeHandle(coords.x, coords.y)
      if (handle && selection) {
        // Start resizing
        setIsResizingSelection(true)
        setResizeHandle(handle)
        selectionStart.current = { x: coords.x, y: coords.y }
      } else if (isInSelection(coords.x, coords.y)) {
        // Start dragging selection
        setIsDraggingSelection(true)
        dragStart.current = {
          x: coords.x,
          y: coords.y,
          selX: selection!.x,
          selY: selection!.y,
        }
      } else {
        // Start new selection - commit any existing selection first
        if (selection) {
          commitSelection()
        }
        setIsSelecting(true)
        selectionStart.current = { x: coords.x, y: coords.y }
        setSelection({
          x: coords.x,
          y: coords.y,
          width: 0,
          height: 0,
          pixels: null,
        })
      }
    } else {
      // Drawing mode
      setIsDrawing(true)
      isDirty.current = false
      if (isInBounds(coords.x, coords.y)) {
        drawPixelDirect(coords.x, coords.y)
        lastDrawnPixel.current = coords
        render()
      }
    }
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    const coords = getPixelCoords(e.clientX, e.clientY)

    if (isPanning) {
      const dx = e.clientX - lastPanPoint.current.x
      const dy = e.clientY - lastPanPoint.current.y
      setPan((prev) => ({ x: prev.x + dx, y: prev.y + dy }))
      lastPanPoint.current = { x: e.clientX, y: e.clientY }
      return
    }

    if (!coords) return

    if (tool === "select") {
      if (isSelecting && selectionStart.current) {
        // Update selection rectangle
        const startX = Math.min(selectionStart.current.x, coords.x)
        const startY = Math.min(selectionStart.current.y, coords.y)
        const endX = Math.max(selectionStart.current.x, coords.x)
        const endY = Math.max(selectionStart.current.y, coords.y)

        setSelection({
          x: Math.max(0, startX),
          y: Math.max(0, startY),
          width: Math.min(width, endX) - Math.max(0, startX),
          height: Math.min(height, endY) - Math.max(0, startY),
          pixels: null,
        })
      } else if (isDraggingSelection && dragStart.current && selection) {
        // Move selection
        const dx = coords.x - dragStart.current.x
        const dy = coords.y - dragStart.current.y
        setSelection({
          ...selection,
          x: dragStart.current.selX + dx,
          y: dragStart.current.selY + dy,
        })
      } else if (isResizingSelection && selectionStart.current && selection && resizeHandle) {
        // Resize selection
        const dx = coords.x - selectionStart.current.x
        const dy = coords.y - selectionStart.current.y

        let newX = selection.x
        let newY = selection.y
        let newW = selection.width
        let newH = selection.height

        if (resizeHandle.includes("w")) {
          newX = selection.x + dx
          newW = selection.width - dx
        }
        if (resizeHandle.includes("e")) {
          newW = selection.width + dx
        }
        if (resizeHandle.includes("n")) {
          newY = selection.y + dy
          newH = selection.height - dy
        }
        if (resizeHandle.includes("s")) {
          newH = selection.height + dy
        }

        // Ensure minimum size
        if (newW >= 1 && newH >= 1) {
          setSelection({
            ...selection,
            x: newX,
            y: newY,
            width: newW,
            height: newH,
          })
          selectionStart.current = { x: coords.x, y: coords.y }
        }
      }
    } else if (isDrawing) {
      if (isInBounds(coords.x, coords.y)) {
        if (lastDrawnPixel.current) {
          const prev = lastDrawnPixel.current
          if (prev.x !== coords.x || prev.y !== coords.y) {
            drawLineDirect(prev.x, prev.y, coords.x, coords.y)
            render()
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
    if (isSelecting && selection && selection.width > 0 && selection.height > 0) {
      // Finalize selection - copy pixels and clear region
      const copiedPixels = copyRegion(selection.x, selection.y, selection.width, selection.height)
      clearRegion(selection.x, selection.y, selection.width, selection.height)
      setSelection({
        ...selection,
        pixels: copiedPixels,
      })
      isDirty.current = true
      render()
    } else if (isSelecting) {
      // Selection was too small, cancel it
      setSelection(null)
    }

    if (isDrawing && isDirty.current) {
      onCommit(new Uint8ClampedArray(livePixelsRef.current))
    }

    setIsDrawing(false)
    setIsPanning(false)
    setIsSelecting(false)
    setIsDraggingSelection(false)
    setIsResizingSelection(false)
    setResizeHandle(null)
    lastDrawnPixel.current = null
    selectionStart.current = null
    dragStart.current = null
    isDirty.current = false
  }

  const handleMouseLeave = () => {
    if (isDrawing && isDirty.current) {
      onCommit(new Uint8ClampedArray(livePixelsRef.current))
    }
    setIsDrawing(false)
    setIsPanning(false)
    setIsSelecting(false)
    setIsDraggingSelection(false)
    setIsResizingSelection(false)
    lastDrawnPixel.current = null
    isDirty.current = false
  }

  // Determine cursor
  let cursor = "crosshair"
  if (isPanning) cursor = "grabbing"
  else if (tool === "select") {
    if (selection) {
      const canvas = canvasRef.current
      if (canvas) {
        // We'd need mouse position here for dynamic cursor, use default for now
        cursor = "default"
      }
    } else {
      cursor = "crosshair"
    }
  }

  const canvasWidth = Math.max(width * zoom + Math.abs(pan.x) * 2, 512)
  const canvasHeight = Math.max(height * zoom + Math.abs(pan.y) * 2, 512)

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ overflow: "hidden", cursor }}
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
