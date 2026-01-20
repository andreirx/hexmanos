import { useState, useEffect, useRef, useCallback } from "react"
import { X, User, Grid3X3, Map as MapIcon, Play, Pause, Package } from "lucide-react"
import { Button } from "@/components/ui/button"
import { getAssetFileUrl, getAssetFile } from "@/api/assets"
import type { AssetDTO } from "@/api/types"

// Character/Object definition from the definition.json
interface EntityDefinition {
  name: string
  spriteSize: number
  entityType?: "CHARACTER" | "OBJECT"
  visualStates?: string[]
  states: Record<string, { frames: number; loop: boolean }>
}

// Tile properties from properties.json (if exists)
interface TileProperties {
  name: string
  tileSize: number
  passable: boolean
  variations: number
  tileType?: "TILE" | "PATH"
}

// Map data structure
interface MapData {
  name: string
  width: number
  height: number
  tileSize: number
  layers: {
    terrain: (MapTile | null)[][]
    waterPaths?: (MapPath | null)[][]
    groundPaths?: (MapPath | null)[][]
    paths?: (MapPath | null)[][]  // Legacy
  }
  characters: MapCharacter[]
}

function normalizeMapData(data: MapData): MapData {
  if (data.layers.waterPaths && data.layers.groundPaths) return data
  const { width, height, layers } = data
  const createEmpty = () => Array.from({ length: height }, () => Array.from({ length: width }, () => null))
  return {
    ...data,
    layers: {
      terrain: layers.terrain,
      waterPaths: layers.waterPaths ?? createEmpty(),
      groundPaths: layers.groundPaths ?? (layers.paths ? layers.paths.map(r => [...r]) : createEmpty())
    }
  }
}

interface MapTile {
  tileAssetId: string
  seed: number
}

interface MapPath {
  pathAssetId: string
}

interface MapCharacter {
  characterAssetId: string
  x: number
  y: number
}

interface AssetDetailModalProps {
  asset: AssetDTO | null
  isOpen: boolean
  onClose: () => void
}

export function AssetDetailModal({ asset, isOpen, onClose }: AssetDetailModalProps) {
  if (!isOpen || !asset) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/80" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-zinc-900 rounded-lg shadow-xl w-full max-w-4xl max-h-[85vh] flex flex-col border border-zinc-700">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-700">
          <div className="flex items-center gap-3">
            {asset.type === "CHARACTER" && <User className="w-5 h-5 text-purple-400" />}
            {asset.type === "OBJECT" && <Package className="w-5 h-5 text-orange-400" />}
            {asset.type === "TILE" && <Grid3X3 className="w-5 h-5 text-blue-400" />}
            {asset.type === "MAP" && <MapIcon className="w-5 h-5 text-emerald-400" />}
            <h2 className="text-lg font-semibold text-zinc-100">{asset.name}</h2>
            <span className="px-2 py-0.5 text-xs rounded-full bg-zinc-800 text-zinc-400">
              {asset.type}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-zinc-700 rounded transition-colors"
          >
            <X className="w-5 h-5 text-zinc-400" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {asset.type === "CHARACTER" && <EntityDetail asset={asset} />}
          {asset.type === "OBJECT" && <EntityDetail asset={asset} />}
          {asset.type === "TILE" && <TileDetail asset={asset} />}
          {asset.type === "MAP" && <MapDetail asset={asset} />}
        </div>
      </div>
    </div>
  )
}

// Entity detail view (CHARACTER or OBJECT) - shows all visual states, animation states and frames
function EntityDetail({ asset }: { asset: AssetDTO }) {
  const [definition, setDefinition] = useState<EntityDefinition | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [playingState, setPlayingState] = useState<string | null>(null)
  const [frameIndices, setFrameIndices] = useState<Record<string, number>>({})
  const [currentVisualState, setCurrentVisualState] = useState<string>("default")
  const intervalRef = useRef<number | null>(null)

  useEffect(() => {
    loadDefinition()
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [asset.storageKeyPrefix])

  async function loadDefinition() {
    setIsLoading(true)
    setError(null)
    try {
      const def = await getAssetFile<EntityDefinition>(asset.storageKeyPrefix, "definition.json")
      setDefinition(def)
      // Initialize frame indices
      const indices: Record<string, number> = {}
      Object.keys(def.states).forEach(stateId => {
        indices[stateId] = 0
      })
      setFrameIndices(indices)
      // Set initial visual state
      if (def.visualStates && def.visualStates.length > 0) {
        setCurrentVisualState(def.visualStates[0])
      } else {
        setCurrentVisualState("default")
      }
    } catch (err) {
      console.error("Failed to load entity definition:", err)
      setError("Failed to load entity data")
    } finally {
      setIsLoading(false)
    }
  }

  const togglePlay = useCallback((stateId: string, frameCount: number) => {
    if (playingState === stateId) {
      // Stop playing
      if (intervalRef.current) clearInterval(intervalRef.current)
      setPlayingState(null)
    } else {
      // Start playing
      if (intervalRef.current) clearInterval(intervalRef.current)
      setPlayingState(stateId)
      intervalRef.current = window.setInterval(() => {
        setFrameIndices(prev => ({
          ...prev,
          [stateId]: (prev[stateId] + 1) % frameCount
        }))
      }, 150)
    }
  }, [playingState])

  // Get the file name for a frame, handling legacy vs new format
  function getFrameFileName(visualState: string, stateId: string, frameIndex: number): string {
    // Legacy format: no visualStates in definition, files are just `{stateId}_{frame}.png`
    // New format: files are `{visualState}_{stateId}_{frame}.png`
    const isLegacy = !definition?.visualStates || definition.visualStates.length === 0
    if (isLegacy) {
      return `${stateId}_${frameIndex}.png`
    }
    return `${visualState}_${stateId}_${frameIndex}.png`
  }

  if (isLoading) {
    return <div className="text-center py-8 text-zinc-400">Loading entity data...</div>
  }

  if (error) {
    return <div className="text-center py-8 text-red-400">{error}</div>
  }

  if (!definition) {
    return <div className="text-center py-8 text-zinc-400">No entity data found</div>
  }

  const visualStates = definition.visualStates && definition.visualStates.length > 0
    ? definition.visualStates
    : ["default"]
  const entityType = definition.entityType || "CHARACTER"

  return (
    <div className="space-y-6">
      <div className="text-sm text-zinc-400">
        Sprite Size: {definition.spriteSize}px • {Object.keys(definition.states).length} animation state{Object.keys(definition.states).length !== 1 ? "s" : ""}
        {visualStates.length > 1 && ` • ${visualStates.length} visual states`}
      </div>

      {/* Visual State Tabs - only show if there are multiple visual states */}
      {visualStates.length > 1 && (
        <div className="flex gap-1 flex-wrap">
          {visualStates.map(vs => (
            <button
              key={vs}
              onClick={() => setCurrentVisualState(vs)}
              className={`px-3 py-1 text-sm rounded transition-colors ${
                currentVisualState === vs
                  ? entityType === "OBJECT"
                    ? "bg-orange-500/20 text-orange-300 border border-orange-500/50"
                    : "bg-purple-500/20 text-purple-300 border border-purple-500/50"
                  : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700 border border-zinc-700"
              }`}
            >
              {vs}
            </button>
          ))}
        </div>
      )}

      {/* Animation States */}
      <div className="grid gap-6">
        {Object.entries(definition.states).map(([stateId, stateInfo]) => (
          <div key={stateId} className="bg-zinc-800/50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <h4 className="font-medium text-zinc-200">{stateId}</h4>
                <span className="text-xs text-zinc-500">
                  {stateInfo.frames} frame{stateInfo.frames !== 1 ? "s" : ""} • {stateInfo.loop ? "looping" : "one-shot"}
                </span>
              </div>
              {stateInfo.frames > 1 && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => togglePlay(stateId, stateInfo.frames)}
                >
                  {playingState === stateId ? (
                    <><Pause className="w-3 h-3 mr-1" /> Pause</>
                  ) : (
                    <><Play className="w-3 h-3 mr-1" /> Play</>
                  )}
                </Button>
              )}
            </div>

            <div className="flex gap-2 flex-wrap">
              {Array.from({ length: stateInfo.frames }).map((_, i) => {
                const isActive = playingState === stateId && frameIndices[stateId] === i
                const fileName = getFrameFileName(currentVisualState, stateId, i)
                return (
                  <div
                    key={i}
                    className={`relative bg-zinc-950 rounded border-2 transition-colors ${
                      isActive ? "border-amber-500" : "border-zinc-700"
                    }`}
                  >
                    <img
                      src={getAssetFileUrl(asset.storageKeyPrefix, fileName, true)}
                      alt={`${stateId} frame ${i}`}
                      className="w-16 h-16 object-contain rendering-pixelated"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement
                        target.style.display = "none"
                      }}
                    />
                    <span className="absolute bottom-0 right-0 px-1 text-[10px] bg-black/70 text-zinc-400 rounded-tl">
                      {i}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// Tile detail view - shows all variations
function TileDetail({ asset }: { asset: AssetDTO }) {
  const [properties, setProperties] = useState<TileProperties | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [variationCount, setVariationCount] = useState(1)

  useEffect(() => {
    loadProperties()
  }, [asset.storageKeyPrefix])

  async function loadProperties() {
    setIsLoading(true)
    try {
      // Try to load properties.json
      const props = await getAssetFile<TileProperties>(asset.storageKeyPrefix, "properties.json")
      setProperties(props)
      setVariationCount(props.variations || 1)
    } catch {
      // If no properties.json, try to detect variations by loading images
      let count = 0
      for (let i = 0; i < 16; i++) {
        try {
          const url = getAssetFileUrl(asset.storageKeyPrefix, `tile_${i}.png`, true)
          const response = await fetch(url, { method: "HEAD" })
          if (response.ok) {
            count = i + 1
          } else {
            break
          }
        } catch {
          break
        }
      }
      setVariationCount(Math.max(1, count))
    } finally {
      setIsLoading(false)
    }
  }

  if (isLoading) {
    return <div className="text-center py-8 text-zinc-400">Loading tile data...</div>
  }

  // Path tiles have 15 fixed variations
  const isPath = properties?.tileType === "PATH"
  const pathLabels = ["→", "←", "←→", "↓", "↓→", "↓←", "↓←→", "↑", "↑→", "↑←", "↑←→", "↑↓", "↑↓→", "↑↓←", "↑↓←→"]

  return (
    <div className="space-y-4">
      <div className="text-sm text-zinc-400">
        {properties && (
          <>
            Size: {properties.tileSize}px •
            {properties.passable ? " Passable" : " Impassable"} •
            {isPath ? " Path tile (15 directional variations)" : ` ${variationCount} variation${variationCount !== 1 ? "s" : ""}`}
          </>
        )}
        {!properties && (
          <>{variationCount} variation{variationCount !== 1 ? "s" : ""} detected</>
        )}
      </div>

      <div className="flex gap-3 flex-wrap">
        {Array.from({ length: isPath ? 15 : variationCount }).map((_, i) => (
          <div
            key={i}
            className="relative bg-zinc-950 rounded border border-zinc-700 p-1"
          >
            <img
              src={getAssetFileUrl(asset.storageKeyPrefix, `tile_${i}.png`, true)}
              alt={`Variation ${i}`}
              className="w-20 h-20 object-contain rendering-pixelated"
              onError={(e) => {
                const target = e.target as HTMLImageElement
                target.src = ""
                target.style.display = "none"
                target.parentElement!.classList.add("hidden")
              }}
            />
            <span className="absolute bottom-0 right-0 px-1.5 py-0.5 text-[10px] bg-black/70 text-zinc-400 rounded-tl">
              {isPath ? pathLabels[i] : i}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// Map detail view - shows map preview
function MapDetail({ asset }: { asset: AssetDTO }) {
  const [mapData, setMapData] = useState<MapData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [tileImages, setTileImages] = useState<Map<string, HTMLImageElement>>(new Map())

  useEffect(() => {
    loadMapData()
  }, [asset.storageKeyPrefix])

  async function loadMapData() {
    setIsLoading(true)
    setError(null)
    try {
      const rawData = await getAssetFile<MapData>(asset.storageKeyPrefix, "map.json")
      const data = normalizeMapData(rawData)
      setMapData(data)

      // Collect all unique tile asset IDs
      const tileAssetIds = new Set<string>()
      for (let y = 0; y < data.height; y++) {
        for (let x = 0; x < data.width; x++) {
          const tile = data.layers.terrain[y]?.[x]
          if (tile) tileAssetIds.add(tile.tileAssetId)

          const waterPath = data.layers.waterPaths?.[y]?.[x]
          if (waterPath) tileAssetIds.add(waterPath.pathAssetId)

          const groundPath = data.layers.groundPaths?.[y]?.[x]
          if (groundPath) tileAssetIds.add(groundPath.pathAssetId)
        }
      }

      // Load tile images
      // Note: tileAssetId is the asset UUID, but the URL needs storageKeyPrefix (tiles/{assetId})
      const images = new Map<string, HTMLImageElement>()
      await Promise.all(
        Array.from(tileAssetIds).map(async (assetId) => {
          try {
            const img = new Image()
            img.crossOrigin = "anonymous"
            await new Promise<void>((resolve, reject) => {
              img.onload = () => resolve()
              img.onerror = reject
              // Construct the storageKeyPrefix from the asset ID
              const storageKeyPrefix = `tiles/${assetId}`
              img.src = `http://localhost:8080/api/assets/files/${storageKeyPrefix}/tile_0.png?t=${Date.now()}`
            })
            images.set(assetId, img)
          } catch {
            // Ignore failed images
          }
        })
      )
      setTileImages(images)
    } catch (err) {
      console.error("Failed to load map:", err)
      setError("Failed to load map data")
    } finally {
      setIsLoading(false)
    }
  }

  // Render map to canvas
  useEffect(() => {
    if (!mapData || !canvasRef.current || tileImages.size === 0) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    // Use smaller preview tile size
    const previewTileSize = 16
    canvas.width = mapData.width * previewTileSize
    canvas.height = mapData.height * previewTileSize

    // Disable image smoothing for pixel art
    ctx.imageSmoothingEnabled = false

    // Clear canvas
    ctx.fillStyle = "#18181b"
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // Render terrain layer
    for (let y = 0; y < mapData.height; y++) {
      for (let x = 0; x < mapData.width; x++) {
        const tile = mapData.layers.terrain[y]?.[x]
        if (tile) {
          const img = tileImages.get(tile.tileAssetId)
          if (img) {
            ctx.drawImage(
              img,
              x * previewTileSize,
              y * previewTileSize,
              previewTileSize,
              previewTileSize
            )
          }
        }
      }
    }

    // Render water paths layer
    for (let y = 0; y < mapData.height; y++) {
      for (let x = 0; x < mapData.width; x++) {
        const path = mapData.layers.waterPaths?.[y]?.[x]
        if (path) {
          const img = tileImages.get(path.pathAssetId)
          if (img) ctx.drawImage(img, x * previewTileSize, y * previewTileSize, previewTileSize, previewTileSize)
        }
      }
    }

    // Render ground paths layer (on top)
    for (let y = 0; y < mapData.height; y++) {
      for (let x = 0; x < mapData.width; x++) {
        const path = mapData.layers.groundPaths?.[y]?.[x]
        if (path) {
          const img = tileImages.get(path.pathAssetId)
          if (img) ctx.drawImage(img, x * previewTileSize, y * previewTileSize, previewTileSize, previewTileSize)
        }
      }
    }
  }, [mapData, tileImages])

  if (isLoading) {
    return <div className="text-center py-8 text-zinc-400">Loading map data...</div>
  }

  if (error) {
    return <div className="text-center py-8 text-red-400">{error}</div>
  }

  if (!mapData) {
    return <div className="text-center py-8 text-zinc-400">No map data found</div>
  }

  return (
    <div className="space-y-4">
      <div className="text-sm text-zinc-400">
        Size: {mapData.width} x {mapData.height} tiles •
        Tile Size: {mapData.tileSize}px •
        Characters: {mapData.characters.length}
      </div>

      <div className="flex justify-center">
        <div className="bg-zinc-950 rounded border border-zinc-700 p-2 inline-block">
          <canvas
            ref={canvasRef}
            className="rendering-pixelated"
            style={{
              maxWidth: "100%",
              height: "auto",
              minWidth: Math.min(mapData.width * 16, 400),
            }}
          />
        </div>
      </div>

      {mapData.characters.length > 0 && (
        <div className="mt-4">
          <h4 className="text-sm font-medium text-zinc-300 mb-2">Placed Characters</h4>
          <div className="flex gap-2 flex-wrap">
            {mapData.characters.map((char, i) => (
              <div
                key={i}
                className="bg-zinc-800 rounded px-2 py-1 text-xs text-zinc-400"
              >
                {char.characterAssetId.slice(0, 8)}... @ ({char.x}, {char.y})
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
