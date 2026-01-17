import { useRef, useEffect, useCallback, useState } from "react"
import { getAssetFileUrl, getAssetsByType, getAssetFile } from "@/api/assets"
import type { MapData, MapPath } from "../pages/MapEditorPage"
import type { AssetDTO } from "@/api/types"

interface TileProperties {
  name: string
  tileSize: number
  passable: boolean
  variations: number
  tileType?: "TILE" | "PATH"
}

interface MapCanvasProps {
  mapData: MapData
  zoom: number
  panOffset: { x: number; y: number }
  onPanChange: (offset: { x: number; y: number }) => void
  showGrid: boolean
  showPaths: boolean
  showCharacters: boolean
  showTransitions: boolean
  activeLayer: "terrain" | "paths" | "characters"
  currentTool: "select" | "paint" | "erase" | "pan"
  onCellClick: (x: number, y: number) => void
}

// Cache for loaded images
const imageCache = new Map<string, HTMLImageElement>()
const assetCache = new Map<string, AssetDTO>()
const propertiesCache = new Map<string, TileProperties>()

// Seeded random for consistent variation selection
function seededRandom(seed: number): number {
  const x = Math.sin(seed * 9999) * 10000
  return x - Math.floor(x)
}

function getVariationFromSeed(seed: number, variations: number): number {
  return Math.floor(seededRandom(seed) * variations)
}

// Transition directions
const TRANSITION_DIRECTIONS = ["n", "ne", "e", "se", "s", "sw", "w", "nw"] as const
type TransitionDirection = typeof TRANSITION_DIRECTIONS[number]

const DIRECTION_OFFSETS: Record<TransitionDirection, { dx: number; dy: number }> = {
  n:  { dx: 0,  dy: -1 },
  ne: { dx: 1,  dy: -1 },
  e:  { dx: 1,  dy: 0 },
  se: { dx: 1,  dy: 1 },
  s:  { dx: 0,  dy: 1 },
  sw: { dx: -1, dy: 1 },
  w:  { dx: -1, dy: 0 },
  nw: { dx: -1, dy: -1 }
}

// Path variation: Up=8, Down=4, Left=2, Right=1
function calculatePathVariation(
  paths: (MapPath | null)[][],
  x: number, y: number,
  width: number, height: number,
  currentPathAssetId: string
): number {
  let bits = 0
  if (y > 0 && paths[y - 1]?.[x]?.pathAssetId === currentPathAssetId) bits |= 8
  if (y < height - 1 && paths[y + 1]?.[x]?.pathAssetId === currentPathAssetId) bits |= 4
  if (x > 0 && paths[y]?.[x - 1]?.pathAssetId === currentPathAssetId) bits |= 2
  if (x < width - 1 && paths[y]?.[x + 1]?.pathAssetId === currentPathAssetId) bits |= 1
  return bits === 0 ? 0 : bits - 1
}

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
  showTransitions,
  activeLayer,
  currentTool,
  onCellClick
}: MapCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mainCanvasRef = useRef<HTMLCanvasElement>(null)
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null)

  const [isDragging, setIsDragging] = useState(false)
  const dragStartRef = useRef({ x: 0, y: 0 })
  const panOffsetRef = useRef(panOffset)

  const [isDrawing, setIsDrawing] = useState(false)
  const lastCellRef = useRef<{ x: number; y: number } | null>(null)

  const [tileProperties, setTileProperties] = useState<Map<string, TileProperties>>(new Map())
  const [assetsLoaded, setAssetsLoaded] = useState(false)

  // Keep panOffsetRef in sync
  useEffect(() => {
    panOffsetRef.current = panOffset
  }, [panOffset])

  // Initialize offscreen canvas
  useEffect(() => {
    offscreenCanvasRef.current = document.createElement("canvas")
  }, [])

  // Load assets once on mount
  useEffect(() => {
    async function loadAssets() {
      try {
        const [tiles, characters] = await Promise.all([
          getAssetsByType("TILE"),
          getAssetsByType("CHARACTER")
        ])

        tiles.forEach(t => assetCache.set(t.id, t))
        characters.forEach(c => assetCache.set(c.id, c))

        // Load properties for variation counts
        const propsPromises = tiles.map(async (asset) => {
          try {
            const props = await getAssetFile<TileProperties>(asset.storageKeyPrefix, "properties.json")
            propertiesCache.set(asset.id, props)
            return { assetId: asset.id, props }
          } catch {
            return { assetId: asset.id, props: null }
          }
        })

        const propsResults = await Promise.all(propsPromises)
        const propsMap = new Map<string, TileProperties>()
        propsResults.forEach(({ assetId, props }) => {
          if (props) propsMap.set(assetId, props)
        })
        setTileProperties(propsMap)
        setAssetsLoaded(true)
      } catch (err) {
        console.error("Failed to load assets:", err)
      }
    }
    loadAssets()
  }, [])

  // Render to offscreen canvas, then blit to main canvas
  const render = useCallback(async () => {
    const mainCanvas = mainCanvasRef.current
    const offscreen = offscreenCanvasRef.current
    if (!mainCanvas || !offscreen || !assetsLoaded) return

    const tileSize = mapData.tileSize
    const mapWidth = mapData.width
    const mapHeight = mapData.height

    // Set offscreen canvas to map size at 1x
    offscreen.width = mapWidth * tileSize
    offscreen.height = mapHeight * tileSize

    const ctx = offscreen.getContext("2d")!
    ctx.imageSmoothingEnabled = false

    // Clear with background
    ctx.fillStyle = "#1a1a2e"
    ctx.fillRect(0, 0, offscreen.width, offscreen.height)

    // Draw terrain layer
    for (let y = 0; y < mapHeight; y++) {
      for (let x = 0; x < mapWidth; x++) {
        const tile = mapData.layers.terrain[y]?.[x]
        if (tile) {
          const asset = assetCache.get(tile.tileAssetId)
          const props = tileProperties.get(tile.tileAssetId)
          if (asset) {
            try {
              const variations = props?.variations ?? 1
              const variation = getVariationFromSeed(tile.seed, variations)
              const url = getAssetFileUrl(asset.storageKeyPrefix, `tile_${variation}.png`, true)
              const img = await loadImage(url)
              ctx.drawImage(img, x * tileSize, y * tileSize, tileSize, tileSize)
            } catch {
              ctx.fillStyle = "#ff00ff44"
              ctx.fillRect(x * tileSize, y * tileSize, tileSize, tileSize)
            }
          }
        }
      }
    }

    // Draw transitions - when neighbor has DIFFERENT tile type, draw neighbor's transition
    // The transition file named "transition_n" has solid at TOP, fades DOWN
    // So if neighbor is at NORTH, draw neighbor's N transition on current cell
    if (showTransitions) {
      for (let y = 0; y < mapHeight; y++) {
        for (let x = 0; x < mapWidth; x++) {
          const tile = mapData.layers.terrain[y]?.[x]
          if (!tile) continue

          for (const dir of TRANSITION_DIRECTIONS) {
            const { dx, dy } = DIRECTION_OFFSETS[dir]
            const nx = x + dx
            const ny = y + dy

            if (nx < 0 || nx >= mapWidth || ny < 0 || ny >= mapHeight) continue

            const neighbor = mapData.layers.terrain[ny]?.[nx]
            if (neighbor && neighbor.tileAssetId !== tile.tileAssetId) {
              const neighborAsset = assetCache.get(neighbor.tileAssetId)
              if (neighborAsset) {
                try {
                  // Draw neighbor's transition for this direction
                  // e.g., neighbor at N -> draw neighbor's N transition (solid at top of current cell)
                  const transitionUrl = getAssetFileUrl(
                    neighborAsset.storageKeyPrefix,
                    `tile_0_transition_${dir}.png`,
                    true
                  )
                  const transitionImg = await loadImage(transitionUrl)
                  ctx.drawImage(transitionImg, x * tileSize, y * tileSize, tileSize, tileSize)
                } catch {
                  // Transition doesn't exist, skip
                }
              }
            }
          }
        }
      }
    }

    // Draw paths with auto-calculated variations
    if (showPaths) {
      for (let y = 0; y < mapHeight; y++) {
        for (let x = 0; x < mapWidth; x++) {
          const path = mapData.layers.paths[y]?.[x]
          if (path) {
            const asset = assetCache.get(path.pathAssetId)
            if (asset) {
              try {
                const variation = calculatePathVariation(
                  mapData.layers.paths, x, y,
                  mapWidth, mapHeight, path.pathAssetId
                )
                const url = getAssetFileUrl(asset.storageKeyPrefix, `tile_${variation}.png`, true)
                const img = await loadImage(url)
                ctx.drawImage(img, x * tileSize, y * tileSize, tileSize, tileSize)
              } catch {
                ctx.fillStyle = "#ffff0044"
                ctx.fillRect(x * tileSize, y * tileSize, tileSize, tileSize)
              }
            }
          }
        }
      }
    }

    // Draw characters
    if (showCharacters) {
      for (const char of mapData.characters) {
        const asset = assetCache.get(char.characterAssetId)
        if (asset) {
          try {
            const url = getAssetFileUrl(asset.storageKeyPrefix, "idle_0.png", true)
            const img = await loadImage(url)
            ctx.drawImage(img, char.x * tileSize, char.y * tileSize, tileSize, tileSize)
          } catch {
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

    // Draw grid on offscreen
    if (showGrid) {
      ctx.strokeStyle = "#ffffff22"
      ctx.lineWidth = 1
      for (let gx = 0; gx <= mapWidth; gx++) {
        ctx.beginPath()
        ctx.moveTo(gx * tileSize, 0)
        ctx.lineTo(gx * tileSize, offscreen.height)
        ctx.stroke()
      }
      for (let gy = 0; gy <= mapHeight; gy++) {
        ctx.beginPath()
        ctx.moveTo(0, gy * tileSize)
        ctx.lineTo(offscreen.width, gy * tileSize)
        ctx.stroke()
      }
    }

    // Layer overlay
    if (activeLayer === "paths") {
      ctx.fillStyle = "#ffa50011"
      ctx.fillRect(0, 0, offscreen.width, offscreen.height)
    } else if (activeLayer === "characters") {
      ctx.fillStyle = "#a855f711"
      ctx.fillRect(0, 0, offscreen.width, offscreen.height)
    }

    // Now blit to main canvas with zoom and pan
    const container = containerRef.current
    if (!container) return

    mainCanvas.width = container.clientWidth
    mainCanvas.height = container.clientHeight

    const mainCtx = mainCanvas.getContext("2d")!
    mainCtx.imageSmoothingEnabled = false

    mainCtx.fillStyle = "#09090b"
    mainCtx.fillRect(0, 0, mainCanvas.width, mainCanvas.height)

    mainCtx.save()
    mainCtx.translate(panOffsetRef.current.x, panOffsetRef.current.y)
    mainCtx.scale(zoom, zoom)
    mainCtx.drawImage(offscreen, 0, 0)
    mainCtx.restore()
  }, [mapData, zoom, showGrid, showPaths, showCharacters, showTransitions, activeLayer, assetsLoaded, tileProperties])

  // Re-render when dependencies change
  useEffect(() => {
    render()
  }, [render, panOffset])

  // Handle resize
  useEffect(() => {
    const handleResize = () => render()
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [render])

  // Get cell from mouse event
  const getCellFromEvent = useCallback((e: React.MouseEvent): { x: number; y: number } | null => {
    const mainCanvas = mainCanvasRef.current
    if (!mainCanvas) return null

    const rect = mainCanvas.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top

    // Account for pan and zoom
    const worldX = (mouseX - panOffsetRef.current.x) / zoom
    const worldY = (mouseY - panOffsetRef.current.y) / zoom

    const cellX = Math.floor(worldX / mapData.tileSize)
    const cellY = Math.floor(worldY / mapData.tileSize)

    if (cellX >= 0 && cellX < mapData.width && cellY >= 0 && cellY < mapData.height) {
      return { x: cellX, y: cellY }
    }
    return null
  }, [zoom, mapData.width, mapData.height, mapData.tileSize])

  // Mouse down - start drag or drawing
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (currentTool === "pan") {
      setIsDragging(true)
      dragStartRef.current = { x: e.clientX - panOffsetRef.current.x, y: e.clientY - panOffsetRef.current.y }
    } else if (currentTool === "paint" || currentTool === "erase") {
      setIsDrawing(true)
      const cell = getCellFromEvent(e)
      if (cell) {
        lastCellRef.current = cell
        onCellClick(cell.x, cell.y)
      }
    } else if (currentTool === "select") {
      const cell = getCellFromEvent(e)
      if (cell) {
        onCellClick(cell.x, cell.y)
      }
    }
  }, [currentTool, getCellFromEvent, onCellClick])

  // Mouse move - pan or draw
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isDragging && currentTool === "pan") {
      const newPan = {
        x: e.clientX - dragStartRef.current.x,
        y: e.clientY - dragStartRef.current.y
      }
      panOffsetRef.current = newPan
      onPanChange(newPan)
      // Request animation frame for smooth panning
      requestAnimationFrame(() => render())
    } else if (isDrawing && (currentTool === "paint" || currentTool === "erase")) {
      const cell = getCellFromEvent(e)
      if (cell && (lastCellRef.current?.x !== cell.x || lastCellRef.current?.y !== cell.y)) {
        lastCellRef.current = cell
        onCellClick(cell.x, cell.y)
      }
    }
  }, [isDragging, isDrawing, currentTool, getCellFromEvent, onCellClick, onPanChange, render])

  // Mouse up - stop drag or drawing
  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
    setIsDrawing(false)
    lastCellRef.current = null
  }, [])

  // Cursor style
  const getCursor = () => {
    switch (currentTool) {
      case "pan": return isDragging ? "grabbing" : "grab"
      case "paint": return "crosshair"
      case "erase": return "crosshair"
      case "select": return "pointer"
      default: return "default"
    }
  }

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-hidden bg-zinc-950"
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <canvas
        ref={mainCanvasRef}
        className="w-full h-full"
        style={{ cursor: getCursor() }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
      />
    </div>
  )
}
