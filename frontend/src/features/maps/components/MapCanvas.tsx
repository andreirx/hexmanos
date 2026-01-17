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

interface CharacterDefinition {
  name: string
  spriteSize: number
  states: Record<string, { frames: number; loop: boolean }>
}

// Character definition cache
const characterDefCache = new Map<string, CharacterDefinition>()

// Animation timing (ms per frame)
const ANIMATION_FRAME_MS = 200

interface MapCanvasProps {
  mapData: MapData
  zoom: number
  minZoom?: number
  maxZoom?: number
  panOffset: { x: number; y: number }
  onPanChange: (offset: { x: number; y: number }) => void
  onZoomChange?: (zoom: number) => void
  showGrid: boolean
  showPaths: boolean
  showCharacters: boolean
  showTransitions: boolean
  activeLayer: "terrain" | "paths" | "characters"
  currentTool: "select" | "paint" | "erase" | "pan" | "rect" | "disc"
  onCellClick: (x: number, y: number) => void
  onShapeStart?: (x: number, y: number) => void
  onShapeEnd?: (x: number, y: number) => void
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
  minZoom = 0.1,
  maxZoom = 4,
  panOffset,
  onPanChange,
  onZoomChange,
  showGrid,
  showPaths,
  showCharacters,
  showTransitions,
  activeLayer,
  currentTool,
  onCellClick,
  onShapeStart,
  onShapeEnd
}: MapCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mainCanvasRef = useRef<HTMLCanvasElement>(null)

  // Offscreen canvases - one for terrain (memoized), one for compositing
  const terrainCanvasRef = useRef<HTMLCanvasElement | null>(null)

  // Interaction state (refs for performance)
  const isDraggingRef = useRef(false)
  const isDrawingRef = useRef(false)
  const isPanningRef = useRef(false) // Middle mouse / Alt+click panning
  const dragStartRef = useRef({ x: 0, y: 0 })
  const panOffsetRef = useRef(panOffset)
  const lastCellRef = useRef<{ x: number; y: number } | null>(null)
  const lastPanPointRef = useRef({ x: 0, y: 0 })

  // Force re-render trigger
  const [renderTrigger, setRenderTrigger] = useState(0)

  // Track if terrain needs redraw
  const [terrainDirty, setTerrainDirty] = useState(true)

  // Asset loading state
  const [assetsLoaded, setAssetsLoaded] = useState(false)
  const [tileProperties, setTileProperties] = useState<Map<string, TileProperties>>(new Map())
  const [characterDefs, setCharacterDefs] = useState<Map<string, CharacterDefinition>>(new Map())

  // Animation state
  const [animationFrame, setAnimationFrame] = useState(0)

  // Keep refs in sync with props
  const zoomRef = useRef(zoom)
  useEffect(() => {
    panOffsetRef.current = panOffset
  }, [panOffset])
  useEffect(() => {
    zoomRef.current = zoom
  }, [zoom])

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

  // Mark terrain dirty when mapData, visibility settings, or assets change
  useEffect(() => {
    setTerrainDirty(true)
  }, [mapData, showTransitions, showPaths, showCharacters, assetsLoaded, tileProperties, characterDefs])

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

        // Load tile properties for variation counts
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

        // Load character definitions for animation frame counts
        const charDefPromises = characters.map(async (asset) => {
          try {
            const def = await getAssetFile<CharacterDefinition>(asset.storageKeyPrefix, "definition.json")
            characterDefCache.set(asset.id, def)
            return { assetId: asset.id, def }
          } catch {
            return { assetId: asset.id, def: null }
          }
        })

        const charDefResults = await Promise.all(charDefPromises)
        const charDefMap = new Map<string, CharacterDefinition>()
        charDefResults.forEach(({ assetId, def }) => {
          if (def) charDefMap.set(assetId, def)
        })
        setCharacterDefs(charDefMap)

        setAssetsLoaded(true)
      } catch (err) {
        console.error("Failed to load assets:", err)
      }
    }
    loadAssets()
  }, [])

  // Animation timer for characters
  useEffect(() => {
    if (!showCharacters || mapData.characters.length === 0) return

    const timer = setInterval(() => {
      setAnimationFrame(f => f + 1)
      setTerrainDirty(true) // Force redraw to show new frame
    }, ANIMATION_FRAME_MS)

    return () => clearInterval(timer)
  }, [showCharacters, mapData.characters.length])

  // Mouse wheel zoom handler - zoom centered on mouse position
  const handleWheel = useCallback(
    (e: WheelEvent) => {
      if (!onZoomChange) return
      e.preventDefault()

      const container = containerRef.current
      if (!container) return

      // Get mouse position relative to container
      const rect = container.getBoundingClientRect()
      const mouseX = e.clientX - rect.left
      const mouseY = e.clientY - rect.top

      // Use refs to get the latest values (avoids stale closure)
      const currentZoom = zoomRef.current
      const currentPan = panOffsetRef.current

      // Calculate world coordinate under mouse before zoom
      const worldX = (mouseX - currentPan.x) / currentZoom
      const worldY = (mouseY - currentPan.y) / currentZoom

      // Calculate new zoom level
      const zoomFactor = 1.1
      const newZoom = e.deltaY < 0
        ? Math.min(maxZoom, currentZoom * zoomFactor)
        : Math.max(minZoom, currentZoom / zoomFactor)

      // Calculate new pan offset so the world point stays under the mouse
      const newPanX = mouseX - worldX * newZoom
      const newPanY = mouseY - worldY * newZoom

      // Update both zoom and pan
      panOffsetRef.current = { x: newPanX, y: newPanY }
      zoomRef.current = newZoom
      onPanChange({ x: newPanX, y: newPanY })
      onZoomChange(newZoom)
    },
    [minZoom, maxZoom, onZoomChange, onPanChange]
  )

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    container.addEventListener("wheel", handleWheel, { passive: false })
    return () => container.removeEventListener("wheel", handleWheel)
  }, [handleWheel])

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

    // PASS 4: Draw characters with animation
    if (showCharacters) {
      for (const char of mapData.characters) {
        const asset = assetCache.get(char.characterAssetId)
        if (!asset) continue

        // Get character definition for frame count
        const charDef = characterDefs.get(char.characterAssetId)
        const idleFrameCount = charDef?.states?.idle?.frames ?? 1

        // Calculate current frame (loop through available frames)
        const currentFrame = idleFrameCount > 1 ? animationFrame % idleFrameCount : 0

        const url = getAssetFileUrl(asset.storageKeyPrefix, `idle_${currentFrame}.png`)
        const img = getImage(url)

        if (img) {
          ctx.drawImage(img, char.x * tileSize, char.y * tileSize, tileSize, tileSize)
        }
      }
    }

    setTerrainDirty(false)
  }, [mapData, showTransitions, showPaths, showCharacters, assetsLoaded, tileProperties, characterDefs, animationFrame])

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

  // Bresenham line algorithm - returns all cells along a line
  const getLineCells = useCallback((x0: number, y0: number, x1: number, y1: number): { x: number; y: number }[] => {
    const cells: { x: number; y: number }[] = []
    const dx = Math.abs(x1 - x0)
    const dy = Math.abs(y1 - y0)
    const sx = x0 < x1 ? 1 : -1
    const sy = y0 < y1 ? 1 : -1
    let err = dx - dy

    let x = x0
    let y = y0

    while (true) {
      cells.push({ x, y })
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
    return cells
  }, [])

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
    // Right click, middle mouse, or Alt+left click: start panning regardless of tool
    if (e.button === 2 || e.button === 1 || (e.button === 0 && e.altKey)) {
      e.preventDefault()
      isPanningRef.current = true
      lastPanPointRef.current = { x: e.clientX, y: e.clientY }
      return
    }

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
    } else if (currentTool === "rect" || currentTool === "disc") {
      // Shape tools: mark start point
      isDrawingRef.current = true
      const cell = getCellFromEvent(e)
      if (cell) {
        lastCellRef.current = cell
        onShapeStart?.(cell.x, cell.y)
      }
    } else if (currentTool === "select") {
      const cell = getCellFromEvent(e)
      if (cell) {
        onCellClick(cell.x, cell.y)
      }
    }
  }, [currentTool, getCellFromEvent, onCellClick, onShapeStart])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    // Handle middle mouse / Alt+click panning
    if (isPanningRef.current) {
      const dx = e.clientX - lastPanPointRef.current.x
      const dy = e.clientY - lastPanPointRef.current.y
      const newPan = {
        x: panOffsetRef.current.x + dx,
        y: panOffsetRef.current.y + dy
      }
      panOffsetRef.current = newPan
      lastPanPointRef.current = { x: e.clientX, y: e.clientY }
      onPanChange(newPan)
      requestAnimationFrame(render)
      return
    }

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
        // Use Bresenham line to fill in gaps when dragging fast
        if (lastCellRef.current) {
          const lineCells = getLineCells(lastCellRef.current.x, lastCellRef.current.y, cell.x, cell.y)
          // Skip the first cell (it was already drawn), draw the rest
          for (let i = 1; i < lineCells.length; i++) {
            onCellClick(lineCells[i].x, lineCells[i].y)
          }
        } else {
          onCellClick(cell.x, cell.y)
        }
        lastCellRef.current = cell
      }
    }
  }, [currentTool, getCellFromEvent, onCellClick, onPanChange, render, getLineCells])

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    // For shape tools, call onShapeEnd with the end cell
    if (isDrawingRef.current && (currentTool === "rect" || currentTool === "disc")) {
      const cell = getCellFromEvent(e)
      if (cell) {
        onShapeEnd?.(cell.x, cell.y)
      }
    }

    isDraggingRef.current = false
    isDrawingRef.current = false
    isPanningRef.current = false
    lastCellRef.current = null
  }, [currentTool, getCellFromEvent, onShapeEnd])

  const getCursor = () => {
    // Panning takes priority (middle mouse / Alt+click)
    if (isPanningRef.current) return "grabbing"

    switch (currentTool) {
      case "pan": return isDraggingRef.current ? "grabbing" : "grab"
      case "paint": return "crosshair"
      case "erase": return "crosshair"
      case "rect": return "crosshair"
      case "disc": return "crosshair"
      case "select": return "pointer"
      default: return "default"
    }
  }

  const handleMouseLeave = useCallback(() => {
    // Just cancel drawing on mouse leave - don't complete shapes
    isDraggingRef.current = false
    isDrawingRef.current = false
    isPanningRef.current = false
    lastCellRef.current = null
  }, [])

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-hidden bg-zinc-950"
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
    >
      <canvas
        ref={mainCanvasRef}
        className="w-full h-full"
        style={{ cursor: getCursor() }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onContextMenu={(e) => e.preventDefault()}
      />
    </div>
  )
}
