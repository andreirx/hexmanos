import { useState, useEffect } from "react"
import { Grid3X3 } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { getAssetsByType, getAssetFileUrl, getAssetFile } from "@/api/assets"
import type { AssetDTO } from "@/api/types"

interface TileProperties {
  name: string
  tileSize: number
  passable: boolean
  variations: number
  tileType?: "TILE" | "PATH"
  terrainType?: "LAND" | "WATER"
}

interface TilePaletteProps {
  selectedAssetId: string | null
  onSelectAsset: (assetId: string | null, terrainType?: "LAND" | "WATER") => void
  tileType: "TILE" | "PATH"
}

export function TilePalette({ selectedAssetId, onSelectAsset, tileType }: TilePaletteProps) {
  const [tiles, setTiles] = useState<AssetDTO[]>([])
  const [tileProperties, setTileProperties] = useState<Map<string, TileProperties>>(new Map())
  const [isLoading, setIsLoading] = useState(false)

  // Load tiles on mount and when tileType changes
  useEffect(() => {
    async function loadTiles() {
      setIsLoading(true)
      try {
        const assets = await getAssetsByType("TILE")

        // Load properties for each tile to filter by type
        const propsPromises = assets.map(async (asset) => {
          try {
            const props = await getAssetFile<TileProperties>(asset.storageKeyPrefix, "properties.json")
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

        // Filter tiles by APPROVED status and tile type
        const filteredTiles = assets.filter(asset => {
          if (asset.status !== "APPROVED") return false
          const props = propsMap.get(asset.id)
          if (!props) return false
          const propType = props.tileType || "TILE"
          return propType === tileType
        })

        setTiles(filteredTiles)

        // Auto-select the first tile if none is selected
        if (!selectedAssetId && filteredTiles.length > 0) {
          const firstProps = propsMap.get(filteredTiles[0].id)
          onSelectAsset(filteredTiles[0].id, firstProps?.terrainType)
        }
      } catch (err) {
        console.error("Failed to load tiles:", err)
      } finally {
        setIsLoading(false)
      }
    }
    loadTiles()
  }, [tileType])

  return (
    <Card className="bg-zinc-800 border-zinc-700">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm text-zinc-300 flex items-center gap-2">
          <Grid3X3 className="w-4 h-4" />
          {tileType === "PATH" ? "Path Types" : "Terrain Types"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 max-h-[400px] overflow-y-auto">
        {isLoading ? (
          <div className="text-center py-4 text-zinc-500 text-sm">Loading tiles...</div>
        ) : tiles.length === 0 ? (
          <div className="text-center py-4 text-zinc-500 text-sm">
            No {tileType.toLowerCase()} tiles found.
            <br />
            Create some in the Tile Editor!
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {tiles.map(tile => {
              const props = tileProperties.get(tile.id)
              const isSelected = selectedAssetId === tile.id
              const thumbnailUrl = getAssetFileUrl(tile.storageKeyPrefix, "tile_0.png", true)
              const isWater = props?.terrainType === "WATER"

              return (
                <button
                  key={tile.id}
                  onClick={() => onSelectAsset(isSelected ? null : tile.id, isSelected ? undefined : props?.terrainType)}
                  className={`relative flex flex-col items-center p-2 rounded border-2 transition-all ${
                    isSelected
                      ? isWater
                        ? "border-cyan-500 bg-cyan-500/10"
                        : "border-blue-500 bg-blue-500/10"
                      : "border-zinc-700 hover:border-zinc-500 bg-zinc-900"
                  }`}
                  title={`${tile.name}${props ? ` (${props.variations} variations)` : ""}${isWater ? " [WATER]" : ""}`}
                >
                  {/* Water indicator */}
                  {isWater && (
                    <div className="absolute top-1 right-1 w-3 h-3 rounded-full bg-cyan-500 border border-cyan-400" title="Water terrain" />
                  )}

                  {/* Thumbnail */}
                  <div className="w-16 h-16 flex items-center justify-center overflow-hidden rounded">
                    <img
                      src={thumbnailUrl}
                      alt={tile.name}
                      className="w-full h-full object-contain"
                      style={{ imageRendering: "pixelated" }}
                      onError={(e) => {
                        const target = e.target as HTMLImageElement
                        target.style.display = "none"
                        target.parentElement!.innerHTML = '<span class="text-2xl text-zinc-600">?</span>'
                      }}
                    />
                  </div>

                  {/* Name */}
                  <span className="text-xs text-zinc-300 truncate w-full text-center mt-1">
                    {tile.name}
                  </span>

                  {/* Variations count */}
                  {props && (
                    <span className="text-xs text-zinc-500">
                      {props.variations} var{props.variations !== 1 ? "s" : ""}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        )}

        {/* Clear selection */}
        {selectedAssetId && (
          <button
            onClick={() => onSelectAsset(null, undefined)}
            className="w-full py-2 px-3 text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 rounded transition-colors mt-2"
          >
            Clear Selection
          </button>
        )}
      </CardContent>
    </Card>
  )
}
