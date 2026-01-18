import { useState, useEffect, useRef } from "react"
import { Map as MapIcon } from "lucide-react"
import { getAssetFile } from "@/api/assets"

const API_BASE = "http://localhost:8080"

interface MapData {
  name: string
  width: number
  height: number
  tileSize: number
  layers: {
    terrain: (MapTile | null)[][]
    paths: (MapPath | null)[][]
  }
  characters: { characterAssetId: string; x: number; y: number }[]
}

interface MapTile {
  tileAssetId: string
  seed: number
}

interface MapPath {
  pathAssetId: string
}

interface MapThumbnailProps {
  storageKeyPrefix: string
  className?: string
}

export function MapThumbnail({ storageKeyPrefix, className = "" }: MapThumbnailProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    loadAndRenderMap()
  }, [storageKeyPrefix])

  async function loadAndRenderMap() {
    setIsLoading(true)
    setError(false)

    try {
      // Load map data
      const data = await getAssetFile<MapData>(storageKeyPrefix, "map.json")

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
              const storageKey = `tiles/${assetId}`
              img.src = `${API_BASE}/api/assets/files/${storageKey}/tile_0.png?t=${Date.now()}`
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

      // Use small tile size for thumbnail
      const previewTileSize = 8
      canvas.width = data.width * previewTileSize
      canvas.height = data.height * previewTileSize

      ctx.imageSmoothingEnabled = false

      // Clear with dark background
      ctx.fillStyle = "#18181b"
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      // Render terrain
      for (let y = 0; y < data.height; y++) {
        for (let x = 0; x < data.width; x++) {
          const tile = data.layers.terrain[y]?.[x]
          if (tile) {
            const img = tileImages.get(tile.tileAssetId)
            if (img) {
              ctx.drawImage(img, x * previewTileSize, y * previewTileSize, previewTileSize, previewTileSize)
            }
          }
        }
      }

      // Render paths
      for (let y = 0; y < data.height; y++) {
        for (let x = 0; x < data.width; x++) {
          const path = data.layers.paths[y]?.[x]
          if (path) {
            const img = tileImages.get(path.pathAssetId)
            if (img) {
              ctx.drawImage(img, x * previewTileSize, y * previewTileSize, previewTileSize, previewTileSize)
            }
          }
        }
      }

      setIsLoading(false)
    } catch (err) {
      console.error("Failed to load map thumbnail:", err)
      setError(true)
      setIsLoading(false)
    }
  }

  if (error) {
    return (
      <div className={`flex items-center justify-center ${className}`}>
        <MapIcon className="w-8 h-8 text-zinc-600" />
      </div>
    )
  }

  return (
    <div className={`relative flex items-center justify-center ${className}`}>
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-zinc-800">
          <MapIcon className="w-8 h-8 text-zinc-600 animate-pulse" />
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
