import { useRef, useEffect, useCallback, useState } from "react"
import { getAssetFileUrl, getAssetsByType } from "@/api/assets"
import type { MapData } from "../pages/MapEditorPage"
import type { AssetDTO } from "@/api/types"

interface MapCanvasProps {
  mapData: MapData
  zoom: number
  panOffset: { x: number; y: number }
  onPanChange: (offset: { x: number; y: number }) => void
  showGrid: boolean
  showPaths: boolean
  showCharacters: boolean
  activeLayer: "terrain" | "paths" | "characters"
  currentTool: "select" | "paint" | "erase" | "pan"
  onCellClick: (x: number, y: number) => void
}

// Cache for loaded images
const imageCache = new Map<string, HTMLImageElement>()
const assetCache = new Map<string, AssetDTO>()

async function loadImage(url: string): Promise<HTMLImageElement> {
  if (imageCache.has(url)) {
    return imageCache.get(url)!
  }

  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.onload = () => {
      imageCache.set(url, img)
      resolve(img)
    }
    img.onerror = reject
    img.src = url
  })
}

export function MapCanvas({
  mapData,
  zoom,
  panOffset,
  onPanChange,
  showGrid,
  showPaths,
  showCharacters,
  activeLayer,
  currentTool,
  onCellClick
}: MapCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [tileAssets, setTileAssets] = useState<AssetDTO[]>([])
  const [characterAssets, setCharacterAssets] = useState<AssetDTO[]>([])
  const [isDrawing, setIsDrawing] = useState(false)

  // Load all tile and character assets on mount
  useEffect(() => {
    async function loadAssets() {
      try {
        const [tiles, characters] = await Promise.all([
          getAssetsByType("TILE"),
          getAssetsByType("CHARACTER")
        ])
        setTileAssets(tiles)
        setCharacterAssets(characters)

        // Populate asset cache
        tiles.forEach(t => assetCache.set(t.id, t))
        characters.forEach(c => assetCache.set(c.id, c))
      } catch (err) {
        console.error("Failed to load assets:", err)
      }
    }
    loadAssets()
  }, [])

  // Calculate canvas size
  const canvasWidth = mapData.width * mapData.tileSize * zoom
  const canvasHeight = mapData.height * mapData.tileSize * zoom

  // Render the map
  const renderMap = useCallback(async () => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    // Set canvas size
    canvas.width = mapData.width * mapData.tileSize
    canvas.height = mapData.height * mapData.tileSize

    // Clear canvas
    ctx.fillStyle = "#1a1a2e"
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // Disable image smoothing for pixel art
    ctx.imageSmoothingEnabled = false

    const tileSize = mapData.tileSize

    // Draw terrain layer
    for (let y = 0; y < mapData.height; y++) {
      for (let x = 0; x < mapData.width; x++) {
        const tile = mapData.layers.terrain[y]?.[x]
        if (tile) {
          const asset = assetCache.get(tile.tileAssetId)
          if (asset) {
            try {
              const url = getAssetFileUrl(asset.storageKeyPrefix, `tile_${tile.variation}.png`, true)
              const img = await loadImage(url)
              ctx.drawImage(img, x * tileSize, y * tileSize, tileSize, tileSize)
            } catch (err) {
              // Draw placeholder for failed tiles
              ctx.fillStyle = "#ff00ff44"
              ctx.fillRect(x * tileSize, y * tileSize, tileSize, tileSize)
            }
          }
        }
      }
    }

    // Draw paths layer (on top of terrain)
    if (showPaths) {
      for (let y = 0; y < mapData.height; y++) {
        for (let x = 0; x < mapData.width; x++) {
          const path = mapData.layers.paths[y]?.[x]
          if (path) {
            const asset = assetCache.get(path.pathAssetId)
            if (asset) {
              try {
                const url = getAssetFileUrl(asset.storageKeyPrefix, `tile_${path.variation}.png`, true)
                const img = await loadImage(url)
                ctx.drawImage(img, x * tileSize, y * tileSize, tileSize, tileSize)
              } catch (err) {
                // Draw placeholder for failed paths
                ctx.fillStyle = "#ffff0044"
                ctx.fillRect(x * tileSize, y * tileSize, tileSize, tileSize)
              }
            }
          }
        }
      }
    }

    // Draw characters layer
    if (showCharacters) {
      for (const char of mapData.characters) {
        const asset = assetCache.get(char.characterAssetId)
        if (asset) {
          try {
            // Load the idle_0.png as the default character sprite
            const url = getAssetFileUrl(asset.storageKeyPrefix, "idle_0.png", true)
            const img = await loadImage(url)
            ctx.drawImage(img, char.x * tileSize, char.y * tileSize, tileSize, tileSize)
          } catch (err) {
            // Draw placeholder for failed characters
            ctx.fillStyle = "#00ffff44"
            ctx.fillRect(char.x * tileSize, char.y * tileSize, tileSize, tileSize)
            ctx.fillStyle = "#00ffff"
            ctx.font = "24px sans-serif"
            ctx.textAlign = "center"
            ctx.textBaseline = "middle"
            ctx.fillText("?", char.x * tileSize + tileSize / 2, char.y * tileSize + tileSize / 2)
          }
        }
      }
    }

    // Draw grid
    if (showGrid) {
      ctx.strokeStyle = "#ffffff22"
      ctx.lineWidth = 1

      // Vertical lines
      for (let x = 0; x <= mapData.width; x++) {
        ctx.beginPath()
        ctx.moveTo(x * tileSize, 0)
        ctx.lineTo(x * tileSize, canvas.height)
        ctx.stroke()
      }

      // Horizontal lines
      for (let y = 0; y <= mapData.height; y++) {
        ctx.beginPath()
        ctx.moveTo(0, y * tileSize)
        ctx.lineTo(canvas.width, y * tileSize)
        ctx.stroke()
      }
    }

    // Highlight active layer cells with subtle overlay
    if (activeLayer === "terrain") {
      // No additional overlay for terrain
    } else if (activeLayer === "paths") {
      ctx.fillStyle = "#ffa50011"
      ctx.fillRect(0, 0, canvas.width, canvas.height)
    } else if (activeLayer === "characters") {
      ctx.fillStyle = "#a855f711"
      ctx.fillRect(0, 0, canvas.width, canvas.height)
    }
  }, [mapData, showGrid, showPaths, showCharacters, activeLayer, tileAssets, characterAssets])

  // Re-render when map data or visibility settings change
  useEffect(() => {
    renderMap()
  }, [renderMap])

  // Get cell coordinates from mouse event
  const getCellFromEvent = useCallback((e: React.MouseEvent): { x: number; y: number } | null => {
    const canvas = canvasRef.current
    if (!canvas) return null

    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height

    const canvasX = (e.clientX - rect.left) * scaleX
    const canvasY = (e.clientY - rect.top) * scaleY

    const cellX = Math.floor(canvasX / mapData.tileSize)
    const cellY = Math.floor(canvasY / mapData.tileSize)

    if (cellX >= 0 && cellX < mapData.width && cellY >= 0 && cellY < mapData.height) {
      return { x: cellX, y: cellY }
    }
    return null
  }, [mapData.width, mapData.height, mapData.tileSize])

  // Handle mouse down
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (currentTool === "pan") {
      setIsDragging(true)
      setDragStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y })
    } else if (currentTool === "paint" || currentTool === "erase") {
      setIsDrawing(true)
      const cell = getCellFromEvent(e)
      if (cell) {
        onCellClick(cell.x, cell.y)
      }
    } else if (currentTool === "select") {
      const cell = getCellFromEvent(e)
      if (cell) {
        onCellClick(cell.x, cell.y)
      }
    }
  }, [currentTool, panOffset, getCellFromEvent, onCellClick])

  // Handle mouse move
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isDragging && currentTool === "pan") {
      onPanChange({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      })
    } else if (isDrawing && (currentTool === "paint" || currentTool === "erase")) {
      const cell = getCellFromEvent(e)
      if (cell) {
        onCellClick(cell.x, cell.y)
      }
    }
  }, [isDragging, isDrawing, currentTool, dragStart, getCellFromEvent, onCellClick, onPanChange])

  // Handle mouse up
  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
    setIsDrawing(false)
  }, [])

  // Handle wheel for zoom
  const handleWheel = useCallback((_e: React.WheelEvent) => {
    // Could implement zoom on scroll here if desired
  }, [])

  // Get cursor style based on tool
  const getCursor = () => {
    switch (currentTool) {
      case "pan":
        return isDragging ? "grabbing" : "grab"
      case "paint":
        return "crosshair"
      case "erase":
        return "crosshair"
      case "select":
        return "pointer"
      default:
        return "default"
    }
  }

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-auto bg-zinc-950 flex items-center justify-center"
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <div
        style={{
          transform: `translate(${panOffset.x}px, ${panOffset.y}px)`,
          cursor: getCursor()
        }}
      >
        <canvas
          ref={canvasRef}
          style={{
            width: canvasWidth,
            height: canvasHeight,
            imageRendering: "pixelated"
          }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onWheel={handleWheel}
        />
      </div>
    </div>
  )
}
