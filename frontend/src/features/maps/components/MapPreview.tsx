import { useState, useEffect, useRef } from "react"
import { getAssetFile, getAssetFileUrl } from "@/api/assets"
import { Map as MapIcon } from "lucide-react"

// Map data structure (simplified for preview)
interface MapData {
  name: string
  width: number
  height: number
  tileSize: number
  layers: {
    terrain: (MapTile | null)[][]
    paths: (MapPath | null)[][]
  }
  characters: MapCharacter[]
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

interface MapPreviewProps {
  storageKeyPrefix: string
  className?: string
}

export function MapPreview({ storageKeyPrefix, className = "" }: MapPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(false)
  const [mapData, setMapData] = useState<MapData | null>(null)

  useEffect(() => {
    loadAndRenderMap()
  }, [storageKeyPrefix])

  async function loadAndRenderMap() {
    setIsLoading(true)
    setError(false)

    try {
      // Load map data
      const data = await getAssetFile<MapData>(storageKeyPrefix, "map.json")
      setMapData(data)

      // Collect all unique tile asset IDs
      const tileAssetIds = new Set<string>()
      for (let y = 0; y < data.height; y++) {
        for (let x = 0; x < data.width; x++) {
          const tile = data.layers.terrain[y]?.[x]
          if (tile) tileAssetIds.add(tile.tileAssetId)

          const path = data.layers.paths[y]?.[x]
          if (path) tileAssetIds.add(path.pathAssetId)
        }
      }

      // Load tile images
      const tileImages = new Map<string, HTMLImageElement>()
      await Promise.all(
        Array.from(tileAssetIds).map(async (assetId) => {
          try {
            const img = new Image()
            img.crossOrigin = "anonymous"
            await new Promise<void>((resolve, reject) => {
              img.onload = () => resolve()
              img.onerror = reject
              // Load tile_0.png for preview
              img.src = getAssetFileUrl(assetId, "tile_0.png", true)
            })
            tileImages.set(assetId, img)
          } catch {
            // Ignore failed images
          }
        })
      )

      // Render to canvas
      const canvas = canvasRef.current
      if (!canvas) return

      const ctx = canvas.getContext("2d")
      if (!ctx) return

      // Calculate preview tile size to fit in container
      // Use 8px tiles for preview (small enough to fit, large enough to see)
      const previewTileSize = 8
      canvas.width = data.width * previewTileSize
      canvas.height = data.height * previewTileSize

      // Disable image smoothing for pixel art
      ctx.imageSmoothingEnabled = false

      // Clear canvas with dark background
      ctx.fillStyle = "#18181b"
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      // Render terrain layer
      for (let y = 0; y < data.height; y++) {
        for (let x = 0; x < data.width; x++) {
          const tile = data.layers.terrain[y]?.[x]
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

      // Render paths layer (on top)
      for (let y = 0; y < data.height; y++) {
        for (let x = 0; x < data.width; x++) {
          const path = data.layers.paths[y]?.[x]
          if (path) {
            const img = tileImages.get(path.pathAssetId)
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

      // Mark character positions with small dots
      if (data.characters.length > 0) {
        ctx.fillStyle = "#f59e0b" // Amber for characters
        data.characters.forEach((char) => {
          const cx = char.x * previewTileSize + previewTileSize / 2
          const cy = char.y * previewTileSize + previewTileSize / 2
          ctx.beginPath()
          ctx.arc(cx, cy, 2, 0, Math.PI * 2)
          ctx.fill()
        })
      }

      setIsLoading(false)
    } catch (err) {
      console.error("Failed to load map preview:", err)
      setError(true)
      setIsLoading(false)
    }
  }

  if (error) {
    return (
      <div className={`flex items-center justify-center bg-zinc-950 ${className}`}>
        <div className="text-center">
          <MapIcon className="w-8 h-8 text-zinc-600 mx-auto mb-1" />
          {mapData && (
            <div className="text-xs text-zinc-500">
              {mapData.width} x {mapData.height}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className={`relative bg-zinc-950 flex items-center justify-center ${className}`}>
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-xs text-zinc-500">Loading...</div>
        </div>
      )}
      <canvas
        ref={canvasRef}
        className="max-w-full max-h-full object-contain"
        style={{ imageRendering: "pixelated" }}
      />
    </div>
  )
}
