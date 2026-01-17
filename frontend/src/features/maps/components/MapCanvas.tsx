import { useRef, useEffect, useCallback, useState } from "react"
import { getAssetFileUrl, getAssetsByType, getAssetFile } from "@/api/assets"
import type { MapData } from "../pages/MapEditorPage"
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

// Seeded random number generator for consistent variation selection
function seededRandom(seed: number): number {
  const x = Math.sin(seed * 9999) * 10000
  return x - Math.floor(x)
}

// Calculate variation from seed and number of variations
function getVariationFromSeed(seed: number, variations: number): number {
  return Math.floor(seededRandom(seed) * variations)
}

// Direction names for transitions (8 directions)
const TRANSITION_DIRECTIONS = ["n", "ne", "e", "se", "s", "sw", "w", "nw"] as const
type TransitionDirection = typeof TRANSITION_DIRECTIONS[number]

// Direction offsets for checking neighbors
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

// Get opposite direction for transition overlay
const OPPOSITE_DIRECTION: Record<TransitionDirection, TransitionDirection> = {
  n: "s",
  ne: "sw",
  e: "w",
  se: "nw",
  s: "n",
  sw: "ne",
  w: "e",
  nw: "se"
}

// Path variation calculation based on neighbors
// Bits: Up=8, Down=4, Left=2, Right=1
// Variations 0-14 map to different connection combinations
function calculatePathVariation(
  paths: (import("../pages/MapEditorPage").MapPath | null)[][],
  x: number,
  y: number,
  width: number,
  height: number,
  currentPathAssetId: string
): number {
  let bits = 0

  // Check up (y - 1)
  if (y > 0 && paths[y - 1]?.[x]?.pathAssetId === currentPathAssetId) {
    bits |= 8
  }
  // Check down (y + 1)
  if (y < height - 1 && paths[y + 1]?.[x]?.pathAssetId === currentPathAssetId) {
    bits |= 4
  }
  // Check left (x - 1)
  if (x > 0 && paths[y]?.[x - 1]?.pathAssetId === currentPathAssetId) {
    bits |= 2
  }
  // Check right (x + 1)
  if (x < width - 1 && paths[y]?.[x + 1]?.pathAssetId === currentPathAssetId) {
    bits |= 1
  }

  // bits = 0 means isolated path, use variation 0
  // bits = 1-15 map to variations 0-14
  // We return max(0, bits - 1) to map 1-15 to 0-14, and 0 stays 0
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
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [tileAssets, setTileAssets] = useState<AssetDTO[]>([])
  const [characterAssets, setCharacterAssets] = useState<AssetDTO[]>([])
  const [tileProperties, setTileProperties] = useState<Map<string, TileProperties>>(new Map())
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

        // Load properties for each tile asset to get variation counts
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
          if (props) {
            propsMap.set(assetId, props)
          }
        })
        setTileProperties(propsMap)
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

    // Draw terrain layer - using seed for random variation selection
    for (let y = 0; y < mapData.height; y++) {
      for (let x = 0; x < mapData.width; x++) {
        const tile = mapData.layers.terrain[y]?.[x]
        if (tile) {
          const asset = assetCache.get(tile.tileAssetId)
          const props = tileProperties.get(tile.tileAssetId)
          if (asset) {
            try {
              // Calculate variation from seed and available variations
              const variations = props?.variations ?? 1
              const variation = getVariationFromSeed(tile.seed, variations)
              const url = getAssetFileUrl(asset.storageKeyPrefix, `tile_${variation}.png`, true)
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

    // Draw auto-transitions between different terrain types
    if (showTransitions) {
      for (let y = 0; y < mapData.height; y++) {
        for (let x = 0; x < mapData.width; x++) {
          const tile = mapData.layers.terrain[y]?.[x]
          if (!tile) continue

          // Check each of the 8 directions for neighbors with different tile types
          for (const direction of TRANSITION_DIRECTIONS) {
            const { dx, dy } = DIRECTION_OFFSETS[direction]
            const nx = x + dx
            const ny = y + dy

            // Skip if out of bounds
            if (nx < 0 || nx >= mapData.width || ny < 0 || ny >= mapData.height) continue

            const neighbor = mapData.layers.terrain[ny]?.[nx]

            // If neighbor has a different tile type, draw the neighbor's transition into current cell
            if (neighbor && neighbor.tileAssetId !== tile.tileAssetId) {
              const neighborAsset = assetCache.get(neighbor.tileAssetId)
              if (neighborAsset) {
                try {
                  // Draw the neighbor's transition tile facing INTO this cell
                  // e.g., if neighbor is to the North, we draw neighbor's south transition on current cell
                  const oppositeDir = OPPOSITE_DIRECTION[direction]
                  const transitionUrl = getAssetFileUrl(
                    neighborAsset.storageKeyPrefix,
                    `tile_0_transition_${oppositeDir}.png`,
                    true
                  )
                  const transitionImg = await loadImage(transitionUrl)
                  ctx.drawImage(transitionImg, x * tileSize, y * tileSize, tileSize, tileSize)
                } catch {
                  // Transition image doesn't exist, skip silently
                }
              }
            }
          }
        }
      }
    }

    // Draw paths layer (on top of terrain) - with auto-calculated variations
    if (showPaths) {
      for (let y = 0; y < mapData.height; y++) {
        for (let x = 0; x < mapData.width; x++) {
          const path = mapData.layers.paths[y]?.[x]
          if (path) {
            const asset = assetCache.get(path.pathAssetId)
            if (asset) {
              try {
                // Calculate path variation based on adjacent paths
                const variation = calculatePathVariation(
                  mapData.layers.paths,
                  x, y,
                  mapData.width, mapData.height,
                  path.pathAssetId
                )
                const url = getAssetFileUrl(asset.storageKeyPrefix, `tile_${variation}.png`, true)
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
  }, [mapData, showGrid, showPaths, showCharacters, showTransitions, activeLayer, tileAssets, characterAssets, tileProperties])

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
