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

// ============================================================
// SYNCHRONOUS IMAGE CACHE
// ============================================================
const imageCache = new Map<string, HTMLImageElement>()
const pendingLoads = new Set<string>()
let onImageLoadedCallback: (() => void) | null = null

function getImage(url: string): HTMLImageElement | null {
  if (imageCache.has(url)) {
    return imageCache.get(url)!
  }

  // Already loading
  if (pendingLoads.has(url)) {
    return null
  }

  // Start async load
  pendingLoads.add(url)
  const img = new Image()
  img.crossOrigin = "anonymous"
  img.onload = () => {
    imageCache.set(url, img)
    pendingLoads.delete(url)
    // Trigger re-render
    onImageLoadedCallback?.()
  }
  img.onerror = () => {
    pendingLoads.delete(url)
  }
  img.src = url

  return null
}

// ============================================================
// ASSET & PROPERTIES CACHE
// ============================================================
const assetCache = new Map<string, AssetDTO>()
const propertiesCache = new Map<string, TileProperties>()

// ============================================================
// HELPERS
// ============================================================
function seededRandom(seed: number): number {
  const x = Math.sin(seed * 9999) * 10000
  return x - Math.floor(x)
}

function getVariationFromSeed(seed: number, variations: number): number {
  return Math.floor(seededRandom(seed) * variations)
}

// Transition direction offsets
const DIRECTION_OFFSETS = {
  n:  { dx: 0,  dy: -1 },
  ne: { dx: 1,  dy: -1 },
  e:  { dx: 1,  dy: 0 },
  se: { dx: 1,  dy: 1 },
  s:  { dx: 0,  dy: 1 },
  sw: { dx: -1, dy: 1 },
  w:  { dx: -1, dy: 0 },
  nw: { dx: -1, dy: -1 }
} as const

type TransitionDirection = keyof typeof DIRECTION_OFFSETS

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

// ============================================================
// COMPONENT
// ============================================================
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

  // Offscreen canvases - one for terrain (memoized), one for compositing
  const terrainCanvasRef = useRef<HTMLCanvasElement | null>(null)

  // Interaction state (refs for performance)
  const isDraggingRef = useRef(false)
  const isDrawingRef = useRef(false)
  const dragStartRef = useRef({ x: 0, y: 0 })
  const panOffsetRef = useRef(panOffset)
  const lastCellRef = useRef<{ x: number; y: number } | null>(null)

  // Force re-render trigger
  const [renderTrigger, setRenderTrigger] = useState(0)

  // Track if terrain needs redraw
  const [terrainDirty, setTerrainDirty] = useState(true)

  // Asset loading state
  const [assetsLoaded, setAssetsLoaded] = useState(false)
  const [tileProperties, setTileProperties] = useState<Map<string, TileProperties>>(new Map())

  // Keep refs in sync
  useEffect(() => {
    panOffsetRef.current = panOffset
  }, [panOffset])

  // Set up image load callback - MUST mark terrain dirty when images arrive
  useEffect(() => {
    onImageLoadedCallback = () => {
      setTerrainDirty(true)  // Force terrain redraw with newly loaded images
      setRenderTrigger(t => t + 1)
    }
    return () => { onImageLoadedCallback = null }
  }, [])

  // Initialize offscreen canvases
  useEffect(() => {
    terrainCanvasRef.current = document.createElement("canvas")
  }, [])

  // Mark terrain dirty when mapData changes
  useEffect(() => {
    setTerrainDirty(true)
  }, [mapData, showTransitions])

  // Load assets once
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

  // ============================================================
  // SYNCHRONOUS TERRAIN RENDER (to offscreen canvas)
  // ============================================================
  const renderTerrain = useCallback(() => {
    const terrainCanvas = terrainCanvasRef.current
    if (!terrainCanvas || !assetsLoaded) return

    const tileSize = mapData.tileSize
    const mapWidth = mapData.width
    const mapHeight = mapData.height

    terrainCanvas.width = mapWidth * tileSize
    terrainCanvas.height = mapHeight * tileSize

    const ctx = terrainCanvas.getContext("2d")!
    ctx.imageSmoothingEnabled = false

    // Clear
    ctx.fillStyle = "#1a1a2e"
    ctx.fillRect(0, 0, terrainCanvas.width, terrainCanvas.height)

    // PASS 1: Draw base terrain tiles
    for (let y = 0; y < mapHeight; y++) {
      for (let x = 0; x < mapWidth; x++) {
        const tile = mapData.layers.terrain[y]?.[x]
        if (!tile) continue

        const asset = assetCache.get(tile.tileAssetId)
        const props = tileProperties.get(tile.tileAssetId)
        if (!asset) continue

        const variations = props?.variations ?? 1
        const variation = getVariationFromSeed(tile.seed, variations)
        const url = getAssetFileUrl(asset.storageKeyPrefix, `tile_${variation}.png`)
        const img = getImage(url)

        if (img) {
          ctx.drawImage(img, x * tileSize, y * tileSize, tileSize, tileSize)
        }
      }
    }

    // PASS 2: Draw transitions (Stacking Algorithm)
    // A tile projects its transition onto neighbors where:
    // - Neighbor is void (empty), OR
    // - Neighbor exists AND tile.assetId > neighbor.assetId (dominant wins)
    if (showTransitions) {
      for (let y = 0; y < mapHeight; y++) {
        for (let x = 0; x < mapWidth; x++) {
          const tile = mapData.layers.terrain[y]?.[x]
          if (!tile) continue

          const tileAsset = assetCache.get(tile.tileAssetId)
          if (!tileAsset) continue

          // Check each direction
          for (const [dir, offset] of Object.entries(DIRECTION_OFFSETS) as [TransitionDirection, {dx: number, dy: number}][]) {
            const nx = x + offset.dx
            const ny = y + offset.dy

            // Skip if neighbor is out of bounds
            if (nx < 0 || nx >= mapWidth || ny < 0 || ny >= mapHeight) continue

            const neighbor = mapData.layers.terrain[ny]?.[nx]

            // Determine if we should draw transition
            let shouldDraw = false

            if (!neighbor) {
              // Condition 1: Neighbor is void - always draw transition
              shouldDraw = true
            } else if (neighbor.tileAssetId !== tile.tileAssetId) {
              // Condition 2: Different tile - dominant tile (higher assetId) wins
              shouldDraw = tile.tileAssetId > neighbor.tileAssetId
            }

            if (shouldDraw) {
              // Draw THIS tile's transition onto the NEIGHBOR's position
              // The transition file is named by where the solid edge is
              // e.g., transition_n has solid at top - use it when projecting NORTH
              const transitionUrl = getAssetFileUrl(
                tileAsset.storageKeyPrefix,
                `tile_0_transition_${dir}.png`
              )
              const transitionImg = getImage(transitionUrl)

              if (transitionImg) {
                ctx.drawImage(transitionImg, nx * tileSize, ny * tileSize, tileSize, tileSize)
              }
            }
          }
        }
      }
    }

    // PASS 3: Draw paths (on top of terrain + transitions)
    if (showPaths) {
      for (let y = 0; y < mapHeight; y++) {
        for (let x = 0; x < mapWidth; x++) {
          const path = mapData.layers.paths[y]?.[x]
          if (!path) continue

          const asset = assetCache.get(path.pathAssetId)
          if (!asset) continue

          const variation = calculatePathVariation(
            mapData.layers.paths, x, y,
            mapWidth, mapHeight, path.pathAssetId
          )
          const url = getAssetFileUrl(asset.storageKeyPrefix, `tile_${variation}.png`)
          const img = getImage(url)

          if (img) {
            ctx.drawImage(img, x * tileSize, y * tileSize, tileSize, tileSize)
          }
        }
      }
    }

    // PASS 4: Draw characters
    if (showCharacters) {
      for (const char of mapData.characters) {
        const asset = assetCache.get(char.characterAssetId)
        if (!asset) continue

        const url = getAssetFileUrl(asset.storageKeyPrefix, "idle_0.png")
        const img = getImage(url)

        if (img) {
          ctx.drawImage(img, char.x * tileSize, char.y * tileSize, tileSize, tileSize)
        }
      }
    }

    setTerrainDirty(false)
  }, [mapData, showTransitions, showPaths, showCharacters, assetsLoaded, tileProperties])

  // ============================================================
  // MAIN RENDER (blit terrain canvas + overlays)
  // ============================================================
  const render = useCallback(() => {
    const mainCanvas = mainCanvasRef.current
    const terrainCanvas = terrainCanvasRef.current
    const container = containerRef.current
    if (!mainCanvas || !terrainCanvas || !container) return

    // Redraw terrain if dirty
    if (terrainDirty) {
      renderTerrain()
    }

    // Set main canvas to container size
    mainCanvas.width = container.clientWidth
    mainCanvas.height = container.clientHeight

    const ctx = mainCanvas.getContext("2d")!
    ctx.imageSmoothingEnabled = false

    // Clear
    ctx.fillStyle = "#09090b"
    ctx.fillRect(0, 0, mainCanvas.width, mainCanvas.height)

    // Draw terrain canvas with pan/zoom
    ctx.save()
    ctx.translate(panOffsetRef.current.x, panOffsetRef.current.y)
    ctx.scale(zoom, zoom)
    ctx.drawImage(terrainCanvas, 0, 0)

    // Draw grid (on top, only if zoomed enough)
    if (showGrid && zoom >= 0.2) {
      const tileSize = mapData.tileSize
      ctx.strokeStyle = "#ffffff22"
      ctx.lineWidth = 1 / zoom // Consistent line width regardless of zoom

      for (let gx = 0; gx <= mapData.width; gx++) {
        ctx.beginPath()
        ctx.moveTo(gx * tileSize, 0)
        ctx.lineTo(gx * tileSize, mapData.height * tileSize)
        ctx.stroke()
      }
      for (let gy = 0; gy <= mapData.height; gy++) {
        ctx.beginPath()
        ctx.moveTo(0, gy * tileSize)
        ctx.lineTo(mapData.width * tileSize, gy * tileSize)
        ctx.stroke()
      }
    }

    // Layer overlay hint
    if (activeLayer === "paths") {
      ctx.fillStyle = "#ffa50011"
      ctx.fillRect(0, 0, mapData.width * mapData.tileSize, mapData.height * mapData.tileSize)
    } else if (activeLayer === "characters") {
      ctx.fillStyle = "#a855f711"
      ctx.fillRect(0, 0, mapData.width * mapData.tileSize, mapData.height * mapData.tileSize)
    }

    ctx.restore()
  }, [zoom, showGrid, activeLayer, mapData, terrainDirty, renderTerrain])

  // Re-render when needed
  useEffect(() => {
    render()
  }, [render, panOffset, renderTrigger])

  // Handle resize
  useEffect(() => {
    const handleResize = () => render()
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [render])

  // ============================================================
  // INTERACTION HANDLERS
  // ============================================================
  const getCellFromEvent = useCallback((e: React.MouseEvent): { x: number; y: number } | null => {
    const mainCanvas = mainCanvasRef.current
    if (!mainCanvas) return null

    const rect = mainCanvas.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top

    const worldX = (mouseX - panOffsetRef.current.x) / zoom
    const worldY = (mouseY - panOffsetRef.current.y) / zoom

    const cellX = Math.floor(worldX / mapData.tileSize)
    const cellY = Math.floor(worldY / mapData.tileSize)

    if (cellX >= 0 && cellX < mapData.width && cellY >= 0 && cellY < mapData.height) {
      return { x: cellX, y: cellY }
    }
    return null
  }, [zoom, mapData.width, mapData.height, mapData.tileSize])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (currentTool === "pan") {
      isDraggingRef.current = true
      dragStartRef.current = { x: e.clientX - panOffsetRef.current.x, y: e.clientY - panOffsetRef.current.y }
    } else if (currentTool === "paint" || currentTool === "erase") {
      isDrawingRef.current = true
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

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isDraggingRef.current && currentTool === "pan") {
      const newPan = {
        x: e.clientX - dragStartRef.current.x,
        y: e.clientY - dragStartRef.current.y
      }
      panOffsetRef.current = newPan
      onPanChange(newPan)
      requestAnimationFrame(render)
    } else if (isDrawingRef.current && (currentTool === "paint" || currentTool === "erase")) {
      const cell = getCellFromEvent(e)
      if (cell && (lastCellRef.current?.x !== cell.x || lastCellRef.current?.y !== cell.y)) {
        lastCellRef.current = cell
        onCellClick(cell.x, cell.y)
      }
    }
  }, [currentTool, getCellFromEvent, onCellClick, onPanChange, render])

  const handleMouseUp = useCallback(() => {
    isDraggingRef.current = false
    isDrawingRef.current = false
    lastCellRef.current = null
  }, [])

  const getCursor = () => {
    switch (currentTool) {
      case "pan": return isDraggingRef.current ? "grabbing" : "grab"
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
